import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-router-'));
process.env.CREATORCLUB_DIR = temp;
const secrets = path.join(temp, 'app-support');
process.env.CREATORCLUB_SECRETS_DIR = secrets;
const { clubRouter } = await import('./index.js');
const { startJob } = await import('./jobs.js');

const app = express();
app.use('/api/club', clubRouter({ avatarFetch: async () => new Response('', { status: 503 }) }));
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
  assert.equal((await call('POST', '/breakdowns', { url: 'https://youtu.be/dQw4w9WgXcQ' })).status, 409, 'Break down needs a channel too');
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

  // The idea drawer edits notes in place: only the sent notes change, null removes one.
  assert.deepEqual((await call('PUT', `/videos/${id}`, { idea: { why: 'It is useful', demand: { level: 'mid', note: 'Some' } } })).body.idea, { why: 'It is useful', demand: { level: 'mid', note: 'Some' } });
  assert.deepEqual((await call('PUT', `/videos/${id}`, { hidden: 'skipped', idea: { dropReason: 'Too generic', why: null } })).body.idea, { dropReason: 'Too generic', demand: { level: 'mid', note: 'Some' } });
  assert.equal((await call('PUT', `/videos/${id}`, { idea: { lane: 'nope' } })).status, 400, 'only the notes the drawer edits');
  assert.equal((await call('PUT', `/videos/${id}`, { idea: { demand: { level: 'huge', note: '' } } })).status, 400);
  await call('PUT', `/videos/${id}`, { hidden: null, idea: { dropReason: null } });

  const moved = await call('POST', `/videos/${id}/move`, { stage: 'planning' });
  assert.equal(moved.body.stage, 'planning');
  assert.ok(moved.body.stageDates.planning);
  assert.equal((await call('POST', `/videos/${id}/move`, { stage: 'bogus' })).status, 400);

  assert.deepEqual((await call('GET', '/videos')).body.map((v: { id: string }) => v.id), [id]);
  assert.equal((await call('GET', `/videos/${id}`)).body.title, 'Hidden features');
  assert.equal((await call('DELETE', `/videos/${id}`)).status, 204);
  assert.equal((await call('GET', `/videos/${id}`)).status, 404);
});

test('board routes: place a video before another, recent videos and the first-visit flag', async () => {
  const made = [];
  for (const title of ['One', 'Two', 'Three']) made.push((await call('POST', '/videos', { title })).body);
  const ids = async () => (await call('GET', '/videos')).body.filter((v: { title: string }) => ['One', 'Two', 'Three'].includes(v.title)).map((v: { title: string }) => v.title);
  assert.equal((await call('POST', `/videos/${made[2].id}/move`, { stage: 'ideas', beforeId: made[0].id })).status, 200);
  assert.deepEqual(await ids(), ['Three', 'One', 'Two']);
  assert.equal((await call('POST', `/videos/${made[0].id}/move`, { stage: 'ideas', beforeId: null })).body.order, 2);
  assert.equal((await call('POST', `/videos/${made[0].id}/move`, { stage: 'ideas', extra: 1 })).status, 400);
  const restored = await call('POST', `/videos/${made[1].id}/move`, { stage: 'planning' });
  const undone = await call('POST', `/videos/${made[1].id}/move`, { stage: 'ideas', stageDates: { ideas: made[1].stageDates.ideas } });
  assert.deepEqual(undone.body.stageDates, made[1].stageDates);
  assert.ok(restored.body.stageDates.planning);
  assert.equal((await call('POST', `/videos/${made[1].id}/move`, { stage: 'ideas', stageDates: { bogus: 'x' } })).status, 400);

  const counted = await call('PUT', `/videos/${made[0].id}`, { views: 12400, viewsCheckedAt: '2026-10-20T00:00:00.000Z' });
  assert.deepEqual([counted.body.views, counted.body.viewsCheckedAt], [12400, '2026-10-20T00:00:00.000Z']);
  assert.equal((await call('PUT', `/videos/${made[0].id}`, { views: -1 })).status, 400);
  assert.ok(!('views' in (await call('PUT', `/videos/${made[0].id}`, { views: null })).body));
  assert.equal((await call('POST', `/videos/${made[1].id}/opened`)).status, 204);
  assert.equal((await call('POST', `/videos/${made[0].id}/opened`)).status, 204);
  assert.deepEqual((await call('GET', '/recent')).body, [made[0].id, made[1].id]);
  assert.equal((await call('POST', '/videos/nope/opened')).status, 404);

  assert.equal((await call('GET', '/settings')).body.welcomed, false);
  assert.deepEqual((await call('POST', '/settings/welcomed')).body, { welcomed: true });
  assert.equal((await call('GET', '/settings')).body.welcomed, true);
});

test('appearance is saved in settings, alone or with the default AI, and only system, light or dark', async () => {
  assert.equal((await call('GET', '/settings')).body.appearance, null);
  assert.deepEqual((await call('PUT', '/settings', { appearance: 'dark' })).body, { defaultAi: null, appearance: 'dark' });
  assert.equal((await call('GET', '/settings')).body.appearance, 'dark');
  assert.deepEqual((await call('PUT', '/settings', { defaultAi: 'codex' })).body, { defaultAi: 'codex', appearance: 'dark' });
  assert.deepEqual((await call('PUT', '/settings', { appearance: 'light', defaultAi: 'claude' })).body, { defaultAi: 'claude', appearance: 'light' });
  assert.equal((await call('PUT', '/settings', { appearance: 'system' })).body.appearance, 'system');
  for (const bad of [{}, { appearance: 'auto' }, { appearance: 'dark', extra: 1 }]) assert.equal((await call('PUT', '/settings', bad)).status, 400, JSON.stringify(bad));
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

test('ai status route answers for Claude and ChatGPT', async () => {
  const res = await call('GET', '/ai/status');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['claude', 'codex']);
});

test('the Gemini API key is saved owner-only outside the workspace, only ever returned masked, and can be removed', async () => {
  const key = 'AIzaSyExampleKeyForTestingOnly1234';
  assert.equal((await call('GET', '/settings')).body.geminiKey, null);
  for (const bad of ['', 'short', 'has spaces in it and is long enough', key + '!', 'x'.repeat(300)]) assert.equal((await call('PUT', '/settings/gemini-key', { key: bad })).status, 400, bad.slice(0, 20));
  assert.equal((await call('PUT', '/settings/gemini-key', { key, extra: 1 })).status, 400);
  const saved = await call('PUT', '/settings/gemini-key', { key: `  ${key}  ` });
  assert.deepEqual(saved.body, { geminiKey: '••••1234' });
  const settings = await call('GET', '/settings');
  assert.equal(settings.body.geminiKey, '••••1234');
  assert.ok(!JSON.stringify(settings.body).includes('AIzaSy'));
  const file = path.join(secrets, 'secrets.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600, 'secrets.json is owner-only');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).geminiKey, key);
  // Other settings changes keep the key, and settings.json in the workspace root never holds it.
  await call('PUT', '/settings', { defaultAi: 'claude' });
  assert.equal((await call('GET', '/settings')).body.geminiKey, '••••1234');
  assert.ok(!(await readFile(path.join(temp, 'settings.json'), 'utf8')).includes('geminiKey'));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual((await call('DELETE', '/settings/gemini-key')).body, { geminiKey: null });
  assert.equal((await call('GET', '/settings')).body.geminiKey, null);
  assert.ok(!(await readFile(file, 'utf8')).includes('geminiKey'));
});
