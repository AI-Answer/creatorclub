import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Breakdown, ResearchTile, SignalItem, TrendingItem, Video } from '../../shared/club.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * The video Board through the HTTP routes: tile positions and the free-spot grid, the signal and breakdown tiles, a Board that
 * starts with its source, the board as text for the companion, and Use as hook / title.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-board-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');

// The stand-in AI answers by the schema it was given (Package it, here), and remembers every prompt.
const asked: { title: string; prompt: string; system?: string; budgetUsd?: number }[] = [];
const answers: unknown[] = [];
let wait: Promise<void> | undefined;
const { AiError } = await import('./ai.js');
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  asked.push({ title: (options.jsonSchema as { title?: string }).title ?? 'text', prompt: options.prompt, system: options.system, budgetUsd: options.budgetUsd });
  // While `wait` is set the answer waits for it; a stopped call ends the wait the way the real CLI is killed.
  if (wait) await Promise.race([wait, new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new AiError('cancelled', 'That was stopped.')), { once: true }))]);
  const json = answers.shift();
  return { text: JSON.stringify(json), json };
}

const { clubRouter } = await import('./index.js');
const store = await import('./store.js');
const { freeSpot } = await import('./tile-layout.js');
const { boardText } = await import('./board-chat.js');
const { packageText } = await import('./prompts.js');

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
  assert.deepEqual((await call('PATCH', url(note), { pos: { x: 10, y: 20, w: 400, h: 220 } })).body.pos, { x: 10, y: 20, w: 400, h: 220 }, 'a resized note keeps its height');
  assert.deepEqual((await call('PATCH', url(note), { pos: { x: 12, y: 20 } })).body.pos, { x: 12, y: 20, w: 400, h: 220 }, 'and a move keeps width and height');
  assert.equal((await call('PATCH', url(note), { pos: { x: 12, y: 20, h: 5 } })).status, 400, 'a height that small is refused');
  await call('PATCH', url(note), { pos: { x: 10, y: 20 } });
  const edited = await call('PATCH', url(note), { text: 'Second thought', title: 'Idea' });
  // A note is a Markdown file: its title is its first line, not a name of its own.
  assert.deepEqual([edited.body.text, edited.body.title, edited.body.pos.x], ['Second thought', 'Second thought', 10]);
  assert.equal((await call('PATCH', url(note), { text: '' })).body.text, '', 'a note can be cleared');

  assert.equal((await call('PATCH', url(link), { title: 'Renamed' })).body.title, 'Renamed');
  assert.equal((await call('PATCH', url(link), { text: 'x' })).status, 400, 'only notes have text to edit');
  assert.equal((await call('PATCH', url(link), { text: 'x' })).body.error, 'Only notes, text and ideas can be edited.');
  // Text and idea cards are written on the card itself, so their text can be saved too.
  const idea = (await call('POST', `/videos/${video.id}/research`, { kind: 'idea', text: 'Works for phones' })).body as ResearchTile;
  const words = (await call('POST', `/videos/${video.id}/research`, { kind: 'text', text: 'A line' })).body as ResearchTile;
  assert.equal((await call('PATCH', url(idea), { text: 'Works for phones, thin in AI' })).body.text, 'Works for phones, thin in AI');
  assert.equal((await call('PATCH', url(words), { text: 'A better line' })).body.text, 'A better line');

  for (const bad of [{}, { pos: { x: -1, y: 0 } }, { pos: { x: 0, y: 20_001 } }, { pos: { x: 'a', y: 0 } }, { pos: { x: 0 } }, { pos: { x: 0, y: 0, w: 50 } }, { pos: { x: 0, y: 0, w: 5000 } }, { pos: { x: null, y: 0 } }, { kind: 'video' }, { id: 'other' }]) {
    assert.equal((await call('PATCH', url(note), bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call('PATCH', `/videos/${video.id}/research/t_nothing`, { title: 'x' })).status, 404);
  assert.deepEqual((await tiles(video.id)).find((tile) => tile.id === note.id)?.pos, { x: 10, y: 20, w: 400, h: 220 }, 'bad requests changed nothing');
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
  assert.equal(blank.body.text, '');
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'text' })).body.error, 'Add some text first.');
});

const sourceTiles = async (id: string) => (await tiles(id)).filter((tile) => tile.kind !== 'idea');

test('a video made from a breakdown concept, a Signals post or a Working now video starts its Board with that source (and The idea beside it)', async () => {
  const concept = await call('POST', `/breakdowns/${BD}/concepts/0/add`);
  assert.equal(concept.status, 201);
  const fromConcept = await sourceTiles(concept.body.id);
  assert.deepEqual(fromConcept.map((tile) => [tile.kind, tile.title, tile.meta.breakdownId, tile.url]), [['breakdown', 'How I built it', BD, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']]);

  const post: SignalItem = { id: 'x-77', source: 'x', author: 'Alex Finn', handle: 'alexfinn', text: 'Claude can now run your inbox. Here is how.', url: 'https://x.com/alexfinn/status/77', likes: 1200, replies: 80, views: 50_000, media: null, createdAt: '2026-10-28T00:00:00.000Z', ageHours: 5 };
  await writeFile(path.join(dir, 'signals.json'), JSON.stringify({ updatedAt: '2026-10-28T00:00:00.000Z', items: [post], errors: [] }));
  const fromPost = await call('POST', '/signals/idea', { id: 'x-77' });
  assert.equal(fromPost.status, 201);
  const postTiles = await sourceTiles(fromPost.body.id);
  assert.equal(postTiles.length, 1);
  assert.deepEqual([postTiles[0].kind, postTiles[0].text, postTiles[0].url, postTiles[0].meta], ['signal', post.text, post.url, { source: 'x', author: '@alexfinn', likes: 1200, replies: 80, views: 50_000 }]);
  assert.equal((await call('POST', '/signals/idea', { id: 'x-77' })).status, 200);
  assert.equal((await sourceTiles(fromPost.body.id)).length, 1, 'a second click adds no second tile');

  const item: TrendingItem = { videoId: 'abcdefghijk', title: 'Claude Code in 20 minutes', channel: 'Duncan', kind: 'followed', views: 120_000, likes: 4000, comments: null, published: '2026-10-24', ageDays: 4, vpd: 30_000, mult: 3.2, history: [], firstSeen: '2026-10-20', fit: true };
  await writeFile(path.join(dir, 'trending.json'), JSON.stringify([item]));
  const fromVideo = await call('POST', '/trending/idea', { videoId: item.videoId });
  assert.equal(fromVideo.status, 201);
  const videoTiles = await sourceTiles(fromVideo.body.id);
  assert.deepEqual(
    [videoTiles[0].kind, videoTiles[0].title, videoTiles[0].url, videoTiles[0].meta],
    ['video', item.title, 'https://www.youtube.com/watch?v=abcdefghijk', { platform: 'youtube', channel: 'Duncan', views: 120_000, ageDays: 4, thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', likes: 4000, multiplier: 3.2 }],
  );
});

// ---------------------------------------------------------------- the board as the companion reads it

const boardVideo = (await call('POST', '/videos', { title: 'Hidden features' })).body as Video;
await call('POST', `/videos/${boardVideo.id}/research`, { kind: 'note', text: 'People keep asking about the free plan.' });
await call('POST', `/videos/${boardVideo.id}/research`, { kind: 'signal', url: 'https://x.com/a/status/9', text: 'Nobody reads the settings page', meta: { source: 'x', author: '@a', likes: 300 } });
await call('POST', `/videos/${boardVideo.id}/research`, { kind: 'breakdown', title: 'How I built it', meta: { breakdownId: BD } });

test('the board shown to the model is bounded however many tiles or how long the transcripts are', async () => {
  const many: ResearchTile[] = Array.from({ length: 80 }, (_, index) => ({ id: `t${index}`, kind: 'note', text: `note ${index} ${'x'.repeat(5000)}`, meta: {}, createdAt: `2026-10-01T00:00:${String(index % 60).padStart(2, '0')}.000Z` }));
  const text = await boardText('maya-lopez', boardVideo.id, many);
  assert.ok(text.length < 26_000, `bounded (${text.length})`);
  assert.match(text, /^\(20 older tiles are left out\)/);
  assert.match(text, /note 79 /);
  assert.doesNotMatch(text, /note 0 /);
  assert.equal(await boardText('maya-lopez', boardVideo.id, []), '');
});

// ---------------------------------------------------------------- Use as hook / title

test('Use as hook makes a package when there is none, and Use as title puts the title first', async () => {
  const video = (await call('POST', '/videos', { title: 'Use it' })).body as Video;
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.package, null, 'no idea notes to start the package from');

  const hook = await call('POST', `/videos/${video.id}/package/text`, { kind: 'hook', text: '  Nobody reads\nthis page.  ' });
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  assert.equal(hook.body.previous, null);
  assert.equal(hook.body.package.hook.spoken, 'Nobody reads this page.');
  // Nothing else is made up: no ratings, and everything not used stays blank.
  assert.deepEqual(hook.body.package, { angle: '', twist: '', titles: ['', '', ''], thumbnailText: '', hook: { visual: '', spoken: 'Nobody reads this page.', text: '' } });
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

test('a package with only a hook reads as a hook in the prompts, with no ratings, blanks or empty title lines; Undo of the first use removes the package', async () => {
  const video = (await call('POST', '/videos', { title: 'Hollow' })).body as Video;
  const used = await call('POST', `/videos/${video.id}/package/text`, { kind: 'hook', text: 'Nobody reads this page.' });
  assert.equal(used.body.previous, null);
  assert.equal(packageText(used.body.package), 'Hook:\n- Spoken: Nobody reads this page.');
  assert.equal(packageText({ ...used.body.package, hook: { visual: '', spoken: '', text: '' } }), '(none: choose these yourself)');
  const titled = await call('POST', `/videos/${video.id}/package/text`, { kind: 'title', text: 'The page nobody reads' });
  assert.equal(packageText(titled.body.package), 'Title options: The page nobody reads\nHook:\n- Spoken: Nobody reads this page.');
  // A package the person rated later reads as before.
  assert.match(packageText({ ...titled.body.package, demand: { level: 'high', note: 'Asked.' } }), /Demand \(high\): Asked\./);
  // A partial package is a package: it can be saved by hand too, and an outline built on it asks no rating.
  assert.equal((await call('PUT', `/videos/${video.id}/package`, titled.body.package)).status, 200);

  const folder = path.join(dir, 'videos', video.id);
  assert.equal((await call('DELETE', `/videos/${video.id}/package`)).status, 204);
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.package, null, 'back to no package');
  assert.ok((await readdir(folder)).some((name) => /^package-unused-.*\.json$/.test(name)), 'set aside, not deleted');
  assert.equal((await call('DELETE', `/videos/${video.id}/package`)).status, 204, 'nothing to remove is fine');
  assert.equal((await call('DELETE', '/videos/v_nothing/package')).status, 404);
  // Using it again after Undo starts from no package again.
  assert.equal((await call('POST', `/videos/${video.id}/package/text`, { kind: 'hook', text: 'Again.' })).body.previous, null);
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

test('a video made from an idea gets its sources on the Board once, and no copy of the idea; tiles that are already there stay and are not repeated', async () => {
  const slug = (await store.currentWorkspace())!;
  const made = (await call('POST', '/videos', { title: 'From an idea' })).body as Video;
  await store.updateVideo(slug, made.id, {
    idea: { why: 'People keep asking.', demand: { level: 'high', note: 'Asked a lot' }, show: { level: 'mid', note: 'Mostly screen' }, sources: [{ label: 'A talk', url: 'https://example.com/talk' }, { label: 'Seen already', url: 'https://example.com/have' }, { label: 'No link' }] },
  });
  await call('POST', `/videos/${made.id}/research`, { kind: 'link', url: 'https://example.com/have' });
  const seeded = await tiles(made.id);
  // Why it could work and the ratings stay the video's own (its Idea page shows them), so the Board gets no copy that could drift.
  assert.deepEqual(seeded.map((tile) => [tile.kind, tile.title ?? tile.url]), [['link', 'https://example.com/have'], ['link', 'A talk']]);
  assert.equal(new Set(seeded.map((tile) => `${tile.pos!.x},${tile.pos!.y}`)).size, 2, 'each has its own place');
  // Once: removing every tile does not bring them back.
  for (const tile of seeded) await call('DELETE', `/videos/${made.id}/research/${tile.id}`);
  assert.deepEqual(await tiles(made.id), []);

  const plain = (await call('POST', '/videos', { title: 'No idea' })).body as Video;
  assert.deepEqual(await tiles(plain.id), [], 'a video that was not an idea starts empty');
});
