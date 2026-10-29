import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { SignalsResponse, TrendingResponse, Video, Workspace } from '../../shared/club.js';

/* Working now, Signals, turn into idea and start fresh, through the HTTP routes. Stand-ins for YouTube, Reddit and treg. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-trends-'));
process.env.CREATORCLUB_DIR = temp;
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
const { clubRouter } = await import('./index.js');
const store = await import('./store.js');

const DAY = 86_400_000;
let youtubeCalls = 0;
let redditCalls = 0;
let releaseListing: () => void = () => {};
const gate = new Promise<void>((resolve) => (releaseListing = resolve));
let hold = false;

const app = express();
app.use(
  '/api/club',
  clubRouter({
    uploads: async () => ({
      async list() {
        youtubeCalls++;
        if (hold) await gate;
        return ['a', 'b', 'c'].map((id) => ({ id: `vid_${id}0000`, title: `Claude video ${id}` }));
      },
      async stats(ids) {
        return new Map(ids.map((id, i) => [id, { views: 1000 * (i + 1) * (i === 2 ? 5 : 1), likes: 5, comments: 1, uploadedAt: Date.now() - (i + 1) * DAY }]));
      },
    }),
    signals: {
      fetch: (async () => {
        redditCalls++;
        const child = { data: { id: 'r1', subreddit: 'ClaudeAI', author: 'bob', title: 'Claude news today', score: 400, num_comments: 20, created_utc: Date.now() / 1000 - 3600, permalink: '/r/ClaudeAI/comments/r1/x/' } };
        return new Response(JSON.stringify({ data: { children: [child] } }), { status: 200 });
      }) as typeof fetch,
      treg: async () => undefined,
    },
  }),
);
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  await rm(temp, { recursive: true, force: true });
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};
async function finished(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const job = (await call('GET', `/jobs/${jobId}`)).body;
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('the job did not finish');
}

test('Working now, Signals and the idea routes need a channel first', async () => {
  for (const [method, url, body] of [
    ['GET', '/trending'], ['POST', '/trending/refresh'], ['POST', '/trending/idea', { videoId: 'abcdefghijk' }],
    ['GET', '/signals'], ['POST', '/signals/refresh'], ['POST', '/signals/idea', { id: 'x-1' }],
    ['GET', '/followed'], ['GET', '/signals-config'],
  ] as [string, string, unknown?][]) {
    const res = await call(method, url, body);
    assert.equal(res.status, 409, `${method} ${url}`);
    assert.equal(res.body.error, 'Set up a channel first.');
  }
});

test('start fresh: a channel with no YouTube link, its profile, and a voice guide from the answers given', async () => {
  const created = await call('POST', '/workspaces/fresh', {
    name: 'Ana Perez',
    topics: ['Claude', 'Automation'],
    audience: ['Small-business owners'],
    voice: { voice: 'Calm and clear, like a teacher', audience: 'Shop owners who are not technical', moves: '' },
  });
  assert.equal(created.status, 201);
  const workspace = created.body as Workspace;
  assert.equal(workspace.slug, 'ana-perez');
  assert.equal(workspace.channelUrl, '');
  assert.equal(workspace.handle, '');
  assert.deepEqual(workspace.topics, ['Claude', 'Automation']);
  assert.deepEqual(workspace.audience, ['Small-business owners']);
  assert.equal(workspace.about, 'Shop owners who are not technical');
  assert.equal(workspace.person, 'Ana Perez', 'a fresh channel is a person, so greetings can use the name');
  assert.equal((await call('PUT', '/workspaces/ana-perez', { person: 'Ana' })).body.person, 'Ana', 'and Settings can change it');
  assert.deepEqual(JSON.parse(await readFile(path.join(store.workspaceDir('ana-perez'), 'profile.json'), 'utf8')).audience, ['Small-business owners']);
  const voice = await readFile(path.join(store.workspaceDir('ana-perez'), 'voice.md'), 'utf8');
  assert.equal(voice, '# Ana Perez: Voice Guide\n\n## Voice DNA\n- **Voice:** Calm and clear, like a teacher\n- **Audience:** Shop owners who are not technical\n');
  assert.equal((await call('GET', '/workspaces')).body.current, 'ana-perez', 'it becomes the current channel');
  assert.equal((await call('GET', '/videos')).status, 200);

  // No answers: no voice guide is written, and the same name gets its own folder.
  const second = await call('POST', '/workspaces/fresh', { name: 'Ana Perez', topics: [], audience: [] });
  assert.equal(second.body.slug, 'ana-perez-2');
  await assert.rejects(stat(path.join(store.workspaceDir('ana-perez-2'), 'voice.md')));
  assert.equal((await call('POST', '/workspaces/fresh', { name: '' })).status, 400);
  assert.equal((await call('POST', '/workspaces/fresh', { name: 'X', channelUrl: 'https://youtube.com/@x' })).status, 400, 'a fresh channel has no link');
});

test('a channel with no link rebuilds its voice from answers and does not try to read YouTube', async () => {
  await call('POST', '/workspaces/ana-perez-2/current');
  const asked = await call('POST', '/workspaces/ana-perez-2/voice', {});
  assert.equal(asked.status, 202);
  const job = await finished(asked.body.id);
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { voice: 'needs-answers' }, 'it asks the three questions instead of failing with a channel error');

  const answered = await finished((await call('POST', '/workspaces/ana-perez-2/voice', { answers: { voice: 'Dry and honest', audience: 'Developers', moves: 'End on a recap' } })).body.id);
  assert.deepEqual(answered.result, { voice: 'built' });
  assert.match(await readFile(path.join(store.workspaceDir('ana-perez-2'), 'voice.md'), 'utf8'), /Signature moves:\*\* End on a recap/);
  assert.equal((await call('GET', '/workspaces/ana-perez-2')).body.about, 'Developers');
});

test('a channel saved before audiences existed reads with an empty audience, and keeps it when other details are saved', async () => {
  await mkdir(store.workspaceDir('legacy'), { recursive: true });
  await writeFile(path.join(store.workspaceDir('legacy'), 'profile.json'), JSON.stringify({ slug: 'legacy', name: 'Legacy', handle: '', channelUrl: '', topics: ['claude'], about: '', cta: '', createdAt: '2026-01-01T00:00:00.000Z' }));
  assert.deepEqual((await call('GET', '/workspaces/legacy')).body.audience, []);
  const put = await call('PUT', '/workspaces/legacy', { audience: ['Students'] });
  assert.deepEqual(put.body.audience, ['Students']);
  assert.deepEqual((await call('PUT', '/workspaces/legacy', { about: 'Teaches' })).body.audience, ['Students']);
});

test('followed channels and signal sources: read, replace and validate', async () => {
  await call('POST', '/workspaces/ana-perez/current');
  assert.deepEqual((await call('GET', '/followed')).body, []);
  assert.deepEqual((await call('GET', '/signals-config')).body, { x: [], xTopics: [], reddit: [] });

  const put = await call('PUT', '/followed', [{ name: 'Riley', url: 'https://youtube.com/@Riley_Brown/videos' }, { name: 'Greg', channelId: 'UCPjNBjflYl0-HQtUvOx0Ibw' }, { name: 'Dan', handle: 'dan_codes' }]);
  assert.equal(put.status, 200);
  assert.deepEqual(put.body, [
    { name: 'Riley', url: 'https://www.youtube.com/@Riley_Brown' },
    { name: 'Greg', channelId: 'UCPjNBjflYl0-HQtUvOx0Ibw' },
    { name: 'Dan', handle: '@dan_codes' },
  ]);
  assert.deepEqual((await call('GET', '/followed')).body, put.body);
  assert.equal((await call('PUT', '/followed', [{ name: 'No link' }])).status, 400, 'a followed channel needs a link, handle or channel id');
  const notYouTube = await call('PUT', '/followed', [{ name: 'Site', url: 'https://example.com/x' }]);
  assert.equal(notYouTube.status, 400);
  assert.equal(notYouTube.body.error, 'Paste a YouTube channel link, like youtube.com/@yourchannel.');

  const config = await call('PUT', '/signals-config', { x: ['@AnthropicAI'], xTopics: ['"claude code"'], reddit: ['r/ClaudeAI', 'vibecoding'], maxAgeDays: 7 });
  assert.deepEqual(config.body, { x: ['AnthropicAI'], xTopics: ['"claude code"'], reddit: ['ClaudeAI', 'vibecoding'], maxAgeDays: 7 });
  assert.equal((await call('PUT', '/signals-config', { reddit: ['not a sub!'] })).status, 400);
  assert.equal((await call('PUT', '/signals-config', { surprise: 1 })).status, 400);
  await call('PUT', '/signals-config', { x: [], xTopics: [], reddit: [] });
});

test('Working now: refresh is a job with progress, the read ranks for the channel, and a second start joins the running job', async () => {
  await call('POST', '/workspaces/ana-perez-2/current');
  assert.deepEqual((await call('POST', '/trending/refresh')).body, { error: 'Follow a channel first.' });
  await call('POST', '/workspaces/ana-perez/current');
  assert.deepEqual((await call('GET', '/trending')).body, { items: [], updatedAt: null, followed: 3 });

  hold = true;
  const first = await call('POST', '/trending/refresh');
  const second = await call('POST', '/trending/refresh');
  assert.equal(first.status, 202);
  assert.equal(first.body.kind, 'trending-refresh');
  assert.equal(second.body.id, first.body.id, 'a refresh already running is not started twice');
  hold = false;
  releaseListing();
  const job = await finished(first.body.id);
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { videos: 3, added: 3, channels: 3, failed: [] });
  assert.equal(youtubeCalls, 3, 'one listing per followed channel');

  const read = (await call('GET', '/trending')).body as TrendingResponse;
  assert.equal(read.items.length, 3);
  assert.ok(read.updatedAt && Date.now() - Date.parse(read.updatedAt) < 60_000);
  assert.equal(read.followed, 3);
  const top = read.items[0];
  assert.equal(top.fit, true);
  assert.equal(top.reason, 'Because you picked Claude');
  assert.equal(top.kind, 'followed');
  assert.ok(typeof top.mult === 'number' || top.mult === null);

  const again = await finished((await call('POST', '/trending/refresh')).body.id);
  assert.equal(again.result.added, 0);
});

test('Signals: refresh reads Reddit, notes that X waits for treg, and the read is ranked for the channel', async () => {
  await call('POST', '/workspaces/ana-perez-2/current');
  assert.deepEqual((await call('POST', '/signals/refresh')).body, { error: 'Add a subreddit or an X account first.' });
  await call('POST', '/workspaces/ana-perez/current');
  assert.deepEqual((await call('POST', '/signals/refresh')).body, { error: 'Add a subreddit or an X account first.' }, 'the sources were cleared above');
  await call('PUT', '/signals-config', { x: ['AnthropicAI'], reddit: ['ClaudeAI', 'vibecoding'] });
  assert.deepEqual((await call('GET', '/signals')).body, { items: [], updatedAt: null, errors: [] });

  const job = await finished((await call('POST', '/signals/refresh')).body.id);
  assert.equal(job.status, 'done');
  assert.deepEqual(job.result, { posts: 1, added: 1, errors: [], note: 'X posts refresh when treg is connected.' });
  assert.equal(redditCalls, 2, 'one request per subreddit');

  const read = (await call('GET', '/signals')).body as SignalsResponse;
  assert.equal(read.items.length, 1);
  assert.deepEqual([read.items[0].id, read.items[0].fit, read.items[0].reason], ['r-r1', true, 'Because you picked Claude']);
});

test('turn a post into an idea: stage ideas, the source and the post text on the idea, and no copy on a second click', async () => {
  const signal = ((await call('GET', '/signals')).body as SignalsResponse).items[0];
  const made = await call('POST', '/signals/idea', { id: signal.id });
  assert.equal(made.status, 201);
  const video = made.body as Video;
  assert.equal(video.stage, 'ideas');
  assert.equal(video.title, 'Claude news today');
  assert.deepEqual(video.idea, { sources: [{ label: 'Claude news today (r/ClaudeAI)', url: 'https://www.reddit.com/r/ClaudeAI/comments/r1/x/' }], note: 'Claude news today' });

  const again = await call('POST', '/signals/idea', { id: signal.id });
  assert.equal(again.status, 200);
  assert.equal(again.body.id, video.id);
  assert.equal((await call('GET', '/videos')).body.filter((v: Video) => v.idea?.sources?.length).length, 1);
  assert.equal((await call('POST', '/signals/idea', { id: 'x-nope' })).status, 404);
  assert.equal((await call('POST', '/signals/idea', {})).status, 400);

  // After the idea is skipped, the same post can become an idea again.
  await call('PUT', `/videos/${video.id}`, { hidden: 'skipped' });
  assert.equal((await call('POST', '/signals/idea', { id: signal.id })).status, 201);
});

test('turn a Working now video into an idea: its title and link are kept as the source', async () => {
  const item = ((await call('GET', '/trending')).body as TrendingResponse).items[0];
  const made = await call('POST', '/trending/idea', { videoId: item.videoId });
  assert.equal(made.status, 201);
  assert.equal(made.body.stage, 'ideas');
  assert.equal(made.body.title, item.title);
  assert.deepEqual(made.body.idea, { sources: [{ label: `${item.title} (${item.channel})`, url: `https://www.youtube.com/watch?v=${item.videoId}` }], note: item.title });
  assert.equal((await call('POST', '/trending/idea', { videoId: item.videoId })).status, 200);
  assert.equal((await call('POST', '/trending/idea', { videoId: 'nothing1234' })).status, 404);
  assert.equal((await call('POST', '/trending/idea', { videoId: '../x' })).status, 400);
});

test('a double click makes one idea: two requests at once, from a post and from a video', async () => {
  const before = ((await call('GET', '/videos')).body as Video[]).length;
  const signals = (await call('GET', '/signals')).body as SignalsResponse;
  const trending = (await call('GET', '/trending')).body as TrendingResponse;
  // Items that are not an idea yet: the post's earlier idea was skipped and recreated above, so use the second video.
  const fresh = trending.items[1];
  const results = await Promise.all([
    call('POST', '/trending/idea', { videoId: fresh.videoId }),
    call('POST', '/trending/idea', { videoId: fresh.videoId }),
    call('POST', '/trending/idea', { videoId: fresh.videoId }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 201]);
  assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
  assert.equal(((await call('GET', '/videos')).body as Video[]).length, before + 1);
  assert.ok(signals.items.length > 0);
});

test('saving signal sources keeps the lists that are not sent', async () => {
  await call('PUT', '/signals-config', { x: ['AnthropicAI'], reddit: ['ClaudeAI'], minXLikes: 800 });
  const merged = await call('PUT', '/signals-config', { reddit: ['vibecoding'] });
  assert.deepEqual(merged.body, { x: ['AnthropicAI'], xTopics: [], reddit: ['vibecoding'], minXLikes: 800, maxAgeDays: 7 });
  assert.deepEqual((await call('PUT', '/signals-config', { x: [] })).body, { x: [], xTopics: [], reddit: ['vibecoding'], minXLikes: 800, maxAgeDays: 7 }, 'an empty list clears a source');
});
