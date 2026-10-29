import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-postiz-'));
process.env.CREATORCLUB_DIR = temp;
delete process.env.CREATORCLUB_POSTIZ_URL;
const { clubRouter } = await import('./index.js');
const { startFakePostiz } = await import('./fake-postiz.js');
const { BAD_ADDRESS, BAD_KEY, CANT_REACH_POSTIZ, MAX_VIDEO_BYTES, POSTIZ_CLOUD_API, POSTS_PER_HOUR, PostizPublisher, UNCONFIRMED, isPrivateHost, normalizeAddress, postizApiBase, postizAppUrl, resetPostizState } = await import('./postiz.js');
const { ALREADY_SENT, ALREADY_UNCONFIRMED, NOT_THERE, effectiveAddress, imageKind } = await import('./publisher-routes.js');
const { PublisherError } = await import('./publisher.js');
const store = await import('./store.js');

const fake = await startFakePostiz();
const videoFile = path.join(temp, 'export.mp4');
await writeFile(videoFile, Buffer.alloc(300_000, 7));
const thumbFile = path.join(temp, 'thumb.png');
await writeFile(thumbFile, Buffer.from('89504e470d0a1a0a', 'hex'));
const file = (over = {}) => ({ path: videoFile, name: 'Hidden features.mp4', size: 300_000, type: 'video/mp4', ...over });
const request = (over = {}) => ({ channelId: 'int_yt1', title: 'Seven tricks', description: 'What you get', tags: ['claude', 'ai'], visibility: 'unlisted' as const, madeForKids: false, video: file(), ...over });
const noProgress = () => {};
const rejects = (promise: Promise<unknown>, message: string | RegExp) =>
  assert.rejects(promise, (error: Error) => error instanceof PublisherError && (typeof message === 'string' ? error.message === message : message.test(error.message)));

beforeEach(() => {
  fake.fail = {};
  fake.uploadAnswer = undefined;
  fake.newState = 'QUEUE';
  fake.releaseURL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  fake.postAnswer = undefined;
  resetPostizState();
});

// ------------------------------------------------------------------ the adapter

test('the API address: Cloud by default, a self-hosted server under /api/public/v1, and anything else refused with one sentence', () => {
  assert.equal(postizApiBase(), POSTIZ_CLOUD_API);
  assert.equal(postizApiBase('  '), POSTIZ_CLOUD_API);
  assert.equal(postizApiBase('https://postiz.example.com'), 'https://postiz.example.com/api/public/v1');
  assert.equal(postizApiBase('https://postiz.example.com/'), 'https://postiz.example.com/api/public/v1');
  assert.equal(postizApiBase('https://example.com/api'), 'https://example.com/api/public/v1');
  assert.equal(postizApiBase('https://example.com/api/public/v1/'), 'https://example.com/api/public/v1');
  assert.equal(postizAppUrl(), 'https://platform.postiz.com/launches');
  assert.equal(postizAppUrl('https://postiz.example.com'), 'https://postiz.example.com/launches');
  for (const bad of ['postiz.example.com', 'ftp://x.y', 'not a url']) assert.throws(() => postizApiBase(bad), { message: BAD_ADDRESS });
});

test('an address with a username or password is refused, and plain http is only for this computer or the own network', () => {
  for (const bad of ['https://user:pass@postiz.example.com', 'https://user@postiz.example.com', 'http://user:pass@127.0.0.1:5000', 'http://postiz.example.com', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.169.0.1']) {
    assert.throws(() => normalizeAddress(bad), { message: BAD_ADDRESS }, bad);
    assert.throws(() => postizApiBase(bad), { message: BAD_ADDRESS }, bad);
    assert.throws(() => postizAppUrl(bad), { message: BAD_ADDRESS }, bad);
  }
  assert.match(BAD_ADDRESS, /without a username or password/);
  assert.match(BAD_ADDRESS, /Plain http only works for this computer or your own network/);
  for (const ok of ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://[::1]:5000', 'http://10.0.0.2', 'http://172.20.1.1', 'http://192.168.1.5', 'http://169.254.1.1', 'http://postiz.local', 'https://postiz.example.com']) assert.doesNotThrow(() => normalizeAddress(ok), ok);
  assert.equal(isPrivateHost('[fd12:3456::1]'), true);
  assert.equal(isPrivateHost('2606:4700::1'), false);
  assert.equal(normalizeAddress('https://postiz.example.com/api/?token=abc#frag'), 'https://postiz.example.com/api', 'only the origin and path are kept');
  assert.equal(normalizeAddress('  https://postiz.example.com/ '), 'https://postiz.example.com');
  assert.equal(normalizeAddress(''), null);
});

test('CREATORCLUB_POSTIZ_URL only counts in a test or a walkthrough, never in a real install', () => {
  const saved = { url: process.env.CREATORCLUB_POSTIZ_URL, env: process.env.NODE_ENV, flag: process.env.CREATORCLUB_TEST };
  try {
    process.env.CREATORCLUB_POSTIZ_URL = 'http://127.0.0.1:9999';
    delete process.env.NODE_ENV;
    delete process.env.CREATORCLUB_TEST;
    assert.equal(effectiveAddress({}), null, 'ignored in production');
    process.env.NODE_ENV = 'production';
    assert.equal(effectiveAddress({}), null);
    process.env.NODE_ENV = 'test';
    assert.equal(effectiveAddress({}), 'http://127.0.0.1:9999');
    delete process.env.NODE_ENV;
    process.env.CREATORCLUB_TEST = '1';
    assert.equal(effectiveAddress({}), 'http://127.0.0.1:9999');
    assert.equal(effectiveAddress({ address: 'https://postiz.example.com' }), 'https://postiz.example.com', 'the person\'s own address wins');
    assert.equal(effectiveAddress({ address: 'https://u:p@postiz.example.com' }), 'http://127.0.0.1:9999', 'a saved address that is no longer accepted is ignored');
  } finally {
    for (const [key, value] of [['CREATORCLUB_POSTIZ_URL', saved.url], ['NODE_ENV', saved.env], ['CREATORCLUB_TEST', saved.flag]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('an upload that was kept is reused only for the same content', async () => {
  fake.uploads.length = 0;
  const publisher = new PostizPublisher({ apiKey: fake.key, address: fake.url });
  await publisher.publish(request({ video: file({ name: 'hash.mp4', version: 'one' }) }), noProgress);
  await publisher.publish(request({ video: file({ name: 'hash.mp4', version: 'one' }) }), noProgress);
  await publisher.publish(request({ video: file({ name: 'hash.mp4', version: 'two' }) }), noProgress);
  assert.equal(fake.uploads.filter((upload) => upload.name === 'hash.mp4').length, 2);
});

test('images are told apart by their first bytes, not by what the client called them', () => {
  assert.equal(imageKind(Buffer.from('89504e470d0a1a0a00', 'hex')), 'png');
  assert.equal(imageKind(Buffer.from('ffd8ffe000104a46', 'hex')), 'jpg');
  assert.equal(imageKind(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'webp');
  for (const bad of [Buffer.from('GIF89a'), Buffer.from('<svg></svg>'), Buffer.alloc(0), Buffer.from('RIFF....WAVE')]) assert.equal(imageKind(bad), undefined);
});

test('connect sends the raw key (no Bearer) and returns only the enabled YouTube channels', async () => {
  fake.channels.push({ id: 'int_off', name: 'Old channel', identifier: 'youtube', disabled: true });
  try {
    const channels = await new PostizPublisher({ apiKey: fake.key, address: fake.url }).connect();
    assert.deepEqual(channels, [{ id: 'int_yt1', name: 'Samin Yasar' }]);
  } finally {
    fake.channels.pop();
  }
});

test('a key Postiz does not accept is one plain sentence, and so is an unreachable Postiz', async () => {
  await rejects(new PostizPublisher({ apiKey: 'wrong', address: fake.url }).connect(), BAD_KEY);
  await rejects(new PostizPublisher({ apiKey: fake.key, address: 'http://127.0.0.1:1' }).connect(), CANT_REACH_POSTIZ);
});

test('publish uploads the video as multipart, then creates one YouTube post with the title, visibility, made-for-kids answer, tags and thumbnail', async () => {
  fake.uploads.length = 0;
  fake.posts.length = 0;
  const events: { step: string; percent?: number; message: string }[] = [];
  const publisher = new PostizPublisher({ apiKey: fake.key, address: fake.url });
  const sent = await publisher.publish(request({ thumbnail: { path: thumbFile, name: 'thumbnail.png', size: 8, type: 'image/png' } }), (event) => events.push(event));
  assert.deepEqual(fake.uploads, [
    { name: 'Hidden features.mp4', size: 300_000, type: 'video/mp4' },
    { name: 'thumbnail.png', size: 8, type: 'image/png' },
  ]);
  assert.equal(fake.posts.length, 1);
  const body = fake.posts[0].body;
  assert.equal(body.type, 'now');
  assert.equal(body.posts[0].integration.id, 'int_yt1');
  assert.equal(body.posts[0].value[0].content, 'What you get');
  assert.deepEqual(body.posts[0].value[0].image, [{ id: 'media_1', path: `${fake.url}/uploads/Hidden features.mp4` }]);
  assert.deepEqual(body.posts[0].settings, {
    __type: 'youtube',
    title: 'Seven tricks',
    type: 'unlisted',
    selfDeclaredMadeForKids: 'no',
    thumbnail: { id: 'media_2', path: `${fake.url}/uploads/thumbnail.png` },
    tags: [{ value: 'claude', label: 'claude' }, { value: 'ai', label: 'ai' }],
  });
  assert.equal(sent.postId, 'post_1');
  assert.equal(events[0].step, 'upload');
  assert.equal(events.at(-1)!.step, 'post');
  const percents = events.filter((event) => event.step === 'upload').map((event) => event.percent!);
  assert.deepEqual(percents, [...percents].sort((a, b) => a - b), 'progress only goes forward');
  assert.equal(percents.at(-1), 100);
  assert.deepEqual(fake.log.filter((line) => line.startsWith('POST')).slice(-3), ['POST /upload', 'POST /upload', 'POST /posts']);
});

test('a scheduled post is sent as schedule with its time, and kids content as yes', async () => {
  fake.posts.length = 0;
  const at = new Date(Date.now() + 86_400_000);
  const sent = await new PostizPublisher({ apiKey: fake.key, address: fake.url }).publish(request({ scheduledFor: at, madeForKids: true }), noProgress);
  assert.equal(fake.posts.at(-1)!.body.type, 'schedule');
  assert.equal(fake.posts.at(-1)!.body.date, at.toISOString());
  assert.equal(fake.posts.at(-1)!.body.posts[0].settings.selfDeclaredMadeForKids, 'yes');
  assert.equal(sent.date.toISOString(), at.toISOString());
});

test('status reads queued, published (with the YouTube link) and failed', async () => {
  const publisher = new PostizPublisher({ apiKey: fake.key, address: fake.url });
  const sent = await publisher.publish(request(), noProgress);
  assert.deepEqual(await publisher.status(sent), { state: 'queued' });
  fake.finish(sent.postId, 'PUBLISHED', 'https://www.youtube.com/watch?v=abc123DEF45');
  assert.deepEqual(await publisher.status(sent), { state: 'published', url: 'https://www.youtube.com/watch?v=abc123DEF45' });
  fake.finish(sent.postId, 'ERROR');
  assert.deepEqual(await publisher.status(sent), { state: 'failed' });
  assert.deepEqual(await publisher.status({ postId: 'unknown', date: sent.date }), { state: 'queued' });
});

test('every way Postiz can refuse is one sentence, never its own words', async () => {
  const publisher = new PostizPublisher({ apiKey: fake.key, address: fake.url });
  fake.fail.upload = { status: 413 };
  await rejects(publisher.publish(request(), noProgress), /Postiz takes videos up to 1 GB/);
  fake.fail.upload = { status: 429, headers: { 'Retry-After': '1500' } };
  await rejects(publisher.publish(request(), noProgress), 'Postiz allows 90 posts an hour and that is used up. Try again in 25 minutes.');
  fake.fail.upload = { status: 429 };
  await rejects(publisher.publish(request(), noProgress), 'Postiz allows 90 posts an hour and that is used up. Try again in a little while.');
  fake.fail.upload = { status: 500 };
  await rejects(publisher.publish(request(), noProgress), 'Postiz had a problem on its side.');
  fake.fail.upload = { status: 400, body: { message: 'ffprobe: moov atom not found' } };
  await rejects(publisher.publish(request(), noProgress), "Postiz couldn't process the video.");
  fake.uploadAnswer = { ok: true };
  await rejects(publisher.publish(request({ video: file({ name: 'other.mp4', version: 'b' }) }), noProgress), "Postiz couldn't process the video.");
  fake.uploadAnswer = undefined;
  fake.fail.posts = { status: 400, body: { message: 'title is too long: a raw detail' } };
  await rejects(publisher.publish(request(), noProgress), 'Postiz rejected the post. Check the title, tags and time.');
  fake.fail.posts = { status: 429, headers: { 'Retry-After': '60' } };
  await rejects(publisher.publish(request(), noProgress), /Try again in a minute\./);
  fake.fail.posts = { status: 200, body: { nothing: true } };
  await rejects(publisher.publish(request(), noProgress), /didn't confirm the post/);
  fake.fail.upload = { status: 401 };
  await rejects(publisher.publish(request({ video: file({ name: 'third.mp4', version: 'c' }) }), noProgress), BAD_KEY);
});

test('a video over 1 GB is refused before anything is sent', async () => {
  fake.log.length = 0;
  await rejects(new PostizPublisher({ apiKey: fake.key, address: fake.url }).publish(request({ video: file({ size: MAX_VIDEO_BYTES + 1.5 * 1024 ** 3 }) }), noProgress), 'Postiz takes videos up to 1 GB. This one is 2.5 GB.');
  assert.deepEqual(fake.log, []);
});

test('a retry after a failed post does not send the video again', async () => {
  fake.uploads.length = 0;
  const publisher = new PostizPublisher({ apiKey: fake.key, address: fake.url });
  const retry = request({ video: file({ name: 'retry.mp4' }) });
  fake.fail.posts = { status: 400 };
  await rejects(publisher.publish(retry, noProgress), /rejected the post/);
  await publisher.publish(retry, noProgress);
  assert.equal(fake.uploads.filter((upload) => upload.name === 'retry.mp4').length, 1);
});

test('the 90 posts an hour are counted here, so the 91st is explained before the video is sent', async () => {
  const publisher = new PostizPublisher({ apiKey: fake.key, address: fake.url });
  for (let i = 0; i < POSTS_PER_HOUR; i++) await publisher.publish(request({ video: file({ name: 'limit.mp4' }) }), noProgress);
  fake.log.length = 0;
  await rejects(publisher.publish(request({ video: file({ name: 'limit.mp4' }) }), noProgress), /Postiz allows 90 posts an hour and that is used up\. Try again in \d+ minutes\./);
  assert.deepEqual(fake.log, []);
});

// ------------------------------------------------------------------ the routes

const exports = new Map<string, { path: string; name: string; size: number; projectId: string }>([['e1', { path: videoFile, name: 'Hidden features-e1.mp4', size: 300_000, projectId: 'p1' }], ['other', { path: videoFile, name: 'x.mp4', size: 300_000, projectId: 'p2' }]]);
const app = express();
app.use('/api/club', clubRouter({ readViews: async () => 1234, publishing: { exportFile: async (id) => exports.get(id), waitMs: 300, pollMs: 15 } }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  await fake.close();
  await rm(temp, { recursive: true, force: true });
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, text, body: text && text.startsWith('{') || text.startsWith('[') || text === 'null' ? JSON.parse(text) : undefined };
};
const finished = async (jobId: string) => {
  for (let i = 0; i < 300; i++) {
    const job = (await call('GET', `/jobs/${jobId}`)).body;
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not finish');
};

await call('POST', '/workspaces', { name: 'Samin' });
const newVideo = async (project = 'p1') => {
  const id = (await call('POST', '/videos', { title: 'Seven hidden Claude tricks', stage: 'publishing' })).body.id as string;
  await call('PUT', `/videos/${id}`, { recorderProjectId: project });
  return id;
};
const start = (over = {}) => ({ exportId: 'e1', title: 'Seven hidden Claude tricks', description: 'What you get', tags: ['claude'], visibility: 'public', madeForKids: false, ...over });
const connect = () => call('PUT', '/publishing/postiz', { key: fake.key, address: fake.url });

test('nothing is connected at first, and the screen is never given the key', async () => {
  const first = await call('GET', '/publishing');
  assert.deepEqual(first.body, { postiz: { connected: false, address: null, channel: null }, defaultVisibility: 'public' });
  assert.equal((await call('PUT', '/publishing/postiz', { key: 'wrong-key', address: fake.url })).body.error, BAD_KEY);
  assert.equal((await call('GET', '/publishing')).body.postiz.connected, false, 'a key Postiz refused is not saved');
  assert.equal((await call('PUT', '/publishing/postiz', { key: fake.key, address: 'nope' })).body.error, BAD_ADDRESS);

  const connected = await connect();
  assert.equal(connected.status, 200);
  assert.deepEqual(connected.body.channels, [{ id: 'int_yt1', name: 'Samin Yasar' }]);
  assert.deepEqual(connected.body.state.postiz, { connected: true, address: fake.url, channel: { id: 'int_yt1', name: 'Samin Yasar' } });
  for (const body of [connected.text, (await call('GET', '/publishing')).text, (await call('GET', '/publishing/postiz/channels')).text, (await call('GET', '/settings')).text]) assert.equal(body.includes(fake.key), false, 'the key never comes back');
  const secrets = await readFile(path.join(store.secretsDir(), 'secrets.json'), 'utf8');
  assert.match(secrets, /fake-postiz-key/);
  assert.equal((await stat(path.join(store.secretsDir(), 'secrets.json'))).mode & 0o077, 0, 'owner-only');
  assert.equal((await readFile(path.join(temp, 'settings.json'), 'utf8')).includes(fake.key), false, 'and not in settings.json');
});

test('an address with credentials is refused, never saved or echoed, and only the clean origin is kept', async () => {
  const before = (await call('GET', '/publishing')).body.postiz.address;
  const bad = await call('PUT', '/publishing/postiz', { key: fake.key, address: 'https://admin:hunter2secret@postiz.example.com/api' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, BAD_ADDRESS);
  assert.equal(bad.text.includes('hunter2secret') || bad.text.includes('admin'), false, 'what was typed is not echoed');
  const plain = await call('PUT', '/publishing/postiz', { key: fake.key, address: 'http://postiz.example.com' });
  assert.equal(plain.body.error, BAD_ADDRESS);
  assert.equal((await call('GET', '/publishing')).body.postiz.address, before, 'a refused address changes nothing');
  const good = await call('PUT', '/publishing/postiz', { key: fake.key, address: `${fake.url}/?token=abc#frag` });
  assert.equal(good.status, 200);
  assert.equal(good.body.state.postiz.address, fake.url);
  const settings = await readFile(path.join(temp, 'settings.json'), 'utf8');
  assert.equal(settings.includes('token=abc'), false);
  assert.equal(settings.includes('hunter2secret'), false);
  // A hand-edited settings.json with credentials in the address is not used and not shown.
  await store.updatePublishingSettings({ address: 'https://admin:hunter2secret@postiz.example.com' });
  const shown = await call('GET', '/publishing');
  assert.equal(shown.body.postiz.address, null);
  assert.equal(shown.text.includes('hunter2secret'), false);
  await store.updatePublishingSettings({ address: fake.url });
});

test('the default visibility and the YouTube channel are saved; a channel Postiz does not have is refused', async () => {
  await connect();
  assert.equal((await call('PUT', '/publishing', { defaultVisibility: 'unlisted' })).body.defaultVisibility, 'unlisted');
  assert.equal((await call('PUT', '/publishing', { defaultVisibility: 'secret' })).status, 400);
  assert.equal((await call('PUT', '/publishing', { channelId: 'int_x1' })).status, 400, 'an X channel is not a YouTube channel');
  assert.equal((await call('PUT', '/publishing', { channelId: 'int_yt1' })).body.postiz.channel.name, 'Samin Yasar');
  await call('PUT', '/publishing', { defaultVisibility: 'public' });
});

test('Publish now: the job reports its steps, the post carries the form, and a published video with its link moves to Published and gets its views', async () => {
  await connect();
  fake.posts.length = 0;
  fake.newState = 'PUBLISHED';
  const id = await newVideo();
  const started = await call('POST', `/videos/${id}/postiz`, start({ tags: ['claude', 'ai'], visibility: 'unlisted' }));
  assert.equal(started.status, 202);
  const events = await fetch(`${base}/jobs/${started.body.id}/events`).then((r) => r.text());
  assert.match(events, /event: progress\ndata: \{"step":"check"/);
  assert.match(events, /"step":"upload","percent":100/);
  assert.match(events, /"step":"post"/);
  assert.match(events, /event: done/);
  const job = await finished(started.body.id);
  assert.equal(job.status, 'done');
  assert.equal(job.result.state, 'published');
  assert.equal(job.result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(job.result.postizUrl, `${fake.url}/launches`);
  assert.equal(fake.posts[0].body.posts[0].settings.type, 'unlisted');
  const video = (await call('GET', `/videos/${id}`)).body;
  assert.equal(video.stage, 'published');
  assert.equal(video.youtubeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  for (let i = 0; i < 100 && !(await call('GET', `/videos/${id}`)).body.views; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal((await call('GET', `/videos/${id}`)).body.views, 1234);
  assert.equal((await call('GET', `/videos/${id}/postiz`)).body.state, 'published', 'the screen can read the result again');
});

test('when Postiz has not posted it yet the job still ends well, and asking again later finds the link', async () => {
  await connect();
  fake.posts.length = 0;
  const id = await newVideo();
  const started = await call('POST', `/videos/${id}/postiz`, start());
  const job = await finished(started.body.id);
  assert.equal(job.status, 'done');
  assert.equal(job.result.state, 'queued');
  assert.equal((await call('GET', `/videos/${id}`)).body.stage, 'publishing', 'not published until YouTube has it');
  fake.finish('post_1', 'PUBLISHED', 'https://www.youtube.com/watch?v=abc123DEF45');
  const later = (await call('GET', `/videos/${id}/postiz`)).body;
  assert.equal(later.state, 'published');
  assert.equal(later.url, 'https://www.youtube.com/watch?v=abc123DEF45');
  assert.equal((await call('GET', `/videos/${id}`)).body.stage, 'published');
});

/** Publishes one video now and returns the finished job. */
const publishNow = async (id: string, over = {}) => finished((await call('POST', `/videos/${id}/postiz`, start(over))).body.id);
const recordPath = (id: string) => path.join(store.videoDir('samin', id), 'postiz.json');

test('Postiz saying published with no link, or a link that is not YouTube, leaves the video and the record queued, with a way out', async () => {
  await connect();
  for (const link of [undefined, 'https://vimeo.com/123456']) {
    fake.posts.length = 0;
    fake.newState = 'PUBLISHED';
    fake.releaseURL = link;
    const id = await newVideo();
    const job = await publishNow(id);
    assert.equal(job.status, 'done', String(link));
    assert.equal(job.result.state, 'queued', 'never published without a YouTube link');
    assert.equal(job.result.url, undefined);
    assert.equal((await call('GET', `/videos/${id}`)).body.stage, 'publishing');
    assert.equal((await call('GET', `/videos/${id}`)).body.youtubeUrl, undefined);
    const again = (await call('GET', `/videos/${id}/postiz`)).body;
    assert.equal(again.state, 'queued');
    assert.equal((await call('GET', `/videos/${id}`)).body.stage, 'publishing');
    // The way out is the old one: the person pastes the link.
    const marked = await call('POST', `/videos/${id}/publish`, { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
    assert.equal(marked.body.stage, 'published');
  }
  fake.posts.length = 0;
  fake.releaseURL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const id = await newVideo();
  const job = await publishNow(id);
  assert.equal(job.result.state, 'published');
  assert.equal((await call('GET', `/videos/${id}`)).body.stage, 'published', 'with a YouTube link the video really moves');
});

test('a link that shows up later (no link at first) settles the record and moves the video', async () => {
  await connect();
  fake.posts.length = 0;
  fake.newState = 'PUBLISHED';
  fake.releaseURL = undefined;
  const id = await newVideo();
  assert.equal((await publishNow(id)).result.state, 'queued');
  fake.finish('post_1', 'PUBLISHED', 'https://www.youtube.com/watch?v=abc123DEF45');
  const later = (await call('GET', `/videos/${id}/postiz`)).body;
  assert.equal(later.state, 'published');
  assert.equal((await call('GET', `/videos/${id}`)).body.stage, 'published');
});

test('a post Postiz did not confirm is kept as unconfirmed, nothing more is sent until Check again settles it, and it is found by its channel and time', async () => {
  await connect();
  fake.posts.length = 0;
  fake.uploads.length = 0;
  const id = await newVideo();
  fake.postAnswer = { created: true };
  const job = await publishNow(id);
  assert.equal(job.status, 'failed');
  assert.equal(job.error, UNCONFIRMED);
  const record = JSON.parse(await readFile(recordPath(id), 'utf8'));
  assert.equal(record.unconfirmed, true);
  assert.equal(record.state, 'queued');
  assert.equal(record.postId, '');
  assert.equal(fake.posts.length, 1, 'Postiz did make the post');
  // Publishing again is refused with a plain sentence, and nothing reaches Postiz.
  fake.log.length = 0;
  const refused = await call('POST', `/videos/${id}/postiz`, start());
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, ALREADY_UNCONFIRMED);
  assert.equal(fake.log.length, 0);
  assert.equal(fake.posts.length, 1);
  // Check again finds the post by its channel and time, and it becomes an ordinary one.
  const found = (await call('GET', `/videos/${id}/postiz`)).body;
  assert.equal(found.unconfirmed, undefined);
  assert.equal(found.postId, 'post_1');
  assert.equal(found.state, 'queued');
  const stillRefused = await call('POST', `/videos/${id}/postiz`, start());
  assert.equal(stillRefused.body.error, ALREADY_SENT);
  fake.finish('post_1', 'PUBLISHED', 'https://www.youtube.com/watch?v=abc123DEF45');
  assert.equal((await call('GET', `/videos/${id}/postiz`)).body.state, 'published');
});

test('an unconfirmed post Postiz still does not list after ten minutes is taken as not made, and can be sent again', async () => {
  await connect();
  fake.posts.length = 0;
  const id = await newVideo();
  fake.postAnswer = { created: true };
  await publishNow(id);
  fake.posts.length = 0; // Postiz has nothing for it
  const young = (await call('GET', `/videos/${id}/postiz`)).body;
  assert.equal(young.unconfirmed, true, 'not yet: it may still turn up');
  const saved = JSON.parse(await readFile(recordPath(id), 'utf8'));
  await writeFile(recordPath(id), JSON.stringify({ ...saved, sentAt: new Date(Date.now() - 11 * 60_000).toISOString() }));
  const gone = (await call('GET', `/videos/${id}/postiz`)).body;
  assert.equal(gone.state, 'failed');
  assert.equal(gone.message, NOT_THERE);
  const again = await publishNow(id);
  assert.equal(again.status, 'done');
  assert.equal(fake.posts.length, 1);
});

test('once Postiz has the video (queued or published) a second post is refused, and a failed one can be sent again', async () => {
  await connect();
  fake.posts.length = 0;
  const queued = await newVideo();
  await publishNow(queued);
  const refused = await call('POST', `/videos/${queued}/postiz`, start());
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, ALREADY_SENT);
  assert.equal(fake.posts.length, 1);
  fake.newState = 'PUBLISHED';
  const done = await newVideo();
  await publishNow(done);
  assert.equal((await call('POST', `/videos/${done}/postiz`, start())).body.error, ALREADY_SENT);
  fake.newState = 'ERROR';
  const failed = await newVideo();
  assert.equal((await publishNow(failed)).status, 'failed');
  fake.newState = 'QUEUE';
  assert.equal((await publishNow(failed)).status, 'done', 'a post Postiz could not make is sent again');
});

test('Postiz failing to post it is one sentence on the job, and Retry works', async () => {
  await connect();
  fake.posts.length = 0;
  fake.newState = 'ERROR';
  const id = await newVideo();
  const failed = await finished((await call('POST', `/videos/${id}/postiz`, start())).body.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, "Postiz couldn't post it to YouTube. Open Postiz to see why.");
  assert.equal((await call('GET', `/videos/${id}/postiz`)).body.state, 'failed');
  fake.newState = 'QUEUE';
  const again = await finished((await call('POST', `/videos/${id}/postiz`, start())).body.id);
  assert.equal(again.status, 'done');
});

test('Postiz refusing mid-job (429, 413) ends the job with its sentence', async () => {
  await connect();
  const id = await newVideo();
  fake.fail.posts = { status: 429, headers: { 'Retry-After': '600' } };
  const limited = await finished((await call('POST', `/videos/${id}/postiz`, start({ title: 'limited' }))).body.id);
  assert.equal(limited.status, 'failed');
  assert.equal(limited.error, 'Postiz allows 90 posts an hour and that is used up. Try again in 10 minutes.');
  fake.fail.upload = { status: 413 };
  fake.uploads.length = 0;
  const second = path.join(temp, 'second.mp4');
  await writeFile(second, Buffer.alloc(1000, 1));
  exports.set('e2', { path: second, name: 'second.mp4', size: 1000, projectId: 'p1' });
  const tooBig = await finished((await call('POST', `/videos/${id}/postiz`, start({ exportId: 'e2' }))).body.id);
  assert.match(tooBig.error, /^Postiz takes videos up to 1 GB/);
});

test('Schedule for later: the post is scheduled, the video stays in Publishing with its date, and a past time is refused', async () => {
  await connect();
  fake.posts.length = 0;
  const id = await newVideo();
  assert.equal((await call('POST', `/videos/${id}/postiz`, start({ scheduledFor: new Date(Date.now() - 60_000).toISOString() }))).body.error, 'Pick a time in the future.');
  const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const job = await finished((await call('POST', `/videos/${id}/postiz`, start({ scheduledFor: at }))).body.id);
  assert.equal(job.status, 'done');
  assert.equal(job.result.state, 'queued');
  assert.equal(job.result.scheduledFor, at);
  assert.equal(fake.posts[0].body.type, 'schedule');
  const video = (await call('GET', `/videos/${id}`)).body;
  assert.equal(video.stage, 'publishing');
  assert.equal(video.publishDate, at);
});

test('the form is checked on the server: made-for-kids is required, the title is 1 to 100 characters, and nothing else is accepted', async () => {
  await connect();
  const id = await newVideo();
  const { madeForKids: _gone, ...withoutKids } = start();
  assert.equal((await call('POST', `/videos/${id}/postiz`, withoutKids)).status, 400);
  assert.equal((await call('POST', `/videos/${id}/postiz`, start({ title: 'x'.repeat(101) }))).status, 400);
  assert.equal((await call('POST', `/videos/${id}/postiz`, start({ title: ' ' }))).status, 400);
  assert.equal((await call('POST', `/videos/${id}/postiz`, start({ extra: 1 }))).status, 400);
});

test('it cannot publish without Postiz, a channel or an export of this video', async () => {
  const id = await newVideo();
  await call('DELETE', '/publishing/postiz');
  assert.equal((await call('POST', `/videos/${id}/postiz`, start())).body.error, 'Pick the YouTube channel first.');
  await connect();
  assert.equal((await call('GET', '/publishing')).body.postiz.channel.name, 'Samin Yasar');
  assert.equal((await call('POST', `/videos/${id}/postiz`, start({ exportId: 'missing' }))).body.error, 'Export the video again, then publish.');
  assert.equal((await call('POST', `/videos/${id}/postiz`, start({ exportId: 'other' }))).body.error, 'Export the video again, then publish.', 'an export of another video');
  await call('DELETE', '/publishing/postiz');
  const state = (await call('GET', '/publishing')).body;
  assert.deepEqual(state.postiz, { connected: false, address: fake.url, channel: null });
  await store.updatePublishingSettings({ channel: { id: 'int_yt1', name: 'Samin Yasar' } });
  assert.equal((await call('POST', `/videos/${id}/postiz`, start())).body.error, 'Connect Postiz first.');
});

test('with two YouTube channels none is picked until the person picks one', async () => {
  fake.channels.push({ id: 'int_yt2', name: 'Second channel', identifier: 'youtube' });
  try {
    await call('DELETE', '/publishing/postiz');
    const result = await connect();
    assert.equal(result.body.channels.length, 2);
    assert.equal(result.body.state.postiz.channel, null);
    assert.equal((await call('PUT', '/publishing', { channelId: 'int_yt2' })).body.postiz.channel.name, 'Second channel');
  } finally {
    fake.channels.pop();
    await call('DELETE', '/publishing/postiz');
  }
});

test('the thumbnail is saved with the video, only as a PNG or JPG up to 2 MB, and goes to Postiz with the post', async () => {
  await connect();
  fake.posts.length = 0;
  fake.uploads.length = 0;
  const id = await newVideo();
  const send = (bytes: Buffer, type: string, name: string) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
    return fetch(`${base}/videos/${id}/thumbnail`, { method: 'POST', body: form });
  };
  assert.equal((await send(Buffer.from('GIF89a'), 'image/gif', 'a.gif')).status, 400);
  assert.equal((await send(Buffer.from('GIF89a'), 'image/png', 'lie.png')).status, 400, 'a GIF called a PNG is still a GIF');
  assert.equal((await send(Buffer.from('<svg/>'), 'image/jpeg', 'lie.jpg')).status, 400);
  assert.equal((await send(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png', 'big.png')).status, 400);
  assert.equal((await send(Buffer.from('89504e470d0a1a0a', 'hex'), 'image/jpeg', 'mine.jpg')).status, 204, 'a PNG called a JPEG is saved as what it is');
  assert.equal((await call('GET', `/videos/${id}/thumbnail`)).status, 200);
  await finished((await call('POST', `/videos/${id}/postiz`, start({ title: 'with thumbnail' }))).body.id);
  assert.ok(fake.posts[0].body.posts[0].settings.thumbnail.id);
  assert.deepEqual(fake.uploads.map((upload) => upload.name).slice(-1), ['thumbnail.png']);
  assert.equal((await call('DELETE', `/videos/${id}/thumbnail`)).status, 204);
  assert.equal((await call('GET', `/videos/${id}/thumbnail`)).status, 204, 'none is not an error');
});
