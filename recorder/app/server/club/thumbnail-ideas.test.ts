import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RunAIOptions } from './ai.js';

/* Thumbnail ideas you can see: three concepts from the connected AI, a ChatGPT preview of each, and one click to use one. Stand-ins play both AIs. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'cc-thumb-ideas-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');
after(() => rm(temp, { recursive: true, force: true }));
const store = await import('./store.js');
const { saveOnePager, readOnePager } = await import('./planning.js');
const { emptyOnePager } = await import('../../src/club/idea/onepager.js');
const { thumbnailIdeas, useIdea, ideasPrompt } = await import('./thumbnail-ideas.js');
const { thumbnailOf } = await import('./publisher-routes.js');

const slug = (await store.createWorkspace({ name: 'Maya', handle: '', channelUrl: undefined, topics: [], about: '', cta: '' } as unknown as Parameters<typeof store.createWorkspace>[0])).slug;
const ideas = [
  { name: 'Doubtful face', headline: 'DOES IT LISTEN?', composition: 'Me close on the left, squinting at a glowing skill card.', emotion: 'doubt', palette: 'charcoal and orange', stopper: 'face' },
  { name: 'Big number', headline: '3x FASTER', composition: 'A huge 3x over my coding screen.', emotion: 'surprise', palette: 'navy and yellow', stopper: 'numbers' },
  { name: 'Shocked', headline: '', composition: 'Me shocked, the terminal behind me.', emotion: 'shock', palette: 'black and red', stopper: 'emotion' },
];

test('three ideas arrive, then a preview of each; using one puts its words on the sketch and its picture as the thumbnail', async () => {
  const id = (await store.createVideo(slug, { title: 'Three Claude skills, tested' })).id;
  await saveOnePager(slug, id, { ...emptyOnePager(), logline: 'We test three Claude skills on a real task.' });
  const events: unknown[] = [];
  const asked: RunAIOptions[] = [], drawn: RunAIOptions[] = [];
  const done = await thumbnailIdeas(slug, id, { emit: (e) => events.push(e), signal: new AbortController().signal }, [], {
    plan: { runAI: async (o) => { asked.push(o); return { text: '', json: { ideas } }; } },
    signedIn: async () => true,
    draw: async (o) => { drawn.push(o); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=320x180', '-frames:v', '1', path.join(o.agent!.cwd, 'thumbnail.png')]); return { text: 'ok' }; },
  });
  assert.match(asked[0].prompt, /We test three Claude skills/);
  assert.equal(drawn.length, 3, 'a preview of each idea');
  assert.ok(drawn.every((o) => o.provider === 'codex' && o.writable));
  assert.deepEqual(done.previews, ['0', '1', '2']);
  assert.ok(events.some((e) => (e as { ideas?: unknown }).ideas), 'the ideas show before the previews');
  assert.equal((await useIdea(slug, id, done.run, 1)).picture, true);
  const sketch = await readOnePager(slug, id);
  assert.equal(sketch?.thumbnail.headline, '3x FASTER');
  assert.match(sketch?.thumbnail.visual ?? '', /huge 3x.*Emotion: surprise/);
  assert.ok(await thumbnailOf(slug, id));
});

test('without ChatGPT the ideas still come, as words; the ask builds on the face and the niche thumbnails', async () => {
  const id = (await store.createVideo(slug, { title: 'No ChatGPT' })).id;
  const done = await thumbnailIdeas(slug, id, { emit: () => {}, signal: new AbortController().signal }, [], {
    plan: { runAI: async () => ({ text: '', json: { ideas } }) }, signedIn: async () => false, draw: async () => { throw new Error('not asked'); },
  });
  assert.deepEqual(done.previews, [null, null, null]);
  assert.equal((await useIdea(slug, id, done.run, 0)).picture, false);
  const built = ideasPrompt({ title: 'T', logline: '', points: [], refs: [{ kind: 'face', title: 'You' }, { kind: 'trending', title: 'Claude 2.0', views: 844329 }] });
  assert.match(built.prompt, /at least two concepts around their face/);
  assert.match(built.prompt, /"Claude 2\.0" \(844329 views\)/);
  assert.match(built.prompt, /Never abstract shapes/);
  assert.match(built.prompt, /Never invent a number/);
});

test('other titles come back ready to pick: the current one, repeats and ones that break the title rules are left out', async () => {
  const { titleIdeas, titlesPrompt } = await import('./title-ideas.js');
  const id = (await store.createVideo(slug, { title: 'Code Faster With 3 Claude Skills' })).id;
  const titles = await titleIdeas(slug, id, new AbortController().signal, { runAI: async () => ({ text: '', json: { titles: ['Code Faster With 3 Claude Skills', 'Three Skills Claude Uses On Its Own', 'Three Skills Claude Uses On Its Own', 'This title is far too long to ever fit the rules here', 'Make Claude Code Work For You'] } }) });
  assert.deepEqual(titles, ['Three Skills Claude Uses On Its Own', 'Make Claude Code Work For You'], 'too few fit, so it asked once more (the stand-in answers the same)');
  assert.match(titlesPrompt({ title: 'T', logline: '', points: [] }).prompt, /Never invent a number/);
});
