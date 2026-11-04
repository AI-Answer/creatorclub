import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Outline, Package, ResearchTile, Video } from '../../shared/club.js';
import type { CompanionApplied, CompanionAsked, CompanionReplyMessage, CompanionThread } from '../../shared/companion.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * The companion through its HTTP routes, with a stand-in runner that streams: the prompt it is given, the SSE stream of steps and
 * text, checking the actions, applying and undoing cards, stopping, trying again, and carrying over the old Board chat.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-companion-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');

interface Script {
  /** Sent as deltas, one by one; without them the whole text arrives at the end, as codex sends it. */
  deltas?: string[];
  text: string;
  /** Holds the answer until this settles; a stop ends it the way the real CLI is killed. */
  hold?: Promise<void>;
  fail?: boolean;
  /** After a stop, the runner takes this long to end (a CLI that is slow to die). */
  slowStop?: number;
}
const scripts: Script[] = [];
const asked: RunAIOptions[] = [];
const { AiError } = await import('./ai.js');
const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  asked.push(options);
  const script = scripts.shift() ?? { text: 'No script.' };
  const aborted = new Promise<never>((_, reject) => options.signal?.addEventListener('abort', () => setTimeout(() => reject(new AiError('cancelled', 'That was stopped.')), script.slowStop ?? 0), { once: true }));
  aborted.catch(() => {});
  if (options.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
  options.onEvent?.({ type: 'started' });
  for (const delta of script.deltas ?? []) {
    options.onEvent?.({ type: 'delta', text: delta });
    await Promise.race([tick(), aborted]);
  }
  if (script.hold) await Promise.race([script.hold, aborted]);
  if (script.fail) throw new AiError('not-signed-in', 'Claude is not signed in.');
  if (!script.deltas) options.onEvent?.({ type: 'text', text: script.text });
  return { text: script.text };
}

const { clubRouter } = await import('./index.js');
const { validateActions, applyAction, undoVersion, readTakesWith, CHANGED_SINCE, KEPT_ASIDE, TAKES_RECORDED, lock } = await import('./companion-actions.js');
const { videoScenes } = await import('./scenes.js');
const store = await import('./store.js');
const { cancelAllJobs, getJob } = await import('./jobs.js');
const { ReplySplitter, parseReply, chunkText } = await import('./companion-reply.js');
const { screenText, fromBoardChat } = await import('./companion.js');

const app = express();
app.use('/api/club', clubRouter({ runAI: fakeAI }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  await rm(temp, { recursive: true, force: true });
});

const call = async <T = unknown>(method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
};

type Sse = { type: string; data: any };
/** Reads a job's whole SSE stream; the server ends it after the last event. */
async function events(jobId: string): Promise<Sse[]> {
  const res = await fetch(`${base}/jobs/${jobId}/events`);
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
  const raw = await res.text();
  return raw
    .split('\n\n')
    .filter((block) => block.includes('event:'))
    .map((block) => ({ type: /event: (\w+)/.exec(block)![1], data: JSON.parse(/data: (.*)/.exec(block)![1]) }));
}

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'], about: 'Practical AI for small shops.', cta: '' });
const dir = path.join(process.env.CREATORCLUB_DIR!, 'maya-lopez');
await writeFile(path.join(dir, 'voice.md'), '# Voice\n\nShort sentences. Shows the screen first.\n');

const video = (await call<Video>('POST', '/videos', { title: 'Hidden features' })).body;
const vdir = path.join(dir, 'videos', video.id);
await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: 'People keep asking about the free plan.' });
const pkg: Package = { angle: 'Angle', twist: 'Twist', titles: ['Hidden features you never opened', '', ''], thumbnailText: 'Never opened', hook: { visual: 'A menu', spoken: 'You never opened this.', text: '' } };
await call('PUT', `/videos/${video.id}/package`, pkg);
const outline: Outline = { scenes: [{ title: 'Opening', talkingPoints: ['Show the result'], show: 'The result', seconds: 60 }, { title: 'Level 1', talkingPoints: ['First feature'], show: 'Settings', seconds: 120 }] };
const saved = (await call<Outline>('PUT', `/videos/${video.id}/outline`, outline)).body;
const [s1, s2] = saved.scenes.map((scene) => scene.id!);

const ask = (message: string, context: Record<string, unknown>, extra: Record<string, unknown> = {}) => call<CompanionAsked>('POST', `/videos/${video.id}/companion`, { message, context, ...extra });
const thread = async () => (await call<CompanionThread>('GET', `/videos/${video.id}/companion`)).body;

test('the prompt holds the voice, the idea, the package, the scenes with their ids, the board, the screen and the actions of the step', async () => {
  scripts.push({ text: 'Fine.' });
  const res = await ask('What is missing?', { tab: 'idea', sceneId: s2, screen: 'Package filled, 2 scenes' });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  await events(res.body.jobId);
  const prompt = asked.at(-1)!.prompt;
  assert.match(prompt, /Short sentences\. Shows the screen first\./, 'the voice');
  assert.match(prompt, /Title: Hidden features/, 'the idea');
  assert.match(prompt, /Spoken: You never opened this\./, 'the package');
  assert.match(prompt, new RegExp(`### 2\\. Level 1 \\(id: ${s2}, 1:00–3:00\\)`), 'scenes with ids and times');
  assert.match(prompt, /People keep asking about the free plan\./, 'a board tile');
  assert.match(prompt, /Step: Idea/);
  assert.match(prompt, new RegExp(`Scene in focus: 2\\. Level 1 \\(id: ${s2}\\)`));
  assert.match(prompt, /On screen: Package filled, 2 scenes/);
  assert.match(prompt, /- set_scene:/, 'Idea offers set_scene');
  assert.doesNotMatch(prompt, /- set_description:/, 'and not the description');
  assert.doesNotMatch(prompt, /\{[a-z_]+\}/, 'every placeholder is filled');
  assert.equal(asked.at(-1)!.stream, true, 'the runner is asked to stream');
  assert.equal(asked.at(-1)!.budgetUsd, 0.5);
});

test('screen text names the step, the scene and the target', () => {
  const text = screenText({ tab: 'record', sceneId: 'a' }, { title: 'T', targetSeconds: 600 }, { scenes: [{ id: 'a', title: 'Intro', talkingPoints: [], show: '', seconds: 30 }] }, '1. Intro: Not recorded');
  assert.equal(text, 'Step: Record\nVideo: T\nScene in focus: 1. Intro (id: a)\nTarget length: 10:00\nTakes: 1. Intro: Not recorded');
});

test('a reply streams over SSE: steps in order, text without the actions, then the saved reply with its cards', async () => {
  const actions = JSON.stringify([{ type: 'draft_scenes', scenes: [{ title: 'Why it matters', talkingPoints: ['The problem'], show: 'A menu', seconds: 60 }, { title: 'Level 1', talkingPoints: ['One click'], show: 'Settings', seconds: 120 }, { title: 'Level 2', talkingPoints: ['A workflow'], show: 'Projects', seconds: 180 }, { title: 'Ending', talkingPoints: ['Next video'], show: 'End card', seconds: 45 }] }]);
  const text = `Here are **four scenes** from your board.\n\n- Level 2 is the longest.\n<actions>\n${actions}\n</actions>`;
  // Split in awkward places: inside a word, and inside the tag.
  scripts.push({ deltas: ['Here are **four ', 'scenes** from your board.\n\n- Level 2 is ', 'the longest.\n<act', 'ions>\n', actions.slice(0, 30), actions.slice(30), '\n</actions>'], text });
  const res = await ask('Draft the scenes', { tab: 'idea' });
  const stream = await events(res.body.jobId);
  const steps = stream.filter((event) => event.data?.type === 'step').map((event) => event.data.label);
  // The actions start before their type is known: a short 'Preparing the changes', then the step named by the action.
  assert.deepEqual(steps, ['Reading the board and the plan', 'Thinking it through', 'Writing the reply', 'Preparing the changes', 'Drafting scenes', 'Checking the changes']);
  const shown = stream.filter((event) => event.data?.type === 'text');
  assert.equal(shown.map((event) => event.data.text).join(''), 'Here are **four scenes** from your board.\n\n- Level 2 is the longest.\n');
  assert.ok(shown.every((event, index) => index === 0 || event.data.at === shown[index - 1].data.at + shown[index - 1].data.text.length), 'each piece says where it goes');
  const done = stream.at(-1)!;
  assert.equal(done.type, 'done');
  const reply = done.data as CompanionReplyMessage;
  assert.equal(reply.text, 'Here are **four scenes** from your board.\n\n- Level 2 is the longest.');
  assert.equal(reply.cards.length, 1);
  assert.equal(reply.cards[0].action.type, 'draft_scenes');
  assert.equal(reply.cards[0].state, 'offered');
  assert.deepEqual(reply.steps!.map((step) => step.label), steps);
  const saved = await thread();
  assert.deepEqual(saved.messages.slice(-2).map((message) => message.role), ['user', 'assistant']);
  assert.equal(saved.running, undefined, 'nothing runs once it is done');
});

test('a runner that sends the whole answer at once is still shown in pieces', async () => {
  scripts.push({ text: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.' });
  const res = await ask('Say something long', { tab: 'publish' });
  const shown = (await events(res.body.jobId)).filter((event) => event.data?.type === 'text');
  assert.ok(shown.length > 2, `${shown.length} pieces`);
  assert.equal(shown.map((event) => event.data.text).join(''), 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.');
});

test('actions are checked: unknown types, unknown scenes, steps that do not offer them and broken titles are left out', () => {
  const { actions, rejected } = validateActions(
    [
      { type: 'delete_everything' },
      { type: 'set_scene', sceneId: 's_missing', title: 'New' },
      { type: 'set_scene', sceneId: s1 },
      { type: 'set_scene', sceneId: s1, talkingPoints: ['  Show   it  '] },
      { type: 'set_description', text: 'Not on Idea' },
      { type: 'use_title', text: 'Is this a question?' },
      { type: 'use_title', text: 'Hidden features you never opened' },
      { type: 'use_title', text: 'Hidden features you never opened' },
      { type: 'use_hook', text: 'x', extra: true },
      'nonsense',
    ],
    { tab: 'idea', sceneIds: [s1, s2] },
  );
  assert.deepEqual(actions, [{ type: 'set_scene', sceneId: s1, talkingPoints: ['Show it'] }, { type: 'use_title', text: 'Hidden features you never opened' }]);
  assert.equal(rejected.length, 7, rejected.join('\n'));
  assert.ok(rejected.some((line) => line.includes('no scene s_missing')));
  assert.ok(rejected.some((line) => line.startsWith('set_description: not offered on idea')));
  assert.equal(validateActions([{ type: 'use_hook', text: 'Hi' }], { tab: 'edit', sceneIds: [] }).actions.length, 0, 'Edit offers none yet');
});

test('a reply whose actions name an unknown scene keeps only the valid cards', async () => {
  scripts.push({ text: `Two changes.\n<actions>[{"type":"set_scene","sceneId":"s_gone","title":"X"},{"type":"set_scene","sceneId":"${s2}","title":"Level 1: one click"},{"type":"warp"}]</actions>` });
  const res = await ask('Tighten scene 2', { tab: 'idea', sceneId: s2 });
  const reply = (await events(res.body.jobId)).at(-1)!.data as CompanionReplyMessage;
  assert.deepEqual(reply.cards.map((card) => card.action), [{ type: 'set_scene', sceneId: s2, title: 'Level 1: one click' }]);
});

const replyWith = async (actions: unknown[], tab = 'idea') => {
  scripts.push({ text: `Done.\n<actions>${JSON.stringify(actions)}</actions>` });
  const res = await ask('Do it', { tab });
  return (await events(res.body.jobId)).at(-1)!.data as CompanionReplyMessage;
};
const apply = (reply: CompanionReplyMessage, index: number) => call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/${index}/apply`);
const undo = (reply: CompanionReplyMessage, index: number) => call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/${index}/undo`);
const plan = async () => (await call<{ package: Package; outline: Outline }>('GET', `/videos/${video.id}/plan`)).body;

const errorOf = (res: { body: unknown }) => (res.body as { error?: string }).error;

test('every applied card is a version, and each Undo puts back only what that card changed', async () => {
  const reply = await replyWith([{ type: 'use_hook', text: 'This menu does the work.' }, { type: 'use_title', text: 'The menu nobody opens' }]);
  const hook = await apply(reply, 0);
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  assert.deepEqual(hook.body.changed, ['package']);
  assert.equal(hook.body.message.cards[0].state, 'applied');
  assert.equal(hook.body.message.cards[0].result, 'Set as your spoken hook');
  assert.equal((await plan()).package.hook.spoken, 'This menu does the work.');
  assert.equal((await apply(reply, 0)).status, 409, 'applied once');
  await apply(reply, 1);
  assert.deepEqual((await plan()).package.titles, ['The menu nobody opens', 'Hidden features you never opened', '']);

  // Two applies in a row, then Undo of the first: the hook goes back, the title applied after it stays, and its card stays applied.
  const undone = await undo(reply, 0);
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.equal(undone.body.message.cards[0].state, 'undone');
  assert.equal(undone.body.message.cards[0].version, undefined);
  assert.equal(undone.body.message.cards[1].state, 'applied');
  const after = (await plan()).package;
  assert.equal(after.hook.spoken, 'You never opened this.');
  assert.deepEqual(after.titles, ['The menu nobody opens', 'Hidden features you never opened', '']);
  assert.equal((await undo(reply, 0)).status, 409, 'nothing left to undo');
  // Then Undo of the second on its own.
  await undo(reply, 1);
  assert.deepEqual((await plan()).package.titles, ['Hidden features you never opened', '', '']);
  assert.equal((await plan()).package.hook.spoken, 'You never opened this.', 'the hook is untouched by the title Undo');
  assert.equal((await apply(reply, 0)).status, 200, 'an undone card can be applied again');
  await undo(reply, 0);
});

test('Undo never overwrites newer work: edits to other fields survive, and an edit to the same field makes Undo refuse', async () => {
  const reply = await replyWith([{ type: 'use_hook', text: 'Open the menu first.' }, { type: 'set_thumbnail_text', text: 'Never opened' }]);
  await apply(reply, 0);
  // Apply the hook, then edit the titles in Plan, then Undo the hook: the title edits stay.
  await call('PUT', `/videos/${video.id}/package`, { titles: ['My own title', 'Second one', null] });
  assert.equal((await undo(reply, 0)).status, 200);
  const pkgNow = (await plan()).package;
  assert.equal(pkgNow.hook.spoken, 'You never opened this.');
  assert.deepEqual(pkgNow.titles, ['My own title', 'Second one', '']);

  // Undo after the person edited the same field: refused, the edit stays, the card stays applied.
  await apply(reply, 0);
  await call('PUT', `/videos/${video.id}/package`, { hook: { spoken: 'My own opening line.' } });
  const refused = await undo(reply, 0);
  assert.equal(refused.status, 409);
  assert.equal(errorOf(refused), CHANGED_SINCE);
  assert.equal((await plan()).package.hook.spoken, 'My own opening line.');
  assert.equal(((await thread()).messages.find((message) => message.id === reply.id) as CompanionReplyMessage).cards[0].state, 'applied');

  // Two cards that change the same field: the later one wins, and Undo of the earlier refuses rather than undo the later.
  const two = await replyWith([{ type: 'set_thumbnail_text', text: 'First words' }, { type: 'set_thumbnail_text', text: 'Second words' }]);
  await apply(two, 0);
  await apply(two, 1);
  assert.equal(errorOf(await undo(two, 0)), CHANGED_SINCE);
  assert.equal((await plan()).package.thumbnailText, 'Second words');
  assert.equal((await undo(two, 1)).status, 200);
  assert.equal((await plan()).package.thumbnailText, 'First words', 'each Undo goes back to what its own card found');
  await call('PUT', `/videos/${video.id}/package`, pkg);
});

test('Use as title: Undo puts the titles back exactly, and never takes away a title the person already had', async () => {
  const titles = async () => (await plan()).package.titles;
  // An existing title moved first, then Undo: back to the list as it was.
  await call('PUT', `/videos/${video.id}/package`, { ...pkg, titles: ['My first title', 'My second title', ''] });
  const moved = await replyWith([{ type: 'use_title', text: 'My second title' }]);
  await apply(moved, 0);
  assert.deepEqual(await titles(), ['My second title', 'My first title', '']);
  assert.equal((await undo(moved, 0)).status, 200);
  assert.deepEqual(await titles(), ['My first title', 'My second title', ''], 'the title the person already had survives Undo');

  // An existing title (different case) moved first, then the titles edited, then Undo: refused, nothing lost.
  const cased = await replyWith([{ type: 'use_title', text: 'my second title' }]);
  await apply(cased, 0);
  await call('PUT', `/videos/${video.id}/package`, { titles: [null, 'My first title, edited', null] });
  const refused = await undo(cased, 0);
  assert.equal(errorOf(refused), CHANGED_SINCE);
  assert.deepEqual(await titles(), ['my second title', 'My first title, edited', '']);

  // A new title, then Undo: back exactly.
  await call('PUT', `/videos/${video.id}/package`, { ...pkg, titles: ['One', 'Two', 'Three'] });
  const fresh = await replyWith([{ type: 'use_title', text: 'A brand new title' }]);
  await apply(fresh, 0);
  assert.deepEqual(await titles(), ['A brand new title', 'One', 'Two']);
  await undo(fresh, 0);
  assert.deepEqual(await titles(), ['One', 'Two', 'Three'], 'the title that fell off comes back');

  // A new title, then the other titles edited, then Undo: only the new title goes; the edits stay.
  const again = await replyWith([{ type: 'use_title', text: 'Another new title' }]);
  await apply(again, 0);
  await call('PUT', `/videos/${video.id}/package`, { titles: [null, 'One, edited', null] });
  assert.equal((await undo(again, 0)).status, 200);
  assert.deepEqual(await titles(), ['One, edited', 'Two', 'Three']);
  await call('PUT', `/videos/${video.id}/package`, pkg);
});

test('the same field changed by two cards is undone newest first, and every card stays truthful', async () => {
  const first = await replyWith([{ type: 'use_hook', text: 'Same line.' }]);
  const second = await replyWith([{ type: 'use_hook', text: 'Same line.' }]);
  await apply(first, 0);
  await apply(second, 0);
  assert.equal(errorOf(await undo(first, 0)), CHANGED_SINCE, 'the newer card still holds the field');
  assert.equal((await plan()).package.hook.spoken, 'Same line.');
  assert.equal((await undo(second, 0)).status, 200);
  assert.equal((await plan()).package.hook.spoken, 'Same line.', 'back to what the second card found');
  assert.equal((await undo(first, 0)).status, 200, 'then the first can go');
  assert.equal((await plan()).package.hook.spoken, 'You never opened this.');
});

test('Undo of drafted scenes refuses once a take was recorded on one of them, and an Undo with nothing kept says nothing was kept', async () => {
  const other = (await call<Video>('POST', '/videos', { title: 'Drafts and takes' })).body;
  const draft = { type: 'draft_scenes' as const, scenes: [{ title: 'A', talkingPoints: ['a'], show: '', seconds: 60 }, { title: 'B', talkingPoints: ['b'], show: '', seconds: 60 }] };
  try {
    // Takes are read from the recording project; here a stand-in says the first drafted scene has one.
    let withTakes: string[] = [];
    readTakesWith(async (slug, id) => (await videoScenes(slug, id)).map((scene, index) => ({ ...scene, takes: withTakes.includes(scene.id) || (withTakes.includes('first') && index === 0) ? [{ id: 't1', seconds: 10, kept: true, retained: false }] : [] })));
    const { version } = await applyAction('maya-lopez', other.id, draft);
    withTakes = ['first'];
    await assert.rejects(undoVersion('maya-lopez', other.id, version), (error: Error) => error.message === TAKES_RECORDED);
    assert.equal((await call<{ outline: Outline }>('GET', `/videos/${other.id}/plan`)).body.outline.scenes.length, 2, 'the drafted scenes stay');
    withTakes = [];
    await undoVersion('maya-lopez', other.id, version);
    assert.equal((await call<{ outline: Outline | null }>('GET', `/videos/${other.id}/plan`)).body.outline, null, 'without takes, Undo goes back to no scenes');

    // Drafted over nothing, then edited: refused, and nothing is said to be kept because there was nothing.
    const second = await applyAction('maya-lopez', other.id, draft);
    const scenes = (await call<{ outline: Outline }>('GET', `/videos/${other.id}/plan`)).body.outline.scenes;
    await call('PUT', `/videos/${other.id}/outline`, { scenes: [{ ...scenes[0], title: 'A, edited' }] });
    await assert.rejects(undoVersion('maya-lopez', other.id, second.version), (error: Error) => error.message === CHANGED_SINCE);
    assert.ok(!(await readdir(path.join(dir, 'videos', other.id))).some((name) => name.includes('before-companion')));
  } finally {
    readTakesWith(videoScenes);
  }
});

test('a card applied before the last twenty versions says it is too old to undo instead of offering Undo', async () => {
  const reply = await replyWith([{ type: 'set_thumbnail_text', text: 'Old words' }]);
  await apply(reply, 0);
  for (let index = 0; index < 21; index++) await applyAction('maya-lopez', video.id, { type: 'add_note', text: `Filler ${index}` });
  const card = ((await thread()).messages.find((message) => message.id === reply.id) as CompanionReplyMessage).cards[0];
  assert.equal(card.state, 'applied');
  assert.equal(card.version, undefined);
  assert.equal(card.tooOld, true);
  assert.equal(errorOf(await undo(reply, 0)), 'There is nothing to undo.');
  await call('PUT', `/videos/${video.id}/package`, pkg);
});

test("Plan's own saves wait for the companion's lock, so Undo's check and write see the same file", async () => {
  let release!: () => void;
  const held = store.withLock(lock('maya-lopez', video.id), () => new Promise<void>((resolve) => (release = resolve)));
  let saved = false;
  const save = call('PUT', `/videos/${video.id}/package`, { thumbnailText: 'While locked' }).then(() => (saved = true));
  await tick(60);
  assert.equal(saved, false, 'the save waits');
  release();
  await held;
  await save;
  assert.equal((await plan()).package.thumbnailText, 'While locked');
  await call('PUT', `/videos/${video.id}/package`, pkg);
});

test('a double click or two windows apply a card once', async () => {
  const reply = await replyWith([{ type: 'add_note', text: 'Only once.' }]);
  const tiles = async () => ((await call<ResearchTile[]>('GET', `/videos/${video.id}/research`)).body).filter((tile) => tile.text === 'Only once.').length;
  const results = await Promise.all([apply(reply, 0), apply(reply, 0), apply(reply, 0)]);
  assert.deepEqual(results.map((res) => res.status).sort(), [200, 409, 409]);
  assert.equal(await tiles(), 1);
  await undo(reply, 0);
});

test('versions are kept for the last twenty applied cards of a video', async () => {
  const other = (await call<Video>('POST', '/videos', { title: 'Many versions' })).body;
  for (let index = 0; index < 23; index++) await applyAction('maya-lopez', other.id, { type: 'set_thumbnail_text', text: `Words ${index}` });
  const versions = (await readdir(path.join(dir, 'videos', other.id, 'companion-versions'))).filter((name) => name.endsWith('.json'));
  assert.equal(versions.length, 20);
});

test('Draft scenes replaces the scenes and sets the script aside; Undo brings both back', async () => {
  await call('PUT', `/videos/${video.id}/script`, { script: '# Hidden features\n\n## Opening\nHello.\n\n## Level 1\nThe first.\n' });
  const before = await readFile(path.join(vdir, 'outline.md'), 'utf8');
  const reply = await replyWith([{ type: 'draft_scenes', scenes: [{ title: 'A', talkingPoints: ['a'], show: '', seconds: 60 }, { title: 'B', talkingPoints: ['b'], show: '', seconds: 60 }, { title: 'C', talkingPoints: ['c'], show: '', seconds: 60 }] }]);
  const applied = await apply(reply, 0);
  assert.equal(applied.body.message.cards[0].result, 'Replaced 2 scenes with 3');
  assert.deepEqual((await plan()).outline.scenes.map((scene) => scene.title), ['A', 'B', 'C']);
  assert.ok(!(await readdir(vdir)).includes('script.md'), 'the old script is set aside');
  await undo(reply, 0);
  assert.equal(await readFile(path.join(vdir, 'outline.md'), 'utf8'), before);
  assert.match(await readFile(path.join(vdir, 'script.md'), 'utf8'), /## Level 1\nThe first\./);
  // Drafted, then edited by hand: Undo refuses, and the earlier scenes are kept on disk under a clear name.
  const again = await replyWith([{ type: 'draft_scenes', scenes: [{ title: 'X', talkingPoints: ['x'], show: '', seconds: 60 }] }]);
  await apply(again, 0);
  const drafted = (await plan()).outline;
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [{ ...drafted.scenes[0], title: 'X, edited' }] });
  const refused = await undo(again, 0);
  assert.equal(refused.status, 409);
  assert.equal(errorOf(refused), `${CHANGED_SINCE} ${KEPT_ASIDE}`, 'it says the earlier scenes are kept, because they were');
  assert.equal((await plan()).outline.scenes[0].title, 'X, edited', 'the edit stays');
  const kept = (await readdir(vdir)).find((name) => /^outline-before-companion-cv_[a-f0-9]{12}\.md$/.test(name));
  assert.ok(kept, 'the pre-action outline is kept');
  assert.equal(await readFile(path.join(vdir, kept!), 'utf8'), before);
  await call('PUT', `/videos/${video.id}/outline`, saved);
});

test('Set scene changes one scene by its id; a scene removed meanwhile is a clear refusal', async () => {
  const reply = await replyWith([{ type: 'set_scene', sceneId: s1, talkingPoints: ['Show the finished thing', 'Say why'] }]);
  await apply(reply, 0);
  const scenes = (await plan()).outline.scenes;
  assert.deepEqual(scenes[0].talkingPoints, ['Show the finished thing', 'Say why']);
  assert.equal(scenes[0].id, s1, 'the id stays');
  // Another scene edited meanwhile: this scene's Undo still works, and the other edit stays.
  const edited = (await plan()).outline.scenes;
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [edited[0], { ...edited[1], title: 'Level 1, renamed' }] });
  assert.equal((await undo(reply, 0)).status, 200);
  assert.deepEqual((await plan()).outline.scenes[0].talkingPoints, ['Show the result']);
  assert.equal((await plan()).outline.scenes[1].title, 'Level 1, renamed');
  await call('PUT', `/videos/${video.id}/outline`, saved);

  const stale = await replyWith([{ type: 'set_scene', sceneId: s2, title: 'Gone soon' }]);
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [(await plan()).outline.scenes[0]] });
  const refused = await apply(stale, 0);
  assert.equal(refused.status, 409);
  assert.equal(refused.body && (refused.body as unknown as { error: string }).error, 'That scene is no longer in the plan.');
  await call('PUT', `/videos/${video.id}/outline`, saved);
});

test('Add note puts a tile on the board and Undo takes it off; the description is set from Publish', async () => {
  const reply = await replyWith([{ type: 'add_note', text: 'Free plan questions keep coming.' }], 'idea');
  const count = async () => ((await call<ResearchTile[]>('GET', `/videos/${video.id}/research`)).body).length;
  const before = await count();
  assert.deepEqual((await apply(reply, 0)).body.changed, ['board']);
  assert.equal(await count(), before + 1);
  await undo(reply, 0);
  assert.equal(await count(), before);
  // A note written in after it was added stays on the board.
  await apply(reply, 0);
  const tile = ((await call<ResearchTile[]>('GET', `/videos/${video.id}/research`)).body).find((each) => each.text === 'Free plan questions keep coming.')!;
  await call('PATCH', `/videos/${video.id}/research/${tile.id}`, { text: 'Free plan questions keep coming. Ask Ana.' });
  assert.equal(errorOf(await undo(reply, 0)), CHANGED_SINCE);
  assert.equal(await count(), before + 1);

  const publish = await replyWith([{ type: 'set_description', text: 'What you get.\n\n0:00 Opening' }], 'publish');
  await apply(publish, 0);
  assert.equal((await plan()).package.description, 'What you get.\n\n0:00 Opening');
  await undo(publish, 0);
  assert.equal((await plan()).package.description, undefined);
});

test('the companion works with notes as Markdown files: Add note makes the file and the card, Undo sets it aside for good, an edited note is kept, and the prompt carries the Markdown', async () => {
  const cards = async () => (await call<ResearchTile[]>('GET', `/videos/${video.id}/research`)).body.filter((tile) => tile.doc);
  const reply = await replyWith([{ type: 'add_note', text: '# Plan B\n\n- show the **bill**\n- [ ] check the price' }], 'idea');
  const before = (await cards()).length;
  assert.deepEqual((await apply(reply, 0)).body.changed, ['board']);
  const added = (await cards()).find((tile) => tile.title === 'Plan B')!;
  assert.ok(added, 'the card shows');
  assert.equal(added.doc!.root, 'video');
  const file = path.join(vdir, added.doc!.path);
  assert.equal(await readFile(file, 'utf8'), '# Plan B\n\n- show the **bill**\n- [ ] check the price', 'the note is a Markdown file in the video\'s folder');
  assert.equal(added.text, '# Plan B\n\n- show the **bill**\n- [ ] check the price');

  // The next question carries the note's Markdown, lines and all.
  scripts.push({ text: 'Fine.' });
  await events((await ask('What do you see?', { tab: 'idea' })).body.jobId);
  const prompt = asked.at(-1)!.prompt;
  assert.match(prompt, /Your note "Plan B":/);
  assert.match(prompt, /- show the \*\*bill\*\*\n\s+- \[ \] check the price/, 'the bullets and the checklist are in the board text');
  assert.doesNotMatch(prompt, /\(empty\)/);

  // Undo takes the card off and sets the file aside, and the Board does not bring it back.
  await undo(reply, 0);
  assert.equal((await cards()).length, before);
  assert.equal(await stat(file).then(() => true, () => false), false, 'the file is gone from the video\'s folder');
  assert.ok((await readdir(path.join(vdir, 'notes', '.removed'))).some((name) => name.endsWith('plan-b.md')), 'and kept aside');
  assert.equal((await cards()).length, before, 'a second read of the Board does not bring it back');

  // Applied again, then written in by the person: Undo is refused and the note stays, in the file and on the Board.
  await apply(reply, 0);
  const again = (await cards()).find((tile) => tile.title === 'Plan B')!;
  await call('PATCH', `/videos/${video.id}/research/${again.id}`, { text: '# Plan B\n\nrewritten by me' });
  assert.equal(errorOf(await undo(reply, 0)), CHANGED_SINCE);
  assert.equal(await readFile(path.join(vdir, again.doc!.path), 'utf8'), '# Plan B\n\nrewritten by me');
  assert.ok((await cards()).some((tile) => tile.id === again.id), 'the card stays');
  // The same when an agent wrote in the file itself.
  const third = await replyWith([{ type: 'add_note', text: 'Quick thought' }], 'idea');
  await apply(third, 0);
  const quick = (await cards()).find((tile) => tile.title === 'Quick thought')!;
  await writeFile(path.join(vdir, quick.doc!.path), 'Quick thought, changed by an agent');
  assert.equal(errorOf(await undo(third, 0)), CHANGED_SINCE);
  assert.equal(await readFile(path.join(vdir, quick.doc!.path), 'utf8'), 'Quick thought, changed by an agent');
});

test('Stop keeps what arrived as a stopped reply; one reply runs at a time; Try again does not save the question twice', async () => {
  let release!: () => void;
  scripts.push({ deltas: ['Half of an ', 'answer'], text: 'Half of an answer and more', hold: new Promise((resolve) => (release = resolve)) });
  const started = await ask('Long one', { tab: 'idea' });
  assert.equal((await ask('Another', { tab: 'idea' })).status, 409, 'a second question waits for the first');
  assert.equal((await thread()).running?.messageId, started.body.message.id, 'a reopened panel finds the running reply');
  await tick(80);
  const running = (await thread()).running!;
  assert.equal(running.text, 'Half of an answer', 'with the text shown so far');
  assert.deepEqual(running.steps, ['Reading the board and the plan', 'Thinking it through', 'Writing the reply'], 'and its steps');
  await call('DELETE', `/jobs/${started.body.jobId}`);
  release();
  await tick(30);
  const last = (await thread()).messages.at(-1) as CompanionReplyMessage;
  assert.equal(last.role, 'assistant');
  assert.equal(last.status, 'stopped');
  assert.equal(last.text, 'Half of an answer');

  scripts.push({ text: 'x', fail: true });
  const failed = await ask('Fails', { tab: 'idea' });
  const stream = await events(failed.body.jobId);
  assert.deepEqual(stream.at(-1), { type: 'failed', data: { message: 'Claude is not signed in.' } });
  const count = (await thread()).messages.length;
  scripts.push({ text: 'Now it works.' });
  const retried = await ask('Fails', { tab: 'idea' }, { retryOf: failed.body.message.id });
  assert.equal(retried.body.message.id, failed.body.message.id);
  await events(retried.body.jobId);
  const after = (await thread()).messages;
  assert.equal(after.length, count + 1, 'only the reply is added');
});

test('a stopped reply that is still being saved goes after its own question, not after the next one', async () => {
  let release!: () => void;
  scripts.push({ deltas: ['Partly ', 'there'], text: 'Partly there', hold: new Promise((resolve) => (release = resolve)), slowStop: 60 });
  const first = await ask('Slow to stop', { tab: 'idea' });
  await tick(40);
  await call('DELETE', `/jobs/${first.body.jobId}`);
  scripts.push({ text: 'Next answer.' });
  const next = await ask('Next question', { tab: 'idea' });
  assert.equal(next.status, 202, 'a new question can be asked at once');
  await events(next.body.jobId);
  release();
  await tick(120);
  const ids = (await thread()).messages.slice(-4).map((message) => (message.role === 'user' ? message.text : message.status ?? message.text));
  assert.deepEqual(ids, ['Slow to stop', 'stopped', 'Next question', 'Next answer.']);
});

test('quitting stops every running reply, so no CLI outlives the app', async () => {
  scripts.push({ deltas: ['Going'], text: 'Going', hold: new Promise(() => {}) });
  const before = asked.length;
  const started = await ask('Never ends', { tab: 'idea' });
  for (let i = 0; i < 200 && asked.length === before; i++) await tick(5);
  assert.ok(cancelAllJobs() >= 1);
  assert.equal(getJob(started.body.jobId)?.status, 'cancelled');
  assert.equal(asked.at(-1)!.signal?.aborted, true, 'the runner was told to stop');
  await tick(20);
});

test('the old Board chat is carried over on first read and its file is kept', async () => {
  const old = (await call<Video>('POST', '/videos', { title: 'Older video' })).body;
  const file = path.join(dir, 'videos', old.id, 'board-chat.json');
  await writeFile(file, JSON.stringify([{ role: 'user', text: 'Hooks?' }, { role: 'assistant', text: 'Two below.', items: [{ kind: 'hook', text: 'A' }, { kind: 'scene', text: 'Intro — why' }], used: [0] }]));
  const read = (await call<CompanionThread>('GET', `/videos/${old.id}/companion`)).body;
  assert.equal(read.messages.length, 2);
  assert.deepEqual(read.messages[0], { id: 'm_board_1', role: 'user', text: 'Hooks?', context: { tab: 'idea' } });
  const reply = read.messages[1] as CompanionReplyMessage;
  assert.deepEqual(reply.cards, [{ action: { type: 'use_hook', text: 'A' }, state: 'applied' }, { action: { type: 'add_note', text: 'Intro — why' }, state: 'offered' }]);
  assert.ok(JSON.parse(await readFile(file, 'utf8')).length === 2, 'the old file stays');
  assert.ok(JSON.parse(await readFile(path.join(dir, 'videos', old.id, 'companion.json'), 'utf8')).messages.length === 2);
  assert.deepEqual(fromBoardChat([]), []);
});

test('a conversation file is read leniently: a bad card goes, never its message; long text is capped; an unreadable file is set aside', async () => {
  const other = (await call<Video>('POST', '/videos', { title: 'Odd files' })).body;
  const folder = path.join(dir, 'videos', other.id);
  const file = path.join(folder, 'companion.json');
  await writeFile(file, JSON.stringify({ messages: [
    { id: 'm1', role: 'user', text: 'Hi', context: { tab: 'plan', extra: true } },
    { id: 'm2', role: 'assistant', text: 'x'.repeat(50_000), tab: 'plan', cards: [{ action: { type: 'use_hook', text: 'Kept' }, state: 'offered' }, 'not a card', { state: 'applied' }, { action: { type: 'from_the_future', x: 1 }, state: 'offered' }] },
    { role: 'assistant', text: 'No id' },
  ] }));
  const read = (await call<CompanionThread>('GET', `/videos/${other.id}/companion`)).body;
  assert.deepEqual(read.messages.map((message) => message.id), ['m1', 'm2'], 'only the message with no id is left out');
  const reply = read.messages[1] as CompanionReplyMessage;
  assert.equal(reply.text.length, 40_000);
  assert.deepEqual([read.messages[0].role === 'user' && read.messages[0].context.tab, reply.tab], ['idea', 'idea'], 'a message saved on Plan or Board reads as Idea');
  assert.deepEqual(reply.cards.map((card) => card.action.type), ['use_hook', 'from_the_future'], 'a card that is not readable goes, its message stays');
  assert.ok((await readdir(folder)).some((name) => /^companion-unreadable-.+\.json$/.test(name)), 'the file as it was is kept aside');
  const refused = await call('POST', `/videos/${other.id}/companion/m2/cards/1/apply`);
  assert.equal(errorOf(refused), "That change can't be applied.", 'a card is checked again on Apply');

  // Not JSON at all: set aside, and the conversation starts empty instead of being replaced by the old Board chat.
  await writeFile(path.join(folder, 'board-chat.json'), JSON.stringify([{ role: 'user', text: 'Old' }]));
  await writeFile(file, '{ not json');
  const fresh = (await call<CompanionThread>('GET', `/videos/${other.id}/companion`)).body;
  assert.deepEqual(fresh.messages, []);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).messages.length, 0);
  assert.ok((await stat(file)).isFile());
});

test('a card with a known type but a field of the wrong kind never breaks the next question', async () => {
  const other = (await call<Video>('POST', '/videos', { title: 'Bad card' })).body;
  await writeFile(path.join(dir, 'videos', other.id, 'companion.json'), JSON.stringify({ messages: [
    { id: 'm1', role: 'user', text: 'Hi', context: { tab: 'plan' } },
    { id: 'm2', role: 'assistant', text: 'ok', tab: 'plan', cards: [{ action: { type: 'use_hook', text: 5 }, state: 'offered' }] },
  ] }));
  scripts.push({ text: 'Fine.' });
  const res = await call<CompanionAsked>('POST', `/videos/${other.id}/companion`, { message: 'Next', context: { tab: 'idea' } });
  const stream = await events(res.body.jobId);
  assert.equal(stream.at(-1)!.type, 'done', JSON.stringify(stream.at(-1)));
  assert.match(asked.at(-1)!.prompt, /use_hook \(not used\)/, 'the history names the card without its broken text');
  assert.equal(errorOf(await call('POST', `/videos/${other.id}/companion/m2/cards/0/apply`)), "That change can't be applied.");
});

test('bad requests are refused', async () => {
  assert.equal((await ask('', { tab: 'idea' })).status, 400);
  assert.equal((await ask('Hi', { tab: 'settings' })).status, 400);
  assert.equal((await call('POST', `/videos/${video.id}/companion/m_none/cards/0/apply`)).status, 404);
  assert.equal((await call('POST', `/videos/${video.id}/companion/m_none/cards/x/apply`)).status, 404);
  assert.equal((await call('GET', '/videos/v_nothing/companion')).status, 404);
});

test('the reply splitter holds back what could be the tag, and the parser reads the actions in every shape', () => {
  const split = new ReplySplitter();
  assert.equal(split.push('Hello <'), 'Hello ');
  assert.equal(split.push('b>bold'), '<b>bold');
  assert.equal(split.push(' end <act'), ' end ');
  assert.equal(split.push('ions>[{"type":"use_'), '');
  assert.deepEqual(split.newActionTypes(), []);
  assert.equal(split.push('hook","text":"x"}]'), '');
  assert.deepEqual(split.newActionTypes(), ['use_hook']);
  assert.deepEqual(split.newActionTypes(), [], 'reported once');
  assert.equal(split.end(), '');
  const other = new ReplySplitter();
  assert.equal(other.push('a <ac'), 'a ');
  assert.equal(other.end(), '<ac', 'not the tag after all');

  assert.deepEqual(parseReply('Just words.'), { reply: 'Just words.', actions: [] });
  assert.deepEqual(parseReply('Words.\n```\n<actions>\n```json\n[{"type":"use_hook","text":"x"}]\n```\n</actions>\n```').actions, [{ type: 'use_hook', text: 'x' }]);
  assert.deepEqual(parseReply('Words.\n<actions>{"actions":[{"type":"add_note","text":"n"}]}</actions>').actions, [{ type: 'add_note', text: 'n' }]);
  assert.deepEqual(parseReply('Words.\n<actions>[{"type":"add_note","text":"cut off"').actions, [], 'an unfinished list offers nothing');
  assert.equal(parseReply('Words.\n```\n<actions>[]</actions>').reply, 'Words.');
  assert.equal(chunkText('').length, 0);
  assert.equal(chunkText('a b c d e f g h i j k l m n o p q r s t u v w x y z').join(''), 'a b c d e f g h i j k l m n o p q r s t u v w x y z');
});

test('a scene script card writes the script of that scene, can be undone, and an unknown scene is left out', async () => {
  const reply = await replyWith([
    { type: 'set_scene_script', sceneId: 's_missing', script: 'Never shown.' },
    { type: 'set_scene_script', sceneId: s1, script: '  Most people only use a sliver of their AI tool.\n\nHere is the first thing to try.  ' },
  ]);
  assert.deepEqual(reply.cards.map((card) => card.action), [{ type: 'set_scene_script', sceneId: s1, script: 'Most people only use a sliver of their AI tool.\n\nHere is the first thing to try.' }]);
  const scriptOf = async () => ((await call<{ outline: { scenes: Array<{ id: string; script?: string }> } }>('GET', `/videos/${video.id}/plan`)).body.outline.scenes.find((scene) => scene.id === s1)?.script ?? '').trim();
  const before = await scriptOf();
  const applied = await apply(reply, 0);
  assert.equal(applied.status, 200);
  assert.match(applied.body.message.cards[0].result ?? '', /Wrote the script for scene 1/);
  assert.equal(await scriptOf(), 'Most people only use a sliver of their AI tool.\n\nHere is the first thing to try.');
  assert.equal((await undo(reply, 0)).status, 200);
  assert.equal(await scriptOf(), before, 'Undo puts the earlier script back');
});

test('a question card needs 2 to 4 short answers, is offered on every step, and cannot be applied', async () => {
  const reply = await replyWith([
    { type: 'ask_choice', question: 'Who is this video for?', options: ['Beginners', 'Developers'] },
    { type: 'ask_choice', question: 'Only one answer?', options: ['Yes'] },
    { type: 'ask_choice', question: 'Too many?', options: ['a', 'b', 'c', 'd', 'e'] },
  ]);
  assert.deepEqual(reply.cards.map((card) => card.action), [{ type: 'ask_choice', question: 'Who is this video for?', options: ['Beginners', 'Developers'] }]);
  const refused = await apply(reply, 0);
  assert.equal(refused.status, 400);
  const onEdit = await replyWith([{ type: 'ask_choice', question: 'How long?', options: ['Short', 'Long'] }], 'edit');
  assert.equal(onEdit.cards.length, 1);
});

test('the Idea cards fill the idea, the three pairs and the whole hook, and each Undo puts back exactly what it changed', async () => {
  const read = async () => (await call<Video>('GET', `/videos/${video.id}`)).body;
  const title = (await read()).title;
  const reply = await replyWith([
    { type: 'set_idea', angle: 'Three skills that edit your videos for you', why: 'Two videos on the board beat their usual by 3x' },
    { type: 'set_pairs', pairs: [{ title: 'Three Claude skills edit my videos', thumb: 'NO EDITOR' }, { title: 'I stopped editing videos', thumb: 'CLAUDE EDITS' }], use: 2 },
    { type: 'set_hook', visual: 'The timeline cutting itself', text: 'NO EDITOR' },
    { type: 'set_idea' },
    { type: 'set_pairs', pairs: [{ title: 'Is this the best Claude skill?', thumb: 'WOW SO GOOD' }] },
    { type: 'set_pairs', pairs: [{ title: 'Claude edits my videos now', thumb: 'NO EDITOR' }], use: 2 },
  ]);
  assert.deepEqual(reply.cards.map((card) => card.action.type), ['set_idea', 'set_pairs', 'set_hook'], 'an empty card, a broken title and a pair that is not there are left out');

  const idea = await apply(reply, 0);
  assert.equal(idea.status, 200, JSON.stringify(idea.body));
  assert.deepEqual(idea.body.changed, ['package', 'videos']);
  assert.equal((await plan()).package.angle, 'Three skills that edit your videos for you');
  assert.equal((await read()).idea?.why, 'Two videos on the board beat their usual by 3x', 'why it could work is the video\'s own');

  const before = (await plan()).package;
  assert.equal((await apply(reply, 1)).body.message.cards[1].result, 'Set your titles and thumbnails, using pair 2');
  const pairs = (await plan()).package;
  assert.deepEqual(pairs.titles, ['Three Claude skills edit my videos', 'I stopped editing videos', before.titles[2]], 'the third place keeps what it held');
  assert.deepEqual(pairs.thumbs!.slice(0, 2), ['NO EDITOR', 'CLAUDE EDITS']);
  assert.equal(pairs.thumbnailText, 'CLAUDE EDITS', 'the thumbnail text is the pair in use');
  assert.equal((await read()).title, 'I stopped editing videos', 'using pair 2 makes its title the video title');

  const spoken = (await plan()).package.hook.spoken;
  await apply(reply, 2);
  assert.deepEqual((await plan()).package.hook, { spoken, visual: 'The timeline cutting itself', text: 'NO EDITOR' }, 'what the card leaves out stays');

  // Undo puts back exactly what each card changed.
  await undo(reply, 2);
  assert.deepEqual((await plan()).package.hook, before.hook);
  await undo(reply, 1);
  assert.deepEqual((await plan()).package.titles, before.titles);
  assert.equal((await read()).title, title, 'the video title goes back too');
  // Changed by hand since: Undo refuses rather than overwrite it.
  await call('PUT', `/videos/${video.id}`, { idea: { why: 'My own words' } });
  assert.equal((await undo(reply, 0)).status, 409);
  assert.equal((await read()).idea?.why, 'My own words');
});

test('Use as title moves each title with its own thumbnail words', async () => {
  await call('PUT', `/videos/${video.id}/package`, { titles: ['First title here', 'Second title here', ''], thumbs: ['FIRST WORDS', 'SECOND WORDS', ''] });
  const reply = await replyWith([{ type: 'use_title', text: 'Second title here' }]);
  await apply(reply, 0);
  const { package: pkg } = await plan();
  assert.deepEqual(pkg.titles.slice(0, 2), ['Second title here', 'First title here']);
  assert.deepEqual(pkg.thumbs!.slice(0, 2), ['SECOND WORDS', 'FIRST WORDS'], 'the words stay with their title');
  await undo(reply, 0);
});
