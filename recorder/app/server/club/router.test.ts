import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-router-'));
process.env.CREATORCLUB_DIR = temp;
const { clubRouter } = await import('./index.js');
const { startJob } = await import('./jobs.js');

const app = express();
app.use('/api/club', clubRouter());
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

test('video routes need a channel first, with one plain sentence', async () => {
  const res = await call('GET', '/videos');
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Set up a channel first.');
});

test('workspace create, read, update and switch', async () => {
  const created = await call('POST', '/workspaces', { name: 'Samin', handle: '@s', topics: ['ai'] });
  assert.equal(created.status, 201);
  assert.equal(created.body.slug, 'samin');
  assert.equal(created.body.cta, '');
  const list = await call('GET', '/workspaces');
  assert.equal(list.body.current, 'samin', 'the first channel becomes current');
  const updated = await call('PUT', '/workspaces/samin', { about: 'Teaches Claude', slug: 'hack' });
  assert.equal(updated.status, 400, 'slug cannot be changed');
  assert.equal((await call('PUT', '/workspaces/samin', { about: 'Teaches Claude' })).body.about, 'Teaches Claude');
  await call('POST', '/workspaces', { name: 'Second' });
  assert.equal((await call('GET', '/workspaces')).body.current, 'samin');
  assert.equal((await call('POST', '/workspaces/second/current')).body.current, 'second');
  assert.equal((await call('POST', '/workspaces/samin/current')).body.current, 'samin');
  assert.equal((await call('GET', '/workspaces/nope')).status, 404);
});

test('video lifecycle: create, update, move, list, delete', async () => {
  const created = await call('POST', '/videos', { title: 'Hidden features', concept: undefined });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.stage, 'ideas');

  assert.equal((await call('POST', '/videos', { title: '' })).status, 400);
  const put = await call('PUT', `/videos/${id}`, { planning: { research: true, package: false, outline: false }, hidden: 'later' });
  assert.equal(put.body.planning.research, true);
  assert.equal((await call('PUT', `/videos/${id}`, { stage: 'editing' })).status, 400, 'stage only changes through move');
  assert.ok(!('hidden' in (await call('PUT', `/videos/${id}`, { hidden: null })).body));

  const moved = await call('POST', `/videos/${id}/move`, { stage: 'planning' });
  assert.equal(moved.body.stage, 'planning');
  assert.ok(moved.body.stageDates.planning);
  assert.equal((await call('POST', `/videos/${id}/move`, { stage: 'bogus' })).status, 400);

  assert.deepEqual((await call('GET', '/videos')).body.map((v: { id: string }) => v.id), [id]);
  assert.equal((await call('GET', `/videos/${id}`)).body.title, 'Hidden features');
  assert.equal((await call('DELETE', `/videos/${id}`)).status, 204);
  assert.equal((await call('GET', `/videos/${id}`)).status, 404);
});

test('research tiles: json tiles, file uploads, file download, delete', async () => {
  const { body: video } = await call('POST', '/videos', { title: 'Research' });
  const note = await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: 'Remember this', meta: { views: 5 } });
  assert.equal(note.status, 201);
  assert.equal(note.body.text, 'Remember this');
  assert.equal((await call('POST', `/videos/${video.id}/research`, { kind: 'link' })).status, 400);

  const form = new FormData();
  form.set('kind', 'image');
  form.set('title', 'Screenshot');
  form.set('meta', JSON.stringify({ channel: 'Someone' }));
  form.set('file', new Blob(['pixels'], { type: 'image/png' }), 'shot.png');
  const image = await (await fetch(`${base}/videos/${video.id}/research`, { method: 'POST', body: form })).json();
  assert.equal(image.meta.channel, 'Someone');
  assert.ok(image.file.endsWith('shot.png'));
  assert.equal(await (await fetch(`${base}/videos/${video.id}/research/${image.id}/file`)).text(), 'pixels');

  const tiles = (await call('GET', `/videos/${video.id}/research`)).body;
  assert.deepEqual(tiles.map((t: { id: string }) => t.id), [note.body.id, image.id]);
  assert.equal((await call('DELETE', `/videos/${video.id}/research/${image.id}`)).status, 204);
  assert.equal((await call('GET', `/videos/${video.id}/research`)).body.length, 1);
});

test('job events stream as server-sent events and replay for late listeners', async () => {
  const job = startJob('demo', async ({ emit }) => {
    emit({ line: 'working' });
    return { done: true };
  });
  await new Promise((r) => setTimeout(r, 30));
  const res = await fetch(`${base}/jobs/${job.id}/events`);
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
  const text = await res.text();
  assert.match(text, /id: 1\nevent: progress\ndata: {"line":"working"}\n\n/);
  assert.match(text, /event: done\ndata: {"done":true}\n\n/);
  assert.equal((await call('GET', `/jobs/${job.id}`)).body.status, 'done');
  assert.equal((await call('GET', '/jobs/nope/events')).status, 404);
});

test('a listener connected while the job runs gets events live and the stream closes at the end', async () => {
  let finish!: (value: string) => void;
  const job = startJob('live', async ({ emit }) => {
    emit({ step: 1 });
    return new Promise<string>((resolve) => (finish = resolve));
  });
  const pending = fetch(`${base}/jobs/${job.id}/events`).then((r) => r.text());
  await new Promise((r) => setTimeout(r, 50));
  finish('ok');
  const text = await pending;
  assert.match(text, /event: progress\ndata: {"step":1}/);
  assert.match(text, /event: done\ndata: "ok"/);
});

test('ai status route answers for Claude, ChatGPT and Google', async () => {
  const res = await call('GET', '/ai/status');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['claude', 'codex', 'gemini']);
});
