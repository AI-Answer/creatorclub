import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
}
const scripts: Script[] = [];
const asked: RunAIOptions[] = [];
const { AiError } = await import('./ai.js');
const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  asked.push(options);
  const script = scripts.shift() ?? { text: 'No script.' };
  const aborted = new Promise<never>((_, reject) => options.signal?.addEventListener('abort', () => reject(new AiError('cancelled', 'That was stopped.')), { once: true }));
  aborted.catch(() => {});
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
const { validateActions } = await import('./companion-actions.js');
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
  const res = await ask('What is missing?', { tab: 'plan', sceneId: s2, screen: 'Package filled, 2 scenes' });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  await events(res.body.jobId);
  const prompt = asked.at(-1)!.prompt;
  assert.match(prompt, /Short sentences\. Shows the screen first\./, 'the voice');
  assert.match(prompt, /Title: Hidden features/, 'the idea');
  assert.match(prompt, /Spoken: You never opened this\./, 'the package');
  assert.match(prompt, new RegExp(`### 2\\. Level 1 \\(id: ${s2}, 1:00–3:00\\)`), 'scenes with ids and times');
  assert.match(prompt, /People keep asking about the free plan\./, 'a board tile');
  assert.match(prompt, /Step: Plan/);
  assert.match(prompt, new RegExp(`Scene in focus: 2\\. Level 1 \\(id: ${s2}\\)`));
  assert.match(prompt, /On screen: Package filled, 2 scenes/);
  assert.match(prompt, /- set_scene:/, 'Plan offers set_scene');
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
  const res = await ask('Draft the scenes', { tab: 'board' });
  const stream = await events(res.body.jobId);
  const steps = stream.filter((event) => event.data?.type === 'step').map((event) => event.data.label);
  // The actions start before their type is known: a short 'Preparing the changes', then the step named by the action.
  assert.deepEqual(steps, ['Reading the board', 'Thinking it through', 'Writing the reply', 'Preparing the changes', 'Drafting scenes', 'Checking the changes']);
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
      { type: 'set_description', text: 'Not on Plan' },
      { type: 'use_title', text: 'Is this a question?' },
      { type: 'use_title', text: 'Hidden features you never opened' },
      { type: 'use_title', text: 'Hidden features you never opened' },
      { type: 'use_hook', text: 'x', extra: true },
      'nonsense',
    ],
    { tab: 'plan', sceneIds: [s1, s2] },
  );
  assert.deepEqual(actions, [{ type: 'set_scene', sceneId: s1, talkingPoints: ['Show it'] }, { type: 'use_title', text: 'Hidden features you never opened' }]);
  assert.equal(rejected.length, 7, rejected.join('\n'));
  assert.ok(rejected.some((line) => line.includes('no scene s_missing')));
  assert.ok(rejected.some((line) => line.startsWith('set_description: not offered on plan')));
  assert.equal(validateActions([{ type: 'use_hook', text: 'Hi' }], { tab: 'edit', sceneIds: [] }).actions.length, 0, 'Edit offers none yet');
});

test('a reply whose actions name an unknown scene keeps only the valid cards', async () => {
  scripts.push({ text: `Two changes.\n<actions>[{"type":"set_scene","sceneId":"s_gone","title":"X"},{"type":"set_scene","sceneId":"${s2}","title":"Level 1: one click"},{"type":"warp"}]</actions>` });
  const res = await ask('Tighten scene 2', { tab: 'plan', sceneId: s2 });
  const reply = (await events(res.body.jobId)).at(-1)!.data as CompanionReplyMessage;
  assert.deepEqual(reply.cards.map((card) => card.action), [{ type: 'set_scene', sceneId: s2, title: 'Level 1: one click' }]);
});

const replyWith = async (actions: unknown[], tab = 'plan') => {
  scripts.push({ text: `Done.\n<actions>${JSON.stringify(actions)}</actions>` });
  const res = await ask('Do it', { tab });
  return (await events(res.body.jobId)).at(-1)!.data as CompanionReplyMessage;
};
const apply = (reply: CompanionReplyMessage, index: number) => call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/${index}/apply`);
const undo = (reply: CompanionReplyMessage, index: number) => call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/${index}/undo`);
const plan = async () => (await call<{ package: Package; outline: Outline }>('GET', `/videos/${video.id}/plan`)).body;

test('every applied card is a version: Use as hook and Use as title apply and undo', async () => {
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

  const undone = await undo(reply, 0);
  assert.equal(undone.body.message.cards[0].state, 'undone');
  assert.equal(undone.body.message.cards[0].version, undefined);
  // Undo puts the file back as it was before that card, so the title applied after it goes too; it is kept beside the package.
  assert.equal((await plan()).package.hook.spoken, 'You never opened this.');
  assert.ok((await readdir(vdir)).some((name) => /^package-undone-.+\.json$/.test(name)), 'what was there is kept aside');
  assert.equal((await undo(reply, 0)).status, 409, 'nothing left to undo');
  assert.equal((await apply(reply, 0)).status, 200, 'an undone card can be applied again');
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
});

test('Set scene changes one scene by its id; a scene removed meanwhile is a clear refusal', async () => {
  const reply = await replyWith([{ type: 'set_scene', sceneId: s1, talkingPoints: ['Show the finished thing', 'Say why'] }]);
  await apply(reply, 0);
  const scenes = (await plan()).outline.scenes;
  assert.deepEqual(scenes[0].talkingPoints, ['Show the finished thing', 'Say why']);
  assert.equal(scenes[0].id, s1, 'the id stays');
  await undo(reply, 0);
  assert.deepEqual((await plan()).outline.scenes[0].talkingPoints, ['Show the result']);

  const stale = await replyWith([{ type: 'set_scene', sceneId: s2, title: 'Gone soon' }]);
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [(await plan()).outline.scenes[0]] });
  const refused = await apply(stale, 0);
  assert.equal(refused.status, 409);
  assert.equal(refused.body && (refused.body as unknown as { error: string }).error, 'That scene is no longer in the plan.');
  await call('PUT', `/videos/${video.id}/outline`, saved);
});

test('Add note puts a tile on the board and Undo takes it off; the description is set from Publish', async () => {
  const reply = await replyWith([{ type: 'add_note', text: 'Free plan questions keep coming.' }], 'board');
  const count = async () => ((await call<ResearchTile[]>('GET', `/videos/${video.id}/research`)).body).length;
  const before = await count();
  assert.deepEqual((await apply(reply, 0)).body.changed, ['board']);
  assert.equal(await count(), before + 1);
  await undo(reply, 0);
  assert.equal(await count(), before);

  const publish = await replyWith([{ type: 'set_description', text: 'What you get.\n\n0:00 Opening' }], 'publish');
  await apply(publish, 0);
  assert.equal((await plan()).package.description, 'What you get.\n\n0:00 Opening');
  await undo(publish, 0);
  assert.equal((await plan()).package.description, undefined);
});

test('Stop keeps what arrived as a stopped reply; one reply runs at a time; Try again does not save the question twice', async () => {
  let release!: () => void;
  scripts.push({ deltas: ['Half of an ', 'answer'], text: 'Half of an answer and more', hold: new Promise((resolve) => (release = resolve)) });
  const started = await ask('Long one', { tab: 'plan' });
  assert.equal((await ask('Another', { tab: 'plan' })).status, 409, 'a second question waits for the first');
  assert.equal((await thread()).running?.messageId, started.body.message.id, 'a reopened panel finds the running reply');
  await tick(30);
  await call('DELETE', `/jobs/${started.body.jobId}`);
  release();
  await tick(30);
  const last = (await thread()).messages.at(-1) as CompanionReplyMessage;
  assert.equal(last.role, 'assistant');
  assert.equal(last.status, 'stopped');
  assert.equal(last.text, 'Half of an answer');

  scripts.push({ text: 'x', fail: true });
  const failed = await ask('Fails', { tab: 'plan' });
  const stream = await events(failed.body.jobId);
  assert.deepEqual(stream.at(-1), { type: 'failed', data: { message: 'Claude is not signed in.' } });
  const count = (await thread()).messages.length;
  scripts.push({ text: 'Now it works.' });
  const retried = await ask('Fails', { tab: 'plan' }, { retryOf: failed.body.message.id });
  assert.equal(retried.body.message.id, failed.body.message.id);
  await events(retried.body.jobId);
  const after = (await thread()).messages;
  assert.equal(after.length, count + 1, 'only the reply is added');
});

test('the old Board chat is carried over on first read and its file is kept', async () => {
  const old = (await call<Video>('POST', '/videos', { title: 'Older video' })).body;
  const file = path.join(dir, 'videos', old.id, 'board-chat.json');
  await writeFile(file, JSON.stringify([{ role: 'user', text: 'Hooks?' }, { role: 'assistant', text: 'Two below.', items: [{ kind: 'hook', text: 'A' }, { kind: 'scene', text: 'Intro — why' }], used: [0] }]));
  const read = (await call<CompanionThread>('GET', `/videos/${old.id}/companion`)).body;
  assert.equal(read.messages.length, 2);
  assert.deepEqual(read.messages[0], { id: 'm_board_1', role: 'user', text: 'Hooks?', context: { tab: 'board' } });
  const reply = read.messages[1] as CompanionReplyMessage;
  assert.deepEqual(reply.cards, [{ action: { type: 'use_hook', text: 'A' }, state: 'applied' }, { action: { type: 'add_note', text: 'Intro — why' }, state: 'offered' }]);
  assert.ok(JSON.parse(await readFile(file, 'utf8')).length === 2, 'the old file stays');
  assert.ok(JSON.parse(await readFile(path.join(dir, 'videos', old.id, 'companion.json'), 'utf8')).messages.length === 2);
  assert.deepEqual(fromBoardChat([]), []);
});

test('bad requests are refused', async () => {
  assert.equal((await ask('', { tab: 'plan' })).status, 400);
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
