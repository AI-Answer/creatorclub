import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Outline, Video } from '../../shared/club.js';
import {
  ACTION_STEP,
  COMPANION_ACTION_TYPES,
  COMPANION_TABS,
  TAB_ACTIONS,
  type CompanionAction,
  type CompanionApplied,
  type CompanionAsked,
  type CompanionCard,
  type CompanionContext,
  type CompanionEvent,
  type CompanionMessage,
  type CompanionReplyMessage,
  type CompanionStep,
  type CompanionTab,
  type CompanionThread,
  type CompanionUserMessage,
} from '../../shared/companion.js';
import { AiError, aiLabel, runAI, type AIEvent } from './ai.js';
import { boardText, readBoardChat } from './board-chat.js';
import { actionShape, applyAction, undoVersion, validateActions, versionExists } from './companion-actions.js';
import { chunkText, parseReply, ReplySplitter } from './companion-reply.js';
import { loadChannelContext } from './context.js';
import { ClubError, notFound } from './errors.js';
import { runningOnce, startJobOnce, type JobContext } from './jobs.js';
import { readOutline, readPackage, type PlanOptions } from './planning.js';
import { buildCompanionPrompt, type PromptIdea } from './prompts.js';
import { videoScenes } from './scenes.js';
import * as store from './store.js';

/*
 * The companion: one conversation per video (`companion.json`), across the steps. A question is saved at once and its reply is
 * written by a job whose progress events stream the steps and the text (`/jobs/:id/events`); the finished reply is saved with
 * its cards. The first read of a video that only has the old Board chat (`board-chat.json`) carries it over and keeps the old file.
 */

export const COMPANION_BUDGET_USD = 0.5;
const MESSAGES_KEPT = 400;
const BOARD_CHARS_HERE = 24_000;
/** Off the Board the board still informs the answer, at a smaller size. */
const BOARD_CHARS_ELSEWHERE = 8000;
const TEXT_EVERY_MS = 40;
/** A runner that sends whole messages has its text shown in pieces over at most this long. */
const FALLBACK_MS = 1200;

const threadFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'companion.json');
const newId = () => `m_${randomBytes(6).toString('hex')}`;
const jobKey = (slug: string, id: string) => `companion:${slug}/${id}`;

// ---------------------------------------------------------------- the saved conversation

const contextShape = z
  .object({
    tab: z.enum(COMPANION_TABS),
    sceneId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
    sceneTitle: z.string().max(300).optional(),
    screen: z.string().max(1000).optional(),
    playhead: z.number().min(0).max(360_000).optional(),
    selection: z.array(z.string().max(80)).max(200).optional(),
  })
  .strict();

/** Saved text is capped here, so what is saved always reads back. */
const TEXT_MAX = { user: 20_000, assistant: 40_000 };
const capped = (max: number) => z.string().transform((text) => text.slice(0, max));
const tabShape = z.enum(COMPANION_TABS).catch('board');

/** Cards are read leniently: one that is not readable is left out, never its message. The action is checked again on Apply. */
const cardShape = z
  .object({
    // Known fields of the wrong kind are dropped, not passed on: the action is checked whole again on Apply.
    action: z
      .object({
        type: z.string(),
        text: z.string().optional().catch(undefined),
        sceneId: z.string().optional().catch(undefined),
        title: z.string().optional().catch(undefined),
        talkingPoints: z.array(z.string()).optional().catch(undefined),
        scenes: z.array(z.unknown()).optional().catch(undefined),
      })
      .passthrough(),
    state: z.enum(['offered', 'applied', 'undone']).catch('offered'),
    version: z.string().max(40).optional().catch(undefined),
    result: capped(300).optional().catch(undefined),
    tooOld: z.literal(true).optional().catch(undefined),
  })
  .strip();
const readCards = (cards: unknown) =>
  (Array.isArray(cards) ? cards : []).slice(0, 20).flatMap((card) => {
    const parsed = cardShape.safeParse(card);
    return parsed.success ? [parsed.data as unknown as CompanionCard] : [];
  });
const messageShape = z.union([
  z.object({ id: z.string().max(40), role: z.literal('user'), text: capped(TEXT_MAX.user), at: z.string().max(40).optional().catch(undefined), context: contextShape.partial().extend({ tab: tabShape }).catch({ tab: 'board' }) }).strip(),
  z
    .object({
      id: z.string().max(40),
      role: z.literal('assistant'),
      text: capped(TEXT_MAX.assistant),
      at: z.string().max(40).optional().catch(undefined),
      tab: tabShape,
      cards: z.unknown().transform(readCards),
      steps: z.array(z.object({ label: z.string().max(80), ms: z.number().min(0) }).strip()).max(20).optional().catch(undefined),
      status: z.literal('stopped').optional().catch(undefined),
    })
    .strip(),
]);

/** The old Board chat as companion messages: its items become cards (a used one is applied, without Undo). */
export function fromBoardChat(old: Awaited<ReturnType<typeof readBoardChat>>): CompanionMessage[] {
  return old.map((message, index): CompanionMessage => {
    const id = `m_board_${index + 1}`;
    if (message.role === 'user') return { id, role: 'user', text: message.text, context: { tab: 'board' } };
    const cards = (message.items ?? []).map((item, k): CompanionCard => {
      const type = item.kind === 'hook' ? 'use_hook' : item.kind === 'title' ? 'use_title' : 'add_note';
      return { action: { type, text: item.text }, state: message.used?.includes(k) ? 'applied' : 'offered' };
    });
    return { id, role: 'assistant', text: message.text, tab: 'board', cards };
  });
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Keeps a copy of a conversation file that could not be read whole, so nothing in it is lost when it is written again. */
async function keepAside(slug: string, id: string, how: 'rename' | 'copy') {
  const file = threadFile(slug, id);
  const aside = path.join(path.dirname(file), `companion-unreadable-${stamp()}.json`);
  await (how === 'rename' ? fs.rename(file, aside) : fs.copyFile(file, aside));
  console.error(`[club] companion: kept ${path.basename(aside)} aside`);
}

async function readThreadFile(slug: string, id: string): Promise<CompanionMessage[]> {
  let saved: unknown;
  try {
    saved = await store.readJSON<unknown>(threadFile(slug, id));
  } catch {
    // A file that cannot be parsed is set aside and the conversation starts again; it is not taken for a missing one.
    await keepAside(slug, id, 'rename');
    await store.writeJSON(threadFile(slug, id), { messages: [] });
    return [];
  }
  if (saved === undefined) {
    // First read: carry the Board chat over. The old file stays where it is.
    const old = await readBoardChat(slug, id);
    if (!old.length) return [];
    const messages = fromBoardChat(old);
    await store.writeJSON(threadFile(slug, id), { messages });
    return messages;
  }
  const list = Array.isArray((saved as { messages?: unknown })?.messages) ? (saved as { messages: unknown[] }).messages : undefined;
  if (!list) {
    await keepAside(slug, id, 'rename');
    await store.writeJSON(threadFile(slug, id), { messages: [] });
    return [];
  }
  const messages = list.flatMap((message) => {
    const parsed = messageShape.safeParse(message);
    return parsed.success ? [parsed.data as CompanionMessage] : [];
  });
  // A message too broken to read (no id or role) is left out; the file as it was is kept beside it first, then written without it.
  if (messages.length < list.length) {
    await keepAside(slug, id, 'copy');
    await store.writeJSON(threadFile(slug, id), { messages });
  }
  return messages;
}

const changeThread = <T>(slug: string, id: string, change: (messages: CompanionMessage[]) => { messages: CompanionMessage[]; result: T }) =>
  store.withLock(`companion:${threadFile(slug, id)}`, async () => {
    const { messages, result } = change(await readThreadFile(slug, id));
    await store.writeJSON(threadFile(slug, id), { messages: messages.slice(-MESSAGES_KEPT) });
    return result;
  });

/** Applied cards whose version was pruned can no longer be undone: they say so instead of offering Undo. */
async function markTooOld(slug: string, id: string, messages: CompanionMessage[]): Promise<CompanionMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== 'assistant' || !message.cards.some((card) => card.state === 'applied' && card.version)) return message;
      const cards = await Promise.all(
        message.cards.map(async (card) => {
          if (card.state !== 'applied' || !card.version || (await versionExists(slug, id, card.version))) return card;
          const { version: _gone, ...rest } = card;
          return { ...rest, tooOld: true as const };
        }),
      );
      return { ...message, cards };
    }),
  );
}

/** The reply being written for each video, with its steps and text so far, so a panel that opens late shows all of it. */
const running = new Map<string, NonNullable<CompanionThread['running']>>();

export async function readThread(slug: string, id: string): Promise<CompanionThread> {
  await store.readVideo(slug, id);
  const messages = await markTooOld(slug, id, await store.withLock(`companion:${threadFile(slug, id)}`, () => readThreadFile(slug, id)));
  const now = running.get(jobKey(slug, id));
  return { messages, ...(now && runningOnce(jobKey(slug, id))?.id === now.jobId ? { running: { ...now, steps: [...now.steps] } } : {}) };
}

// ---------------------------------------------------------------- what the companion is told

const STEP_NAME: Record<CompanionTab, string> = { board: 'Board', plan: 'Plan', record: 'Record', edit: 'Edit', publish: 'Publish' };
const READING: Record<CompanionTab, string> = { board: 'Reading the board', plan: 'Reading the plan', record: 'Reading the scenes', edit: 'Reading the edit', publish: 'Reading the package' };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

const ideaFor = (video: Video): PromptIdea => {
  const { lane: _lane, dropReason: _drop, ...notes } = video.idea ?? {};
  return { title: video.title, ...notes };
};

/** The step, the scene in focus and what the screen shows, as the prompt reads them. */
export function screenText(context: CompanionContext, video: Pick<Video, 'title' | 'targetSeconds'>, outline: Outline | null, takes?: string): string {
  const scene = context.sceneId ? outline?.scenes.findIndex((each) => each.id === context.sceneId) ?? -1 : -1;
  const lines = [`Step: ${STEP_NAME[context.tab]}`, `Video: ${video.title}`];
  if (scene >= 0) lines.push(`Scene in focus: ${scene + 1}. ${outline!.scenes[scene].title} (id: ${context.sceneId})`);
  if (video.targetSeconds) lines.push(`Target length: ${clock(video.targetSeconds)}`);
  if (context.screen?.trim()) lines.push(`On screen: ${context.screen.trim()}`);
  if (context.tab === 'edit' && context.playhead !== undefined) lines.push(`Playhead: ${clock(context.playhead)}`);
  if (takes) lines.push(`Takes: ${takes}`);
  return lines.join('\n');
}

/** What each earlier reply offered, so the model knows what was used. */
const historyText = (message: CompanionMessage) => {
  if (message.role === 'user') return message.text;
  const cards = message.cards.map((card) => {
    const text = (card.action as { text?: unknown }).text;
    return `${String(card.action.type)}${typeof text === 'string' ? ` "${text.slice(0, 120)}"` : ''} (${card.state === 'offered' ? 'not used' : card.state})`;
  });
  return cards.length ? `${message.text}\n[Offered: ${cards.join('; ')}]` : message.text;
};

// ---------------------------------------------------------------- asking

/** The steps of one reply: each starts when the next one does, and keeps how long it took. */
class Steps {
  readonly done: CompanionStep[] = [];
  private current?: { label: string; started: number };
  private count = 0;
  constructor(private readonly emit: (event: CompanionEvent) => void) {}
  start(label: string) {
    if (this.current?.label === label) return;
    this.close();
    this.current = { label, started: Date.now() };
    this.emit({ type: 'step', label, index: this.count++ });
  }
  close() {
    if (this.current) this.done.push({ label: this.current.label, ms: Date.now() - this.current.started });
    this.current = undefined;
  }
  get label() {
    return this.current?.label;
  }
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

interface AskInput {
  message: CompanionUserMessage;
  history: CompanionMessage[];
  /** What the screen would need to show this reply from the start: kept while it is written. */
  live: { steps: string[]; text: string };
}

/** Writes one reply: reads what the step needs, streams the model's answer, checks its actions and saves the reply. */
async function writeReply(slug: string, id: string, input: AskInput, context: JobContext, options: PlanOptions): Promise<CompanionReplyMessage> {
  const emit = (event: CompanionEvent) => {
    if (event.type === 'step') input.live.steps[event.index] = event.label;
    else input.live.text = input.live.text.slice(0, event.at) + event.text;
    context.emit(event);
  };
  const steps = new Steps(emit);
  const tab = input.message.context.tab;
  steps.start(READING[tab]);

  const video = await store.readVideo(slug, id);
  const [channel, tiles, pkg, outline] = await Promise.all([loadChannelContext(slug), store.listPlacedTiles(slug, id), readPackage(slug, id), readOutline(slug, id)]);
  const takes =
    tab === 'record'
      ? await videoScenes(slug, id).then(
          (scenes) => scenes.map((scene, index) => `${index + 1}. ${scene.title}: ${scene.status}`).join('; '),
          () => undefined,
        )
      : undefined;
  const built = await buildCompanionPrompt(channel, {
    idea: ideaFor(video),
    pkg: pkg ?? undefined,
    outline: outline ?? undefined,
    board: await boardText(slug, id, tiles, tab === 'board' ? BOARD_CHARS_HERE : BOARD_CHARS_ELSEWHERE),
    screen: screenText(input.message.context, video, outline, takes),
    history: input.history.map((message) => ({ role: message.role, text: historyText(message) })),
    message: input.message.text,
    actions: TAB_ACTIONS[tab],
  });

  // The text the person sees, sent in small batches. `at` lets a screen that reconnects see where each piece goes.
  const splitter = new ReplySplitter();
  let at = 0;
  let pending = '';
  let shown = '';
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    emit({ type: 'text', at, text: pending });
    at += pending.length;
    pending = '';
  };
  const show = (text: string) => {
    if (!text) return;
    if (!shown.trim() && !text.trim()) return;
    if (!shown) steps.start('Writing the reply');
    shown += text;
    pending += text;
    timer ??= setTimeout(flush, TEXT_EVERY_MS);
  };
  const feed = (chunk: string) => {
    show(splitter.push(chunk));
    if (!splitter.writingActions) return;
    const fresh = splitter.newActionTypes().filter((type): type is (typeof COMPANION_ACTION_TYPES)[number] => (COMPANION_ACTION_TYPES as readonly string[]).includes(type));
    if (fresh.length) steps.start(ACTION_STEP[fresh[fresh.length - 1]]);
    else if (steps.label === 'Writing the reply' || steps.label === 'Thinking it through') steps.start('Preparing the changes');
  };

  const provider = (await store.defaultAi()) ?? 'claude';
  const run = options.runAI ?? runAI;
  let streamed = false;
  let whole = '';
  steps.start('Thinking it through');
  try {
    // Reading the video takes a moment: a stop that came meanwhile never starts the runner.
    if (context.signal.aborted) throw new AiError('cancelled', 'That was stopped.');
    const answer = await run({
      extraDirs: options.extraDirs,
      provider,
      prompt: built.prompt,
      system: built.system,
      model: provider === 'claude' ? 'sonnet' : undefined,
      budgetUsd: COMPANION_BUDGET_USD,
      stream: true,
      signal: context.signal,
      onEvent: (event: AIEvent) => {
        if (event.type === 'delta') {
          streamed = true;
          feed(event.text);
        } else if (event.type === 'text' && !streamed) whole = event.text;
      },
    });
    // A runner that finished just as Stop was pressed: the stop wins, so the reply ends where the person saw it end.
    if (context.signal.aborted) throw new AiError('cancelled', 'That was stopped.');
    if (!streamed) {
      // A runner without partial messages: the whole answer arrives at once, and is shown in pieces so it still reads as it is written.
      const pieces = chunkText(answer.text || whole);
      const pause = Math.min(16, FALLBACK_MS / Math.max(1, pieces.length));
      for (const piece of pieces) {
        if (context.signal.aborted) throw new AiError('cancelled', 'That was stopped.');
        feed(piece);
        flush();
        await wait(pause, context.signal);
      }
    }
    show(splitter.end());
    flush();

    const parsed = parseReply(answer.text || whole);
    if (!parsed.reply && !parsed.actions.length) throw new AiError('bad-answer', `${aiLabel(provider)} sent back no answer.`);
    const sceneIds = (outline?.scenes ?? []).map((scene) => scene.id).filter((sceneId): sceneId is string => !!sceneId);
    if (parsed.actions.length) steps.start('Checking the changes');
    const { actions, rejected } = validateActions(parsed.actions, { tab, sceneIds });
    if (rejected.length) console.error('[club] companion actions left out:', rejected.slice(0, 5).join('; '));
    steps.close();
    const reply: CompanionReplyMessage = {
      id: newId(),
      role: 'assistant',
      text: parsed.reply.slice(0, TEXT_MAX.assistant),
      at: new Date().toISOString(),
      tab,
      cards: actions.map((action) => ({ action, state: 'offered' })),
      steps: steps.done,
    };
    await changeThread(slug, id, (messages) => ({ messages: [...messages, reply], result: undefined }));
    return reply;
  } catch (error) {
    clearTimeout(timer);
    if (context.signal.aborted) {
      // Stopped: what had arrived is kept, marked as stopped, so the conversation shows what was read.
      steps.close();
      const text = (shown + splitter.end()).trim();
      // It goes right after its question, even when the next question was asked while this was being saved.
      const stopped: CompanionReplyMessage = { id: newId(), role: 'assistant', text: text.slice(0, TEXT_MAX.assistant), at: new Date().toISOString(), tab, cards: [], steps: steps.done, status: 'stopped' };
      if (text)
        await changeThread(slug, id, (messages) => {
          const at = messages.findIndex((message) => message.id === input.message.id);
          return { messages: at < 0 ? [...messages, stopped] : [...messages.slice(0, at + 1), stopped, ...messages.slice(at + 1)], result: undefined };
        });
    }
    throw error;
  }
}

export const askBody = z
  .object({
    message: z.string().trim().min(1).max(4000),
    context: contextShape,
    /** Try again: the question already saved, asked again instead of saved twice. */
    retryOf: z.string().max(40).optional(),
  })
  .strict();

/** Saves the question and starts the reply. One reply runs at a time per video. */
export async function askCompanion(slug: string, id: string, body: z.infer<typeof askBody>, options: PlanOptions): Promise<CompanionAsked> {
  await store.readVideo(slug, id);
  const key = jobKey(slug, id);
  if (runningOnce(key)) throw new ClubError('Wait for the reply, or stop it first.', 409);
  const { message, history } = await changeThread(slug, id, (messages) => {
    const last = messages[messages.length - 1];
    if (body.retryOf && last?.role === 'user' && last.id === body.retryOf) return { messages, result: { message: last, history: messages.slice(0, -1) } };
    const asked: CompanionUserMessage = { id: newId(), role: 'user', text: body.message.trim(), at: new Date().toISOString(), context: body.context };
    return { messages: [...messages, asked], result: { message: asked, history: messages } };
  });
  const live = { jobId: '', messageId: message.id, steps: [] as string[], text: '' };
  const job = startJobOnce(key, 'companion', (context) =>
    writeReply(slug, id, { message, history, live }, context, options).finally(() => {
      if (running.get(key) === live) running.delete(key);
    }),
  );
  live.jobId = job.id;
  running.set(key, live);
  return { jobId: job.id, message };
}

// ---------------------------------------------------------------- applying and undoing a card

/** Reading the card, changing it and saving its state happen under one lock per video, so a double click or two windows apply once. */
function changeCard(slug: string, id: string, messageId: string, index: number, change: (card: CompanionCard) => Promise<{ card: CompanionCard; changed: CompanionApplied['changed'] }>): Promise<CompanionApplied> {
  return store.withLock(`companion-card:${store.videoDir(slug, id)}`, () => changeCardNow(slug, id, messageId, index, change));
}

async function changeCardNow(slug: string, id: string, messageId: string, index: number, change: (card: CompanionCard) => Promise<{ card: CompanionCard; changed: CompanionApplied['changed'] }>): Promise<CompanionApplied> {
  const thread = await readThread(slug, id);
  const message = thread.messages.find((each): each is CompanionReplyMessage => each.id === messageId && each.role === 'assistant');
  const card = message?.cards[index];
  if (!message || !card) throw notFound('card');
  const { card: next, changed } = await change(card);
  const updated = await changeThread(slug, id, (messages) => {
    let saved: CompanionReplyMessage | undefined;
    const list = messages.map((each) => {
      if (each.id !== messageId || each.role !== 'assistant') return each;
      saved = { ...each, cards: each.cards.map((old, at) => (at === index ? next : old)) };
      return saved;
    });
    return { messages: list, result: saved };
  });
  if (!updated) throw notFound('card');
  return { message: updated, changed };
}

export function applyCard(slug: string, id: string, messageId: string, index: number): Promise<CompanionApplied> {
  return changeCard(slug, id, messageId, index, async (card) => {
    if (card.state === 'applied') throw new ClubError('That is already applied.', 409);
    const checked = actionShape.safeParse(card.action);
    if (!checked.success) throw new ClubError("That change can't be applied.", 409);
    const { version, result, changed } = await applyAction(slug, id, checked.data as CompanionAction);
    return { card: { ...card, state: 'applied', version, result }, changed };
  });
}

export function undoCard(slug: string, id: string, messageId: string, index: number): Promise<CompanionApplied> {
  return changeCard(slug, id, messageId, index, async (card) => {
    if (card.state !== 'applied' || !card.version) throw new ClubError('There is nothing to undo.', 409);
    if (!(await versionExists(slug, id, card.version))) throw new ClubError('This was applied too long ago to undo.', 409);
    const changed = await undoVersion(slug, id, card.version);
    const { version: _version, result: _result, ...rest } = card;
    return { card: { ...rest, state: 'undone' }, changed };
  });
}
