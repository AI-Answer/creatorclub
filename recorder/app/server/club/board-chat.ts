import path from 'node:path';
import { z } from 'zod';
import { BOARD_ITEM_KINDS, type Breakdown, type BoardChatMessage, type BoardChatReply, type BoardItem, type ResearchTile, type Video } from '../../shared/club.js';
import { AiError } from './ai.js';
import { readBreakdown } from './breakdown.js';
import { loadChannelContext } from './context.js';
import { asker, parseAnswer, readOutline, readPackage, type PlanOptions } from './planning.js';
import { boardTiles } from './board-docs.js';
import { buildBoardChatPrompt, noteText, titleProblems } from './prompts.js';
import { readTranscript } from './research.js';
import * as store from './store.js';

/*
 * "Ask Claude about this board": one question, answered from the video's tiles, package and outline in the channel's voice.
 * The conversation is saved with the video (board-chat.json), so reopening the Board keeps it.
 */

export const BOARD_CHAT_BUDGET_USD = 0.5;
/** The most the board shows the model, so the prompt stays the same size however many tiles there are. */
const BOARD_CHARS = 24_000;
const TILE_CHARS_MAX = 3000;
const TILE_CHARS_MIN = 400;
const TILES_KEPT = 60;
const MESSAGES_KEPT = 400;
const ITEMS_KEPT = 6;

const chatFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'board-chat.json');

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);
const count = (value: number) => value.toLocaleString('en-US');

// ---------------------------------------------------------------- the board as text

async function tileText(slug: string, videoId: string, tile: ResearchTile): Promise<string> {
  const { meta } = tile;
  switch (tile.kind) {
    case 'note':
    case 'text':
    {
      const body = noteText(tile.text ?? '') || '(empty)';
      return `Your note${tile.doc && tile.title ? ` "${tile.title}"` : ''}:${body.startsWith('\n') ? '' : ' '}${body}`;
    }
    case 'signal': {
      const stats = [meta.likes !== undefined ? `${count(meta.likes)} likes` : '', meta.replies !== undefined ? `${count(meta.replies)} replies` : ''].filter(Boolean).join(', ');
      return `Post${meta.source ? ` on ${meta.source === 'x' ? 'X' : 'Reddit'}` : ''}${meta.author ? ` by ${meta.author}` : ''}${stats ? ` (${stats})` : ''}: ${squash(tile.text ?? '')}`;
    }
    case 'idea':
      return `The idea: ${squash(tile.text ?? '') || '(no reason given)'}`;
    case 'link':
      return `Link: ${[tile.title, tile.url].filter(Boolean).join(' ')}`;
    case 'image':
      return `Image: ${tile.title ?? tile.file ?? 'untitled'}`;
    case 'video': {
      const stats = [
        meta.channel,
        meta.views !== undefined ? `${count(meta.views)} views` : '',
        meta.multiplier !== undefined ? `${meta.multiplier}x the channel's usual views` : '',
      ].filter(Boolean);
      const head = `Video: ${tile.title ?? tile.url ?? 'untitled'}${stats.length ? ` (${stats.join(', ')})` : ''}`;
      if (!meta.transcript) return head;
      const transcript = (await readTranscript(slug, videoId, tile.id).catch(() => [])).map((chapter) => (chapter.title ? `${chapter.title}: ${chapter.text}` : chapter.text)).join(' ');
      return `${head}\nTranscript: ${squash(transcript)}`;
    }
    case 'breakdown': {
      const breakdown: Breakdown | undefined = meta.breakdownId ? await readBreakdown(slug, meta.breakdownId).catch(() => undefined) : undefined;
      if (!breakdown) return `Breakdown: ${tile.title ?? 'a video'} (no longer saved)`;
      const why = breakdown.whyItWorked;
      return [
        `Breakdown of "${breakdown.video.title}" by ${breakdown.video.channel}`,
        `Why it worked: ${[why.titlePackaging, why.hookSpeed, why.retention, why.payoff].map(squash).filter(Boolean).join(' ')}`,
        breakdown.reusableOutline.length ? `Reusable outline: ${breakdown.reusableOutline.map((beat, index) => `${index + 1}. ${squash(beat)}`).join(' ')}` : '',
        breakdown.concepts.length ? `Concepts: ${breakdown.concepts.map((concept) => `${concept.title} (${squash(concept.angle)})`).join('; ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
}

/** The board's tiles as numbered text. Each tile is cut to its share of the room, so a long transcript or many tiles never grow the prompt. */
export async function boardText(slug: string, videoId: string, tiles: readonly ResearchTile[]): Promise<string> {
  const kept = tiles.slice(-TILES_KEPT);
  if (!kept.length) return '';
  const each = Math.max(TILE_CHARS_MIN, Math.min(TILE_CHARS_MAX, Math.floor(BOARD_CHARS / kept.length)));
  const lines = await Promise.all(kept.map(async (tile, index) => `${index + 1}. ${cut(await tileText(slug, videoId, tile), each)}`));
  const left = tiles.length - kept.length;
  return [...(left ? [`(${left} older ${left === 1 ? 'tile is' : 'tiles are'} left out)`] : []), ...lines].join('\n\n');
}

// ---------------------------------------------------------------- the saved conversation

const messageShape = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    items: z.array(z.object({ kind: z.enum(BOARD_ITEM_KINDS), text: z.string() }).strict()).optional(),
    used: z.array(z.number().int().nonnegative()).optional(),
  })
  .strict();

/** The saved conversation, oldest first. Empty when there is none, or when the file cannot be read. */
export async function readBoardChat(slug: string, id: string): Promise<BoardChatMessage[]> {
  await store.readVideo(slug, id);
  const saved = await store.readJSON<unknown>(chatFile(slug, id)).catch(() => undefined);
  const parsed = z.array(messageShape).safeParse(saved);
  return parsed.success ? parsed.data : [];
}

const changeChat = <T>(slug: string, id: string, change: (messages: BoardChatMessage[]) => Promise<BoardChatMessage[]> | BoardChatMessage[], result: (messages: BoardChatMessage[]) => T) =>
  store.withLock(`board-chat:${chatFile(slug, id)}`, async () => {
    const messages = (await change(await readBoardChat(slug, id))).slice(-MESSAGES_KEPT);
    await store.writeJSON(chatFile(slug, id), messages);
    return result(messages);
  });

/** Replaces the saved conversation (marking items as used, or clearing it). */
export const saveBoardChat = (slug: string, id: string, messages: BoardChatMessage[]) => changeChat(slug, id, () => messages, (saved) => saved);

// ---------------------------------------------------------------- asking

const answerShape = z.object({ reply: z.string().max(8000), items: z.array(z.object({ kind: z.enum(BOARD_ITEM_KINDS), text: z.string().max(1000) }).strict()).max(20) }).strict();

/** What the model offered, cleaned: empty and repeated lines go, a title that breaks the title rules goes, and at most six stay. */
export function cleanItems(items: BoardItem[]): BoardItem[] {
  const seen = new Set<string>();
  const kept: BoardItem[] = [];
  for (const item of items) {
    const text = squash(item.text);
    const key = `${item.kind}:${text.toLowerCase()}`;
    if (!text || seen.has(key) || (item.kind === 'title' && titleProblems(text).length)) continue;
    seen.add(key);
    kept.push({ kind: item.kind, text });
  }
  return kept.slice(0, ITEMS_KEPT);
}

const ideaFor = (video: Video) => {
  const { lane: _lane, dropReason: _drop, ...notes } = video.idea ?? {};
  return { title: video.title, ...notes };
};

/**
 * Answers one question about the board and saves the exchange. `history` is the conversation as the screen has it; the
 * last twelve turns are sent. Nothing is saved when the model fails or the call is stopped.
 */
export async function askAboutBoard(
  slug: string,
  id: string,
  message: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  options: PlanOptions,
  signal: AbortSignal,
): Promise<BoardChatReply> {
  const video = await store.readVideo(slug, id);
  const [channel, tiles, pkg, outline] = await Promise.all([loadChannelContext(slug), boardTiles(slug, id), readPackage(slug, id), readOutline(slug, id)]);
  const built = await buildBoardChatPrompt(channel, { idea: ideaFor(video), pkg: pkg ?? undefined, outline: outline ?? undefined, board: await boardText(slug, id, tiles), history, message });
  const ai = await asker({ signal }, options);
  const answer = parseAnswer(answerShape, (await ai.ask(built, BOARD_CHAT_BUDGET_USD)).json, ai.who, 'board chat');
  const reply = answer.reply.trim();
  if (!reply) throw new AiError('bad-answer', `${ai.who} sent back no answer.`);
  const items = cleanItems(answer.items);
  await changeChat(slug, id, (messages) => [...messages, { role: 'user', text: message.trim() }, { role: 'assistant', text: reply, ...(items.length ? { items } : {}) }], () => undefined);
  return { reply, items };
}
