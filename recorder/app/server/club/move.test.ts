import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Video } from '../../shared/club.js';
import { VIDEO_STAGES } from '../../shared/club.js';
import type { Project } from '../../shared/types.js';

/* Manual moves are organizational changes and never require production artifacts. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-move-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');

const { clubRouter } = await import('./index.js');

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
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};
const projectFile = (id: string) => path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${id}.json`);
const scene = (title: string) => ({ title, talkingPoints: ['a'], show: '', seconds: 60 });

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'] });

const move = (id: string, stage: string) => call('POST', `/videos/${id}/move`, { stage });
const stageOf = async (id: string) => ((await call('GET', `/videos/${id}`)).body as Video).stage;

test('every stage can move directly to every other stage without scenes, takes, export or YouTube link',async()=>{
 for(const from of VIDEO_STAGES)for(const to of VIDEO_STAGES){
  const video=(await call('POST','/videos',{title:`${from} to ${to}`,stage:from==='published'?'publishing':from})).body as Video;
  if(from==='published')await move(video.id,'published');
  const result=await move(video.id,to);
  assert.equal(result.status,200,`${from} → ${to}: ${JSON.stringify(result.body)}`);
  assert.equal(await stageOf(video.id),to);
 }
});

test('manual moves preserve scene, recording and YouTube metadata', async () => {
  const video = (await call('POST', '/videos', { title: 'Hidden features', stage: 'planning' })).body as Video;
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [scene('Opening'), scene('Build')] });
  assert.equal((await move(video.id, 'recording')).status, 200, 'scenes exist');

  // Continue to recording makes the recording project; a take recorded but not kept counts as something to edit.
  const withProject = (await call('POST', `/videos/${video.id}/recorder`)).body as Video;
  const projectId = withProject.recorderProjectId!;
  const project = JSON.parse(await readFile(projectFile(projectId), 'utf8')) as Project;
  project.recordedTakes = [{ id: 't1', createdAt: '2026-10-01T00:00:00.000Z', sceneId: project.scenes[0].id, media: [], tracks: ['camera'], offsets: [] }];
  await writeFile(projectFile(projectId), JSON.stringify(project));
  assert.equal((await move(video.id, 'editing')).status, 200, 'a take exists');

  assert.equal((await move(video.id, 'publishing')).status, 200, 'no export is required');

  await call('POST', `/videos/${video.id}/publish`, { youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal((await move(video.id, 'published')).status, 200, 'it has a YouTube link');

  // Back down the line is always allowed, and so is coming forward again to where it was.
  for (const stage of ['editing', 'ideas', 'publishing', 'published']) assert.equal((await move(video.id, stage)).status, 200, stage);
});

test('an idea with a recording project can skip to Publishing without an export', async () => {
  const video = (await call('POST', '/videos', { title: 'Skipper' })).body as Video;
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [scene('Only')] });
  await call('POST', `/videos/${video.id}/recorder`);
  await move(video.id, 'ideas');
  assert.equal((await move(video.id, 'publishing')).status, 200);
});
