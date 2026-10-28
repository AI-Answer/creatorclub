import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Outline, Package, Video } from '../../shared/club.js';
import type { Project } from '../../shared/types.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/*
 * The Plan step through the HTTP routes: Package it, Create outline and Write full script instead with a stand-in for the AI,
 * a stand-in yt-dlp for video tiles, and Continue to recording writing a real SceneForge project into a temp folder.
 * Nothing here reaches YouTube or a paid AI. (Temp folders are left for the system to clear.)
 */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-plan-'));
const bin = path.join(temp, 'bin');
await mkdir(bin);
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

// yt-dlp for a video tile: info with two chapters, timed English captions, and a channel listing with known views.
await writeFile(
  path.join(bin, 'yt-dlp'),
  `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('2026.03.17'); process.exit(0); }
if (args.includes('--flat-playlist')) { console.log(JSON.stringify({ entries: Array.from({ length: 30 }, (_, i) => ({ id: 'up_' + String(i).padStart(8, '0'), view_count: 1000 })) })); process.exit(0); }
if (!args.includes('--skip-download')) { console.error('A STREAM WAS REQUESTED'); process.exit(3); }
const out = path.dirname(args[args.indexOf('-o') + 1]);
if (args.includes('--write-comments')) { console.error('COMMENTS WERE REQUESTED'); process.exit(3); }
if (args.includes('--write-info-json')) {
  fs.writeFileSync(path.join(out, 'media.info.json'), JSON.stringify({ title: 'How I built it', channel: 'Source Channel', channel_url: 'https://www.youtube.com/channel/UC' + 'b'.repeat(22),
    view_count: 2500, like_count: 40, comment_count: 7, upload_date: '20260101', language: 'en', automatic_captions: { 'en-orig': [] }, subtitles: {},
    chapters: [{ title: 'Intro', start_time: 0 }, { title: 'The build', start_time: 30 }] }));
  process.exit(0);
}
if (args.includes('--write-auto-subs')) {
  const lang = args[args.indexOf('--sub-langs') + 1];
  fs.writeFileSync(path.join(out, 'media.' + lang + '.json3'), JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: 'Today we build it.' }] }, { tStartMs: 31000, segs: [{ utf8: 'First the frame.' }] }] }));
  process.exit(0);
}
`,
);
await chmod(path.join(bin, 'yt-dlp'), 0o755);

const scene = (title: string, seconds: number, points = [`${title} point one`, `${title} point two`]) => ({ title, talkingPoints: points, show: `Show ${title}`, seconds });
const goodPackage: Package = {
  demand: { level: 'high', note: 'People ask.' },
  gap: { level: 'mid', note: 'Few show it.' },
  show: { level: 'high', note: 'Screen only.' },
  angle: 'The angle',
  twist: 'The twist',
  titles: ['Build it in ten minutes', 'The fast way to build', 'Stop building it slowly'],
  thumbnailText: 'Ten minute build',
  hook: { visual: 'The result', spoken: 'This took ten minutes.', text: '10 MIN' },
};
const goodOutline = { scenes: [scene('Opening', 60), scene('Level 1', 120), scene('Where this falls short', 90), scene('Ending', 45)] };

// The stand-in AI answers by the schema it was given, and remembers every prompt.
const prompts: { title: string; prompt: string }[] = [];
const answers: Record<string, unknown[]> = {};
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  const title = (options.jsonSchema as { title?: string } | undefined)?.title ?? 'text';
  prompts.push({ title, prompt: options.prompt });
  const queued = answers[title]?.shift();
  if (title === 'text') return { text: String(queued ?? '') };
  return { text: JSON.stringify(queued), json: queued };
}

const { clubRouter } = await import('./index.js');
const app = express();
app.use('/api/club', clubRouter({ runAI: fakeAI }));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(() => server.close());

const call = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};

async function finish(jobId: string) {
  for (let i = 0; i < 200; i++) {
    const job = (await call('GET', `/jobs/${jobId}`)).body;
    if (job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('job did not finish');
}

const { formatOutline, parseOutline, scriptSections } = await import('./planning.js');
const { changedSceneNumber, recorderScenes, syncProject } = await import('./recorder.js');
const { chapterize, timedCaptions } = await import('./research.js');

await call('POST', '/workspaces', { name: 'Samin', handle: '@s', topics: ['ai'] });

// ---------------------------------------------------------------- outline.md

test('an outline survives a round trip through outline.md', () => {
  const outline: Outline = { scenes: [scene('Opening: the result (fast)', 75), scene('Level 1', 130, ['One', 'Two', 'Your call: three or four'])] };
  const markdown = formatOutline(outline);
  assert.match(markdown, /### 1\. Opening: the result \(fast\) \(0:00–1:15\)/);
  assert.match(markdown, /### 2\. Level 1 \(1:15–3:25\)\n- One\n- Two\n- Your call: three or four\nShow: Show Level 1/);
  assert.deepEqual(parseOutline(markdown), outline);
});

test("the old board's outlines are read as scenes", async () => {
  const board = await readFile(path.join(import.meta.dirname, 'fixtures/board-samin/videos/hidden-features/outline.md'), 'utf8');
  const { scenes } = parseOutline(board);
  assert.ok(scenes.length >= 3, 'every ### section is a scene');
  assert.equal(scenes[0].title, 'Why this matters');
  assert.equal(scenes[0].seconds, 60);
  assert.match(scenes[0].talkingPoints[0], /^phone channels get huge views/, '"Say:" is dropped');
  assert.match(scenes[0].show, /phone settings page/);
  assert.ok(!scenes.some((s) => s.title === 'Promise' || s.title === 'Title options'), '## sections are not scenes');
});

test('a full script splits into its ## scenes', () => {
  assert.deepEqual(scriptSections('# Title\n\nintro\n\n## One\n\nLine one.\n\n## Two\nLine two.\n### note\nmore'), [
    { heading: 'One', body: 'Line one.' },
    { heading: 'Two', body: 'Line two.\n### note\nmore' },
  ]);
});

// ---------------------------------------------------------------- recorder scenes

const take = (sceneId: string, createdAt: string) => ({ id: `take-${createdAt.replace(/\D/g, '')}`, createdAt, sceneId, media: [], tracks: [], offsets: [] });

test('one recorder scene per outline scene, with the talking points as the script', () => {
  const wanted = recorderScenes({ scenes: [scene('Opening', 60), scene('Ending', 30, ['  Close ', '', 'Point to a video'])] });
  assert.deepEqual(wanted, [
    { name: 'Opening', script: 'Opening point one\nOpening point two', notes: 'Show Opening' },
    { name: 'Ending', script: 'Close\nPoint to a video', notes: 'Show Ending' },
  ]);
  const withScript = recorderScenes({ scenes: [scene('Opening', 60), scene('Ending', 30)], fullScript: '# T\n\n## Opening\n\nHello there.\n\n## Ending\n\nBye.' });
  assert.deepEqual(withScript.map((s) => s.script), ['Hello there.', 'Bye.'], 'a full script replaces the talking points');
  const byTitle = recorderScenes({ scenes: [scene('Opening', 60), scene('Ending', 30)], fullScript: '# T\n\n## Ending\n\nBye.\n\n## Extra\n\nMore.\n\n## opening\n\nHello.' });
  assert.deepEqual(byTitle.map((s) => s.script), ['Hello.', 'Bye.'], 'sections are matched by scene title');
});

test('syncing updates changed scenes, adds new ones and never removes a scene', () => {
  const first = syncProject('My video', undefined, undefined, recorderScenes({ scenes: [scene('A', 10), scene('B', 10)] }), '2026-10-01T00:00:00.000Z');
  assert.equal(first.project.name, 'My video');
  assert.deepEqual(first.project.scenes.map((s) => [s.name, s.start, s.duration]), [['A', 0, 0], ['B', 0, 0]]);
  assert.deepEqual(first.mapping.map((m) => m.sceneId), first.project.scenes.map((s) => s.id));

  const second = syncProject('My video', first.project, first.mapping, recorderScenes({ scenes: [scene('A', 10), scene('B changed', 10), scene('C', 10)] }), '2026-10-02T00:00:00.000Z');
  assert.deepEqual(second.project.scenes.map((s) => s.name), ['A', 'B changed', 'C']);
  assert.equal(second.mapping[0].changedAt, '2026-10-01T00:00:00.000Z', 'an unchanged scene keeps its date');
  assert.equal(second.mapping[1].changedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(second.project.scenes[1].id, first.project.scenes[1].id, 'the same scene is updated in place');

  const third = syncProject('My video', second.project, second.mapping, recorderScenes({ scenes: [scene('A', 10)] }));
  assert.equal(third.project.scenes.length, 3, 'scenes the outline dropped stay in the recorder');
});

test('the changed-scene warning names the first scene recorded before its outline changed', () => {
  const outline = { scenes: [scene('A', 10), scene('B', 10), scene('C', 10)] };
  const { project, mapping } = syncProject('V', undefined, undefined, recorderScenes(outline), '2026-10-01T00:00:00.000Z');
  const [a, b] = project.scenes.map((s) => s.id);
  const recorded: Project = { ...project, recordedTakes: [take(b, '2026-10-01T10:00:00.000Z')] };
  assert.equal(changedSceneNumber(recorded, mapping, recorderScenes(outline)), undefined, 'nothing changed');

  const edited = { scenes: [scene('A', 10, ['new']), scene('B', 10, ['new']), scene('C', 10)] };
  assert.equal(changedSceneNumber(recorded, mapping, recorderScenes(edited)), 2, 'scene A has no takes, so scene 2 is named');

  const synced = syncProject('V', recorded, mapping, recorderScenes(edited), '2026-10-02T00:00:00.000Z');
  assert.equal(changedSceneNumber(synced.project, synced.mapping, recorderScenes(edited)), 2, 'still flagged after Continue updates the scene');
  const again: Project = { ...synced.project, recordedTakes: [...(synced.project.recordedTakes ?? []), take(b, '2026-10-03T00:00:00.000Z'), take(a, '2026-10-01T09:00:00.000Z')] };
  assert.equal(changedSceneNumber(again, synced.mapping, recorderScenes(edited)), 1, 'scene 1 was recorded before its change too');
  const dropped = { scenes: [scene('A', 10)] };
  const onlyB: Project = { ...synced.project, recordedTakes: [take(b, '2026-10-03T00:00:00.000Z')] };
  assert.equal(changedSceneNumber(onlyB, synced.mapping, recorderScenes(dropped)), 2, 'a recorded scene the outline dropped counts as changed');
});

// ---------------------------------------------------------------- research transcripts

test('captions are grouped under the chapters, or in two-minute blocks', () => {
  const lines = timedCaptions(JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: 'a ' }, { utf8: 'b' }] }, { tStartMs: 5000 }, { tStartMs: 130000, segs: [{ utf8: 'c\n' }] }] }));
  assert.deepEqual(lines, [{ start: 0, text: 'a b' }, { start: 130, text: 'c' }]);
  assert.deepEqual(chapterize(lines), [{ title: '', start: 0, text: 'a b' }, { title: '', start: 120, text: 'c' }]);
  assert.deepEqual(chapterize(lines, [{ title: 'Two', start: 100 }, { title: 'One', start: 3 }]), [{ title: 'One', start: 0, text: 'a b' }, { title: 'Two', start: 100, text: 'c' }]);
  assert.deepEqual(timedCaptions('not json'), []);
});

// ---------------------------------------------------------------- through the routes

let video: Video;

test('help lines are remembered per channel once a step is completed', async () => {
  assert.deepEqual((await call('GET', '/settings')).body.helpSeen, []);
  assert.deepEqual((await call('POST', '/settings/help/research')).body.helpSeen, ['research']);
  assert.deepEqual((await call('POST', '/settings/help/research')).body.helpSeen, ['research']);
  assert.equal((await call('POST', '/settings/help/brief')).status, 400);
  await call('POST', '/workspaces', { name: 'Other' });
  await call('POST', '/workspaces/other/current');
  assert.deepEqual((await call('GET', '/settings')).body.helpSeen, [], 'another channel has its own');
  await call('POST', '/workspaces/samin/current');
});

test('a YouTube tile gets its details, outlier chip and transcript without fetching the video or comments', async () => {
  video = (await call('POST', '/videos', { title: 'Build it fast' })).body;
  const tile = (await call('POST', `/videos/${video.id}/research`, { kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' })).body;
  const started = await call('POST', `/videos/${video.id}/research/${tile.id}/read`);
  assert.equal(started.status, 202);
  const again = await call('POST', `/videos/${video.id}/research/${tile.id}/read`);
  if (again.body.status === 'running') assert.equal(again.body.id, started.body.id, 'a running read is reused');
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(job.result.title, 'How I built it');
  assert.deepEqual(job.result.meta, { platform: 'youtube', channel: 'Source Channel', views: 2500, likes: 40, comments: 7, ageDays: job.result.meta.ageDays, thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', multiplier: 2.5, transcript: true });
  assert.deepEqual((await call('GET', `/videos/${video.id}/research/${tile.id}/transcript`)).body, [
    { title: 'Intro', start: 0, text: 'Today we build it.' },
    { title: 'The build', start: 30, text: 'First the frame.' },
  ]);
  const note = (await call('POST', `/videos/${video.id}/research`, { kind: 'note', text: 'Remember the cost' })).body;
  assert.equal((await call('POST', `/videos/${video.id}/research/${note.id}/read`)).status, 400, 'only video tiles are read');
  assert.equal((await call('DELETE', `/videos/${video.id}/research/${tile.id}`)).status, 204);
  assert.deepEqual(await readdir(path.join(process.env.CREATORCLUB_DIR!, 'samin', 'videos', video.id, 'research', 'transcripts')), [], 'the transcript goes with its tile');
});

test('Package it reads the idea and research, and fixes titles that break the rules once', async () => {
  answers.Package = [{ ...goodPackage, titles: ['Is this the fastest way to build it today?', 'B', 'C'] }, goodPackage];
  const started = await call('POST', `/videos/${video.id}/package`);
  assert.equal(started.status, 202);
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.deepEqual(job.result, goodPackage);
  const asked = prompts.filter((p) => p.title === 'Package');
  assert.equal(asked.length, 2, 'asked again once');
  assert.match(asked[0].prompt, /Title: Build it fast/);
  assert.match(asked[0].prompt, /Note: Remember the cost/, 'the research board is in the prompt');
  assert.match(asked[1].prompt, /Title 1 is a question\./);
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body, { package: goodPackage, outline: null });

  const edited = { ...goodPackage, angle: 'My own angle' };
  assert.deepEqual((await call('PUT', `/videos/${video.id}/package`, edited)).body, edited);
  assert.equal((await call('PUT', `/videos/${video.id}/package`, { ...edited, titles: ['one'] })).status, 400);
});

test('Create outline follows the break down it came from and repairs an outline that breaks the rules once', async () => {
  // A video added from a break down: its reusable outline goes into the prompt.
  const breakdownId = 'bd_0123456789ab';
  const dir = path.join(process.env.CREATORCLUB_DIR!, 'samin', 'breakdowns', breakdownId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'breakdown.json'), JSON.stringify({ id: breakdownId, reusableOutline: ['Claim the outcome', 'Show the build', 'Pay it off'], concepts: [] }));
  const fromBreakdown = (await call('POST', '/videos', { title: 'From a breakdown', source: { kind: 'breakdown', breakdownId } })).body as Video;

  answers.Outline = [{ scenes: goodOutline.scenes.slice(0, 2) }, goodOutline];
  const job = await finish((await call('POST', `/videos/${fromBreakdown.id}/outline`)).body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.deepEqual(job.result, goodOutline);
  const asked = prompts.filter((p) => p.title === 'Outline');
  assert.match(asked[0].prompt, /<reusable_outline>\n1\. Claim the outcome\n2\. Show the build\n3\. Pay it off\n<\/reusable_outline>/);
  assert.match(asked[1].prompt, /The outline has 2 scenes, and it needs 4 to 7\./);
  assert.deepEqual((await call('GET', `/videos/${fromBreakdown.id}/plan`)).body.outline, goodOutline);

  answers.Outline = [goodOutline];
  await finish((await call('POST', `/videos/${video.id}/outline`)).body.id);
  assert.doesNotMatch(prompts.filter((p) => p.title === 'Outline').at(-1)!.prompt, /<reusable_outline>/, 'a video added by hand has no shape to follow');
  assert.match(prompts.filter((p) => p.title === 'Outline').at(-1)!.prompt, /Thumbnail text: Ten minute build/, 'the package is in the prompt');
});

test('Write full script instead writes the script and lengthens short scenes once', async () => {
  const sections = goodOutline.scenes.map((s) => `## ${s.title}\n\n${'word '.repeat(s.title === 'Level 1' ? 20 : 400).trim()}`);
  answers.text = [`# Build it in ten minutes\n\n${sections.join('\n\n')}`, 'A much longer Level 1.'];
  const job = await finish((await call('POST', `/videos/${video.id}/script`)).body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  const script = job.result.fullScript as string;
  assert.match(script, /^# Build it in ten minutes\n\n## Opening/);
  assert.match(script, /## Level 1\n\nA much longer Level 1\.\n\n## Where this falls short/);
  assert.equal(prompts.filter((p) => p.title === 'text').length, 2, 'only the short scene was lengthened');

  const back = await call('PUT', `/videos/${video.id}/script`, { script: null });
  assert.equal(back.body.outline.fullScript, undefined, 'back to talking points');
  const files = await readdir(path.join(process.env.CREATORCLUB_DIR!, 'samin', 'videos', video.id));
  assert.ok(files.some((name) => /^script-unused-.*\.md$/.test(name)), 'the script is set aside, not removed');
});

test('Continue to recording creates the recording project and moves the video to Recording', async () => {
  const edited = { scenes: [...goodOutline.scenes.slice(0, 3), scene('Ending', 45, ['Point to the next video', 'Say goodbye'])] };
  assert.deepEqual((await call('PUT', `/videos/${video.id}/outline`, edited)).body, edited);
  assert.equal((await call('PUT', `/videos/${video.id}/outline`, { scenes: [] })).status, 400);

  const moved = await call('POST', `/videos/${video.id}/recorder`);
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const saved = moved.body as Video;
  assert.equal(saved.stage, 'recording');
  assert.ok(saved.stageDates.recording);
  assert.deepEqual(saved.planning, { research: false, package: false, outline: true });
  const project = JSON.parse(await readFile(path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${saved.recorderProjectId}.json`), 'utf8')) as Project;
  assert.equal(project.name, 'Build it fast');
  assert.deepEqual(project.scenes.map((s) => ({ name: s.name, script: s.script, notes: s.notes })), [
    { name: 'Opening', script: 'Opening point one\nOpening point two', notes: 'Show Opening' },
    { name: 'Level 1', script: 'Level 1 point one\nLevel 1 point two', notes: 'Show Level 1' },
    { name: 'Where this falls short', script: 'Where this falls short point one\nWhere this falls short point two', notes: 'Show Where this falls short' },
    { name: 'Ending', script: 'Point to the next video\nSay goodbye', notes: 'Show Ending' },
  ]);
  assert.deepEqual(saved.recorderScenes!.map((s) => s.sceneId), project.scenes.map((s) => s.id));

  // Record a take of scene 2, then change its outline: the plan names scene 2, and Continue updates the same project.
  project.recordedTakes = [{ id: 'take1', createdAt: new Date().toISOString(), sceneId: project.scenes[1].id, media: [{ id: 'm1', name: 'cam', path: '/tmp/cam.mov', kind: 'video', duration: 3, width: 10, height: 10 }], tracks: ['camera'], offsets: [0] }];
  await writeFile(path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${saved.recorderProjectId}.json`), JSON.stringify(project));
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, undefined);
  await call('PUT', `/videos/${video.id}/outline`, { scenes: edited.scenes.map((s, i) => (i === 1 ? { ...s, talkingPoints: ['A new point'] } : s)) });
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, 2);
  const again = (await call('POST', `/videos/${video.id}/recorder`)).body as Video;
  assert.equal(again.recorderProjectId, saved.recorderProjectId, 'the same project is kept');
  const updated = JSON.parse(await readFile(path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${saved.recorderProjectId}.json`), 'utf8')) as Project;
  assert.equal(updated.scenes[1].script, 'A new point');
  assert.equal(updated.recordedTakes?.length, 1, 'the take is kept');
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, 2, 'still recorded before the change');
});

test('a video further along is not moved back, and Continue needs an outline', async () => {
  const later = (await call('POST', '/videos', { title: 'Later', stage: 'editing' })).body as Video;
  assert.equal((await call('POST', `/videos/${later.id}/recorder`)).body.error, 'Create the outline first.');
  await call('PUT', `/videos/${later.id}/outline`, goodOutline);
  const result = (await call('POST', `/videos/${later.id}/recorder`)).body as Video;
  assert.equal(result.stage, 'editing');
  assert.ok(result.recorderProjectId);
  assert.equal((await call('POST', `/videos/${later.id}/script`)).status, 202);
  const fresh = (await call('POST', '/videos', { title: 'Fresh' })).body as Video;
  assert.equal((await call('POST', `/videos/${fresh.id}/script`)).body.error, 'Create the outline first.');
});
