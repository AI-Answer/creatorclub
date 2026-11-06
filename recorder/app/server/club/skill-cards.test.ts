import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Video } from '../../shared/club.js';
import type { CompanionApplied, CompanionAsked, CompanionReplyMessage, CompanionThread } from '../../shared/companion.js';
import { createProject, defaultEffects, defaultTransform, type Clip, type Project } from '../../shared/types.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * A skill run on Edit answers with a plan: the companion's own edit cards, checked against the timeline, previewed and applied like a
 * reply's. A stand-in plays the skill: it reads what it was given and writes result.json, as a real run would.
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-skill-cards-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');
const home = path.join(temp, 'home');
// The skills are found in ~/.claude/skills: this run's home is the test's own.
process.env.HOME = home;
await mkdir(path.join(home, '.claude', 'skills', 'screenplay-edit'), { recursive: true });
await writeFile(path.join(home, '.claude', 'skills', 'screenplay-edit', 'SKILL.md'), '---\nname: screenplay-edit\ndescription: Motion graphics for a talking-head video, anchored to spoken words.\ncreatorclub: edit\n---\nPut a graphic on every claim.');

let plan: unknown = {};
let pictures: string[] | undefined;
/** A 4×4 PNG, enough for the editor to place as a picture. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP8z4AATEhsPBwAM9EBBRmVGJcAAAAASUVORK5CYII=', 'base64');
const seen: { brief: string; actions: string; system: string }[] = [];
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  const dir = options.agent?.cwd;
  if (dir) {
    seen.push({ brief: await readFile(path.join(dir, 'brief.md'), 'utf8'), actions: await readFile(path.join(dir, 'actions.md'), 'utf8').catch(() => ''), system: options.system ?? '' });
    if (pictures) for (const name of pictures) await writeFile(path.join(dir, 'out', name), PNG);
    await writeFile(path.join(dir, 'result.json'), JSON.stringify(plan));
    return { text: 'Planned the graphics.' };
  }
  options.onEvent?.({ type: 'text', text: 'Fine.' });
  return { text: 'Fine.' };
}

const { clubRouter } = await import('./index.js');
const storage = await import('../storage.js');
await storage.initStorage();
const app = express();
app.use('/api/club', clubRouter({ runAI: fakeAI }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async () => {
  server.close();
  await rm(temp, { recursive: true, force: true });
});
const call = async <T = unknown>(method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
};

const clip = (id: string, track: Clip['track'], length: number): Clip => ({ id, mediaId: 'm', name: id, track, start: 0, sourceIn: 0, sourceOut: length, speed: 1, gain: 1, muted: false, transform: defaultTransform(), effects: defaultEffects() });
function recording(): Project {
  const p = createProject('Skills');
  p.media = [{ id: 'm', name: 'take', path: '/tmp/take.mov', kind: 'video', duration: 30, width: 1920, height: 1080, hasAudio: true }];
  p.clips = [clip('screen-1', 'screen', 20), clip('camera-1', 'camera', 20)];
  const words = [['Here', 1], ['are', 1.4], ['three', 2], ['skills', 2.5], ['first', 8], ['the', 8.4], ['hook', 8.8]].map(([text, start]) => ({ text: text as string, start: start as number, end: (start as number) + 0.35 }));
  p.captions = [{ id: 'cap1', start: 1, end: 9.2, text: words.map((w) => w.text).join(' '), words }];
  return p;
}

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'] });
const project = await storage.saveProject(recording());
const video = (await call<Video>('POST', '/videos', { title: 'Skills', stage: 'planning' })).body;
await call('PUT', `/videos/${video.id}`, { recorderProjectId: project.id });
const thread = async () => (await call<CompanionThread>('GET', `/videos/${video.id}/companion`)).body;

async function run(message: string): Promise<CompanionReplyMessage> {
  const res = await call<CompanionAsked>('POST', `/videos/${video.id}/companion`, { message, context: { tab: 'edit', playhead: 0 } });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  for (let tries = 0; tries < 300; tries++) {
    const messages = (await thread()).messages;
    const at = messages.findIndex((each) => each.id === res.body.message.id);
    if (at >= 0 && messages[at + 1]?.role === 'assistant') return messages[at + 1] as CompanionReplyMessage;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no reply');
}

test('a skill run answers with edit cards: told the word times, the timeline and the changes it may make', async () => {
  plan = {
    text: 'A title on "three skills" and a lower third on "hook".',
    actions: [
      { type: 'add_motion_block', template: 'title-card', start: 2, duration: 3, text: 'Three skills' },
      { type: 'add_motion_block', template: 'lower-third', start: 8.8, duration: 3, text: 'The hook', detail: 'Skill 1' },
      { type: 'add_motion_block', template: 'confetti', start: 4, text: 'Not a template' },
      { type: 'ask_choice', question: 'Which?', options: ['A', 'B'] },
    ],
  };
  const reply = await run('/screenplay-edit add graphics');
  const told = seen.at(-1)!;
  assert.match(told.brief, /\[2\.00\] three \[2\.50\] skills/, 'the word times, so a graphic can sit on its word');
  assert.match(told.brief, /# The timeline now/);
  assert.match(told.brief, /# Sources on the video's Board/);
  assert.match(told.brief, new RegExp(`/api/club/videos/${video.id}/proof`), 'how to make a proof shot for this video');
  assert.match(told.brief, /Pacing: 1 spot to look at\n- 0:00–0:20: 20 s with nothing changing on screen/, 'the pacing as it is now');
  assert.match(told.actions, /before any of your cuts/);
  assert.match(told.actions, /add_motion_block/);
  assert.doesNotMatch(told.actions, /ask_choice/, 'a run cannot wait for an answer');
  assert.match(told.system, /Prefer changes to this timeline over rendering/);
  assert.match(told.brief, /0:00 to 0:20/, 'with nothing selected, the plan is for the whole video');
  assert.deepEqual(reply.cards.map((card) => card.action.type), ['add_motion_block', 'add_motion_block'], 'what does not fit is left out');
  assert.ok(reply.cards.every((card) => card.state === 'offered' && card.proposedOn), 'offered for the timeline it was planned on');
  assert.match(reply.text, /I skipped 2 changes that no longer fit your video\./, 'said in plain words');
  assert.doesNotMatch(reply.text, /cards|did not fit the timeline|left out|Add all/, 'no app words in the reply');
  const applied = await call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/apply-all`, { indices: [0, 1], revision: (await storage.projectState(project.id)).revision });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const saved = (await storage.readProject(project.id)) as Project;
  assert.deepEqual((saved.motion ?? []).map((block) => block.start), [2, 8.8]);
});

test('the pacing after the cards stops, as Add all does, at a card the cuts before it leave no room for', async () => {
  plan = {
    text: 'Cut the end and title it.',
    actions: [
      { type: 'delete_range', start: 10, end: 19.9 },
      { type: 'add_motion_block', template: 'title-card', start: 15, duration: 3, text: 'The end' },
    ],
  };
  const reply = await run('/screenplay-edit tighten');
  assert.equal(reply.cards.length, 2, 'both fit the timeline as it is now');
  assert.match(reply.text, /Still worth a look after the first 1 changes: |^Cut the end and title it\.$/m, 'pacing is said in plain words, and only when something is worth a look');
  assert.doesNotMatch(reply.text, /Add all|card/);
});

test('a graphic whose stretch a cut before it takes out still stays up long enough to read', async () => {
  plan = {
    text: 'Cut the middle and label what is left.',
    actions: [
      { type: 'delete_range', start: 14, end: 18 },
      { type: 'add_motion_block', template: 'title-card', start: 13.5, duration: 3, text: 'Next' },
    ],
  };
  const reply = await run('/screenplay-edit tighten');
  const applied = await call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/apply-all`, { indices: [0, 1], revision: (await storage.projectState(project.id)).revision });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const block = ((await storage.readProject(project.id)) as Project).motion!.find((each) => each.template === 'title-card' && each.start > 13)!;
  assert.deepEqual([block.start, block.duration], [13.5, 2], 'not the half second the cut left of its stretch');
});

test('a skill that has nothing to do says why, with no cards', async () => {
  plan = { text: 'This skill makes reels from scratch, not edits.' };
  const reply = await run('/screenplay-edit');
  assert.equal(reply.cards.length, 0);
  assert.match(reply.text, /makes reels from scratch/);
});

test('one run can hand back several proof shots, each its own card at its moment, and a blur that hides something private', async () => {
  pictures = ['proof-1.png', 'proof-2.png'];
  plan = {
    text: 'Two proof shots and a blur over the email.',
    actions: [{ type: 'add_blur', start: 3, duration: 2, x: 0.6, y: 0.05, width: 0.3, height: 0.08 }],
    files: [
      { file: 'out/proof-1.png', title: 'Anthropic docs', start: 2, duration: 3 },
      { file: 'out/proof-2.png', title: 'Release notes', start: 8.5, duration: 3 },
      { file: '../../outside.png', title: 'Not allowed', start: 1 },
    ],
  };
  const reply = await run('/screenplay-edit show the proof');
  pictures = undefined;
  assert.deepEqual(reply.cards.map((card) => card.action.type), ['add_blur', 'add_clip', 'add_clip']);
  assert.deepEqual(reply.cards.slice(1).map((card) => (card.action as { start: number; title: string }).start), [2, 8.5]);
  assert.match(reply.text, /Left out: \.\.\/\.\.\/outside\.png is not one it made in its folder/);
  const blur = await call<CompanionApplied>('POST', `/videos/${video.id}/companion/${reply.id}/cards/0/apply`, { revision: (await storage.projectState(project.id)).revision });
  assert.equal(blur.status, 200, JSON.stringify(blur.body));
  const saved = (await storage.readProject(project.id)) as Project;
  const hidden = saved.elements.find((each) => each.type === 'blur');
  assert.deepEqual(hidden && [hidden.start, hidden.duration, hidden.x, hidden.width], [3, 2, 0.6, 0.3]);
});

test('the proof-edit skill comes with the app: found and offered on Edit without being installed', async () => {
  const { listSkills } = await import('./skills.js');
  const { skillFolder } = await import('./skill-run.js');
  const skills = await listSkills(path.join(temp, 'nobody'));
  assert.ok(skills.some((each) => each.name === 'proof-edit' && each.forEdit));
  assert.match((await skillFolder('proof-edit', path.join(temp, 'nobody')))!, /skills[\\/]proof-edit$/);
});
