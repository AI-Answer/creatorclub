import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-avatar-'));
process.env.CREATORCLUB_DIR = temp;
const { parseChannelAvatar, ensureChannelAvatar, cachedChannelAvatar } = await import('./channel-avatar.js');
const store = await import('./store.js');
const { clubRouter } = await import('./index.js');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a82sAAAAASUVORK5CYII=', 'base64');
const calls: string[] = [];
const fixture: typeof fetch = async (input) => {
  const url = String(input); calls.push(url);
  return url.startsWith('https://www.youtube.com/') ? new Response('<meta property="og:image" content="https://yt3.googleusercontent.com/avatar">') : new Response(image, { headers: { 'content-type': 'image/png' } });
};
const app = express();
app.use('/api/club', clubRouter({ avatarFetch: fixture }));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => { server.close(); await rm(temp, { recursive: true, force: true }); });
const workspace = (name: string, channelUrl = `https://www.youtube.com/@${name}`) => store.createWorkspace({ name, handle: '', channelUrl, topics: [], about: '', cta: '' });

test('parses Open Graph attributes in either order and channel metadata escaped URLs', () => {
  assert.equal(parseChannelAvatar('<meta property="og:image" content="https://yt3.ggpht.com/pic?a=1&amp;b=2">'), 'https://yt3.ggpht.com/pic?a=1&b=2');
  assert.equal(parseChannelAvatar("<meta content='https://yt3.googleusercontent.com/avatar' property='og:image'>"), 'https://yt3.googleusercontent.com/avatar');
  assert.equal(parseChannelAvatar('"channelMetadataRenderer":{"title":"A","avatar":{"thumbnails":[{"url":"https://yt3.ggpht.com/a\\u003ds88"}]}}'), 'https://yt3.ggpht.com/a=s88');
  for (const raw of ['', '<meta property="og:image" content="http://localhost/a">', '<meta property="og:image" content="https://yt3.ggpht.com.evil.test/a">', '<meta property="og:image" content="https://yt3.ggpht.com:1234/a">']) assert.equal(parseChannelAvatar(raw), undefined);
});

test('caches bytes with the workspace, persists a local URL and serves it without more network calls', async () => {
  const original = await workspace('cached');
  calls.length = 0;
  const [saved, duplicate] = await Promise.all([ensureChannelAvatar(original, fixture), ensureChannelAvatar(original, fixture)]);
  assert.equal(saved.avatarUrl, '/api/club/workspaces/cached/avatar');
  assert.equal(duplicate.avatarUrl, saved.avatarUrl);
  assert.equal((await store.readWorkspace('cached')).avatarUrl, saved.avatarUrl);
  assert.deepEqual(await readFile(path.join(store.workspaceDir('cached'), 'channel-avatar')), image);
  assert.equal((await ensureChannelAvatar(saved, fixture)).avatarUrl, saved.avatarUrl);
  const served = await fetch(base + '/workspaces/cached/avatar');
  assert.equal(served.status, 200); assert.match(served.headers.get('content-type')!, /image\/png/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), image);
  assert.equal(calls.length, 2, 'one page and one picture, even for concurrent requests and a later load');
});

test('workspace list lazily backfills an existing channel, including a handle-only profile', async () => {
  await workspace('backfill');
  const handle = await workspace('handle-only', '');
  await store.writeWorkspace({ ...handle, handle: '@SaminYasar_' });
  const list = await fetch(base + '/workspaces').then(response => response.json());
  for (const slug of ['backfill', 'handle-only']) assert.equal(list.workspaces.find((item: { slug: string }) => item.slug === slug).avatarUrl, `/api/club/workspaces/${slug}/avatar`);
});

test('missing metadata, a failed request or a non-raster image keeps the initials fallback; failures are throttled', async () => {
  for (const [name, fetcher] of [
    ['offline', async () => { throw new Error('offline'); }],
    ['no-avatar', async () => new Response('<html>No avatar</html>')],
    ['bad-image', async (input: unknown) => String(input).includes('youtube.com') ? fixture(String(input)) : new Response('<svg/>')],
  ] as const) {
    const original = await workspace(name); let count = 0;
    const counted: typeof fetch = async (input) => { count++; return fetcher(input); };
    assert.equal((await ensureChannelAvatar(original, counted)).avatarUrl, undefined);
    const first = count;
    assert.equal((await ensureChannelAvatar(original, counted)).avatarUrl, undefined);
    assert.equal(count, first);
    assert.equal(await cachedChannelAvatar(original.slug), undefined);
  }
  const fresh = await workspace('fresh', '');
  assert.equal((await ensureChannelAvatar(fresh, fixture)).avatarUrl, undefined);
});

test('a changed channel URL refreshes its cached picture', async () => {
  const original = await store.readWorkspace('cached');
  const updated = { ...original, channelUrl: 'https://www.youtube.com/@another-channel' };
  await store.writeWorkspace(updated);
  calls.length = 0;
  await ensureChannelAvatar(updated, fixture);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], updated.channelUrl);
});
