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
// While `gate` is set, answers wait for it; Stop (an aborted signal) ends the wait the way the real CLI is killed.
let gate: Promise<void> | undefined;
const aborted: string[] = [];
const { AiError } = await import('./ai.js');
async function fakeAI(options: RunAIOptions): Promise<RunAIResult> {
  const title = (options.jsonSchema as { title?: string } | undefined)?.title ?? 'text';
  prompts.push({ title, prompt: options.prompt });
  if (gate)
    await Promise.race([
      gate,
      new Promise((_, reject) => options.signal?.addEventListener('abort', () => (aborted.push(title), reject(new AiError('cancelled', 'That was stopped.'))), { once: true })),
    ]);
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

const { adoptSceneIds, formatOutline, packageFromOldOutline, parseOutline, scriptSections, takeDecisions, withScript } = await import('./planning.js');
const { changedSceneNumber, recorderScenes, syncProject } = await import('./recorder.js');
const { chapterize, timedCaptions } = await import('./research.js');
const { validateScenes } = await import('../../src/recording-scenes.js');

await call('POST', '/workspaces', { name: 'Samin', handle: '@s', topics: ['ai'] });

// ---------------------------------------------------------------- outline.md

/** Scenes with ids, as a saved outline has them. */
const ided = (...scenes: ReturnType<typeof scene>[]) => ({ scenes: scenes.map((each) => ({ id: `id-${each.title.toLowerCase().replace(/\W+/g, '-')}`, ...each })) });

test('an outline survives a round trip through outline.md, scene ids included', () => {
  const outline: Outline = ided(scene('Opening: the result (fast)', 75), scene('Level 1', 130, ['One', 'Two', 'Your call: three or four']));
  const markdown = formatOutline(outline);
  assert.match(markdown, /### 1\. Opening: the result \(fast\) \(0:00–1:15\) <!-- id:id-opening-the-result-fast- -->/);
  assert.match(markdown, /### 2\. Level 1 \(1:15–3:25\) <!-- id:id-level-1 -->\n- One\n- Two\n- Your call: three or four\nShow: Show Level 1/);
  assert.deepEqual(parseOutline(markdown), outline);
  assert.deepEqual(parseOutline(formatOutline({ scenes: [scene('No id', 10)] })).scenes[0].id, undefined);
});

test('scene ids are kept through edits and reorders, carried over by title on a re-run, and new only for new scenes', () => {
  const previous = ided(scene('A', 10), scene('B', 10), scene('C', 10)).scenes;
  const reordered = adoptSceneIds([previous[2], { ...previous[0], title: 'A renamed' }, scene('New', 10)], previous);
  assert.deepEqual(reordered.slice(0, 2).map((s) => s.id), ['id-c', 'id-a'], 'kept through a rename and a reorder');
  assert.match(reordered[2].id!, /^s_[0-9a-f]{8}$/, 'a new scene gets a new id');
  const rerun = adoptSceneIds([scene('b', 10), scene('Other', 10), scene('A', 10)], previous);
  assert.deepEqual(rerun.map((s) => s.id === 'id-b' || s.id === 'id-a' ? s.id : 'new'), ['id-b', 'new', 'id-a'], 'an AI re-run keeps the ids of scenes with the same title');
  const dupes = adoptSceneIds([previous[0], previous[0]], previous);
  assert.notEqual(dupes[0].id, dupes[1].id, 'ids never repeat');
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

test("an old outline's [YOUR CALL: …] notes become the scene's To decide list, out of the talking points; saving writes them as To decide lines", async () => {
  const board = await readFile(path.join(import.meta.dirname, 'fixtures/board-samin/videos/hidden-features/outline.md'), 'utf8');
  const { scenes } = parseOutline(board);
  const level1 = scenes.find((scene) => scene.title.startsWith('Level 1'))!;
  assert.deepEqual(level1.decide, [
    "which tool to use. Claude is the default because it's his tool of record. A second tool would widen the audience but splits the proof.",
    "which Level 1 features. Pick those that are in the tool's docs, easy to show, and not obvious. Cut any you can't check.",
  ]);
  for (const scene of scenes) {
    assert.ok(!scene.talkingPoints.some((point) => /YOUR CALL/i.test(point)), `${scene.title}: no marker in what is said`);
    assert.ok(!/YOUR CALL/i.test(scene.show));
  }
  assert.match(level1.talkingPoints.at(-1)!, /smaller than expected\.$/, 'the point the marker followed ends where it did');
  assert.equal(scenes[0].decide, undefined, 'a scene without markers has no list');
  // Saved again, the choices are kept as their own lines and read back the same.
  const again = parseOutline(formatOutline({ scenes }));
  assert.deepEqual(again.scenes.map((scene) => scene.decide), scenes.map((scene) => scene.decide));
  assert.match(formatOutline({ scenes }), /^To decide: which tool to use\./m);
  assert.doesNotMatch(formatOutline({ scenes }), /YOUR CALL/);
});

test('a marker inside a point or a script is taken out, and the words around it stay', () => {
  assert.deepEqual(takeDecisions('Say it plainly. [YOUR CALL: tone] Then move on.'), { text: 'Say it plainly. Then move on.', decide: ['tone'] });
  const scene = { id: 's_1', title: 'Intro', talkingPoints: ['Hello'], show: '', seconds: 30 };
  const outline = withScript([scene], '# T\n\n## Intro\nHi there. [YOUR CALL: name the tool]\n');
  assert.equal(outline.scenes[0].script, 'Hi there.');
  assert.deepEqual(outline.scenes[0].decide, ['name the tool']);
});

const migratedOutline = () => readFile(path.join(import.meta.dirname, 'fixtures/board-samin/videos/idea-1a179c8273f-1/outline.md'), 'utf8');

test("a migrated outline with a ## Points section gives one scene per point, with what to say and what to show, and no notes to the creator", async () => {
  const { scenes } = parseOutline(await migratedOutline());
  assert.deepEqual(scenes.map((s) => s.title), ['Round 1, drop the old habit and see the first difference', 'Round 2, stop redoing work Claude can remember or reuse', 'Round 3, hand over the bigger job']);
  assert.match(scenes[0].show, /^Samin runs the task the old way/);
  assert.ok(!scenes[0].show.includes('CONFIRM'), '[CONFIRM: …] notes are dropped');
  assert.equal(scenes[0].talkingPoints.length, 5, 'Setup, Analogy or example, Framework, Payoff and Transition; Structure is a template');
  assert.ok(scenes.every((s) => s.talkingPoints.every((p) => !/^(Setup|Structure|Framework):/.test(p) && !p.includes('CONFIRM'))));
  assert.deepEqual(parseOutline('## Promise\nSomething.\n').scenes, [], 'no points, no scenes');
});

test("an old outline's promise, title options and recommended hook become a package", async () => {
  const pkg = packageFromOldOutline(await migratedOutline())!;
  assert.deepEqual(pkg.titles, ["Still Using Claude Like It's 2024?", 'Same Task Twice: Old Claude vs New', 'Your Claude Habits Are From 2024']);
  assert.match(pkg.hook.spoken, /^Are you still using Claude the way you did in 2024\?/);
  assert.match(pkg.angle, /^By the end, a non-technical viewer/);
  assert.equal(packageFromOldOutline('## Points\n- Point 1: x\n'), null);
});

test('the package from the real "hidden-features" outline takes the promise, not the planner\'s notes about the brief', async () => {
  const board = await readFile(path.join(import.meta.dirname, 'fixtures/board-samin/videos/hidden-features/outline.md'), 'utf8');
  assert.match(board, /Brief was empty/, 'the sample outline has the notes right after the promise');
  const pkg = packageFromOldOutline(board)!;
  assert.equal(pkg.angle, "By the end, the viewer knows how to find the features in their AI tool they've never used, and has tried three of them, from a one-click setting to a repeatable setup.");
  assert.doesNotMatch(JSON.stringify(pkg), /Brief was/i);
});

test('a full script splits into its ## scenes', () => {
  assert.deepEqual(scriptSections('# Title\n\nintro\n\n## One\n\nLine one.\n\n## Two\nLine two.\n### note\nmore'), [
    { heading: 'One', body: 'Line one.' },
    { heading: 'Two', body: 'Line two.\n### note\nmore' },
  ]);
});

// ---------------------------------------------------------------- recorder scenes

const take = (sceneId: string, createdAt: string) => ({ id: `take-${sceneId.slice(0, 8)}-${createdAt.replace(/\D/g, '')}`, createdAt, sceneId, media: [], tracks: [], offsets: [] });

test('one recorder scene per outline scene, with the talking points as the script', () => {
  const wanted = recorderScenes(ided(scene('Opening', 60), scene('Ending', 30, ['  Close ', '', 'Point to a video'])));
  assert.deepEqual(wanted, [
    { outlineId: 'id-opening', name: 'Opening', script: 'Opening point one\nOpening point two', notes: 'Show Opening' },
    { outlineId: 'id-ending', name: 'Ending', script: 'Close\nPoint to a video', notes: 'Show Ending' },
  ]);
  const withScript = recorderScenes({ ...ided(scene('Opening', 60), scene('Ending', 30)), fullScript: '# T\n\n## Opening\n\nHello there.\n\n## Ending\n\nBye.' });
  assert.deepEqual(withScript.map((s) => s.script), ['Hello there.', 'Bye.'], 'a full script replaces the talking points');
  const byTitle = recorderScenes({ ...ided(scene('Opening', 60), scene('Ending', 30)), fullScript: '# T\n\n## Ending\n\nBye.\n\n## Extra\n\nMore.\n\n## opening\n\nHello.' });
  assert.deepEqual(byTitle.map((s) => s.script), ['Hello.', 'Bye.'], 'sections are matched by scene title');
});

test('syncing updates changed scenes, adds new ones and never removes a scene', () => {
  const first = syncProject('My video', undefined, undefined, recorderScenes(ided(scene('A', 10), scene('B', 10))), '2026-10-01T00:00:00.000Z');
  assert.equal(first.project.name, 'My video');
  assert.deepEqual(first.project.scenes.map((s) => [s.name, s.start, s.duration]), [['A', 0, 0], ['B', 0, 0]]);
  assert.deepEqual(first.mapping.map((m) => [m.outlineId, m.sceneId]), [['id-a', first.project.scenes[0].id], ['id-b', first.project.scenes[1].id]]);

  const changedB = { ...ided(scene('B', 10)).scenes[0], title: 'B changed' };
  const second = syncProject('My video', first.project, first.mapping, recorderScenes({ scenes: [ided(scene('A', 10)).scenes[0], changedB, ided(scene('C', 10)).scenes[0]] }), '2026-10-02T00:00:00.000Z');
  assert.deepEqual(second.project.scenes.map((s) => s.name), ['A', 'B changed', 'C']);
  assert.equal(second.mapping[0].changedAt, '2026-10-01T00:00:00.000Z', 'an unchanged scene keeps its date');
  assert.equal(second.mapping[1].changedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(second.project.scenes[1].id, first.project.scenes[1].id, 'the same scene is updated in place');

  const third = syncProject('My video', second.project, second.mapping, recorderScenes(ided(scene('A', 10))));
  assert.equal(third.project.scenes.length, 3, 'scenes the outline dropped stay in the recorder');
});

test('reordering, inserting and removing scenes after recording keeps every take with its own scene', () => {
  const outline = ided(scene('A', 10), scene('B', 10), scene('C', 10));
  const first = syncProject('V', undefined, undefined, recorderScenes(outline), '2026-10-01T00:00:00.000Z');
  const [a, b, c] = first.project.scenes;
  const recorded: Project = { ...first.project, recordedTakes: [take(a.id, '2026-10-01T10:00:00.000Z'), take(b.id, '2026-10-01T11:00:00.000Z'), take(c.id, '2026-10-01T12:00:00.000Z')] };
  const content = (project: Project) => project.scenes.map((s) => [s.name, s.script.split('\n')[0], (project.recordedTakes ?? []).filter((t) => t.sceneId === s.id).length]);

  // Remove A, put C before B, insert D between them.
  const [, sb, sc] = outline.scenes;
  const edited = { scenes: [sc, ided(scene('D', 10)).scenes[0], sb] };
  const synced = syncProject('V', recorded, first.mapping, recorderScenes(edited), '2026-10-02T00:00:00.000Z');
  assert.deepEqual(content(synced.project), [
    ['A', 'A point one', 1],
    ['B', 'B point one', 1],
    ['C', 'C point one', 1],
    ['D', 'D point one', 0],
  ], 'recorded scenes stay where they are with their own content and takes; the new scene is added at the end');
  assert.deepEqual(synced.project.scenes.slice(0, 3).map((s) => s.id), [a.id, b.id, c.id]);
  assert.equal(changedSceneNumber(synced.project, synced.mapping, recorderScenes(edited)), 1, 'the removed scene is flagged by its place in the recorder');
  assert.ok(synced.mapping.some((m) => m.outlineId === 'id-a'), 'the removed scene stays mapped');

  // A new scene called A: names stay unique, and the old A keeps its name and take.
  const again = { scenes: [...edited.scenes, { ...scene('A', 10), id: 's_newa0000' }] };
  const named = syncProject('V', synced.project, synced.mapping, recorderScenes(again));
  assert.deepEqual(named.project.scenes.map((s) => s.name), ['A', 'B', 'C', 'D', 'A (2)']);
  assert.equal(named.project.scenes[0].id, a.id, 'the recorded A keeps its id and take');
});

test("a sync after real recordings keeps SceneForge's scene timeline valid", () => {
  const outline = ided(scene('A', 10), scene('B', 10), scene('C', 10));
  const first = syncProject('V', undefined, undefined, recorderScenes(outline), '2026-10-01T00:00:00.000Z');
  // Recorded: A runs 0–12 s, B 12–30 s, C 30–41.5 s, as SceneForge leaves them after confirming takes.
  const timed: Project = structuredClone(first.project);
  [[0, 12], [12, 18], [30, 11.5]].forEach(([start, duration], index) => Object.assign(timed.scenes[index], { start, duration }));
  timed.recordedTakes = timed.scenes.map((s, i) => take(s.id, `2026-10-01T1${i}:00:00.000Z`));
  validateScenes(timed);

  // Reorder (C before B), insert D in the middle, remove A, and edit B.
  const [, sb, sc] = outline.scenes;
  const edited = { scenes: [sc, ided(scene('D', 10)).scenes[0], { ...sb, talkingPoints: ['B again'] }] };
  const synced = syncProject('V', timed, first.mapping, recorderScenes(edited), '2026-10-02T00:00:00.000Z');
  assert.doesNotThrow(() => validateScenes(synced.project), 'no overlapping or out-of-order scenes');
  assert.deepEqual(synced.project.scenes.map((s) => [s.name, s.start, s.duration]), [['A', 0, 12], ['B', 12, 18], ['C', 30, 11.5], ['D', 41.5, 0]], 'existing scenes keep their place on the timeline; D starts where the last one ends');
  assert.equal(synced.project.scenes[1].script, 'B again', 'edited in place');
  const later = syncProject('V', synced.project, synced.mapping, recorderScenes({ scenes: [...edited.scenes, ided(scene('E', 10)).scenes[0]] }));
  assert.doesNotThrow(() => validateScenes(later.project));
  assert.deepEqual(later.project.scenes.at(-1)!.start, 41.5);
});

test('the changed-scene warning names the first scene recorded before its outline changed', () => {
  const outline = ided(scene('A', 10), scene('B', 10), scene('C', 10));
  const { project, mapping } = syncProject('V', undefined, undefined, recorderScenes(outline), '2026-10-01T00:00:00.000Z');
  const [a, b] = project.scenes.map((s) => s.id);
  const recorded: Project = { ...project, recordedTakes: [take(b, '2026-10-01T10:00:00.000Z')] };
  assert.equal(changedSceneNumber(recorded, mapping, recorderScenes(outline)), undefined, 'nothing changed');

  const edited = { scenes: outline.scenes.map((s, i) => (i < 2 ? { ...s, talkingPoints: ['new'] } : s)) };
  assert.equal(changedSceneNumber(recorded, mapping, recorderScenes(edited)), 2, 'scene A has no takes, so scene 2 is named');

  const synced = syncProject('V', recorded, mapping, recorderScenes(edited), '2026-10-02T00:00:00.000Z');
  assert.equal(changedSceneNumber(synced.project, synced.mapping, recorderScenes(edited)), 2, 'still flagged after Continue updates the scene');
  const again: Project = { ...synced.project, recordedTakes: [...(synced.project.recordedTakes ?? []), take(b, '2026-10-03T00:00:00.000Z'), take(a, '2026-10-01T09:00:00.000Z')] };
  assert.equal(changedSceneNumber(again, synced.mapping, recorderScenes(edited)), 1, 'scene 1 was recorded before its change too');
  const dropped = { scenes: [edited.scenes[0]] };
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

const noIds = (outline: { scenes: { id?: string }[] } | null | undefined) => outline && { ...outline, scenes: outline.scenes.map(({ id: _id, ...rest }) => rest) };
const videoFiles = () => readdir(path.join(process.env.CREATORCLUB_DIR!, 'samin', 'videos', video.id));
const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(check(), 'timed out');
};

test('Package it reads the idea and research, and fixes titles that break the rules once', async () => {
  answers.Package = [{ ...goodPackage, titles: ['Is this the fastest way to build it today?', 'B', 'C'] }, goodPackage];
  const started = await call('POST', `/videos/${video.id}/package`);
  assert.equal(started.status, 202);
  const job = await finish(started.body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.deepEqual(job.result, { value: goodPackage }, 'nothing was replaced the first time');
  const asked = prompts.filter((p) => p.title === 'Package');
  assert.equal(asked.length, 2, 'asked again once');
  assert.match(asked[0].prompt, /Title: Build it fast/);
  assert.match(asked[0].prompt, /Note: Remember the cost/, 'the research board is in the prompt');
  assert.match(asked[1].prompt, /Title 1 is a question\./);
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body, { package: goodPackage, outline: null, running: {}, ready: {} });

  const edited = { ...goodPackage, angle: 'My own angle' };
  assert.deepEqual((await call('PUT', `/videos/${video.id}/package`, edited)).body, edited);
  assert.equal((await call('PUT', `/videos/${video.id}/package`, { ...edited, titles: ['one'] })).status, 400);
});

test('PUT /package changes only the fields it is sent, so a page that is behind cannot put back what it did not edit', async () => {
  const fresh = (await call('POST', '/videos', { title: 'Patched' })).body as Video;
  await call('PUT', `/videos/${fresh.id}/package`, goodPackage);
  await call('POST', `/videos/${fresh.id}/package/text`, { kind: 'hook', text: 'A hook from the board.' });
  const edited = (await call('PUT', `/videos/${fresh.id}/package`, { angle: 'My angle' })).body as Package;
  assert.equal(edited.angle, 'My angle');
  assert.equal(edited.hook.spoken, 'A hook from the board.', 'the hook the page never saw stays');
  assert.deepEqual((await call('PUT', `/videos/${fresh.id}/package`, { hook: { text: 'NEW' } })).body.hook, { visual: 'The result', spoken: 'A hook from the board.', text: 'NEW' });
  assert.deepEqual((await call('PUT', `/videos/${fresh.id}/package`, { titles: [null, 'Second', null] })).body.titles, [goodPackage.titles[0], 'Second', goodPackage.titles[2]], 'a title slot sent as null stays');
  assert.equal((await call('PUT', `/videos/${fresh.id}/package`, { surprise: 1 })).status, 400);
  assert.equal((await call('PUT', `/videos/${fresh.id}/package`, { titles: ['only one'] })).status, 400);
  assert.deepEqual((await call('PUT', `/videos/${fresh.id}/package`, goodPackage)).body, goodPackage, 'a whole package still replaces it (Undo)');
});

test('an empty package starts from the idea (angle, twist, hook, ratings), filling only empty places, with no AI call', async () => {
  const store = await import('./store.js');
  const slug = (await store.currentWorkspace())!;
  const fresh = (await call('POST', '/videos', { title: 'From an idea' })).body as Video;
  await store.updateVideo(slug, fresh.id, { idea: { angle: 'The idea angle', twist: 'The idea twist', hook: 'Watch what happens when…', demand: { level: 'high', note: 'Asked a lot' }, gap: { level: 'mid', note: 'Some' } } });
  const before = prompts.length;
  const read = (await call('GET', `/videos/${fresh.id}/plan`)).body.package as Package;
  assert.equal(prompts.length, before, 'no model is called');
  assert.deepEqual([read.angle, read.twist, read.hook.spoken, read.demand?.level, read.gap?.level, read.show], ['The idea angle', 'The idea twist', 'Watch what happens when…', 'high', 'mid', undefined]);
  await call('PUT', `/videos/${fresh.id}/package`, { angle: 'Mine' });
  await store.updateVideo(slug, fresh.id, { idea: { angle: 'Changed later', twist: 'T2' } });
  const again = (await call('GET', `/videos/${fresh.id}/plan`)).body.package as Package;
  assert.deepEqual([again.angle, again.twist], ['Mine', 'The idea twist'], 'a package with words in it is not touched again');
  // Cleared on purpose: the package exists, so it is not started again from the idea.
  await call('PUT', `/videos/${fresh.id}/package`, { angle: '', twist: '', hook: { spoken: '' }, demand: undefined });
  await store.updateVideo(slug, fresh.id, { idea: { angle: 'Back again', twist: 'Again', hook: 'Again' } });
  const cleared = (await call('GET', `/videos/${fresh.id}/plan`)).body.package as Package;
  assert.deepEqual([cleared.angle, cleared.twist, cleared.hook.spoken], ['', '', ''], 'what the person emptied stays empty');
});

test('running Package it again fills only what is empty on the server, keeps the hand edits, and Undo brings the earlier package back', async () => {
  const fresh = { ...goodPackage, angle: 'A fresh angle', twist: 'A fresh twist', titles: ['Fresh one', 'Fresh two', 'Fresh three'] as [string, string, string] };
  await call('PUT', `/videos/${video.id}/package`, { ...goodPackage, angle: 'My own angle', twist: '', titles: ['My title', '', 'C'] });
  answers.Package = [fresh];
  const job = await finish((await call('POST', `/videos/${video.id}/package`)).body.id);
  const merged = { ...goodPackage, angle: 'My own angle', twist: 'A fresh twist', titles: ['My title', 'Fresh two', 'C'] };
  assert.deepEqual(job.result.value, merged, 'what the person wrote stays; empty places take the run');
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.package, merged, 'and that is what is saved: no second save by the page');
  assert.match(job.result.replaced, /^\d{4}-\d{2}-\d{2}T/, 'the earlier package was set aside');
  assert.ok((await videoFiles()).includes(`package-earlier-${job.result.replaced}.json`));
  const undone = await call('POST', `/videos/${video.id}/package/undo`, { token: job.result.replaced });
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.equal(undone.body.package.angle, 'My own angle');
  assert.deepEqual(undone.body.package.titles, ['My title', '', 'C'], 'the package as it was before the run');
  assert.ok((await videoFiles()).some((name) => /^package-undone-.*\.json$/.test(name)), 'the replacing version is kept too');
  assert.equal((await call('POST', `/videos/${video.id}/package/undo`, { token: job.result.replaced })).status, 404, 'an undo happens once');
  assert.equal((await call('POST', `/videos/${video.id}/package/undo`, { token: '../../x' })).status, 404);
});

test('Write titles again with a group to replace takes the whole group, and nothing else that was written', async () => {
  const fresh = { ...goodPackage, angle: 'Ignored angle', titles: ['R1', 'R2', 'R3'] as [string, string, string] };
  await call('PUT', `/videos/${video.id}/package`, { ...goodPackage, angle: 'Kept angle', titles: ['A', 'B', 'C'] });
  answers.Package = [fresh];
  assert.equal((await call('POST', `/videos/${video.id}/package`, { replace: 'nope' })).status, 400);
  const job = await finish((await call('POST', `/videos/${video.id}/package`, { replace: 'titles' })).body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.deepEqual(job.result.value.titles, ['R1', 'R2', 'R3']);
  assert.equal(job.result.value.angle, 'Kept angle');
  assert.deepEqual(job.result.value.hook, goodPackage.hook);
  // The thumbnail text is a group of its own (Plan's "Write thumbnail text again").
  answers.Package = [{ ...goodPackage, thumbnailText: 'NEW WORDS', titles: ['X1', 'X2', 'X3'] as [string, string, string] }];
  const thumb = await finish((await call('POST', `/videos/${video.id}/package`, { replace: 'thumbnail' })).body.id);
  assert.equal(thumb.status, 'done', JSON.stringify(thumb));
  assert.equal(thumb.result.value.thumbnailText, 'NEW WORDS');
  assert.deepEqual(thumb.result.value.titles, ['R1', 'R2', 'R3'], 'the titles stay');
  await call('PUT', `/videos/${video.id}/package`, { ...goodPackage, angle: 'My own angle' });
});

test('the video\'s planning flags follow what exists: package once it has a title and a spoken hook, outline once it has scenes', async () => {
  const flags = async () => ((await call('GET', `/videos/${video.id}`)).body as Video).planning;
  const fresh = (await call('POST', '/videos', { title: 'Flags' })).body as Video;
  const get = async () => ((await call('GET', `/videos/${fresh.id}`)).body as Video).planning;
  assert.deepEqual(await get(), { research: false, package: false, outline: false });
  await call('PUT', `/videos/${fresh.id}/package`, { ...goodPackage, titles: ['', '', ''] });
  assert.equal((await get()).package, false, 'no title yet');
  await call('PUT', `/videos/${fresh.id}/package`, { ...goodPackage, hook: { visual: '', spoken: '', text: '' } });
  assert.equal((await get()).package, false, 'no spoken hook yet');
  await call('PUT', `/videos/${fresh.id}/package`, goodPackage);
  assert.equal((await get()).package, true);
  await call('PUT', `/videos/${fresh.id}/outline`, { scenes: [scene('Opening', 60)] });
  assert.deepEqual(await get(), { research: false, package: true, outline: true });
  await call('DELETE', `/videos/${fresh.id}/package`);
  assert.deepEqual(await get(), { research: false, package: false, outline: true });
  assert.ok(await flags(), 'the other video is untouched');
});

test('a video keeps its target length: set by PUT, validated, cleared with null', async () => {
  const set = await call('PUT', `/videos/${video.id}`, { targetSeconds: 600 });
  assert.equal(set.body.targetSeconds, 600);
  assert.equal(((await call('GET', `/videos/${video.id}`)).body as Video).targetSeconds, 600);
  for (const bad of [0, 59, 36001, 90.5, '10']) assert.equal((await call('PUT', `/videos/${video.id}`, { targetSeconds: bad })).status, 400, String(bad));
  assert.equal('targetSeconds' in (await call('PUT', `/videos/${video.id}`, { targetSeconds: null })).body, false);
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
  assert.deepEqual(noIds(job.result.value), goodOutline);
  assert.ok(job.result.value.scenes.every((s: { id?: string }) => /^s_[0-9a-f]{8}$/.test(s.id ?? '')), 'every scene gets an id');
  const asked = prompts.filter((p) => p.title === 'Outline');
  assert.match(asked[0].prompt, /<reusable_outline>\n1\. Claim the outcome\n2\. Show the build\n3\. Pay it off\n<\/reusable_outline>/);
  assert.match(asked[1].prompt, /The outline has 2 scenes, and it needs 4 to 7\./);
  assert.deepEqual((await call('GET', `/videos/${fromBreakdown.id}/plan`)).body.outline, job.result.value);

  answers.Outline = [goodOutline];
  await finish((await call('POST', `/videos/${video.id}/outline`)).body.id);
  assert.doesNotMatch(prompts.filter((p) => p.title === 'Outline').at(-1)!.prompt, /<reusable_outline>/, 'a video added by hand has no shape to follow');
  assert.match(prompts.filter((p) => p.title === 'Outline').at(-1)!.prompt, /Thumbnail text: My own angle|Angle: My own angle/, 'the package is in the prompt');
});

test('running Create outline again keeps the ids of same-titled scenes, and Undo restores the edited outline', async () => {
  const current = (await call('GET', `/videos/${video.id}/plan`)).body.outline as Outline;
  const edited = { scenes: current.scenes.map((s, i) => (i === 0 ? { ...s, talkingPoints: ['My own opening'] } : s)) };
  await call('PUT', `/videos/${video.id}/outline`, edited);
  answers.Outline = [{ scenes: [scene('Opening', 60, ['AI opening']), scene('Something new', 120), scene('Where this falls short', 90), scene('Ending', 45)] }];
  const job = await finish((await call('POST', `/videos/${video.id}/outline`)).body.id);
  const ids = job.result.value.scenes.map((s: { id: string }) => s.id);
  assert.equal(ids[0], current.scenes[0].id, 'Opening keeps its id');
  assert.notEqual(ids[1], current.scenes[1].id, 'a new scene gets a new id');
  assert.equal(ids[3], current.scenes[3].id);
  assert.ok(job.result.replaced);
  const undone = await call('POST', `/videos/${video.id}/outline/undo`, { token: job.result.replaced });
  assert.deepEqual(undone.body.outline.scenes[0].talkingPoints, ['My own opening'], 'the hand edits are back');
  assert.deepEqual(undone.body.outline.scenes.map((s: { id: string }) => s.id), current.scenes.map((s) => s.id));
});

test('a step runs once at a time per video, can be stopped, and a page opened mid-run finds it', async () => {
  let release!: () => void;
  gate = new Promise((resolve) => (release = resolve));
  answers.Outline = [goodOutline];
  const earlier = prompts.length;
  const first = await call('POST', `/videos/${video.id}/outline`);
  const second = await call('POST', `/videos/${video.id}/outline`);
  assert.equal(second.body.id, first.body.id, 'a second start gets the running job');
  await waitFor(() => prompts.length > earlier);
  const asked = prompts.length;
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.running, { outline: first.body.id }, 'the page re-attaches to it');
  const before = await readFile(path.join(process.env.CREATORCLUB_DIR!, 'samin', 'videos', video.id, 'outline.md'), 'utf8');

  const stopped = await call('DELETE', `/jobs/${first.body.id}`);
  assert.equal(stopped.body.status, 'cancelled');
  await waitFor(() => aborted.includes('Outline'));
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.running, {});
  assert.equal(await readFile(path.join(process.env.CREATORCLUB_DIR!, 'samin', 'videos', video.id, 'outline.md'), 'utf8'), before, 'a stopped run writes nothing');
  assert.equal(prompts.length, asked, 'nothing more was asked');
  assert.equal(prompts.length, earlier + 1, 'two clicks, one paid run');
  const third = await call('POST', `/videos/${video.id}/outline`);
  assert.notEqual(third.body.id, first.body.id, 'after a stop a new run can start');
  release();
  gate = undefined;
  assert.equal((await finish(third.body.id)).status, 'done');
});

test('a result that finishes after the step was edited is held, and Use it takes it', async () => {
  let release!: () => void;
  gate = new Promise((resolve) => (release = resolve));
  const late = { scenes: [scene('Late opening', 60), scene('Level 1', 120), scene('Where this falls short', 90), scene('Ending', 45)] };
  answers.Outline = [late];
  const job = await call('POST', `/videos/${video.id}/outline`);
  await waitFor(() => prompts.at(-1)?.title === 'Outline');
  const current = (await call('GET', `/videos/${video.id}/plan`)).body.outline as Outline;
  const mine = { scenes: current.scenes.map((s, i) => (i === 0 ? { ...s, title: 'Edited while it ran' } : s)) };
  await call('PUT', `/videos/${video.id}/outline`, mine);
  release();
  gate = undefined;
  const done = await finish(job.body.id);
  assert.match(done.result.held, /^\d{4}-/, 'held, not written');
  assert.equal(done.result.replaced, undefined);
  const plan = (await call('GET', `/videos/${video.id}/plan`)).body;
  assert.equal(plan.outline.scenes[0].title, 'Edited while it ran', 'the edit is not overwritten');
  assert.deepEqual(plan.ready, { outline: done.result.held }, 'a page opened later still offers it');

  const used = await call('POST', `/videos/${video.id}/outline/use`, { token: done.result.held });
  assert.equal(used.body.outline.scenes[0].title, 'Late opening');
  assert.equal(used.body.outline.scenes[1].id, current.scenes[1].id, 'same-titled scenes keep their ids');
  assert.deepEqual((await call('GET', `/videos/${video.id}/plan`)).body.ready, {}, 'used once');
  assert.ok((await videoFiles()).some((name) => /^outline-earlier-.*\.md$/.test(name)), 'the edited outline is set aside');
});

test('Write full script instead writes the script and lengthens short scenes once', async () => {
  await call('PUT', `/videos/${video.id}/outline`, goodOutline);
  const textBefore = prompts.filter((p) => p.title === 'text').length;
  const sections = goodOutline.scenes.map((s) => `## ${s.title}\n\n${'word '.repeat(s.title === 'Level 1' ? 20 : 400).trim()}`);
  answers.text = [`# Build it in ten minutes\n\n${sections.join('\n\n')}`, '## Level 1\nA much longer Level 1.'];
  const job = await finish((await call('POST', `/videos/${video.id}/script`)).body.id);
  assert.equal(job.status, 'done', JSON.stringify(job));
  const script = job.result.value.fullScript as string;
  assert.match(script, /^# Build it in ten minutes\n\n## Opening/);
  assert.match(script, /## Level 1\n\nA much longer Level 1\.\n\n## Where this falls short/, 'a heading in the lengthened part is dropped');
  assert.equal(prompts.filter((p) => p.title === 'text').length - textBefore, 2, 'only the short scene was lengthened');

  const back = await call('PUT', `/videos/${video.id}/script`, { script: null });
  assert.equal(back.body.outline.fullScript, undefined, 'back to talking points');
  assert.ok((await videoFiles()).some((name) => /^script-unused-.*\.md$/.test(name)), 'the script is set aside, not removed');
});

test('Continue to recording creates the recording project and moves the video to Recording', async () => {
  const current = (await call('GET', `/videos/${video.id}/plan`)).body.outline as Outline;
  const edited = { scenes: [...current.scenes.slice(0, 3), { ...current.scenes[3], talkingPoints: ['Point to the next video', 'Say goodbye'] }] };
  assert.deepEqual((await call('PUT', `/videos/${video.id}/outline`, edited)).body, edited);
  assert.equal((await call('PUT', `/videos/${video.id}/outline`, { scenes: [] })).status, 400);

  const moved = await call('POST', `/videos/${video.id}/recorder`);
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const saved = moved.body as Video;
  assert.equal(saved.stage, 'recording');
  assert.ok(saved.stageDates.recording);
  assert.deepEqual(saved.planning, { research: false, package: true, outline: true }, 'the package was written earlier in this file');
  const projectFile = path.join(process.env.SCENEFORGE_DATA_DIR!, 'projects', `${saved.recorderProjectId}.json`);
  const project = JSON.parse(await readFile(projectFile, 'utf8')) as Project;
  assert.equal(project.name, 'Build it fast');
  assert.deepEqual(project.scenes.map((s) => ({ name: s.name, script: s.script, notes: s.notes })), [
    { name: 'Opening', script: 'Opening point one\nOpening point two', notes: 'Show Opening' },
    { name: 'Level 1', script: 'Level 1 point one\nLevel 1 point two', notes: 'Show Level 1' },
    { name: 'Where this falls short', script: 'Where this falls short point one\nWhere this falls short point two', notes: 'Show Where this falls short' },
    { name: 'Ending', script: 'Point to the next video\nSay goodbye', notes: 'Show Ending' },
  ]);
  assert.deepEqual(saved.recorderScenes!.map((s) => [s.outlineId, s.sceneId]), edited.scenes.map((s, i) => [s.id, project.scenes[i].id]));

  // Record a take of Level 1, then move it to the end and change it: the plan names it, and Continue keeps its take with it.
  project.recordedTakes = [{ id: 'take1', createdAt: new Date().toISOString(), sceneId: project.scenes[1].id, media: [{ id: 'm1', name: 'cam', path: '/tmp/cam.mov', kind: 'video', duration: 3, width: 10, height: 10 }], tracks: ['camera'], offsets: [0] }];
  await writeFile(projectFile, JSON.stringify(project));
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, undefined);
  const [opening, level1, short, ending] = edited.scenes;
  await call('PUT', `/videos/${video.id}/outline`, { scenes: [opening, short, ending, { ...level1, talkingPoints: ['A new point'] }] });
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, 2, 'named by its place in the recorder');
  const again = (await call('POST', `/videos/${video.id}/recorder`)).body as Video;
  assert.equal(again.recorderProjectId, saved.recorderProjectId, 'the same project is kept');
  const updated = JSON.parse(await readFile(projectFile, 'utf8')) as Project;
  assert.deepEqual(updated.scenes.map((s) => s.name), ['Opening', 'Level 1', 'Where this falls short', 'Ending'], 'recorder scenes are never moved');
  assert.equal(updated.scenes[1].id, project.scenes[1].id, 'the recorded scene keeps its take');
  assert.equal(updated.scenes[1].script, 'A new point');
  assert.equal(updated.recordedTakes?.length, 1, 'the take is kept');
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, 2, 'still recorded before the change');

  // Mapping entries saved before scenes had ids are matched by place: a recorded, unchanged scene is not flagged.
  const latest = (await call('GET', `/videos/${video.id}/plan`)).body.outline as Outline;
  const order = latest.scenes.map((s) => s.id);
  const oldStyle = order.map((outlineId) => {
    const entry = (again.recorderScenes ?? []).find((m) => m.outlineId === outlineId)!;
    return { sceneId: entry.sceneId, text: entry.text, changedAt: '2000-01-01T00:00:00.000Z' };
  });
  const videoFile = path.join(process.env.CREATORCLUB_DIR!, 'samin', 'videos', video.id, 'video.json');
  const stored = JSON.parse(await readFile(videoFile, 'utf8')) as Video;
  await writeFile(videoFile, JSON.stringify({ ...stored, recorderScenes: oldStyle }));
  assert.equal((await call('GET', `/videos/${video.id}/plan`)).body.changedScene, undefined, 'old entries are not all flagged');
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
