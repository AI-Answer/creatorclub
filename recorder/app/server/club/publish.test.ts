import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-publish-'));
process.env.CREATORCLUB_DIR = temp;
const { clubRouter } = await import('./index.js');
const { NOT_A_YOUTUBE_LINK, publishVideo, youtubeId } = await import('./publish.js');
const store = await import('./store.js');

/** Each test sets what the next view read answers: a number, undefined (not readable) or an error. */
let answer: () => Promise<number | undefined> = async () => undefined;
const reads: string[] = [];
const readViews = (id: string) => {
  reads.push(id);
  return answer();
};

const app = express();
app.use('/api/club', clubRouter({ readViews }));
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
/** Waits until the background view read has written (or given up). */
const settle = async (id: string, done: (video: { views?: number }) => boolean) => {
  for (let i = 0; i < 100; i++) {
    const video = (await call('GET', `/videos/${id}`)).body;
    if (done(video)) return video;
    await new Promise((r) => setTimeout(r, 10));
  }
  return (await call('GET', `/videos/${id}`)).body;
};

await call('POST', '/workspaces', { name: 'Samin' });
const newVideo = async (title: string) => (await call('POST', '/videos', { title, stage: 'editing' })).body.id as string;

test('youtubeId reads watch, youtu.be and Shorts links and refuses anything else with one sentence', () => {
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  for (const bad of ['', 'not a link', 'https://www.instagram.com/reel/abcdef/', 'https://vimeo.com/123', 'https://www.youtube.com/@samin']) {
    assert.throws(() => youtubeId(bad), { message: NOT_A_YOUTUBE_LINK });
  }
});

test('Mark as published saves the link and date, moves the card to Published, then reads the views once', async () => {
  const id = await newVideo('Hidden features');
  reads.length = 0;
  answer = async () => 1234;
  const before = Date.now();
  const res = await call('POST', `/videos/${id}/publish`, { youtubeUrl: ' https://youtu.be/dQw4w9WgXcQ?si=share ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.stage, 'published');
  assert.equal(res.body.youtubeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'saved as the plain watch link');
  assert.ok(Date.parse(res.body.publishedAt) >= before - 1000, 'publish date saved');
  assert.ok(res.body.stageDates.published, 'the stage date is recorded too');
  const listed = (await call('GET', '/videos')).body.find((v: { id: string }) => v.id === id);
  assert.equal(listed.stage, 'published', 'the board sees it in Published');

  const read = await settle(id, (v) => v.views !== undefined);
  assert.equal(read.views, 1234);
  assert.ok(read.viewsCheckedAt);
  assert.deepEqual(reads, ['dQw4w9WgXcQ'], 'views are read once, for the published video');
});

test('a link that is not YouTube is refused with one sentence and nothing changes', async () => {
  const id = await newVideo('Not yet');
  reads.length = 0;
  const res = await call('POST', `/videos/${id}/publish`, { youtubeUrl: 'https://vimeo.com/123' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, NOT_A_YOUTUBE_LINK);
  const video = (await call('GET', `/videos/${id}`)).body;
  assert.equal(video.stage, 'editing');
  assert.equal(video.youtubeUrl, undefined);
  assert.equal(video.publishedAt, undefined);
  assert.equal((await call('POST', `/videos/${id}/publish`, {})).status, 400, 'a link is required');
  assert.equal((await call('POST', `/videos/${id}/publish`, { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', extra: 1 })).status, 400);
  assert.deepEqual(reads, []);
});

test('views that cannot be read stay unset, silently', async () => {
  for (const failing of [async () => undefined, async () => { throw new Error('yt-dlp exploded'); }]) {
    const id = await newVideo('Quiet');
    answer = failing;
    const res = await call('POST', `/videos/${id}/publish`, { youtubeUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' });
    assert.equal(res.status, 200);
    assert.equal(res.body.stage, 'published');
    // publishVideo hands back the background read so the test can wait for it to finish.
    const { viewsDone } = await publishVideo('samin', id, 'https://www.youtube.com/watch?v=aaaaaaaaaaa', readViews);
    await viewsDone;
    const video = await store.readVideo('samin', id);
    assert.equal(video.views, undefined);
    assert.equal(video.viewsCheckedAt, undefined);
  }
});

test('marking again keeps the first publish date; a new link drops the old views', async () => {
  const id = await newVideo('Twice');
  answer = async () => 50;
  const first = (await call('POST', `/videos/${id}/publish`, { youtubeUrl: 'https://youtu.be/bbbbbbbbbbb' })).body;
  await settle(id, (v) => v.views === 50);
  answer = async () => undefined;
  const second = (await call('POST', `/videos/${id}/publish`, { youtubeUrl: 'https://youtu.be/ccccccccccc' })).body;
  assert.equal(second.publishedAt, first.publishedAt);
  assert.equal(second.stage, 'published');
  assert.equal(second.youtubeUrl, 'https://www.youtube.com/watch?v=ccccccccccc');
  assert.equal(second.views, undefined, 'views of the old link are not kept for the new one');
});

test('an unknown video is a 404', async () => {
  assert.equal((await call('POST', '/videos/nope/publish', { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' })).status, 404);
});
