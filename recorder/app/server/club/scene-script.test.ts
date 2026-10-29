import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Outline, Video } from '../../shared/club.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/* Write this scene: the script job with a `sceneId`, through the HTTP routes with a stand-in for the AI. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-scene-script-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.CREATORCLUB_SECRETS_DIR = path.join(temp, 'app-support');

const prompts: string[] = [];
const answers: string[] = [];
let gate: Promise<void> | undefined;
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  prompts.push(options.prompt);
  if (gate) await gate;
  return { text: answers.shift() ?? '' };
}

const { clubRouter } = await import('./index.js');
const { matchSection, scriptSections } = await import('./planning.js');
const { recorderScenes } = await import('./recorder.js');

const app = express();
app.use('/api/club', clubRouter({ runAI: fakeAI }));
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
async function finish(jobId: string) {
  for (let i = 0; i < 300; i++) {
    const job = (await call('GET', `/jobs/${jobId}`)).body;
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job did not finish');
}

await call('POST', '/workspaces', { name: 'Maya Lopez', handle: '@maya', topics: ['claude'] });
const dir = path.join(process.env.CREATORCLUB_DIR!, 'maya-lopez');

const scene = (title: string, seconds: number) => ({ title, talkingPoints: [`${title} point one`, `${title} point two`], show: `Show ${title}`, seconds });
const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');
const video = (await call('POST', '/videos', { title: 'Build it fast' })).body as Video;
await call('PUT', `/videos/${video.id}/outline`, { scenes: [scene('Opening', 60), scene('Level 1', 120), scene('Where this falls short', 90), scene('Ending', 45)] });
const outline = async () => (await call('GET', `/videos/${video.id}/plan`)).body.outline as Outline;
const ids = (await outline()).scenes.map((s) => s.id!);
const files = async () => readdir(path.join(dir, 'videos', video.id));
const scriptText = () => readFile(path.join(dir, 'videos', video.id, 'script.md'), 'utf8');

test('Write this scene writes one scene of the script: the others stay empty, and the prompt is about that scene only', async () => {
  answers.push(words(140));
  const started = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[0] });
  assert.equal(started.status, 202);
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(prompts.length, 1, 'one call: the scene is at its word budget');
  const prompt = prompts[0];
  assert.match(prompt, /<scene number="1" of="4" heading="Opening" spoken_words_wanted="140">/);
  assert.match(prompt, /### 1\. Opening \(0:00–1:00\)/);
  assert.match(prompt, /\(none: write it fresh\)/);
  assert.match(prompt, /This is the opening/);
  assert.doesNotMatch(prompt, /This is the ending/);
  assert.doesNotMatch(prompt, /\{[a-z_]+\}/, 'every placeholder is filled');
  assert.doesNotMatch(prompt, /Samin/);

  const sections = scriptSections(await scriptText());
  assert.deepEqual(sections.map((s) => s.heading), ['Opening', 'Level 1', 'Where this falls short', 'Ending']);
  assert.deepEqual(sections.map((s) => s.body.length > 0), [true, false, false, false]);
  assert.match(await scriptText(), /^# Build it fast\n\n## Opening\n\nword0 /);
  assert.equal(job.result.value.fullScript, await scriptText());
  assert.equal(job.result.replaced, undefined, 'there was no script to replace');

  // Continue to recording gives the written scene its script and the others their talking points.
  const wanted = recorderScenes((await outline()));
  assert.equal(wanted[0].script, words(140));
  assert.equal(wanted[1].script, 'Level 1 point one\nLevel 1 point two');
});

test('a second scene keeps the first; a scene with words is a draft that is kept; the last scene gets the ending rule; Undo puts the earlier script back', async () => {
  answers.push(words(105));
  const job = await finish((await call('POST', `/videos/${video.id}/script`, { sceneId: ids[3] })).body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.match(prompts.at(-1)!, /This is the ending/);
  assert.doesNotMatch(prompts.at(-1)!, /This is the opening/);
  const sections = scriptSections(await scriptText());
  assert.equal(sections[0].body, words(140), 'the first scene is untouched');
  assert.equal(sections[3].body, words(105));
  assert.ok(job.result.replaced, 'the earlier script is set aside under Undo');
  assert.ok((await files()).some((name) => /^script-earlier-.*\.md$/.test(name)));

  // Again for the first scene: its own words are the draft.
  answers.push(words(140).replace('word0', 'zero'));
  await finish((await call('POST', `/videos/${video.id}/script`, { sceneId: ids[0] })).body.id);
  assert.match(prompts.at(-1)!, new RegExp(`<draft>\\n${words(140)}\\n</draft>`));
  assert.match((await scriptText()), /## Opening\n\nzero word1/, 'and the new words replace it');

  const beforeLast = await scriptText();
  answers.push(words(130));
  const replaced = await finish((await call('POST', `/videos/${video.id}/script`, { sceneId: ids[0] })).body.id);
  assert.notEqual(await scriptText(), beforeLast);
  const undone = await call('POST', `/videos/${video.id}/script/undo`, { token: replaced.result.replaced });
  assert.equal(undone.status, 200);
  assert.equal(await scriptText(), beforeLast, 'Undo puts back the script that run replaced');
});

test('a scene under 80% of its budget is lengthened once, with its heading dropped from the answer', async () => {
  const earlier = prompts.length;
  answers.push(words(20), `## Level 1\n${words(240)}`);
  const job = await finish((await call('POST', `/videos/${video.id}/script`, { sceneId: ids[1] })).body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(prompts.length - earlier, 2);
  assert.match(prompts.at(-1)!, /<scene heading="Level 1" spoken_words_now="20" spoken_words_wanted="280">/);
  const section = scriptSections(await scriptText())[1];
  assert.equal(section.body, words(240), 'the lengthened body, without the heading the model added');
  assert.equal(scriptSections(await scriptText()).length, 4, 'still four scenes');
});

test('one script run at a time per video: the same scene joins the running job, another scene or the full script waits', async () => {
  let release!: () => void;
  gate = new Promise<void>((resolve) => (release = resolve));
  answers.push(words(210));
  const first = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[2] });
  const again = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[2] });
  assert.equal(again.body.id, first.body.id, 'the same scene: the run that is going');
  for (const body of [{ sceneId: ids[0] }, {}]) {
    const refused = await call('POST', `/videos/${video.id}/script`, body);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'Wait for the script that is running.');
  }
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.running, { script: first.body.id });
  release();
  gate = undefined;
  assert.equal((await finish(first.body.id)).status, 'done');
  answers.push(words(140));
  const next = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[0] });
  assert.equal(next.status, 202, 'after it, another scene can start');
  assert.equal((await finish(next.body.id)).status, 'done');
});

test('a scene written after the script was edited is held, not written over the edit', async () => {
  let release!: () => void;
  gate = new Promise<void>((resolve) => (release = resolve));
  answers.push(words(210));
  const job = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[2] });
  await new Promise((r) => setTimeout(r, 30));
  const mine = (await scriptText()).replace('## Opening', '## Opening\n\nMy own first line.');
  await call('PUT', `/videos/${video.id}/script`, { script: mine });
  release();
  gate = undefined;
  const done = await finish(job.body.id);
  assert.match(done.result.held, /^\d{4}-/);
  assert.equal(await scriptText(), mine.trimEnd() + '\n', 'the edit is still the script');
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.ready, { script: done.result.held });
  const used = await call('POST', `/videos/${video.id}/script/use`, { token: done.result.held });
  assert.equal(used.status, 200);
});

test('a scene that is not in the outline, a bad id, no outline and a bad body are refused in one sentence', async () => {
  assert.equal((await call('POST', `/videos/${video.id}/script`, { sceneId: 'nope' })).body.error, 'That scene was not found.');
  assert.equal((await call('POST', `/videos/${video.id}/script`, { sceneId: '../x' })).status, 400);
  assert.equal((await call('POST', `/videos/${video.id}/script`, { sceneId: ids[0], extra: 1 })).status, 400);
  const bare = (await call('POST', '/videos', { title: 'Bare' })).body as Video;
  assert.equal((await call('POST', `/videos/${bare.id}/script`, { sceneId: 'x' })).body.error, 'Create the outline first.');
});

test('a scene is matched to its part of the script by title, else by place when there are as many', () => {
  const scenes = [{ title: 'One' }, { title: 'Two' }];
  assert.equal(matchSection([{ heading: 'two', body: 'b' }, { heading: 'one', body: 'a' }], scenes, 0)?.body, 'a');
  assert.equal(matchSection([{ heading: 'x', body: 'a' }, { heading: 'y', body: 'b' }], scenes, 1)?.body, 'b', 'by place');
  assert.equal(matchSection([{ heading: 'x', body: 'a' }], scenes, 1), undefined, 'a different number: no guess');
});
