import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RunAIOptions } from './ai.js';

/* The sketch's thumbnail drawn with the creator's ChatGPT: what Codex is asked and allowed, and what becomes the thumbnail. A stand-in plays Codex. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'cc-chatgpt-thumb-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');
after(() => rm(temp, { recursive: true, force: true }));
const store = await import('./store.js');
const { saveOnePager } = await import('./planning.js');
const { emptyOnePager } = await import('../../src/club/idea/onepager.js');
const { makeThumbnailWithChatGPT, chatgptThumbnailPrompt } = await import('./chatgpt-thumbnail.js');
const { thumbnailOf } = await import('./publisher-routes.js');

const slug = (await store.createWorkspace({ name: 'Maya', handle: '', channelUrl: undefined, topics: [], about: '', cta: '' } as unknown as Parameters<typeof store.createWorkspace>[0])).slug;
const context = { emit: () => {}, signal: new AbortController().signal };

test('ChatGPT draws the sketch\'s idea in the video\'s folder, and the picture becomes the video\'s thumbnail', async () => {
  const id = (await store.createVideo(slug, { title: 'Three Claude skills, tested' })).id;
  await saveOnePager(slug, id, { ...emptyOnePager(), title: 'Three Claude skills, tested', thumbnail: { headline: 'DOES IT LISTEN?', visual: 'One glowing skill card over a dim code window.', closer: '' } });
  const calls: RunAIOptions[] = [];
  const made = await makeThumbnailWithChatGPT(slug, id, context, {
    signedIn: async () => true,
    run: async (options) => {
      calls.push(options);
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=320x180', '-frames:v', '1', path.join(options.agent!.cwd, 'thumbnail.png')]);
      return { text: 'Saved thumbnail.png' };
    },
  });
  const call = calls[0];
  assert.equal(call.provider, 'codex');
  assert.equal(call.writable, true, 'it may write the picture');
  assert.ok(call.agent!.cwd.startsWith(store.videoDir(slug, id)), 'in a folder of this video');
  assert.match(call.prompt, /DOES IT LISTEN\?/);
  assert.match(call.prompt, /glowing skill card/);
  assert.match(call.prompt, /image generation tool/);
  assert.ok(await thumbnailOf(slug, id), 'the picture is the video\'s thumbnail now');
  assert.match(made.made, /thumbnails-chatgpt/);
});

test('no picture, no idea or no ChatGPT: nothing changes, and it says why', async () => {
  const id = (await store.createVideo(slug, { title: 'Untitled idea' })).id;
  const run = async () => ({ text: 'done' });
  await assert.rejects(makeThumbnailWithChatGPT(slug, id, context, { signedIn: async () => true, run }), /what the thumbnail shows/);
  await saveOnePager(slug, id, { ...emptyOnePager(), thumbnail: { headline: 'WORTH IT?', visual: '', closer: '' } });
  await assert.rejects(makeThumbnailWithChatGPT(slug, id, context, { signedIn: async () => false, run }), /Connect ChatGPT/);
  await assert.rejects(makeThumbnailWithChatGPT(slug, id, context, { signedIn: async () => true, run }), /didn't make a picture/);
  assert.equal(await thumbnailOf(slug, id), undefined);
  assert.ok((await readdir(store.videoDir(slug, id))).includes('thumbnails-chatgpt'));
  assert.match(chatgptThumbnailPrompt('T', '', { visual: 'A face' }), /Use no headline/);
});

test('Codex may work in a folder only to write what it makes there; skill runs stay Claude\'s', async () => {
  const { runAI } = await import('./ai.js');
  const bin = path.join(temp, 'bin');
  await (await import('node:fs/promises')).mkdir(bin, { recursive: true });
  const fake = path.join(bin, 'codex');
  await (await import('node:fs/promises')).writeFile(fake, '#!/bin/sh\ncat >/dev/null\necho \'{"type":"item.completed","item":{"type":"agent_message","text":"Saved"}}\'\n', { mode: 0o755 });
  const folder = { cwd: temp, dirs: [temp], tools: [] };
  // Only the stand-in is found: never the real Codex on this Mac.
  const path0 = process.env.PATH;
  process.env.PATH = `${bin}:/usr/bin:/bin`;
  try {
    await assert.rejects(runAI({ provider: 'codex', prompt: 'x', budgetUsd: 1, agent: folder, extraDirs: [] }), /Claude only/);
    const done = await runAI({ provider: 'codex', prompt: 'x', budgetUsd: 1, agent: folder, writable: true, extraDirs: [] });
    assert.equal(done.text, 'Saved');
  } finally {
    process.env.PATH = path0;
  }
});

test('the picture is made from the references picked: the face first as the subject, niche thumbnails for style only', async () => {
  const { referenceRoles } = await import('./thumbnail-references.js');
  const id = (await store.createVideo(slug, { title: 'With references' })).id;
  await saveOnePager(slug, id, { ...emptyOnePager(), thumbnail: { headline: 'WORTH IT?', visual: 'Me, shocked, holding a glowing card.', closer: '' } });
  const { addReference } = await import('./thumbnail-references.js');
  const png = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x36', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']);
  const added = await addReference(slug, id, png);
  const calls: RunAIOptions[] = [];
  await makeThumbnailWithChatGPT(slug, id, context, {
    signedIn: async () => true,
    run: async (options) => { calls.push(options); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=320x180', '-frames:v', '1', path.join(options.agent!.cwd, 'thumbnail.png')]); return { text: 'ok' }; },
  }, [added.id]);
  assert.equal(calls[0].images?.length, 1, 'the picked picture is attached');
  assert.match(calls[0].prompt, /Image 1: a picture the creator added/);
  assert.match(calls[0].prompt, /No plain shapes/);
  const roles = referenceRoles([{ kind: 'face', title: 'You' }, { kind: 'trending', title: 'Claude Just Changed Everything' }]);
  assert.match(roles, /Image 1: the creator\. Put this exact person/);
  assert.match(roles, /Image 2: a thumbnail that does well.*Do not copy its text/);
});

test('a face photo given once, before any recording, is the face for every video\'s thumbnail', async () => {
  const { setFacePhoto, listReferences, referenceFile } = await import('./thumbnail-references.js');
  const id = (await store.createVideo(slug, { title: 'Packaged before recording' })).id;
  assert.ok(!(await listReferences(slug, id)).some((r) => r.kind === 'face'), 'nothing recorded and no photo: no face yet');
  const jpg = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=64x64', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']);
  await setFacePhoto(slug, jpg);
  const face = (await listReferences(slug, id)).find((r) => r.kind === 'face');
  assert.equal(face?.title, 'Your photo');
  assert.equal(face?.selected, true);
  assert.match(await referenceFile(slug, id, 'face'), /thumbnail-face-photo\.jpg$/);
  await assert.rejects(setFacePhoto(slug, Buffer.from('not a picture')), /PNG, JPG or WebP/);
});

test('the references picked for a video are kept with it, four at most; a link that is not YouTube is refused', async () => {
  const { chooseReferences, listReferences, addLinkReference, addReference } = await import('./thumbnail-references.js');
  const id = (await store.createVideo(slug, { title: 'Picks' })).id;
  const png = (c: string) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${c}:s=64x36`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']);
  const a = await addReference(slug, id, png('red')), b = await addReference(slug, id, png('blue'));
  assert.deepEqual((await listReferences(slug, id)).filter((r) => r.selected && r.kind !== 'face').map((r) => r.id).sort(), [a.id, b.id].sort(), 'an added picture is picked at once');
  await chooseReferences(slug, id, [b.id, 'trending:notreal0000', b.id]);
  assert.deepEqual((await listReferences(slug, id)).filter((r) => r.selected && r.kind !== 'face').map((r) => r.id), [b.id], 'unknown and repeated picks are dropped; the pick is kept');
  await assert.rejects(addLinkReference(slug, id, 'https://example.com/video'), /YouTube video or Short/);
});

test('picks keep the order they were picked in, so their places do not move when another comes or goes', async () => {
  const { chooseReferences, listReferences, addReference } = await import('./thumbnail-references.js');
  const id = (await store.createVideo(slug, { title: 'Order' })).id;
  const png = (c: string) => execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${c}:s=64x36`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']);
  const a = await addReference(slug, id, png('red')), b = await addReference(slug, id, png('blue')), c = await addReference(slug, id, png('green'));
  await chooseReferences(slug, id, [c.id, a.id]);
  const picks = (await listReferences(slug, id)).filter((r) => r.pick !== undefined).sort((x, y) => x.pick! - y.pick!).map((r) => r.id);
  assert.deepEqual(picks, [c.id, a.id]);
  assert.ok(!(await listReferences(slug, id)).find((r) => r.id === b.id)?.selected);
});
