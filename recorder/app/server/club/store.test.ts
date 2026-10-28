import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-store-'));
process.env.CREATORCLUB_DIR = temp;
const store = await import('./store.js');
after(() => rm(temp, { recursive: true, force: true }));

const channel = { name: 'Samin Yasar', handle: '@SaminYasar_', channelUrl: 'https://youtube.com/@SaminYasar_', topics: ['claude code'], about: 'About', cta: '' };

test('workspaces round-trip and the current one lives in settings.json', async () => {
  assert.deepEqual(await store.listWorkspaces(), []);
  assert.equal(await store.currentWorkspace(), undefined);
  const ws = await store.createWorkspace(channel);
  assert.equal(ws.slug, 'samin-yasar');
  assert.deepEqual(await store.readWorkspace('samin-yasar'), ws);
  assert.equal((await store.createWorkspace(channel)).slug, 'samin-yasar-2');
  await store.setCurrentWorkspace('samin-yasar');
  assert.equal(await store.currentWorkspace(), 'samin-yasar');
  assert.deepEqual(JSON.parse(await readFile(path.join(temp, 'settings.json'), 'utf8')), { currentWorkspace: 'samin-yasar' });
  assert.equal((await store.listWorkspaces()).length, 2);
  await assert.rejects(store.readWorkspace('../etc'), /not valid/);
  await assert.rejects(store.setCurrentWorkspace('missing'), /not found/);
});

test('videos are created, ordered per stage, updated and moved with stage dates recorded', async () => {
  const a = await store.createVideo('samin-yasar', { title: 'A' });
  const b = await store.createVideo('samin-yasar', { title: 'B' });
  assert.deepEqual([a.stage, a.order, b.order], ['ideas', 0, 1]);
  assert.deepEqual(a.planning, { research: false, package: false, outline: false });
  assert.deepEqual(Object.keys(a.stageDates), ['ideas']);

  const moved = await store.moveVideo('samin-yasar', a.id, 'planning');
  assert.equal(moved.stage, 'planning');
  assert.equal(moved.order, 0);
  assert.ok(moved.stageDates.planning);
  assert.equal(moved.stageDates.ideas, a.stageDates.ideas);
  assert.deepEqual(await store.readVideo('samin-yasar', a.id), moved);

  const patched = await store.updateVideo('samin-yasar', a.id, { youtubeUrl: 'https://youtu.be/x', hidden: 'later' });
  assert.equal(patched.hidden, 'later');
  const cleared = await store.updateVideo('samin-yasar', a.id, { hidden: null });
  assert.ok(!('hidden' in cleared));
  assert.equal(cleared.youtubeUrl, 'https://youtu.be/x');
  assert.ok(cleared.updatedAt >= a.updatedAt);

  assert.deepEqual((await store.listVideos('samin-yasar')).map((v) => v.title), ['B', 'A']);
  await store.deleteVideo('samin-yasar', b.id);
  await assert.rejects(store.readVideo('samin-yasar', b.id), /not found/);
  await assert.rejects(store.readVideo('samin-yasar', '../x'), /not found/);
});

test('research tiles keep their files in videos/<id>/research and delete cleanly', async () => {
  const video = await store.createVideo('samin-yasar', { title: 'Tiles' });
  const link = await store.addTile('samin-yasar', video.id, { kind: 'link', url: 'https://example.com', meta: { views: 10 } });
  const image = await store.addTile('samin-yasar', video.id, { kind: 'image', title: 'Shot', file: { name: '../../evil name.png', data: Buffer.from('png') } });
  assert.ok(image.file && !image.file.includes('/') && image.file.startsWith(image.id));
  const dir = store.researchDir('samin-yasar', video.id);
  assert.ok((await readdir(dir)).includes(image.file));
  assert.deepEqual((await store.listTiles('samin-yasar', video.id)).map((t) => t.id), [link.id, image.id]);
  assert.equal(await readFile(store.tileFilePath('samin-yasar', video.id, image)!, 'utf8'), 'png');

  await store.deleteTile('samin-yasar', video.id, image.id);
  assert.deepEqual((await readdir(dir)).sort(), [`${link.id}.json`]);
  await assert.rejects(store.readTile('samin-yasar', video.id, image.id), /not found/);
});

test('writeJSON is atomic: no temp files are left and failed writes keep the old content', async () => {
  const file = path.join(temp, 'samin-yasar', 'x.json');
  await store.writeJSON(file, { n: 1 });
  await store.writeJSON(file, { n: 2 });
  assert.deepEqual(await store.readJSON(file), { n: 2 });
  assert.ok(!(await readdir(path.dirname(file))).some((n) => n.endsWith('.tmp')));
  assert.equal(await store.readJSON(path.join(temp, 'nope.json')), undefined);
});
