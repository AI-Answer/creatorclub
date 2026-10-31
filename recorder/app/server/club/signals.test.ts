import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SignalItem, SignalsConfig } from '../../shared/club.js';

/* Signals: Reddit through a stand-in for fetch, X through a stand-in for treg. No network, nothing paid. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-signals-'));
process.env.CREATORCLUB_DIR = temp;
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
after(() => rm(temp, { recursive: true, force: true }));

const store = await import('./store.js');
const { refreshSignals, rankedSignals, redditItem, tregEnv, REDDIT_USER_AGENT, X_NEEDS_TREG } = await import('./signals.js');
type Sources = import('./signals.js').SignalsSources;
type Treg = import('./signals.js').TregCall;

const HOUR = 3600;
const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const nowSec = NOW / 1000;
const context = () => ({ emit() {}, signal: new AbortController().signal });

let count = 0;
async function channel(config: SignalsConfig, stored: SignalItem[] = []) {
  const workspace = await store.createWorkspace({ name: `Channel ${++count}`, handle: '', channelUrl: '', topics: ['claude'], about: '', cta: '' });
  const dir = store.workspaceDir(workspace.slug);
  await store.writeJSON(path.join(dir, 'signals-config.json'), config);
  if (stored.length) await store.writeJSON(path.join(dir, 'signals.json'), { updatedAt: '2026-10-26T00:00:00.000Z', items: stored, errors: [] });
  return workspace.slug;
}
const saved = async (slug: string) => (await store.readJSON<{ updatedAt: string; items: SignalItem[]; errors: string[] }>(path.join(store.workspaceDir(slug), 'signals.json')))!;

const redditPost = (over: Record<string, unknown> = {}) => ({
  data: { id: 'a1', subreddit: 'ClaudeAI', author: 'bob', title: 'Tom &amp; Jerry &gt; everything', link_flair_text: 'News', score: 120, num_comments: 30, created_utc: nowSec - 5 * HOUR, permalink: '/r/ClaudeAI/comments/a1/tom/', over_18: false, ...over },
});
const listing = (...posts: unknown[]) => ({ data: { children: posts } });

/** A stand-in for fetch: answers by subreddit, and remembers what was asked. */
function fakeFetch(answers: Record<string, unknown | number | Error>) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)) });
    const answer = answers[/\/r\/([^/]+)\//.exec(url)![1]];
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return new Response('{}', { status: answer });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof fetch;
  return { impl, requests };
}

const tweet = (over: Record<string, unknown> = {}) => ({
  id: '111', text: 'Hello https://t.co/abc   world', createdUtc: nowSec - 2 * HOUR, isReply: false, authorName: 'Anthropic', authorHandle: 'AnthropicAI',
  url: 'https://x.com/i/web/status/111', likes: 900, replies: 40, retweets: 10, views: 5000, media: [{ url: 'https://pbs.example/x.jpg', type: 'photo', width: 100, height: 50 }], ...over,
});
const found = (over: Record<string, unknown> = {}) => ({
  id: '222', text: 'Claude Code just got faster', createdUtc: nowSec - 6 * HOUR, isReply: false, authorName: 'Someone', authorUsername: 'someone', url: 'https://x.com/i/web/status/222',
  likeCount: 700, replyCount: 20, retweetCount: 5, viewCount: 9000, media: [], ...over,
});

/** A stand-in for treg: records each call and answers from the table, or null (a failed call). */
function fakeTreg(answers: Record<string, (payload: Record<string, unknown>) => unknown>) {
  const calls: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const call: Treg = async (endpoint, payload) => {
    calls.push({ endpoint, payload: payload as Record<string, unknown> });
    return (answers[endpoint]?.(payload as Record<string, unknown>) ?? null) as never;
  };
  return { calls, sources: { treg: async () => call } };
}
const noTreg = { treg: async () => undefined };

const stored = (over: Partial<SignalItem>): SignalItem => ({
  id: 'x-old', source: 'x', author: 'Old', handle: 'old', text: 'An older post', url: 'https://x.com/old', likes: 10, replies: 1, media: null, createdAt: new Date(NOW - 2 * 86_400_000).toISOString(), ageHours: 48, ...over,
});

test('a Reddit post becomes a signal: real numbers, the title unescaped, filters for age, score and adult posts', () => {
  const limits = { maxAgeDays: 7, minRedditScore: 50 };
  const item = redditItem(redditPost().data, 'ClaudeAI', limits, NOW)!;
  assert.deepEqual(item, {
    id: 'r-a1', source: 'reddit', author: 'r/ClaudeAI', handle: 'bob', text: 'Tom & Jerry > everything', flair: 'News', media: null,
    url: 'https://www.reddit.com/r/ClaudeAI/comments/a1/tom/', likes: 120, replies: 30, createdAt: new Date(NOW - 5 * HOUR * 1000).toISOString(), ageHours: 5,
  });
  assert.equal(redditItem(redditPost({ score: 49 }).data, 'ClaudeAI', limits, NOW), undefined, 'under the minimum score');
  assert.equal(redditItem(redditPost({ over_18: true }).data, 'ClaudeAI', limits, NOW), undefined);
  assert.equal(redditItem(redditPost({ created_utc: nowSec - 8 * 24 * HOUR }).data, 'ClaudeAI', limits, NOW), undefined, 'older than 7 days');
  assert.deepEqual(redditItem(redditPost({ post_hint: 'image', url: 'https://i.redd.it/a.png' }).data, 'ClaudeAI', limits, NOW)!.media, { type: 'image', url: 'https://i.redd.it/a.png' });
  assert.deepEqual(redditItem(redditPost({ is_video: true }).data, 'ClaudeAI', limits, NOW)!.media, { type: 'video', url: null });
  assert.equal(redditItem(redditPost({ link_flair_text: null }).data, 'ClaudeAI', limits, NOW)!.flair, null);
});

test('refresh reads Reddit top of the week with a real User-Agent, keeps the best per subreddit and writes atomically', async () => {
  const slug = await channel({ reddit: ['ClaudeAI', 'ClaudeCode'], maxPerSource: 2 });
  const web = fakeFetch({
    ClaudeAI: listing(redditPost({ id: 'p1', score: 300 }), redditPost({ id: 'p2', score: 100 }), redditPost({ id: 'p3', score: 60 }), redditPost({ id: 'p1', score: 300 })),
    ClaudeCode: listing(redditPost({ id: 'q1', subreddit: 'ClaudeCode', score: 80 })),
  });
  const result = await refreshSignals(slug, context(), { fetch: web.impl, treg: noTreg.treg }, NOW);

  assert.deepEqual(web.requests.map((r) => r.url), ['https://www.reddit.com/r/ClaudeAI/top.json?t=week&limit=25', 'https://www.reddit.com/r/ClaudeCode/top.json?t=week&limit=25']);
  for (const request of web.requests) assert.equal(request.headers['User-Agent'], REDDIT_USER_AGENT);
  assert.match(REDDIT_USER_AGENT, /creatorclub/i);
  const file = await saved(slug);
  assert.deepEqual(file.items.map((i) => i.id), ['r-p1', 'r-p2', 'r-q1'], 'ranked by likes and replies; the duplicate is dropped and r/ClaudeAI is capped at 2');
  assert.equal(file.updatedAt, '2026-10-29T12:00:00.000Z');
  assert.deepEqual(file.errors, []);
  assert.deepEqual(result, { posts: 3, added: 3, errors: [], tried: 2, failed: [] }, 'no note when no X source is set up');
  assert.ok(!(await readdir(store.workspaceDir(slug))).some((name) => name.endsWith('.tmp')));
});

test('without treg the stored X posts stay and the refresh says so; Reddit still refreshes', async () => {
  const oldX = stored({});
  const oldReddit = stored({ id: 'r-gone', source: 'reddit', author: 'r/ClaudeAI', handle: 'bob' });
  const slug = await channel({ x: ['AnthropicAI'], xTopics: ['claude'], reddit: ['ClaudeAI'] }, [oldX, oldReddit]);
  const web = fakeFetch({ ClaudeAI: listing(redditPost({ id: 'new1' })) });
  const result = await refreshSignals(slug, context(), { fetch: web.impl, treg: noTreg.treg }, NOW);

  assert.equal(result.note, 'X posts refresh when treg is connected.');
  assert.equal(result.note, X_NEEDS_TREG);
  assert.deepEqual((await saved(slug)).items.map((i) => i.id).sort(), ['r-new1', 'x-old']);
  assert.deepEqual(result.errors, [], 'a missing tool is a note, not a failed source');
  assert.equal(result.added, 1);
});

test('with treg, X accounts and searches are read through the same endpoints as the board, replies and old posts left out', async () => {
  const slug = await channel({ x: ['AnthropicAI'], xTopics: ['"claude code"'], minXLikes: 500 });
  const treg = fakeTreg({
    'anyapi.x.user.posts': () => ({ output: { data: { tweets: [tweet(), tweet({ id: '112', isReply: true }), tweet({ id: '113', createdUtc: nowSec - 9 * 24 * HOUR }), tweet({ id: '114', text: 'https://t.co/only-a-link' })] } } }),
    'anyapi.x.search.posts': () => ({ output: { data: { items: [found(), found({ id: '111', text: 'Same id as the account post' })] } } }),
  });
  const result = await refreshSignals(slug, context(), { fetch: fakeFetch({}).impl, ...treg.sources }, NOW);

  assert.deepEqual(treg.calls[0], { endpoint: 'anyapi.x.user.posts', payload: { handle: 'AnthropicAI' } });
  assert.equal(treg.calls[1].endpoint, 'anyapi.x.search.posts');
  assert.deepEqual(treg.calls[1].payload, { query: '"claude code" min_faves:500 since:2026-10-22 -filter:replies lang:en', queryType: 'Top', limit: 20 });
  const file = await saved(slug);
  assert.deepEqual(file.items.map((i) => i.id), ['x-111', 'x-222'], 'ranked by likes and replies; the repeated id appears once');
  assert.deepEqual(file.items[0], {
    id: 'x-111', source: 'x', author: 'Anthropic', handle: 'AnthropicAI', text: 'Hello world', url: 'https://x.com/i/web/status/111', likes: 900, replies: 40, shares: 10, views: 5000,
    media: { type: 'image', url: 'https://pbs.example/x.jpg', w: 100, h: 50 }, createdAt: new Date(NOW - 2 * HOUR * 1000).toISOString(), ageHours: 2,
  });
  assert.equal(file.items[1].flair, 'claude code', 'a search result carries its topic');
  assert.equal(file.items[1].handle, 'someone');
  assert.equal(result.note, undefined);
});

test('a source that fails keeps its earlier posts and is listed; other sources are not held up', async () => {
  const keptX = stored({ id: 'x-bad-old', handle: 'BadAccount' });
  const keptTopic = stored({ id: 'x-topic-old', handle: 'someone', flair: 'vibe coding' });
  const keptReddit = stored({ id: 'r-old', source: 'reddit', author: 'r/ClaudeAI', handle: 'bob' });
  const tooOld = stored({ id: 'r-ancient', source: 'reddit', author: 'r/ClaudeAI', createdAt: new Date(NOW - 10 * 86_400_000).toISOString() });
  const otherX = stored({ id: 'x-unrelated', handle: 'GoodAccount' });
  const slug = await channel({ x: ['BadAccount', 'GoodAccount'], xTopics: ['vibe coding'], reddit: ['ClaudeAI', 'vibecoding'] }, [keptX, keptTopic, keptReddit, tooOld, otherX]);
  const web = fakeFetch({ ClaudeAI: 429, vibecoding: listing(redditPost({ id: 'v1', subreddit: 'vibecoding' })) });
  const treg = fakeTreg({
    'anyapi.x.user.posts': (payload) => (payload.handle === 'BadAccount' ? null : { output: { data: { tweets: [tweet({ id: '900', authorHandle: 'GoodAccount' })] } } }),
    'anyapi.x.search.posts': () => null,
  });
  const result = await refreshSignals(slug, context(), { fetch: web.impl, ...treg.sources }, NOW);

  assert.deepEqual(result.errors, ['r/ClaudeAI', 'X @BadAccount', 'X search vibe coding']);
  const ids = (await saved(slug)).items.map((i) => i.id).sort();
  assert.deepEqual(ids, ['r-ancient', 'r-old', 'r-v1', 'x-900', 'x-bad-old', 'x-topic-old'], 'a failed source keeps every earlier post, however old');
  assert.deepEqual((await saved(slug)).errors, result.errors);

  const thrown = await channel({ reddit: ['ClaudeAI'] }, [keptReddit]);
  const broken = await refreshSignals(thrown, context(), { fetch: fakeFetch({ ClaudeAI: new Error('offline') }).impl, treg: noTreg.treg }, NOW);
  assert.deepEqual(broken.errors, ['r/ClaudeAI']);
  assert.deepEqual((await saved(thrown)).items.map((i) => i.id), ['r-old']);

  const notJson = await channel({ reddit: ['ClaudeAI'] });
  const garbage = await refreshSignals(notJson, context(), { fetch: fakeFetch({ ClaudeAI: { data: 'nope' } }).impl, treg: noTreg.treg }, NOW);
  assert.deepEqual(garbage.errors, ['r/ClaudeAI']);
});

const SUBS = ['ClaudeAI', 'ClaudeCode', 'vibecoding', 'AI_Agents', 'OpenAI', 'codex', 'ChatGPT', 'ArtificialInteligence', 'artificial'];
/** What a channel read on Oct 26 has: five posts in each of nine subreddits, now four days older, plus X posts. */
const earlier = SUBS.flatMap((sub) => Array.from({ length: 5 }, (_, n) => stored({ id: `r-${sub}-${n}`, source: 'reddit', author: `r/${sub}`, handle: 'u', likes: 100 + n, createdAt: new Date(NOW - (4 + n) * 86_400_000).toISOString() })));

test('Reddit failing on all nine subreddits replaces nothing: every post stays, each source is listed, and the next good read clears them', async () => {
  const slug = await channel({ reddit: SUBS, x: ['AnthropicAI'] }, [...earlier, stored({ id: 'x-kept' })]);
  const lines: unknown[] = [];
  const failing = fakeFetch(Object.fromEntries(SUBS.map((sub) => [sub, 429])));
  const result = await refreshSignals(slug, { emit: (data: unknown) => lines.push(data), signal: new AbortController().signal }, { fetch: failing.impl, treg: noTreg.treg }, NOW);
  assert.equal(failing.requests.length, 9);
  assert.deepEqual(result.failed, SUBS.map((sub) => `r/${sub}`));
  assert.equal(result.tried, 9);
  const file = await saved(slug);
  assert.equal(file.items.filter((item) => item.source === 'reddit').length, 45, 'all 45 earlier Reddit posts stay, the 8-day-old ones too');
  assert.ok(file.items.some((item) => item.id === 'x-kept'), 'X is untouched');
  assert.deepEqual(file.errors, SUBS.map((sub) => `r/${sub}`), 'each failed source, for the error line after a reload');
  // Progress: which source, how many of how many, and the time left once one is read.
  assert.deepEqual((lines[0] as { done: number; total: number }).done, 0);
  assert.match((lines[0] as { message: string }).message, /^Reading r\/ClaudeAI \(1 of 9\)…$/);
  assert.match((lines[8] as { message: string }).message, /^Reading r\/artificial \(9 of 9\) · (under a minute|about \d+ min) left…$/);

  // Try again on two of them: only those are read; the other seven keep their posts and their errors.
  const two = fakeFetch({ ClaudeAI: listing(redditPost({ id: 'fresh1' })), ClaudeCode: 503 });
  const retried = await refreshSignals(slug, context(), { fetch: two.impl, treg: noTreg.treg }, { only: ['r/ClaudeAI', 'r/ClaudeCode'], nowMs: NOW });
  assert.deepEqual(two.requests.map((r) => r.url.split('/r/')[1].split('/')[0]), ['ClaudeAI', 'ClaudeCode']);
  assert.deepEqual(retried.failed, ['r/ClaudeCode']);
  assert.equal(retried.tried, 2);
  const after = await saved(slug);
  assert.deepEqual(after.errors, SUBS.filter((sub) => sub !== 'ClaudeAI').map((sub) => `r/${sub}`), 'r/ClaudeAI read, so its error is gone; the rest stay listed');
  const fromClaudeAI = after.items.filter((item) => item.author === 'r/ClaudeAI').map((item) => item.id);
  assert.deepEqual(fromClaudeAI, ['r-fresh1'], 'a source that reads replaces its own posts');
  assert.equal(after.items.filter((item) => item.author === 'r/vibecoding').length, 5, 'a source not read this time is untouched');

  // Everything reads: no error is left.
  const good = fakeFetch(Object.fromEntries(SUBS.map((sub) => [sub, listing(redditPost({ id: `ok-${sub}`, subreddit: sub }))])));
  const fine = await refreshSignals(slug, context(), { fetch: good.impl, treg: noTreg.treg }, NOW);
  assert.deepEqual(fine.failed, []);
  assert.deepEqual((await saved(slug)).errors, []);
});

test('the time left comes from the sources read so far', async () => {
  const { timeLeft } = await import('./signals.js');
  assert.equal(timeLeft(10_000, 0, 9), undefined, 'nothing to go on before the first');
  assert.equal(timeLeft(10_000, 1, 9), 'about 1 min left');
  assert.equal(timeLeft(60_000, 1, 9), 'about 8 min left');
  assert.equal(timeLeft(5_000, 5, 9), 'under a minute left');
  assert.equal(timeLeft(5_000, 9, 9), undefined);
});

test('a refresh needs a source, and a subreddit name that is not one is never requested', async () => {
  const empty = await channel({});
  await assert.rejects(refreshSignals(empty, context(), { treg: noTreg.treg }, NOW), { message: 'Add a subreddit or an X account first.' });

  const odd = await channel({ reddit: ['../etc/passwd'] });
  const web = fakeFetch({});
  const result = await refreshSignals(odd, context(), { fetch: web.impl, treg: noTreg.treg }, NOW);
  assert.equal(web.requests.length, 0);
  assert.deepEqual(result.errors, ['r/../etc/passwd']);
});

test('read for a channel: posts about its topics and audience first with a reason, the rest fit false', async () => {
  const workspace = await store.createWorkspace({ name: 'Ranked signals', handle: '', channelUrl: '', topics: ['claude'], audience: ['Students'], about: '', cta: '' });
  const make = (id: string, text: string, likes: number): SignalItem => stored({ id, text, likes, replies: 0, ageHours: 10, source: 'reddit', author: 'r/x' });
  await store.writeJSON(path.join(store.workspaceDir(workspace.slug), 'signals.json'), {
    updatedAt: '2026-10-26T13:00:00.000Z',
    items: [make('cats', 'Cute cats', 9000), make('study', 'How students study', 100), make('cl', 'Claude is out', 50), make('cl-big', 'Claude again', 500)],
    errors: ['r/gone'],
  });
  const ranked = await rankedSignals(workspace.slug, workspace);
  assert.deepEqual(ranked.items.map((i) => [i.id, i.fit, i.reason]), [
    ['cl-big', true, 'Because you picked Claude'],
    ['study', true, 'Because you picked Students'],
    ['cl', true, 'Because you picked Claude'],
    ['cats', false, null],
  ]);
  assert.equal(ranked.updatedAt, '2026-10-26T13:00:00.000Z');
  assert.deepEqual(ranked.errors, ['r/gone']);

  const none = await store.createWorkspace({ name: 'No signals yet', handle: '', channelUrl: '', topics: [], about: '', cta: '' });
  assert.deepEqual(await rankedSignals(none.slug, none), { items: [], updatedAt: null, errors: [], sources: 0, sourcesBy: { x: 0, reddit: 0 } });
  assert.equal(ranked.sources, 0, 'no sources set up');
});

test('treg gets its own TREG_* settings and certificate variables, and none of the app\'s other secrets', () => {
  const keep = { ...process.env };
  Object.assign(process.env, { TREG_TOKEN: 't', TREG_API_URL: 'u', SSL_CERT_FILE: '/c.pem', NODE_EXTRA_CA_CERTS: '/e.pem', ANTHROPIC_API_KEY: 'secret', OPENAI_API_KEY: 'secret' });
  try {
    const env = tregEnv({});
    assert.deepEqual([env.TREG_TOKEN, env.TREG_API_URL, env.SSL_CERT_FILE, env.NODE_EXTRA_CA_CERTS], ['t', 'u', '/c.pem', '/e.pem']);
    assert.ok(!('ANTHROPIC_API_KEY' in env) && !('OPENAI_API_KEY' in env));
    assert.ok(env.PATH && env.HOME);
  } finally {
    for (const key of ['TREG_TOKEN', 'TREG_API_URL', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
      if (keep[key] === undefined) delete process.env[key];
      else process.env[key] = keep[key];
    }
  }
});
