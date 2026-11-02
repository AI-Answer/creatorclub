import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject, defaultEffects, defaultTransform, type Project } from '../../shared/types.js';
import type { RunAIOptions, RunAIResult } from './ai.js';

/* A skill run on Edit, with a stand-in for Claude: what it is told and allowed, and what comes back as a card. Nothing touches real data. */

const temp = await mkdtemp(path.join(os.tmpdir(), 'creatorclub-skillrun-'));
process.env.CREATORCLUB_DIR = path.join(temp, 'root');
process.env.SCENEFORGE_DATA_DIR = path.join(temp, 'sceneforge');
after(() => rm(temp, { recursive: true, force: true }));
const { runMakingSkill, skillBrief, skillFolder, SKILL_RUN_BUDGET_USD } = await import('./skill-run.js');

const home = path.join(temp, 'home');
await mkdir(path.join(home, '.claude', 'skills', 'motion-graphics'), { recursive: true });
await writeFile(path.join(home, '.claude', 'skills', 'motion-graphics', 'SKILL.md'), '---\nname: motion-graphics\n---\nMake an animation.');

function project(): Project {
  const p = createProject('Test');
  p.clips.push({ id: 'c1', mediaId: 'm1', name: 'Camera', track: 'camera', start: 0, sourceIn: 0, sourceOut: 30, speed: 1, gain: 1, muted: false, transform: defaultTransform(), effects: defaultEffects() });
  p.captions.push({ id: 'k1', start: 11, end: 13, text: '710K views from one channel' }, { id: 'k2', start: 20, end: 22, text: 'later words' });
  p.markers = [{ id: 'n1', time: 12, name: 'make this number pop' }];
  return p;
}

/** A stand-in that writes what a skill would leave in its folder, and records how it was called. */
const fake = (write: (dir: string) => Promise<void>, calls: RunAIOptions[] = []) => async (options: RunAIOptions): Promise<RunAIResult> => {
  calls.push(options);
  await write(options.agent!.cwd);
  options.onEvent?.({ type: 'tool', name: 'Bash' });
  return { text: 'Made an animated stat.' };
};

test('the skill is told the stretch, what is said there and the notes on it',() => {
  const brief = skillBrief(project(), 10, 15, '/motion-graphics make the number pop');
  assert.match(brief, /0:10 to 0:15/);
  assert.match(brief, /0:11 710K views from one channel/);
  assert.match(brief, /0:12 make this number pop/);
  assert.doesNotMatch(brief, /later words/, 'only what is said in the stretch');
});

test('only an installed skill with a SKILL.md runs, by a plain name', async () => {
  assert.ok(await skillFolder('motion-graphics', home));
  assert.equal(await skillFolder('nope', home), undefined);
  assert.equal(await skillFolder('../escape', home), undefined);
});

test('the run works in its own folder of the video, with its tools and the skill folder, under a spending cap', async () => {
  const calls: RunAIOptions[] = [];
  const steps: string[] = [];
  const done = await runMakingSkill({ slug: 'samin', id: 'v1', skill: 'motion-graphics', request: 'make it pop', project: project(), from: 10, to: 15, home, onStep: (s) => steps.push(s),
    runAI: fake(async (dir) => writeFile(path.join(dir, 'result.json'), JSON.stringify({ text: 'This skill makes reels, not overlays.' })), calls) });
  const call = calls[0];
  assert.ok(call.agent!.cwd.includes(path.join('videos', 'v1', 'skill-runs')), 'inside this video\'s folder');
  assert.ok(call.agent!.dirs.some((dir) => dir.endsWith(path.join('.claude', 'skills'))), 'the skills folder, so a skill can read its siblings');
  assert.deepEqual(call.agent!.tools, ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent']);
  assert.equal(call.budgetUsd, SKILL_RUN_BUDGET_USD);
  assert.deepEqual(steps, ['Running the skill']);
  assert.deepEqual(done, { text: 'This skill makes reels, not overlays.' }, 'no file: the reason, and no card');
});

test('a file outside the run\'s out folder is never placed', async () => {
  const done = await runMakingSkill({ slug: 'samin', id: 'v1', skill: 'motion-graphics', request: '', project: project(), from: 10, to: 15, home,
    runAI: fake(async (dir) => writeFile(path.join(dir, 'result.json'), JSON.stringify({ file: '../../../../etc/hosts', title: 'x' }))) });
  assert.equal(done.action, undefined);
  assert.match(done.text, /not one it made in its folder/);
});

test('what the skill made comes back as an add_clip card at the stretch', async () => {
  const done = await runMakingSkill({ slug: 'samin', id: 'v1', skill: 'motion-graphics', request: '', project: project(), from: 10, to: 15, home,
    runAI: fake(async (dir) => {
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x36', '-frames:v', '1', path.join(dir, 'out', 'stat.png')]);
      await writeFile(path.join(dir, 'result.json'), JSON.stringify({ file: 'out/stat.png', title: 'Animated stat', duration: 4 }));
    }) });
  assert.equal(done.action?.type, 'add_clip');
  assert.equal(done.action?.title, 'Animated stat');
  assert.equal(done.action?.start, 10, 'it starts where the stretch starts');
  assert.equal(done.action?.duration, 4);
  assert.equal(done.action?.media.kind, 'image');
});

test('a ProRes .mov becomes a WebM the editor can play, keeping its see-through background', async () => {
  const done = await runMakingSkill({ slug: 'samin', id: 'v1', skill: 'motion-graphics', request: '', project: project(), from: 10, to: 12, home,
    runAI: fake(async (dir) => {
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red@0.5:s=64x36:d=1,format=yuva444p10le', '-c:v', 'prores_ks', '-profile:v', '4444', path.join(dir, 'out', 'stat.mov')]);
      await writeFile(path.join(dir, 'result.json'), JSON.stringify({ file: 'out/stat.mov', title: 'Stat' }));
    }) });
  assert.match(done.action!.media.path, /stat\.webm$/);
  const pix = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_tags=alpha_mode', '-of', 'default=nw=1:nk=1', done.action!.media.path]).toString().trim();
  assert.equal(pix, '1', 'the WebM carries alpha');
});

test('only skills that edit or make video count as video skills, judged by their own description', async () => {
  const { isVideoSkill } = await import('../../shared/skills.js');
  const video = [
    ['motion-graphics', 'A short, design-led motion graphic where motion is the message'],
    ['b-roll-finder', 'Source b-roll for a video edit'],
    ['effects', 'Add any of 45 video effects to a talking-head video'],
    ['ghost-editor', 'AI video editor for talking-head reels.'],
    ['hyperframes-cli', 'Use the HyperFrames CLI development loop'],
    ['remotion-best-practices', 'Best practices for Remotion - Video creation in React'],
    ['higgsfield-video-explainer', 'Build a complete non-photoreal narrated explainer or story video'],
  ];
  const other = [
    ['write-hook', 'Create, compare, or improve opening hooks for short-form videos, long-form videos, posts, reels'],
    ['build-points', 'Plan, write, reorder, or strengthen the main teaching points of a video or creator script'],
    ['youtube-thumbnail', 'Use when the user wants to create a YouTube thumbnail'],
    ['watch-video', 'Genuinely watch a video with Gemini — motion and audio in one real pass'],
    ['youtube-transcript', 'Extract transcripts from YouTube videos.'],
    ['diagrammer', 'Render clean blueprint-style SVG diagrams from JSON specs.'],
  ];
  for (const [name, description] of video) assert.ok(isVideoSkill({ name, description }), name);
  for (const [name, description] of other) assert.ok(!isVideoSkill({ name, description }), name);
});

test('on Edit: your choice wins, then the skill\'s own creatorclub: edit, then the automatic pick', async () => {
  const { editSkill } = await import('../../shared/skills.js');
  const skill = (name: string, description: string, forEdit?: boolean) => ({ name, description, previews: [], ...(forEdit ? { forEdit } : {}) });
  const none = { on: [], off: [] };
  assert.deepEqual([editSkill(skill('motion-graphics', 'A motion graphic'), none).on, editSkill(skill('motion-graphics', 'A motion graphic'), none).reason], [true, 'auto']);
  assert.equal(editSkill(skill('my-intro-sting', 'Adds my branded intro', true), none).reason, 'declared', 'a skill can say it is for Edit');
  assert.deepEqual(editSkill(skill('my-intro-sting', 'Adds my branded intro'), { on: ['my-intro-sting'], off: [] }), { ...skill('my-intro-sting', 'Adds my branded intro'), on: true, reason: 'added' });
  assert.equal(editSkill(skill('motion-graphics', 'A motion graphic', true), { on: [], off: ['motion-graphics'] }).on, false, 'taking it off wins over everything');
  assert.equal(editSkill(skill('write-hook', 'Opening hooks for videos'), none).on, false);
});

test('the skill list reads creatorclub: edit from the front matter, and the run follows your choices', async () => {
  const { listSkills } = await import('./skills.js');
  const { isVideoSkillInstalled } = await import('./skill-run.js');
  const store = await import('./store.js');
  await mkdir(path.join(home, '.claude', 'skills', 'my-intro-sting'), { recursive: true });
  await writeFile(path.join(home, '.claude', 'skills', 'my-intro-sting', 'SKILL.md'), '---\nname: my-intro-sting\ndescription: Adds my branded intro.\ncreatorclub: edit\n---\nDo it.');
  await mkdir(path.join(home, '.claude', 'skills', 'write-hook'), { recursive: true });
  await writeFile(path.join(home, '.claude', 'skills', 'write-hook', 'SKILL.md'), '---\nname: write-hook\ndescription: Opening hooks for videos.\n---\nWrite.');
  assert.equal((await listSkills(home)).find((s) => s.name === 'my-intro-sting')?.forEdit, true);
  assert.equal(await isVideoSkillInstalled('my-intro-sting', home), true);
  assert.equal(await isVideoSkillInstalled('write-hook', home), false);
  await store.setEditSkill('write-hook', true);
  assert.equal(await isVideoSkillInstalled('write-hook', home), true, 'added by you');
  await store.setEditSkill('my-intro-sting', false);
  assert.equal(await isVideoSkillInstalled('my-intro-sting', home), false, 'taken off by you');
  await store.setEditSkill('my-intro-sting', null);
  assert.equal(await isVideoSkillInstalled('my-intro-sting', home), true, 'back to automatic');
});
