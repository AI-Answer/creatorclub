import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Outline, RecorderScene, ScenesByVideo, Video, VideoScene } from '../../shared/club.js';
import { createProject, type Clip, type Project, type RecordedTake } from '../../shared/types.js';

/* The scenes of a video: the outline merged with the recording project's takes, through the merge itself and the routes. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-scenes-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');

const { clubRouter } = await import('./index.js');
const { mergeScenes } = await import('./scenes.js');

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

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'] });

// ---------------------------------------------------------------- the merge

const outline: Outline = {
  scenes: [
    { id: 'o1', title: 'Opening', talkingPoints: ['a'], show: '', seconds: 60 },
    { id: 'o2', title: 'Build', talkingPoints: ['b'], show: '', seconds: 120 },
    { id: 'o3', title: 'Ending', talkingPoints: ['c'], show: '', seconds: 30 },
  ],
};
const take = (id: string, sceneId: string, createdAt: string, duration: number, offset = 0): RecordedTake => ({
  id,
  createdAt,
  sceneId,
  media: [{ id: `m-${id}`, name: id, path: `/tmp/${id}.mov`, kind: 'video', duration, width: 10, height: 10 }],
  tracks: ['camera'],
  offsets: [offset],
});
const onTimeline = (takeId: string): Clip =>
  ({ id: `c-${takeId}`, mediaId: `m-${takeId}`, name: takeId, track: 'camera', start: 0, sourceIn: 0, sourceOut: 5, speed: 1, gain: 1, muted: false, recordingTakeId: takeId } as Clip);
/** A project with three recorder scenes (r1, r2, r3) mapped to the outline scenes in the order given. */
const projectWith = (takes: RecordedTake[], clips: Clip[]): Project => ({
  ...createProject('V'),
  scenes: ['r1', 'r2', 'r3'].map((id, index) => ({ id, name: id, script: '', notes: '', start: index * 10, duration: 10 })),
  recordedTakes: takes,
  clips,
});
const mapping = (pairs: [string, string][]): RecorderScene[] => pairs.map(([outlineId, sceneId]) => ({ outlineId, sceneId, text: '', changedAt: '2026-10-01T00:00:00.000Z' }));
const words = (scenes: VideoScene[]) => scenes.map((scene) => scene.status);

test('scenes with no recording project are the outline alone', () => {
  const scenes = mergeScenes(outline, undefined, undefined);
  assert.deepEqual(scenes.map((scene) => [scene.id, scene.title, scene.seconds, scene.takes, scene.status]), [
    ['o1', 'Opening', 60, [], 'Not recorded'],
    ['o2', 'Build', 120, [], 'Not recorded'],
    ['o3', 'Ending', 30, [], 'Not recorded'],
  ]);
  assert.deepEqual(mergeScenes(null, projectWith([], []), mapping([])), [], 'no outline, no scenes');
});

test('takes are found through the scene mapping, numbered in the order they were recorded, and kept while on the timeline', () => {
  const project = projectWith(
    [
      take('late', 'r2', '2026-10-03T00:00:00.000Z', 12.34),
      take('early', 'r2', '2026-10-01T00:00:00.000Z', 8, 1.5),
      take('only', 'r1', '2026-10-02T00:00:00.000Z', 20),
      take('two-a', 'r3', '2026-10-01T00:00:00.000Z', 5),
      take('two-b', 'r3', '2026-10-02T00:00:00.000Z', 6),
    ],
    [onTimeline('late'), onTimeline('only'), { ...onTimeline('stray'), recordingTakeId: undefined } as Clip],
  );
  const scenes = mergeScenes(outline, project, mapping([['o1', 'r1'], ['o2', 'r2'], ['o3', 'r3']]));
  assert.deepEqual(words(scenes), ['Kept take 1', 'Kept take 2', '2 takes']);
  assert.deepEqual(scenes[1].takes, [{ id: 'early', seconds: 9.5, kept: false, retained: false }, { id: 'late', seconds: 12.3, kept: true, retained: false }], 'oldest first; a take is as long as its latest source ends');
  assert.deepEqual(scenes[2].takes.map((t) => t.kept), [false, false]);
  assert.equal('cutSeconds' in scenes[0], false, 'no cut seconds: the recording project does not keep them per scene');
});

test('a scene is linked by its outline id, not by its place: reordering the outline moves the takes with the scene', () => {
  const project = projectWith([take('t', 'r1', '2026-10-01T00:00:00.000Z', 5)], [onTimeline('t')]);
  const reordered: Outline = { scenes: [outline.scenes[2], outline.scenes[1], outline.scenes[0]] };
  const scenes = mergeScenes(reordered, project, mapping([['o1', 'r1'], ['o2', 'r2'], ['o3', 'r3']]));
  assert.deepEqual(scenes.map((scene) => [scene.id, scene.status]), [['o3', 'Not recorded'], ['o2', 'Not recorded'], ['o1', 'Kept take 1']]);
  // A scene with no mapping entry yet (added since Continue to recording) has no takes.
  const added = mergeScenes({ scenes: [...outline.scenes, { id: 'o4', title: 'New', talkingPoints: [], show: '', seconds: 10 }] }, project, mapping([['o1', 'r1']]));
  assert.equal(added[3].status, 'Not recorded');
  // A recorder scene the outline no longer has is not shown.
  assert.equal(mergeScenes({ scenes: [outline.scenes[1]] }, project, mapping([['o1', 'r1'], ['o2', 'r2']])).length, 1);
});

test('scenes of an outline written before ids existed get the ids they are read with', () => {
  const noIds: Outline = { scenes: [{ title: 'A', talkingPoints: [], show: '', seconds: 5 }, { title: 'B', talkingPoints: [], show: '', seconds: 5 }] };
  assert.deepEqual(mergeScenes(noIds, undefined, undefined).map((scene) => scene.id), ['s_1', 's_2']);
});

// ---------------------------------------------------------------- the routes

const projectFile = (id: string) => path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${id}.json`);
const scene = (title: string, seconds: number) => ({ title, talkingPoints: [`${title} one`, `${title} two`], show: `Show ${title}`, seconds });

test('GET /videos/scenes is the batch: every video not published, in one request, and it is not read as a video id', async () => {
  const none = (await call('POST', '/videos', { title: 'Idea only' })).body as Video;
  const planned = (await call('POST', '/videos', { title: 'Planned', stage: 'planning' })).body as Video;
  const recording = (await call('POST', '/videos', { title: 'Recording', stage: 'planning' })).body as Video;
  const out = (await call('POST', '/videos', { title: 'Out', stage: 'published' })).body as Video;
  for (const video of [planned, recording, out]) await call('PUT', `/videos/${video.id}/outline`, { scenes: [scene('Opening', 60), scene('Build', 120)] });

  const moved = (await call('POST', `/videos/${recording.id}/recorder`)).body as Video;
  assert.ok(moved.recorderProjectId);
  const project = JSON.parse(await readFile(projectFile(moved.recorderProjectId!), 'utf8')) as Project;
  project.recordedTakes = [take('t1', project.scenes[0].id, '2026-10-01T00:00:00.000Z', 14), take('t2', project.scenes[0].id, '2026-10-02T00:00:00.000Z', 16)];
  project.clips = [onTimeline('t2')];
  await writeFile(projectFile(moved.recorderProjectId!), JSON.stringify(project));
  const before = await readFile(projectFile(moved.recorderProjectId!), 'utf8');

  const res = await call('GET', '/videos/scenes');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const found = res.body as ScenesByVideo;
  assert.deepEqual(Object.keys(found).sort(), [none.id, planned.id, recording.id].sort(), 'published videos are left out');
  assert.deepEqual(found[none.id], [], 'no outline: known to have no scenes');
  assert.deepEqual(words(found[planned.id]), ['Not recorded', 'Not recorded'], 'a plan with no recording project is the outline alone');
  assert.deepEqual(words(found[recording.id]), ['Kept take 2', 'Not recorded']);
  assert.deepEqual(found[recording.id][0].takes, [{ id: 't1', seconds: 14, kept: false, retained: false }, { id: 't2', seconds: 16, kept: true, retained: false }]);
  assert.deepEqual(found[recording.id].map((s) => [s.title, s.seconds]), [['Opening', 60], ['Build', 120]]);

  const one = await call('GET', `/videos/${recording.id}/scenes`);
  assert.deepEqual(one.body, found[recording.id], 'the same answer for one video');
  assert.deepEqual((await call('GET', `/videos/${none.id}/scenes`)).body, []);
  assert.equal((await call('GET', '/videos/v_nothing/scenes')).status, 404);
  assert.equal(await readFile(projectFile(moved.recorderProjectId!), 'utf8'), before, 'the recording project is only read');
});

test('a video whose recording project cannot be read is left out of the batch, not shown as empty; its own request fails in one sentence', async () => {
  const broken = (await call('POST', '/videos', { title: 'Broken', stage: 'recording' })).body as Video;
  await call('PUT', `/videos/${broken.id}/outline`, { scenes: [scene('Opening', 60)] });
  await mkdir(path.dirname(projectFile('broken')), { recursive: true });
  await writeFile(projectFile('broken'), '{ not json');
  await call('PUT', `/videos/${broken.id}`, { recorderProjectId: 'broken' });
  const log = console.error;
  console.error = () => {};
  try {
    const found = (await call('GET', '/videos/scenes')).body as ScenesByVideo;
    assert.equal(broken.id in found, false);
    assert.ok(Object.keys(found).length > 0, 'the others are still there');
    const alone = await call('GET', `/videos/${broken.id}/scenes`);
    assert.equal(alone.body.error, 'That could not be read.', 'a plain sentence, never the parser\'s message');
  } finally {
    console.error = log;
  }
  // A project that was deleted is not an error: the scenes are the outline alone.
  await call('PUT', `/videos/${broken.id}`, { recorderProjectId: 'gone' });
  assert.deepEqual(words((await call('GET', `/videos/${broken.id}/scenes`)).body), ['Not recorded']);
});

test('scenes need a channel first', async () => {
  const other = express();
  other.use('/api/club', clubRouter());
  const saved = process.env.CREATORCLUB_DIR;
  process.env.CREATORCLUB_DIR = path.join(temp, 'empty');
  try {
    const empty = other.listen(0, '127.0.0.1');
    await new Promise((r) => empty.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${(empty.address() as AddressInfo).port}/api/club/videos/scenes`);
    assert.equal(res.status, 409);
    empty.close();
  } finally {
    process.env.CREATORCLUB_DIR = saved;
  }
});
