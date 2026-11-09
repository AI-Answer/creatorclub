import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, stat, writeFile } from 'node:fs/promises';
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

  // An idea's notes merge field by field: sent fields replace, null removes, the rest stay.
  const noted = await store.updateVideo('samin-yasar', a.id, { idea: { why: 'Because', hook: 'Hello', demand: { level: 'high', note: 'Asked a lot' } } });
  assert.deepEqual(noted.idea, { why: 'Because', hook: 'Hello', demand: { level: 'high', note: 'Asked a lot' } });
  const edited = await store.updateVideo('samin-yasar', a.id, { idea: { hook: null, twist: 'Live', dropReason: 'Too generic' } });
  assert.deepEqual(edited.idea, { why: 'Because', twist: 'Live', demand: { level: 'high', note: 'Asked a lot' }, dropReason: 'Too generic' });
  assert.ok(!('idea' in (await store.updateVideo('samin-yasar', a.id, { idea: null })) ), 'null on idea itself still removes all of it');

  assert.deepEqual((await store.listVideos('samin-yasar')).map((v) => v.title), ['B', 'A']);
  await store.deleteVideo('samin-yasar', b.id);
  await assert.rejects(store.readVideo('samin-yasar', b.id), /not found/);
  await assert.rejects(store.readVideo('samin-yasar', '../x'), /not found/);
});

test('research tiles keep their files in videos/<id>/research and delete cleanly', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });
  const video = await store.createVideo('samin-yasar', { title: 'Tiles' });
  const link = await store.addTile('samin-yasar', video.id, { kind: 'link', url: 'https://example.com', meta: { views: 10 } });
  // listTiles orders by creation time; filesystem speed must not decide whether these tie.
  t.mock.timers.tick(1);
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

test('concurrent writes to one video keep every update, and parallel creates get distinct orders', async () => {
  const video = await store.createVideo('samin-yasar', { title: 'Race' });
  const patches = [{ youtubeUrl: 'u' }, { publishDate: 'd' }, { recorderProjectId: 'r' }, { publishedAt: 'p' }, { title: 'Raced' }, { hidden: 'later' as const }];
  await Promise.all([...patches.map((p) => store.updateVideo('samin-yasar', video.id, p)), store.moveVideo('samin-yasar', video.id, 'editing')]);
  const after = await store.readVideo('samin-yasar', video.id);
  assert.deepEqual([after.youtubeUrl, after.publishDate, after.recorderProjectId, after.publishedAt, after.title, after.hidden, after.stage], ['u', 'd', 'r', undefined, 'Raced', undefined, 'editing']);

  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => store.createVideo('samin-yasar', { title: `Parallel ${i}`, stage: 'recording' })));
  assert.deepEqual(many.map((v) => v.order).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i));

  const moved = await Promise.all(many.slice(0, 10).map((v) => store.moveVideo('samin-yasar', v.id, 'publishing')));
  assert.deepEqual(moved.map((v) => v.order).sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => i));
});

test('moving a video places it among its neighbours, renumbers the stage and can put the old dates back', async () => {
  const ws = (await store.createWorkspace({ ...channel, name: 'Board order' })).slug;
  const made = [];
  for (const title of ['A', 'B', 'C', 'D']) made.push(await store.createVideo(ws, { title }));
  const [va, vb, vc, vd] = made;
  const titles = async (stage: string) => (await store.listVideos(ws)).filter((v) => v.stage === stage).map((v) => v.title);

  const moved = await store.moveVideo(ws, vd.id, 'ideas', { beforeId: va.id });
  assert.deepEqual(await titles('ideas'), ['D', 'A', 'B', 'C']);
  assert.equal(moved.order, 0);
  assert.deepEqual(moved.stageDates, vd.stageDates, 'a move inside a stage keeps its dates');

  await store.moveVideo(ws, vb.id, 'ideas', { beforeId: null });
  assert.deepEqual(await titles('ideas'), ['D', 'A', 'C', 'B']);
  await store.moveVideo(ws, vb.id, 'ideas', { beforeId: 'missing' });
  assert.deepEqual(await titles('ideas'), ['D', 'A', 'C', 'B'], 'a neighbour that is not there means last');

  const into = await store.moveVideo(ws, vc.id, 'recording');
  const second = await store.moveVideo(ws, va.id, 'recording', { beforeId: vc.id });
  assert.deepEqual(await titles('recording'), ['A', 'C']);
  assert.equal(second.order, 0);
  assert.equal((await store.readVideo(ws, vc.id)).order, 1);
  assert.equal(into.stageDates.recording !== undefined, true);

  const back = await store.moveVideo(ws, va.id, 'ideas', { beforeId: vd.id, stageDates: va.stageDates });
  assert.deepEqual(back.stageDates, va.stageDates, 'Undo puts the stage dates back');
  assert.deepEqual(await titles('ideas'), ['A', 'D', 'B']);
  await assert.rejects(store.moveVideo(ws, 'nope', 'ideas'), /not found/);
});

test('the first-visit flag and the recent videos live in settings.json', async () => {
  const ws = (await store.createWorkspace({ ...channel, name: 'Recent' })).slug;
  assert.equal(await store.welcomed(), false);
  await store.setWelcomed();
  assert.equal(await store.welcomed(), true);

  const [a, b, c] = [await store.createVideo(ws, { title: 'A' }), await store.createVideo(ws, { title: 'B' }), await store.createVideo(ws, { title: 'C' })];
  assert.deepEqual(await store.recentVideoIds(ws), []);
  for (const video of [a, b, c, a]) await store.markOpened(ws, video.id);
  assert.deepEqual(await store.recentVideoIds(ws), [a.id, c.id, b.id]);
  await store.deleteVideo(ws, c.id);
  assert.deepEqual(await store.recentVideoIds(ws), [a.id, b.id], 'deleted videos drop out');
  await assert.rejects(store.markOpened(ws, 'nope'), /not found/);
  const settings = JSON.parse(await readFile(path.join(temp, 'settings.json'), 'utf8'));
  assert.equal(settings.welcomed, true);
  assert.ok(settings.currentWorkspace, 'other settings are kept');
});

test('a Gemini key an older build left in settings.json moves to secrets.json once, owner-only', async () => {
  const secrets = path.join(temp, 'secrets-move');
  process.env.CREATORCLUB_SECRETS_DIR = secrets;
  try {
    const settingsFile = path.join(temp, 'settings.json');
    const before = JSON.parse(await readFile(settingsFile, 'utf8').catch(() => '{}'));
    await writeFile(settingsFile, JSON.stringify({ ...before, geminiKey: 'AIzaSyLegacyKeyForTestingOnly9876' }));
    assert.equal(await store.geminiKey(), 'AIzaSyLegacyKeyForTestingOnly9876');
    const moved = path.join(secrets, 'secrets.json');
    assert.equal(JSON.parse(await readFile(moved, 'utf8')).geminiKey, 'AIzaSyLegacyKeyForTestingOnly9876');
    assert.equal((await stat(moved)).mode & 0o777, 0o600);
    const after = JSON.parse(await readFile(settingsFile, 'utf8'));
    assert.equal(after.geminiKey, undefined, 'the key is gone from the workspace root');
    assert.deepEqual(after, before, 'the other settings are kept');
    // A key saved since then is not replaced by a stale one in settings.json.
    await store.setGeminiKey('AIzaSyNewerKeyForTestingOnly5555');
    await writeFile(settingsFile, JSON.stringify({ ...after, geminiKey: 'AIzaSyStaleKeyForTestingOnly0000' }));
    assert.equal(await store.maskedGeminiKey(), '••••5555');
    assert.equal(JSON.parse(await readFile(settingsFile, 'utf8')).geminiKey, undefined);
  } finally {
    delete process.env.CREATORCLUB_SECRETS_DIR;
  }
});

test('secrets default to Application Support, and stay next to a custom workspace root without an override', () => {
  const saved = { dir: process.env.CREATORCLUB_DIR, secrets: process.env.CREATORCLUB_SECRETS_DIR };
  try {
    delete process.env.CREATORCLUB_SECRETS_DIR;
    assert.equal(store.secretsDir(), temp);
    delete process.env.CREATORCLUB_DIR;
    assert.equal(store.secretsDir(), path.join(os.homedir(), 'Library', 'Application Support', 'Creator Compiler'));
    assert.equal(store.rootDir(), path.join(os.homedir(), 'Documents', 'Creator Compiler'), 'workspaces stay in Documents');
  } finally {
    process.env.CREATORCLUB_DIR = saved.dir;
    if (saved.secrets) process.env.CREATORCLUB_SECRETS_DIR = saved.secrets;
  }
});
