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
/** Waits until the stand-in AI has been asked something new, so the run has read everything it starts from. */
async function asking(count: number) {
  for (let i = 0; i < 200 && prompts.length === count; i++) await new Promise((r) => setTimeout(r, 10));
}
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
  assert.match(await scriptText(), /^<!-- Creator Compiler scene script -->\n# Build it fast\n\n## Opening\n\nword0 /);
  assert.equal(job.result.replaced, undefined, 'there was no script to replace');

  // The outline says so: some scenes have a script, and it is not the full script.
  const value = job.result.value as Outline;
  assert.equal(value.scriptState, 'partial');
  assert.equal(value.fullScript, undefined, 'a scene is not the full script');
  assert.deepEqual(value.scenes.map((each) => each.script), [words(140), undefined, undefined, undefined]);
  assert.deepEqual((await outline()), value, 'and so does the plan');
  assert.equal((await call('PUT', `/videos/${video.id}/outline`, { scenes: value.scenes })).status, 200, 'the outline sent back as it was read is accepted');
  assert.equal(((await outline()).scenes)[0].script, words(140), 'and the script is still there');

  // Continue to recording gives the written scene its script and the others their talking points.
  const wanted = recorderScenes((await outline()));
  assert.equal(wanted[0].script, words(140), 'the recorder gets the scene\'s own script');
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

test('edits made elsewhere while a scene is written stay: only that scene is merged into the script as it is then', async () => {
  let release!: () => void;
  gate = new Promise<void>((resolve) => (release = resolve));
  answers.push(words(210));
  const earlier = prompts.length;
  const job = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[2] });
  await asking(earlier);
  const current = await scriptText();
  const edited = current.replace(/## Opening\n\n[^]*?\n\n## Level 1/, '## Opening\n\nMy own first line.\n\n## Level 1');
  assert.notEqual(edited, current);
  await call('PUT', `/videos/${video.id}/script`, { script: edited });
  release();
  gate = undefined;
  const done = await finish(job.body.id);
  assert.equal(done.result.held, undefined, 'a different scene changed, so nothing is held');
  assert.ok(done.result.replaced);
  const sections = scriptSections(await scriptText());
  assert.equal(sections[0].body, 'My own first line.', 'the edit made while it ran is kept');
  assert.equal(sections[2].body, words(210), 'and the new scene is in');
});

test('a scene result is held only when that scene or the outline changed meanwhile, and Use it merges just that scene', async () => {
  let release!: () => void;
  gate = new Promise<void>((resolve) => (release = resolve));
  answers.push(words(210));
  const earlier = prompts.length;
  const job = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[2] });
  await asking(earlier);
  const current = await scriptText();
  const mineScene = current.replace(`## Where this falls short\n\n${words(210)}`, '## Where this falls short\n\nMy own words for this scene.');
  assert.notEqual(mineScene, current);
  await call('PUT', `/videos/${video.id}/script`, { script: mineScene });
  release();
  gate = undefined;
  const done = await finish(job.body.id);
  assert.match(done.result.held, /^\d{4}-/);
  assert.equal(done.result.replaced, undefined);
  assert.equal(scriptSections(await scriptText())[2].body, 'My own words for this scene.', 'the scene\'s edit is not overwritten');
  const heldFile = (await files()).find((name) => name.startsWith('script-new-'))!;
  const heldText = await readFile(path.join(dir, 'videos', video.id, heldFile), 'utf8');
  assert.match(heldText, new RegExp(`^<!-- scene:${ids[2]} -->\\n## Where this falls short\\n\\n${words(210)}\\n$`), 'only that scene is held');
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.ready, { script: done.result.held });

  // Edits made to other scenes after the hold are still there after Use it.
  const later = (await scriptText()).replace(/## Ending\n\n[^]*$/, '## Ending\n\nMy new ending.\n');
  await call('PUT', `/videos/${video.id}/script`, { script: later });
  const used = await call('POST', `/videos/${video.id}/script/use`, { token: done.result.held });
  assert.equal(used.status, 200, JSON.stringify(used.body));
  const sections = scriptSections(await scriptText());
  assert.equal(sections[2].body, words(210), 'the held scene is in');
  assert.equal(sections[3].body, 'My new ending.', 'the other scenes keep their edits');
  assert.equal(sections[0].body, 'My own first line.');
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.ready, {}, 'used once');
  assert.ok((await files()).some((name) => /^script-earlier-.*\.md$/.test(name)));
});

test('a scene result is held when the outline changed while it was written', async () => {
  let release!: () => void;
  gate = new Promise<void>((resolve) => (release = resolve));
  answers.push(words(105));
  const earlier = prompts.length;
  const job = await call('POST', `/videos/${video.id}/script`, { sceneId: ids[3] });
  await asking(earlier);
  const now = await outline();
  await call('PUT', `/videos/${video.id}/outline`, { scenes: now.scenes.map((each, i) => (i === 1 ? { ...each, show: 'A changed note' } : each)) });
  release();
  gate = undefined;
  assert.match((await finish(job.body.id)).result.held, /^\d{4}-/);
});

test('a script written whole is a full script, and a scene-by-scene one becomes full when every scene has its part', async () => {
  const whole = scriptSections(await scriptText()).map((section) => `## ${section.heading}\n\n${section.body || 'Filled in.'}`).join('\n\n');
  const saved = await call('PUT', `/videos/${video.id}/script`, { script: `# Build it fast\n\n${whole}` });
  assert.equal(saved.body.outline.scriptState, 'full');
  assert.match(saved.body.outline.fullScript, /^# Build it fast\n\n## Opening/, 'written whole: no marker, the editor gets the text as it is');
  assert.equal(saved.body.outline.scenes.every((each: { script?: string }) => !!each.script), true);

  // Scene by scene from nothing: partial until the last scene is written, then it reads as the full script without the marker line.
  const fresh = (await call('POST', '/videos', { title: 'By scene' })).body as Video;
  await call('PUT', `/videos/${fresh.id}/outline`, { scenes: [scene('One', 60), scene('Two', 60)] });
  const freshIds = ((await call('GET', `/videos/${fresh.id}/plan`)).body.outline as Outline).scenes.map((each) => each.id!);
  answers.push(words(140));
  const first = await finish((await call('POST', `/videos/${fresh.id}/script`, { sceneId: freshIds[0] })).body.id);
  assert.equal(first.result.value.scriptState, 'partial');
  answers.push(words(140));
  const second = await finish((await call('POST', `/videos/${fresh.id}/script`, { sceneId: freshIds[1] })).body.id);
  assert.equal(second.result.value.scriptState, 'full');
  assert.match(second.result.value.fullScript, /^# By scene\n\n## One\n\nword0/, 'no marker line in what is shown');
  assert.equal(scriptSections(second.result.value.fullScript).length, 2);
});

test('the recorder gets a scene\'s own script, and talking points for scenes without one', async () => {
  const fresh = (await call('POST', '/videos', { title: 'Push' })).body as Video;
  await call('PUT', `/videos/${fresh.id}/outline`, { scenes: [scene('One', 60), scene('Two', 60)] });
  const freshIds = ((await call('GET', `/videos/${fresh.id}/plan`)).body.outline as Outline).scenes.map((each) => each.id!);
  answers.push(words(140));
  await finish((await call('POST', `/videos/${fresh.id}/script`, { sceneId: freshIds[1] })).body.id);
  const pushed = recorderScenes((await call('GET', `/videos/${fresh.id}/plan`)).body.outline);
  assert.deepEqual(pushed.map((each) => each.script), ['One point one\nOne point two', words(140)]);
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

test('hand-editing a scene keeps the script format: a scene-by-scene script stays partial, a full script stays one, other scenes are untouched', async () => {
  const edit = (sceneId: string, text: string) => call('PUT', `/videos/${video.id}/script/scene/${sceneId}`, { text });
  // Start from a script written scene by scene: only scenes 1 and 4 have words.
  await call('PUT', `/videos/${video.id}/script`, { script: null });
  await edit(ids[0], 'Opening words.');
  await edit(ids[3], 'Ending words.');
  const before = scriptSections(await scriptText());
  const partial = await edit(ids[2], 'My own words for scene three.');
  assert.equal(partial.status, 200);
  const value = partial.body.outline as Outline;
  assert.equal(value.scenes[2].script, 'My own words for scene three.');
  assert.equal(value.scriptState, 'partial');
  assert.equal(value.fullScript, undefined);
  assert.equal(value.scenes[0].script, before[0].body, 'other scenes keep what they have');
  assert.match(await scriptText(), /^<!-- Creator Compiler scene script -->\n/, 'the scene marker stays');

  // Emptying a scene clears only its part.
  assert.equal(((await edit(ids[2], '  ')).body.outline as Outline).scenes[2].script, undefined);

  // Once every scene has words the script is full, and editing a scene edits its section of it.
  await edit(ids[1], 'Level one words.');
  const full = (await edit(ids[2], 'Level two words.')).body.outline as Outline;
  assert.equal(full.scriptState, 'full');
  assert.ok(full.fullScript?.includes('Level two words.'));
  await call('PUT', `/videos/${video.id}/script`, { script: `# Whole\n\n## Opening\n\nA\n\n## Level 1\n\nB\n\n## Where this falls short\n\nC\n\n## Ending\n\nD\n` });
  const whole = (await edit(ids[1], 'B edited')).body.outline as Outline;
  assert.equal(whole.scriptState, 'full');
  assert.equal(whole.fullScript, '# Whole\n\n## Opening\n\nA\n\n## Level 1\n\nB edited\n\n## Where this falls short\n\nC\n\n## Ending\n\nD\n');
  assert.doesNotMatch(await scriptText(), /Creator Compiler scene script/, 'a full script written whole does not become a scene script');
});

test('hand-editing a scene: unknown scene is 404, a script without scenes is refused and left as it was, no script and no words writes nothing', async () => {
  const edit = (sceneId: string, text: unknown) => call('PUT', `/videos/${video.id}/script/scene/${sceneId}`, { text });
  assert.equal((await edit('nope', 'x')).status, 404);
  assert.equal((await edit('bad id!', 'x')).status, 404);
  assert.equal((await edit(ids[0], 5)).status, 400);
  await call('PUT', `/videos/${video.id}/script`, { script: 'One long script with no scene headings.' });
  const refused = await edit(ids[0], 'new');
  assert.equal(refused.status, 409);
  assert.equal(await scriptText(), 'One long script with no scene headings.\n');
  await call('PUT', `/videos/${video.id}/script`, { script: null });
  assert.equal((await edit(ids[0], '')).status, 200);
  assert.ok(!(await files()).includes('script.md'), 'nothing is written for no words');
  const first = await edit(ids[0], 'Fresh start');
  assert.equal((first.body.outline as Outline).scriptState, 'partial');
});
