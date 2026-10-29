import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FollowedChannel, TrendingItem } from '../../shared/club.js';
import type { VideoStats } from './source.js';

/* Working now: the refresh with a stand-in for YouTube, plus the real yt-dlp runner against a fake yt-dlp. No network. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-trending-'));
process.env.CREATORCLUB_DIR = temp;
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
after(() => rm(temp, { recursive: true, force: true }));

const store = await import('./store.js');
const { refreshTrending, rankedTrending, followedUrl, readFollowed, ytDlpUploads } = await import('./trending.js');
type Source = import('./trending.js').UploadsSource;

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const context = () => {
  const messages: unknown[] = [];
  return { messages, context: { emit: (data: unknown) => void messages.push(data), signal: new AbortController().signal } };
};

/** What YouTube "answers": uploads per channel link, numbers per video. */
const uploads = new Map<string, { id: string; title: string }[]>();
const stats = new Map<string, VideoStats>();
const listed: string[] = [];
const fake = async (): Promise<Source> => ({
  async list(url) {
    listed.push(url);
    const entries = uploads.get(url);
    if (!entries) throw new Error('cannot read that channel');
    return entries;
  },
  async stats(ids) {
    return new Map(ids.flatMap((id) => (stats.has(id) ? [[id, stats.get(id)!] as const] : [])));
  },
});

let channelCount = 0;
async function channel(followed: FollowedChannel[], seed?: TrendingItem[]) {
  const workspace = await store.createWorkspace({ name: `Channel ${++channelCount}`, handle: '', channelUrl: '', topics: ['claude'], about: '', cta: '' });
  await store.writeJSON(path.join(store.workspaceDir(workspace.slug), 'followed.json'), followed);
  if (seed) await store.writeJSON(path.join(store.workspaceDir(workspace.slug), 'trending.json'), seed);
  return workspace.slug;
}
const items = async (slug: string) => (await store.readJSON<TrendingItem[]>(path.join(store.workspaceDir(slug), 'trending.json'))) ?? [];

/** 30 uploads: 25 old ones at 10,000 views and five recent ones, so the usual is 10,000. */
function alphaUploads(prefix: string, views: number[] = [50_000, 20_000, 5_000, 8_000, 9_999], ages = [1, 3, 10, 29, 45]) {
  const entries = [];
  for (let i = 0; i < 30; i++) {
    const id = `${prefix}${String(i).padStart(2, '0')}`;
    entries.push({ id, title: `Video ${i}` });
    const recent = i < views.length;
    stats.set(id, { views: recent ? views[i] : 10_000, likes: i === 0 ? 100 : null, comments: i === 0 ? 7 : null, uploadedAt: NOW - (recent ? ages[i] : 60 + i) * DAY });
  }
  return entries;
}

test('refresh: multiplier over the median of the last 30, views per day, history, 30 days kept, medians saved', async () => {
  uploads.set('https://www.youtube.com/@alpha', alphaUploads('alpha'));
  const slug = await channel([{ name: 'Alpha', handle: '@alpha' }]);
  const run = context();
  const result = await refreshTrending(slug, run.context, fake, NOW);

  assert.deepEqual(result, { videos: 4, added: 4, channels: 1, failed: [] });
  const saved = await items(slug);
  assert.deepEqual(saved.map((item) => item.videoId), ['alpha00', 'alpha01', 'alpha02', 'alpha03'], 'ranked by views per day; the 45 day old video and the older uploads are not kept');
  const [top, second, third, fourth] = saved;
  assert.deepEqual(top, {
    videoId: 'alpha00',
    title: 'Video 0',
    channel: 'Alpha',
    kind: 'followed',
    views: 50_000,
    likes: 100,
    comments: 7,
    published: '2026-10-28',
    ageDays: 1,
    vpd: 50_000,
    mult: 5,
    history: [{ d: '2026-10-29', v: 50_000 }],
    firstSeen: '2026-10-29',
    fit: true,
  });
  assert.equal(second.mult, 2);
  assert.equal(second.vpd, Math.round(20_000 / 3));
  assert.equal(third.mult, 0.5);
  assert.equal(fourth.mult, 0.8);
  assert.equal(second.likes, null, 'a number YouTube did not give stays null');
  assert.ok(run.messages.some((m) => (m as { message: string }).message === 'Reading Alpha (1 of 1)…'));

  assert.equal((await readFollowed(slug))[0].median, 10_000, 'the usual views are kept for next time');
  assert.deepEqual(await store.readJSON(path.join(store.workspaceDir(slug), 'meta.json')), { lastRefresh: '2026-10-29T12:00:00.000Z', newVideos: 4 });
  assert.ok(!(await readdir(store.workspaceDir(slug))).some((name) => name.endsWith('.tmp')), 'files are written atomically');
});

test('refresh again: the same day replaces the reading, a later day adds one, and first seen stays', async () => {
  uploads.set('https://www.youtube.com/@beta', alphaUploads('beta'));
  const slug = await channel([{ name: 'Beta', url: 'https://www.youtube.com/@beta' }]);
  await refreshTrending(slug, context().context, fake, NOW);

  stats.set('beta00', { ...stats.get('beta00')!, views: 60_000 });
  const sameDay = await refreshTrending(slug, context().context, fake, NOW + 3_600_000);
  assert.equal(sameDay.added, 0);
  assert.deepEqual((await items(slug))[0].history, [{ d: '2026-10-29', v: 60_000 }]);

  stats.set('beta00', { ...stats.get('beta00')!, views: 70_000 });
  await refreshTrending(slug, context().context, fake, NOW + DAY);
  const next = (await items(slug)).find((item) => item.videoId === 'beta00')!;
  assert.deepEqual(next.history, [{ d: '2026-10-29', v: 60_000 }, { d: '2026-10-30', v: 70_000 }]);
  assert.equal(next.firstSeen, '2026-10-29');
  assert.equal(next.views, 70_000);
});

test('without 3 uploads that have views there is no usual, so mult is null; a saved median stands in', async () => {
  const entries = [{ id: 'gamma01', title: 'One' }, { id: 'gamma02', title: 'Two' }, { id: 'gamma03', title: 'No numbers' }];
  stats.set('gamma01', { views: 4000, likes: null, comments: null, uploadedAt: NOW - 2 * DAY });
  stats.set('gamma02', { views: 8000, likes: null, comments: null, uploadedAt: NOW - 4 * DAY });
  uploads.set('https://www.youtube.com/@gamma', entries);
  uploads.set(`https://www.youtube.com/channel/UC${'g'.repeat(22)}`, entries);

  const unknown = await channel([{ name: 'Gamma', channelId: 'UC' + 'g'.repeat(22) }]);
  await refreshTrending(unknown, context().context, fake, NOW);
  assert.deepEqual((await items(unknown)).map((item) => [item.videoId, item.mult]), [['gamma01', null], ['gamma02', null]], 'a video with no numbers is skipped');
  assert.equal((await readFollowed(unknown))[0].median, undefined, 'no median is invented');

  const known = await channel([{ name: 'Gamma', handle: '@gamma', median: 4000 }]);
  await refreshTrending(known, context().context, fake, NOW);
  assert.deepEqual((await items(known)).map((item) => [item.videoId, item.mult]), [['gamma01', 1], ['gamma02', 2]], 'a median saved earlier is used when it cannot be worked out now');
});

test('a video with no upload time is skipped, because its age is unknown', async () => {
  uploads.set('https://www.youtube.com/@zeta', [{ id: 'zeta01', title: 'One' }, { id: 'zeta02', title: 'Two' }, { id: 'zeta03', title: 'No date' }]);
  stats.set('zeta01', { views: 3000, likes: null, comments: null, uploadedAt: NOW - DAY });
  stats.set('zeta02', { views: 4000, likes: null, comments: null, uploadedAt: NOW - 2 * DAY });
  stats.set('zeta03', { views: 5000, likes: null, comments: null });
  const slug = await channel([{ name: 'Zeta', handle: '@zeta' }]);
  await refreshTrending(slug, context().context, fake, NOW);
  assert.deepEqual((await items(slug)).map((item) => [item.videoId, item.mult]), [['zeta01', 0.75], ['zeta02', 1]], 'the usual still counts all three: 4000');
});

test('a channel that cannot be read keeps its earlier videos for 30 days; reading none fails and writes nothing', async () => {
  uploads.set('https://www.youtube.com/@delta', alphaUploads('delta'));
  const old = (id: string, channelName: string, published: string): TrendingItem => ({
    videoId: id, title: id, channel: channelName, kind: 'followed', views: 1000, likes: null, comments: null, published, ageDays: 3, vpd: 300, mult: 1.5,
    history: [{ d: '2026-10-26', v: 1000 }], firstSeen: '2026-10-26', fit: true,
  });
  const seed = [old('broken-recent', 'Broken', '2026-10-24'), old('broken-ancient', 'Broken', '2026-09-01')];
  const slug = await channel([{ name: 'Delta', handle: '@delta' }, { name: 'Broken', handle: '@nobody' }], seed);
  const logged = console.error;
  console.error = () => {};
  const result = await refreshTrending(slug, context().context, fake, NOW);
  assert.deepEqual(result.failed, ['Broken']);
  assert.equal(result.channels, 1);
  const ids = (await items(slug)).map((item) => item.videoId);
  assert.ok(ids.includes('broken-recent') && ids.includes('delta00'));
  assert.ok(!ids.includes('broken-ancient'), 'older than 30 days leaves the list');

  const allBroken = await channel([{ name: 'Broken', handle: '@nobody' }], seed);
  const before = await readFile(path.join(store.workspaceDir(allBroken), 'trending.json'), 'utf8');
  console.error = () => {};
  await assert.rejects(refreshTrending(allBroken, context().context, fake, NOW), { message: "Couldn't read the channels you follow. Check your connection and try again." });
  console.error = logged;
  assert.equal(await readFile(path.join(store.workspaceDir(allBroken), 'trending.json'), 'utf8'), before);
});

test('refresh needs a followed channel, and stops when cancelled', async () => {
  const none = await channel([]);
  await assert.rejects(refreshTrending(none, context().context, fake, NOW), { message: 'Follow a channel first.' });

  uploads.set('https://www.youtube.com/@epsilon', alphaUploads('epsilon'));
  const slug = await channel([{ name: 'Epsilon', handle: '@epsilon' }]);
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(refreshTrending(slug, { emit() {}, signal: stop.signal }, fake, NOW), { message: 'That was stopped.' });
  assert.deepEqual(await items(slug), []);
});

test('a followed channel is read from its link, else its handle, else its channel id; anything else is skipped', () => {
  assert.equal(followedUrl({ name: 'A', url: 'https://www.youtube.com/@a_b/videos' }), 'https://www.youtube.com/@a_b');
  assert.equal(followedUrl({ name: 'A', handle: 'abc' }), 'https://www.youtube.com/@abc');
  assert.equal(followedUrl({ name: 'A', handle: '@abc' }), 'https://www.youtube.com/@abc');
  assert.equal(followedUrl({ name: 'A', channelId: 'UCFeFVytEkT8kaqPCJZGFswg' }), 'https://www.youtube.com/channel/UCFeFVytEkT8kaqPCJZGFswg');
  assert.equal(followedUrl({ name: 'A', url: 'https://example.com/x' }), undefined);
  assert.equal(followedUrl({ name: 'A', channelId: 'nope' }), undefined);
});

test('ranked for the channel: matches come first with a reason, the rest have fit false, and a missing usual stays null', async () => {
  const make = (videoId: string, title: string, vpd: number, mult: number | null): TrendingItem => ({
    videoId, title, channel: 'Someone', kind: 'creator', views: 10 * vpd, likes: null, comments: null, published: '2026-10-28', ageDays: 1, vpd, mult, history: [], firstSeen: '2026-10-28', fit: false,
  });
  const workspace = await store.createWorkspace({ name: 'Ranked', handle: '', channelUrl: '', topics: ['claude'], audience: ['Developers'], about: '', cta: '' });
  await store.writeJSON(path.join(store.workspaceDir(workspace.slug), 'trending.json'), [
    make('cats', 'Funny cats', 9000, null),
    make('dev', 'A day in the life of a developer', 100, 2.5),
    make('cl', 'Claude Code tips', 500, null),
    make('cl2', 'More Claude news', 800, 3),
  ]);
  await store.writeJSON(path.join(store.workspaceDir(workspace.slug), 'meta.json'), { lastRefresh: '2026-10-26T19:00:54.616440+00:00', newVideos: 1 });
  const ranked = await rankedTrending(workspace.slug, workspace);
  assert.deepEqual(ranked.items.map((item) => [item.videoId, item.fit, item.reason]), [
    ['cl2', true, 'Because you picked Claude'],
    ['cl', true, 'Because you picked Claude'],
    ['dev', true, 'Because you picked Developers'],
    ['cats', false, null],
  ]);
  assert.equal(ranked.items.find((item) => item.videoId === 'cl')!.mult, null);
  assert.equal(ranked.updatedAt, '2026-10-26T19:00:54.616440+00:00');
  assert.equal(ranked.followed, 0);

  const empty = await store.createWorkspace({ name: 'Empty', handle: '', channelUrl: '', topics: [], about: '', cta: '' });
  assert.deepEqual(await rankedTrending(empty.slug, empty), { items: [], updatedAt: null, followed: 0 });
});

test('the yt-dlp source lists with a flat playlist and reads numbers with --print: metadata only, nothing downloaded', async () => {
  const bin = path.join(temp, 'bin');
  const log = path.join(temp, 'ytdlp-args.log');
  await rm(bin, { recursive: true, force: true });
  await (await import('node:fs/promises')).mkdir(bin);
  const file = path.join(bin, 'yt-dlp');
  await writeFile(file, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args.includes('--flat-playlist')) {
  console.log(JSON.stringify({ entries: [{ id: 'aaaaaaaaaaa', title: 'First' }, { id: 'bad id', title: 'Skipped' }, { id: 'bbbbbbbbbbb' }] }));
} else {
  for (const url of args.filter((a) => a.includes('watch?v='))) {
    const id = url.split('v=')[1];
    console.log(id === 'bbbbbbbbbbb' ? [id, 'NA', 'NA', 'NA', 'NA', 'NA'].join('\\t') : [id, '1500', '30', '4', '1793226009', '20261028'].join('\\t'));
  }
}
`);
  await chmod(file, 0o755);
  const source = ytDlpUploads(file, { extraDirs: [] });

  assert.deepEqual(await source.list('https://www.youtube.com/@alpha'), [{ id: 'aaaaaaaaaaa', title: 'First' }, { id: 'bbbbbbbbbbb', title: '' }]);
  const many = Array.from({ length: 9 }, (_, i) => `id${String(i).padStart(9, '0')}`);
  const read = await source.stats(['bbbbbbbbbbb', 'aaaaaaaaaaa', ...many]);
  assert.equal(read.size, 10, 'a video with no view count is left out');
  assert.deepEqual(read.get('aaaaaaaaaaa'), { views: 1500, likes: 30, comments: 4, uploadedAt: 1793226009000 });
  assert.ok(!read.has('bbbbbbbbbbb'));

  const calls = (await readFile(log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as string[]);
  assert.equal(calls.length, 1 + 3, 'one listing, then 11 videos in batches of 4');
  assert.ok(calls[0].includes('--flat-playlist') && calls[0].at(-1) === 'https://www.youtube.com/@alpha/videos' && calls[0].includes('--playlist-end') && calls[0].includes('30'));
  for (const call of calls.slice(1)) assert.ok(call.includes('--skip-download') && call.includes('--print'));
  const joined = calls.flat().join(' ');
  assert.doesNotMatch(joined, /(^| )(-f|-x|--format|--extract-audio|--write-[\w-]+|--audio-format|--download-sections)( |$)/, 'no video, audio, subtitle or thumbnail is requested');
});
