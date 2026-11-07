import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(), 'club-state-machines-'));
process.env.CREATORCLUB_DIR = temp;
const store = await import('./store.js');
const plan = await import('./planning.js');
const { startJobOnce, getJob } = await import('./jobs.js');
const { settle } = await import('./publisher-routes.js');
const workspace = await store.createWorkspace({ name: 'Races', handle: '', channelUrl: '', topics: [], about: '', cta: '' });
const slug = workspace.slug;
after(() => rm(temp, { recursive: true, force: true }));
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

test('every move out of Ideas clears hidden, and conditional auto-moves preserve a newer stage', async () => {
  for (const hidden of ['later', 'skipped'] as const) {
    const video = await store.createVideo(slug, { title: hidden, hidden });
    assert.equal((await store.moveVideo(slug, video.id, 'editing')).hidden, undefined);
    const result = await store.moveVideo(slug, video.id, 'recording', { expectedStages: ['ideas', 'planning'] });
    assert.equal(result.stage, 'editing');
  }
});

test('deletion aborts owned jobs and atomic writes cannot recreate the video folder', async () => {
  const video = await store.createVideo(slug, { title: 'Delete me' });
  const job = startJobOnce(`test:${slug}:${video.id}`, 'write', ({ signal }) => new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('stop')), { once: true })));
  await tick();
  await store.deleteVideo(slug, video.id);
  assert.equal(getJob(job.id)?.status, 'cancelled');
  await assert.rejects(store.writeFileAtomic(path.join(store.videoDir(slug, video.id), 'script.md'), 'late'), /not found/);
  assert.equal(await stat(store.videoDir(slug, video.id)).then(() => true, () => false), false);
});

test('direct plan saves wait for the same lock used by companion apply and job commits', async () => {
  const video = await store.createVideo(slug, { title: 'Plan' });
  let release!: () => void;
  const held = plan.planLock(slug, video.id, () => new Promise<void>(resolve => { release = resolve; }));
  await tick();
  let finished = false;
  const save = plan.saveScript(slug, video.id, 'New script').then(() => { finished = true; });
  await tick();
  assert.equal(finished, false);
  release();
  await Promise.all([held, save]);
  assert.equal(await readFile(plan.scriptFile(slug, video.id), 'utf8'), 'New script\n');
});

test('tile updates queue behind board sync and merge with its latest document metadata', async () => {
  const video = await store.createVideo(slug, { title: 'Board' });
  const tile = await store.addTile(slug, video.id, { kind: 'note', text: 'A' });
  let release!: () => void;
  const sync = store.boardLock(slug, video.id, async () => {
    const current = await store.readTile(slug, video.id, tile.id);
    await new Promise<void>(resolve => { release = resolve; });
    await store.writeTile(slug, video.id, { ...current, text: 'Synced', doc: { root: 'video', path: 'notes/note.md' } });
  });
  await tick();
  const update = store.updateTile(slug, video.id, tile.id, { pos: { x: 100, y: 200 } });
  await tick();
  release();
  await Promise.all([sync, update]);
  const result = await store.readTile(slug, video.id, tile.id);
  assert.equal(result.text, 'Synced');
  assert.deepEqual(result.pos, { x: 100, y: 200 });
  assert.equal(result.doc?.path, 'notes/note.md');
});

test('a slow Postiz refresh cannot overwrite a forgotten intent or move its video', async () => {
  const video = await store.createVideo(slug, { title: 'Forget' });
  const file = path.join(store.videoDir(slug, video.id), 'postiz.json');
  const intent = { state: 'queued' as const, postId: 'post', channelId: 'channel', sentAt: new Date().toISOString(), title: 'Forget', visibility: 'public' as const, postizUrl: '', idempotencyKey: 'key' };
  await store.writeJSON(file, { ...intent, state: 'failed', message: 'Forgotten' });
  const result = await settle(slug, video.id, intent, { state: 'published', url: 'https://youtu.be/dQw4w9WgXcQ' }, async () => undefined);
  assert.equal(result.state, 'failed');
  assert.equal((await store.readVideo(slug, video.id)).stage, 'ideas');
});

test('a stale Postiz lookup cannot move a published record back to queued or failed', async () => {
  const video = await store.createVideo(slug, { title: 'Already published' });
  const file = path.join(store.videoDir(slug, video.id), 'postiz.json');
  const intent = { state: 'posting' as const, postId: '', channelId: 'channel', sentAt: new Date().toISOString(), title: video.title, visibility: 'public' as const, postizUrl: '', idempotencyKey: 'published-key' };
  const published = { ...intent, state: 'published' as const, postId: 'post', url: 'https://youtu.be/dQw4w9WgXcQ', stageApplied: true };
  await store.writeJSON(file, published);
  for (const state of ['queued', 'failed'] as const) {
    assert.deepEqual(await settle(slug, video.id, intent, { state, postId: 'post' }, async () => undefined), published);
  }
});

test('package seeding on read returns an in-memory seed without creating files', async () => {
  const video = await store.createVideo(slug, { title: 'Seed', idea: { angle: 'Existing idea' } });
  assert.equal((await plan.ensurePackage(slug, video))?.angle, 'Existing idea');
  assert.equal(await stat(plan.packageFile(slug, video.id)).then(() => true, () => false), false);
});

test('JSON cache observes an atomic replacement and never returns a mutable cached reference', async () => {
  const { JsonCache } = await import('./json-cache.js');
  const cache = new JsonCache();
  const file = path.join(temp, 'cache-race.json');
  await writeFile(file, '{"value":1}');
  const first = await cache.read<{ value: number }>(file);
  first!.value = 99;
  assert.equal((await cache.read<{ value: number }>(file))!.value, 1);
  await store.writeJSON(file, { value: 2 });
  assert.equal((await cache.read<{ value: number }>(file))!.value, 2);
});

test('planning list reads bypass plan locks and preserve quickRecording and video bytes',async()=>{const express=(await import('express')).default,{clubRouter}=await import('./index.js');const video=await store.createVideo(slug,{title:'Pure reads'});await store.updateVideo(slug,video.id,{quickRecording:{mode:'screen'}} as never);await plan.saveOutline(slug,video.id,{scenes:[{id:'scene-pure',title:'Opening',talkingPoints:['A'],show:'Screen',seconds:10}]});await store.updateVideo(slug,video.id,{quickRecording:{mode:'screen'}} as never);const file=path.join(store.videoDir(slug,video.id),'video.json'),before=await readFile(file,'utf8');let release!:()=>void;const held=plan.planLock(slug,video.id,()=>new Promise<void>(resolve=>release=resolve));await tick();const app=express();app.use('/api/club',clubRouter());const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{const address=server.address() as import('node:net').AddressInfo;for(const route of ['/videos','/videos/'+video.id]){const response=await fetch(`http://127.0.0.1:${address.port}/api/club${route}`,{headers:{'X-Club-Workspace':slug},signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);const body=await response.json(),found=Array.isArray(body)?body.find(v=>v.id===video.id):body;assert.equal(found.planning.outline,true);assert.ok(found.quickRecording);}assert.equal(await readFile(file,'utf8'),before);}finally{release();await held;server.close();}});
test('many plan versions retain early Undo tokens, unused files and legacy held results',async()=>{const video=await store.createVideo(slug,{title:'Version retention'}),folder=store.videoDir(slug,video.id),tokens=Array.from({length:16},(_,i)=>new Date(Date.UTC(2026,0,1,0,0,i)).toISOString().replace(/[:.]/g,'-'));await store.writeFileAtomic(plan.scriptFile(slug,video.id),'Current');for(const [i,token] of tokens.entries()){await store.writeFileAtomic(path.join(folder,`script-earlier-${token}.md`),'Earlier '+i);await store.writeFileAtomic(path.join(folder,`script-unused-${token}.md`),'Unused '+i);await store.writeFileAtomic(path.join(folder,`script-new-${token}.md`),'Held '+i);}assert.equal((await plan.heldResults(slug,video.id)).script,tokens.at(-1));await plan.useHeld(slug,video.id,'script',tokens.at(-1)!);await plan.undoReplace(slug,video.id,'script',tokens[0]);assert.equal(await readFile(plan.scriptFile(slug,video.id),'utf8'),'Earlier 0');for(const token of tokens)assert.ok(await stat(path.join(folder,`script-unused-${token}.md`)));for(const token of tokens.slice(1))assert.ok(await stat(path.join(folder,`script-earlier-${token}.md`)));assert.equal((await plan.heldResults(slug,video.id)).script,tokens.at(-2));});
