import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { BoardChatMessage, Breakdown, ResearchTile, SignalItem, TrendingItem, Video } from '../../shared/club.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * The video Board through the HTTP routes: tile positions and the free-spot grid, the signal and breakdown tiles, a Board that
 * starts with its source, "Ask Claude about this board" with a stand-in for the AI, and Use as hook / title.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-board-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');

// The stand-in AI answers the board chat by the schema it was given, and remembers every prompt.
const asked: { title: string; prompt: string; system?: string; budgetUsd?: number }[] = [];
const answers: unknown[] = [];
let wait: Promise<void> | undefined;
let stopped = 0;
const { AiError } = await import('./ai.js');
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  asked.push({ title: (options.jsonSchema as { title?: string }).title ?? 'text', prompt: options.prompt, system: options.system, budgetUsd: options.budgetUsd });
  // While `wait` is set the answer waits for it; a stopped call ends the wait the way the real CLI is killed.
  if (wait) await Promise.race([wait, new Promise((_, reject) => options.signal?.addEventListener('abort', () => (stopped++, reject(new AiError('cancelled', 'That was stopped.'))), { once: true }))]);
  const json = answers.shift();
  return { text: JSON.stringify(json), json };
}

const { clubRouter } = await import('./index.js');
const store = await import('./store.js');
const { freeSpot } = await import('./tile-layout.js');
const { boardText, cleanItems } = await import('./board-chat.js');
const { buildBoardChatPrompt } = await import('./prompts.js');

const app = express();
app.use('/api/club', clubRouter({ runAI: fakeAI }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  await rm(temp, { recursive: true, force: true });
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'], about: 'Practical AI for small shops.' });
const dir = path.join(process.env.CREATORCLUB_DIR!, 'maya-lopez');
const tiles = async (id: string) => (await call('GET', `/videos/${id}/research`)).body as ResearchTile[];

// ---------------------------------------------------------------- positions

test('new tiles take the first free slot of the grid, five across, wider for a breakdown', () => {
  const noTiles: Pick<ResearchTile, 'kind' | 'pos'>[] = [];
  assert.deepEqual(freeSpot(noTiles, 'note'), { x: 60, y: 60, w: 280 });
  const placed: Pick<ResearchTile, 'kind' | 'pos'>[] = [];
  const spots = Array.from({ length: 7 }, () => {
    const spot = freeSpot(placed, 'note');
    placed.push({ kind: 'note', pos: spot });
    return [spot.x, spot.y];
  });
  assert.deepEqual(spots, [[60, 60], [400, 60], [740, 60], [1080, 60], [1420, 60], [60, 470], [400, 470]]);
  assert.equal(freeSpot([], 'breakdown').w, 320);
  // A tile the person dragged onto a slot takes that slot; a tile without a position takes no room.
  assert.deepEqual(freeSpot([{ kind: 'note', pos: { x: 70, y: 80 } }, { kind: 'note' }], 'note'), { x: 400, y: 60, w: 280 });
  // A wide tile covers the slot beside it.
  assert.deepEqual(freeSpot([{ kind: 'note', pos: { x: 60, y: 60, w: 500 } }], 'note'), { x: 740, y: 60, w: 280 });
});

test('a tile is placed when it is added, and two added at once do not share a place', async () => {
  const video = (await call('POST', '/videos', { title: 'Positions' })).body as Video;
  const added = await Promise.all(['one', 'two', 'three'].map((text) => call('POST', `/videos/${video.id}/research`, { kind: 'note', text })));
  assert.deepEqual(added.map((res) => res.status), [201, 201, 201]);
  const spots = added.map((res) => `${res.body.pos.x},${res.body.pos.y}`);
  assert.equal(new Set(spots).size, 3);
  assert.deepEqual(spots.sort(), ['400,60', '60,60', '740,60']);
  assert.ok(added.every((res) => res.body.pos.w === 280));
});

test('PATCH moves a tile, renames it and edits a note; it checks the numbers and writes only what was sent', async () => {
  const video = (await call('POST', '/videos', { title: 'Patch' })).body as Video;
  const note = (await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: 'First thought' })).body as ResearchTile;
  const link = (await call('POST', `/videos/${video.id}/research`, { kind: 'link', url: 'https://example.com/a' })).body as ResearchTile;
  const url = (tile: ResearchTile) => `/videos/${video.id}/research/${tile.id}`;

  const moved = await call('PATCH', url(note), { pos: { x: 500.5, y: 120 } });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.body.pos, { x: 500.5, y: 120, w: 280 }, 'the width stays when it is not sent');
  assert.equal(moved.body.text, 'First thought');
  assert.deepEqual((await call('PATCH', url(note), { pos: { x: 10, y: 20, w: 400 } })).body.pos, { x: 10, y: 20, w: 400 });
  const edited = await call('PATCH', url(note), { text: 'Second thought', title: 'Idea' });
  assert.deepEqual([edited.body.text, edited.body.title, edited.body.pos.x], ['Second thought', 'Idea', 10]);
  assert.equal((await call('PATCH', url(note), { text: '' })).body.text, '', 'a note can be cleared');

  assert.equal((await call('PATCH', url(link), { title: 'Renamed' })).body.title, 'Renamed');
  assert.equal((await call('PATCH', url(link), { text: 'x' })).status, 400, 'only notes have text to edit');
  assert.equal((await call('PATCH', url(link), { text: 'x' })).body.error, 'Only notes can be edited.');

  for (const bad of [{}, { pos: { x: -1, y: 0 } }, { pos: { x: 0, y: 20_001 } }, { pos: { x: 'a', y: 0 } }, { pos: { x: 0 } }, { pos: { x: 0, y: 0, w: 50 } }, { pos: { x: 0, y: 0, w: 5000 } }, { pos: { x: null, y: 0 } }, { kind: 'video' }, { id: 'other' }]) {
    assert.equal((await call('PATCH', url(note), bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call('PATCH', `/videos/${video.id}/research/t_nothing`, { title: 'x' })).status, 404);
  assert.deepEqual((await tiles(video.id)).find((tile) => tile.id === note.id)?.pos, { x: 10, y: 20, w: 400 }, 'bad requests changed nothing');
});

test('tiles saved before positions existed are placed when the board is read, once', async () => {
  const video = (await call('POST', '/videos', { title: 'Old tiles' })).body as Video;
  const folder = path.join(dir, 'videos', video.id, 'research');
  await mkdir(folder, { recursive: true });
  for (const [index, kind] of (['note', 'link', 'note'] as const).entries()) {
    await writeFile(path.join(folder, `t_old${index}.json`), JSON.stringify({ id: `t_old${index}`, kind, text: `old ${index}`, meta: {}, createdAt: `2026-10-0${index + 1}T00:00:00.000Z` }));
  }
  const first = await tiles(video.id);
  assert.deepEqual(first.map((tile) => [tile.id, tile.pos?.x, tile.pos?.y]), [['t_old0', 60, 60], ['t_old1', 400, 60], ['t_old2', 740, 60]]);
  await call('PATCH', `/videos/${video.id}/research/t_old0`, { pos: { x: 900, y: 900 } });
  const second = await tiles(video.id);
  assert.deepEqual(second.map((tile) => tile.pos?.x), [900, 400, 740], 'a placed tile keeps its place');
  assert.equal(JSON.parse(await readFile(path.join(folder, 't_old1.json'), 'utf8')).pos.x, 400, 'and the place is saved');
});

// ---------------------------------------------------------------- new kinds

const breakdown = (id: string): Breakdown => ({
  id,
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  platform: 'youtube',
  createdAt: '2026-10-28T00:00:00.000Z',
  video: { title: 'How I built it', channel: 'Source Channel', views: 1000, likes: 10, comments: 2, ageDays: 3, thumbnail: '' },
  whyItWorked: { titlePackaging: 'A bold claim.', hookSpeed: 'Within ten seconds.', structure: ['Claim', 'Demo'], retention: 'Open loops.', payoff: 'A working thing.', short: ['Clear claim'] },
  reusableOutline: ['Claim the outcome', 'Show the build'],
  viewerQuestions: [{ question: 'Does it work on a free plan?', likes: 9 }],
  concepts: [
    { title: 'Concept one', angle: 'An angle', twist: 'A twist', hook: 'A hook', demand: { level: 'high', note: 'Asked.' }, gap: { level: 'mid', note: 'Few.' }, show: { level: 'low', note: 'Setup.' }, why: 'Because' },
  ],
});
const BD = 'bd_aaaaaaaaaaaa';
await mkdir(path.join(dir, 'breakdowns', BD), { recursive: true });
await writeFile(path.join(dir, 'breakdowns', BD, 'breakdown.json'), JSON.stringify(breakdown(BD)));

test('signal and breakdown tiles can be added, and need what they show', async () => {
  const video = (await call('POST', '/videos', { title: 'Kinds' })).body as Video;
  const post = await call('POST', `/videos/${video.id}/research`, { kind: 'signal', url: 'https://x.com/a/status/1', text: 'Claude can now run your inbox', meta: { source: 'x', author: '@a', likes: 900, replies: 40 } });
  assert.equal(post.status, 201);
  assert.deepEqual([post.body.kind, post.body.text, post.body.meta.source, post.body.meta.likes], ['signal', 'Claude can now run your inbox', 'x', 900]);
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'signal', url: 'https://x.com/a/status/1' })).body.error, 'Add the post first.');
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'signal', text: 'x', meta: { source: 'tiktok' } })).status, 400);

  const linked = await call('POST', `/videos/${video.id}/research`, { kind: 'breakdown', title: 'How I built it', meta: { breakdownId: BD } });
  assert.equal(linked.status, 201);
  assert.equal(linked.body.pos.w, 320);
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'breakdown' })).body.error, 'Pick a breakdown first.');
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'breakdown', meta: { breakdownId: 'bd_bbbbbbbbbbbb' } })).status, 404, 'a breakdown that is not saved');
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'breakdown', meta: { breakdownId: '../x' } })).status, 400);

  // A note can be added empty, to be written on the Board.
  const blank = await call('POST', `/videos/${video.id}/research`, { kind: 'note' });
  assert.equal(blank.status, 201);
  assert.equal(blank.body.text, undefined);
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'text' })).body.error, 'Add some text first.');
});

test('a video made from a breakdown concept, a Signals post or a Working now video starts its Board with that source', async () => {
  const concept = await call('POST', `/breakdowns/${BD}/concepts/0/add`);
  assert.equal(concept.status, 201);
  const fromConcept = await tiles(concept.body.id);
  assert.deepEqual(fromConcept.map((tile) => [tile.kind, tile.title, tile.meta.breakdownId, tile.url]), [['breakdown', 'How I built it', BD, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']]);

  const post: SignalItem = { id: 'x-77', source: 'x', author: 'Alex Finn', handle: 'alexfinn', text: 'Claude can now run your inbox. Here is how.', url: 'https://x.com/alexfinn/status/77', likes: 1200, replies: 80, views: 50_000, media: null, createdAt: '2026-10-28T00:00:00.000Z', ageHours: 5 };
  await writeFile(path.join(dir, 'signals.json'), JSON.stringify({ updatedAt: '2026-10-28T00:00:00.000Z', items: [post], errors: [] }));
  const fromPost = await call('POST', '/signals/idea', { id: 'x-77' });
  assert.equal(fromPost.status, 201);
  const postTiles = await tiles(fromPost.body.id);
  assert.equal(postTiles.length, 1);
  assert.deepEqual([postTiles[0].kind, postTiles[0].text, postTiles[0].url, postTiles[0].meta], ['signal', post.text, post.url, { source: 'x', author: '@alexfinn', likes: 1200, replies: 80, views: 50_000 }]);
  assert.equal((await call('POST', '/signals/idea', { id: 'x-77' })).status, 200);
  assert.equal((await tiles(fromPost.body.id)).length, 1, 'a second click adds no second tile');

  const item: TrendingItem = { videoId: 'abcdefghijk', title: 'Claude Code in 20 minutes', channel: 'Duncan', kind: 'followed', views: 120_000, likes: 4000, comments: null, published: '2026-10-24', ageDays: 4, vpd: 30_000, mult: 3.2, history: [], firstSeen: '2026-10-20', fit: true };
  await writeFile(path.join(dir, 'trending.json'), JSON.stringify([item]));
  const fromVideo = await call('POST', '/trending/idea', { videoId: item.videoId });
  assert.equal(fromVideo.status, 201);
  const videoTiles = await tiles(fromVideo.body.id);
  assert.deepEqual(
    [videoTiles[0].kind, videoTiles[0].title, videoTiles[0].url, videoTiles[0].meta],
    ['video', item.title, 'https://www.youtube.com/watch?v=abcdefghijk', { platform: 'youtube', channel: 'Duncan', views: 120_000, ageDays: 4, thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', likes: 4000, multiplier: 3.2 }],
  );
});

// ---------------------------------------------------------------- Ask Claude about this board

const boardVideo = (await call('POST', '/videos', { title: 'Hidden features' })).body as Video;
await call('POST', `/videos/${boardVideo.id}/research`, { kind: 'note', text: 'People keep asking about the free plan.' });
await call('POST', `/videos/${boardVideo.id}/research`, { kind: 'signal', url: 'https://x.com/a/status/9', text: 'Nobody reads the settings page', meta: { source: 'x', author: '@a', likes: 300 } });
await call('POST', `/videos/${boardVideo.id}/research`, { kind: 'breakdown', title: 'How I built it', meta: { breakdownId: BD } });
const chat = (message: string, history: unknown[] = []) => call('POST', `/videos/${boardVideo.id}/board/chat`, { message, history });

test('Ask Claude: one structured call with the board, the channel, and no one else\'s name; the reply comes back with items', async () => {
  answers.push({ reply: 'Three openings below, from the post and your note.', items: [{ kind: 'hook', text: 'Nobody reads this page.' }, { kind: 'hook', text: ' Nobody reads this page. ' }, { kind: 'title', text: 'The settings page nobody reads' }, { kind: 'note', text: '' }] });
  const res = await chat('Write three hooks from this board');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { reply: 'Three openings below, from the post and your note.', items: [{ kind: 'hook', text: 'Nobody reads this page.' }, { kind: 'title', text: 'The settings page nobody reads' }] });

  assert.equal(asked.length, 1);
  const prompt = asked[0].prompt;
  assert.equal(asked[0].title, 'BoardChat');
  assert.equal(asked[0].budgetUsd, 0.5);
  assert.match(prompt, /Hidden features/, 'the idea');
  assert.match(prompt, /People keep asking about the free plan\./, 'a note');
  assert.match(prompt, /Post on X by @a \(300 likes\): Nobody reads the settings page/, 'a post');
  assert.match(prompt, /Breakdown of "How I built it" by Source Channel/, 'a breakdown');
  assert.match(prompt, /Claim the outcome/, 'its reusable outline');
  assert.match(prompt, /Practical AI for small shops/, 'the channel profile');
  assert.match(prompt, /<question>\nWrite three hooks from this board\n<\/question>/);
  assert.match(prompt, /second person/);
  assert.doesNotMatch(prompt, /Samin/, 'a channel that is not Samin\'s never reads his name');
  assert.doesNotMatch(prompt, /\{[a-z_]+\}/, 'every placeholder is filled');
});

test('the exchange is saved with the video, so reopening the Board keeps it; used items can be marked', async () => {
  const saved = (await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as BoardChatMessage[];
  assert.deepEqual(saved.map((m) => m.role), ['user', 'assistant']);
  assert.equal(saved[0].text, 'Write three hooks from this board');
  assert.equal(saved[1].items?.length, 2);
  assert.ok((await readdir(path.join(dir, 'videos', boardVideo.id))).includes('board-chat.json'));

  const marked = await call('PUT', `/videos/${boardVideo.id}/board/chat`, [saved[0], { ...saved[1], used: [0] }]);
  assert.equal(marked.status, 200);
  assert.deepEqual(((await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as BoardChatMessage[])[1].used, [0]);
  assert.equal((await call('PUT', `/videos/${boardVideo.id}/board/chat`, [{ role: 'robot', text: 'x' }])).status, 400);
  assert.equal((await call('PUT', `/videos/${boardVideo.id}/board/chat`, [{ ...saved[0], extra: 1 }])).status, 400);
  assert.deepEqual(((await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as BoardChatMessage[]).length, 2, 'bad requests changed nothing');
  assert.deepEqual((await call('GET', '/videos/v_nothing/board/chat')).status, 404);
});

test('a long conversation is cut to the last twelve turns, each trimmed, and the saved chat grows by the new pair', async () => {
  const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `turn ${index} ${'word '.repeat(600)}` }));
  answers.push({ reply: 'Here is what is missing.', items: [] });
  const earlier = asked.length;
  const res = await chat("What's missing before I plan?", history);
  assert.deepEqual(res.body, { reply: 'Here is what is missing.', items: [] });
  const prompt = asked[earlier].prompt;
  assert.doesNotMatch(prompt, /turn 17 /, 'older turns are left out');
  assert.match(prompt, /turn 18 /);
  assert.match(prompt, /turn 29 /);
  assert.equal(prompt.match(/turn \d+ /g)?.length, 12);
  assert.ok(prompt.length < 30_000, `the prompt stays bounded (${prompt.length})`);
  const saved = (await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as BoardChatMessage[];
  assert.deepEqual(saved.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(saved[3].items, undefined);
});

test('an answer in the wrong shape, an empty message and a missing video are plain sentences, and nothing is saved', async () => {
  const before = ((await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as unknown[]).length;
  const log = console.error;
  console.error = () => {};
  answers.push({ reply: 'No items key' });
  const bad = await chat('Hello');
  console.error = log;
  assert.equal(bad.status, 502);
  assert.match(bad.body.error, /answered in a shape we could not read/);
  answers.push({ reply: '   ', items: [] });
  assert.equal((await chat('Hello')).status, 502);
  assert.equal((await chat('   ')).status, 400);
  assert.equal((await call('POST', `/videos/${boardVideo.id}/board/chat`, { message: 'x', history: [{ role: 'system', text: 'x' }] })).status, 400);
  assert.equal((await call('POST', '/videos/v_nothing/board/chat', { message: 'x' })).status, 404);
  assert.equal(((await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as unknown[]).length, before);
});

test('closing the panel stops the call, and nothing is saved', async () => {
  const before = ((await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as unknown[]).length;
  wait = new Promise<void>(() => {});
  const earlier = asked.length;
  const request = new AbortController();
  const pending = fetch(`${base}/videos/${boardVideo.id}/board/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Slow one', history: [] }), signal: request.signal }).catch(() => undefined);
  for (let i = 0; i < 100 && asked.length === earlier; i++) await new Promise((r) => setTimeout(r, 10));
  request.abort();
  await pending;
  for (let i = 0; i < 100 && !stopped; i++) await new Promise((r) => setTimeout(r, 10));
  wait = undefined;
  assert.equal(stopped, 1, 'the model call was stopped');
  assert.equal(((await call('GET', `/videos/${boardVideo.id}/board/chat`)).body as unknown[]).length, before);
});

test('the board shown to the model is bounded however many tiles or how long the transcripts are', async () => {
  const many: ResearchTile[] = Array.from({ length: 80 }, (_, index) => ({ id: `t${index}`, kind: 'note', text: `note ${index} ${'x'.repeat(5000)}`, meta: {}, createdAt: `2026-10-01T00:00:${String(index % 60).padStart(2, '0')}.000Z` }));
  const text = await boardText('maya-lopez', boardVideo.id, many);
  assert.ok(text.length < 26_000, `bounded (${text.length})`);
  assert.match(text, /^\(20 older tiles are left out\)/);
  assert.match(text, /note 79 /);
  assert.doesNotMatch(text, /note 0 /);
  assert.equal(await boardText('maya-lopez', boardVideo.id, []), '');
});

test('items are cleaned: no repeats or empty lines, titles must follow the title rules, six at most', () => {
  const items = cleanItems([
    { kind: 'title', text: 'Is this the best AI tool today?' },
    { kind: 'title', text: 'One two three four five six seven eight' },
    { kind: 'title', text: 'A real claim in few words' },
    ...Array.from({ length: 10 }, (_, index) => ({ kind: 'note' as const, text: `Note ${index}` })),
  ]);
  assert.deepEqual(items.map((item) => item.text), ['A real claim in few words', 'Note 0', 'Note 1', 'Note 2', 'Note 3', 'Note 4']);
});

test('the prompt gives the channel and the board, and refuses nothing it was not given', async () => {
  const built = await buildBoardChatPrompt({ workspace: { name: 'Ana Perez', about: '', topics: ['claude'], cta: '' }, voice: '' }, { idea: { title: 'Idea' }, board: '', history: [], message: 'Hi {name}' });
  assert.match(built.prompt, /creator of the YouTube channel Ana Perez/);
  assert.match(built.prompt, /\(the board is empty\)/);
  assert.match(built.prompt, /Hi \{name\}/, 'text that goes in is never searched again');
  assert.equal((built.schema as { title: string }).title, 'BoardChat');
});

// ---------------------------------------------------------------- Use as hook / title

test('Use as hook makes a package when there is none, and Use as title puts the title first', async () => {
  const video = (await call('POST', '/videos', { title: 'Use it' })).body as Video;
  await call('PUT', `/videos/${video.id}`, { idea: { angle: 'An angle from the idea', demand: { level: 'high', note: 'Asked a lot.' } } });
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.package, null);

  const hook = await call('POST', `/videos/${video.id}/package/text`, { kind: 'hook', text: '  Nobody reads\nthis page.  ' });
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  assert.equal(hook.body.previous, null);
  assert.equal(hook.body.package.hook.spoken, 'Nobody reads this page.');
  assert.deepEqual([hook.body.package.angle, hook.body.package.demand], ['An angle from the idea', { level: 'high', note: 'Asked a lot.' }]);
  assert.deepEqual(hook.body.package.titles, ['', '', '']);
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.package, hook.body.package, 'saved like PUT /package');

  const first = await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'The settings page nobody reads' });
  assert.deepEqual(first.body.package.titles, ['The settings page nobody reads', '', '']);
  assert.equal(first.body.package.hook.spoken, 'Nobody reads this page.', 'the hook is untouched');
  assert.deepEqual(first.body.previous, hook.body.package, 'the package it replaced, for Undo');
  await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'Second title' });
  await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'Third title' });
  const fourth = await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'Fourth title' });
  assert.deepEqual(fourth.body.package.titles, ['Fourth title', 'Third title', 'Second title'], 'the oldest drops off when all three are full');
  const same = await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'second TITLE' });
  assert.deepEqual(same.body.package.titles, ['second TITLE', 'Fourth title', 'Third title'], 'a title already there moves to the front, not twice');

  const undone = await call('PUT', `/videos/${video.id}/package`, same.body.previous);
  assert.deepEqual(undone.body.titles, ['Fourth title', 'Third title', 'Second title'], 'Undo is PUT /package with the previous one');

  assert.equal((await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'x'.repeat(201) })).body.error, 'That title is too long.');
  assert.equal((await call('POST', `/videos/${video.id}/package/text`, { kind: 'headline', text: 'x' })).status, 400);
  assert.equal((await call('POST', `/videos/${video.id}/package/text`, { kind: 'hook', text: '   ' })).status, 400);
  assert.equal((await call('POST', '/videos/v_nothing/package/text', { kind: 'hook', text: 'x' })).status, 404);
});

test('Use as title goes through the package save path: a Package it run that was going holds its result', async () => {
  const video = (await call('POST', '/videos', { title: 'Held' })).body as Video;
  let release!: () => void;
  wait = new Promise<void>((resolve) => (release = resolve));
  const good = { demand: { level: 'high', note: 'x' }, gap: { level: 'mid', note: 'y' }, show: { level: 'high', note: 'z' }, angle: 'a', twist: 't', titles: ['Build it in ten minutes', 'The fast way to build', 'Stop building it slowly'], thumbnailText: 'Ten minute build', hook: { visual: 'v', spoken: 'This took ten minutes.', text: '10 MIN' } };
  const earlier = asked.length;
  answers.push(good);
  // The Package it job reads the stand-in AI too: it is the one that waits.
  const job = await call('POST', `/videos/${video.id}/package`);
  for (let i = 0; i < 100 && asked.length === earlier; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(asked.at(-1)?.title, 'Package');
  await call('POST', `/videos/${video.id}/package/text`, { kind: 'hook', text: 'My own opening line.' });
  release();
  wait = undefined;
  let done = (await call('GET', `/jobs/${job.body.id}`)).body;
  for (let i = 0; i < 100 && done.status === 'running'; i++, done = (await call('GET', `/jobs/${job.body.id}`)).body) await new Promise((r) => setTimeout(r, 10));
  assert.match(done.result.held, /^\d{4}-/, 'held, not written over the line that was just used');
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.package.hook.spoken, 'My own opening line.');
});
