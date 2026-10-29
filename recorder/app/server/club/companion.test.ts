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
const { validateActions, applyAction, CHANGED_SINCE } = await import('./companion-actions.js');
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
  assert.equal(errorOf(refused), CHANGED_SINCE);
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
  const reply = await replyWith([{ type: 'add_note', text: 'Free plan questions keep coming.' }], 'board');
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

test('Stop keeps what arrived as a stopped reply; one reply runs at a time; Try again does not save the question twice', async () => {
  let release!: () => void;
  scripts.push({ deltas: ['Half of an ', 'answer'], text: 'Half of an answer and more', hold: new Promise((resolve) => (release = resolve)) });
  const started = await ask('Long one', { tab: 'plan' });
  assert.equal((await ask('Another', { tab: 'plan' })).status, 409, 'a second question waits for the first');
  assert.equal((await thread()).running?.messageId, started.body.message.id, 'a reopened panel finds the running reply');
  await tick(80);
  const running = (await thread()).running!;
  assert.equal(running.text, 'Half of an answer', 'with the text shown so far');
  assert.deepEqual(running.steps, ['Reading the plan', 'Thinking it through', 'Writing the reply'], 'and its steps');
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

test('a stopped reply that is still being saved goes after its own question, not after the next one', async () => {
  let release!: () => void;
  scripts.push({ deltas: ['Partly ', 'there'], text: 'Partly there', hold: new Promise((resolve) => (release = resolve)), slowStop: 60 });
  const first = await ask('Slow to stop', { tab: 'plan' });
  await tick(40);
  await call('DELETE', `/jobs/${first.body.jobId}`);
  scripts.push({ text: 'Next answer.' });
  const next = await ask('Next question', { tab: 'plan' });
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
  const started = await ask('Never ends', { tab: 'plan' });
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
  assert.deepEqual(read.messages[0], { id: 'm_board_1', role: 'user', text: 'Hooks?', context: { tab: 'board' } });
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
