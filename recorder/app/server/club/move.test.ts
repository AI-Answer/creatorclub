import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Video } from '../../shared/club.js';
import { MOVE_NEEDS_EXPORT, MOVE_NEEDS_LINK, MOVE_NEEDS_SCENES, MOVE_NEEDS_TAKE, MOVE_REFUSED_STATUS } from '../../shared/club-move.js';
import type { Project } from '../../shared/types.js';

/* POST /videos/:id/move is the authority on moving a video by hand: forward only when the video has what that stage works on. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-move-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');

const { clubRouter } = await import('./index.js');

/** Recording projects with a finished export, as SceneForge's export history would answer. */
const exported = new Set<string>();
const app = express();
app.use('/api/club', clubRouter({ publishing: { projectExported: async (id) => exported.has(id) } }));
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
const projectFile = (id: string) => path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${id}.json`);
const scene = (title: string) => ({ title, talkingPoints: ['a'], show: '', seconds: 60 });

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'] });

const move = (id: string, stage: string) => call('POST', `/videos/${id}/move`, { stage });
const refused = async (id: string, stage: string, sentence: string) => {
  const res = await move(id, stage);
  assert.equal(res.status, MOVE_REFUSED_STATUS, `${stage}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error, sentence);
};
const stageOf = async (id: string) => ((await call('GET', `/videos/${id}`)).body as Video).stage;

test('an idea with nothing behind it can go to Planning, and nowhere further, each refusal naming what is missing', async () => {
  const idea = (await call('POST', '/videos', { title: 'Run Claude Doctor' })).body as Video;
  await refused(idea.id, 'recording', MOVE_NEEDS_SCENES);
  await refused(idea.id, 'editing', MOVE_NEEDS_TAKE);
  await refused(idea.id, 'publishing', MOVE_NEEDS_EXPORT);
  await refused(idea.id, 'published', MOVE_NEEDS_LINK);
  assert.equal(await stageOf(idea.id), 'ideas', 'a refused move changes nothing');
  assert.equal((await move(idea.id, 'planning')).status, 200);
  assert.equal((await move(idea.id, 'ideas')).status, 200, 'back is always allowed');
});

test('each stage opens once the video has what it works on: scenes, a take, an export, a YouTube link', async () => {
  const video = (await call('POST', '/videos', { title: 'Hidden features', stage: 'planning' })).body as Video;
  await refused(video.id, 'recording', MOVE_NEEDS_SCENES);
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [scene('Opening'), scene('Build')] });
  assert.equal((await move(video.id, 'recording')).status, 200, 'scenes exist');
  await refused(video.id, 'editing', MOVE_NEEDS_TAKE);

  // Continue to recording makes the recording project; a take recorded but not kept counts as something to edit.
  const withProject = (await call('POST', `/videos/${video.id}/recorder`)).body as Video;
  const projectId = withProject.recorderProjectId!;
  const project = JSON.parse(await readFile(projectFile(projectId), 'utf8')) as Project;
  project.recordedTakes = [{ id: 't1', createdAt: '2026-10-01T00:00:00.000Z', sceneId: project.scenes[0].id, media: [], tracks: ['camera'], offsets: [] }];
  await writeFile(projectFile(projectId), JSON.stringify(project));
  assert.equal((await move(video.id, 'editing')).status, 200, 'a take exists');

  await refused(video.id, 'publishing', MOVE_NEEDS_EXPORT);
  exported.add(projectId);
  assert.equal((await move(video.id, 'publishing')).status, 200, 'an export exists');

  await refused(video.id, 'published', MOVE_NEEDS_LINK);
  const facts = (await call('GET', '/videos/move-facts')).body;
  assert.deepEqual(facts[video.id], { scenes: 2, takes: 1, exported: true, published: false }, 'the board reads the same facts');
  await call('PUT', `/videos/${video.id}`, { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal((await move(video.id, 'published')).status, 200, 'it has a YouTube link');

  // Back down the line is always allowed, and so is coming forward again to where it was.
  for (const stage of ['editing', 'ideas', 'publishing', 'published']) assert.equal((await move(video.id, stage)).status, 200, stage);
});

test('a jump forward needs only what the target stage needs, and an idea with an export can skip to Publishing', async () => {
  const video = (await call('POST', '/videos', { title: 'Skipper' })).body as Video;
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [scene('Only')] });
  const withProject = (await call('POST', `/videos/${video.id}/recorder`)).body as Video;
  await move(video.id, 'ideas');
  exported.add(withProject.recorderProjectId!);
  assert.equal((await move(video.id, 'publishing')).status, 200);
});
