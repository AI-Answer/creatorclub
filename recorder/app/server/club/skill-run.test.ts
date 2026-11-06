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

test('a skill that edits the whole recording gets the recording, Opus and room to finish, and its video takes the timeline\'s place', async () => {
  const { editsWholeRecording, FULL_EDIT_BUDGET_USD } = await import('./skill-run.js');
  await mkdir(path.join(home, '.claude', 'skills', 'screenplay-edit'), { recursive: true });
  await writeFile(path.join(home, '.claude', 'skills', 'screenplay-edit', 'SKILL.md'), '---\nname: screenplay-edit\ndescription: Edit a raw talking-head recording into a premium motion-graphics tutorial with the screenplay engine.\n---\nRun the loop.');
  assert.equal(await editsWholeRecording('screenplay-edit', home), true);
  assert.equal(await editsWholeRecording('motion-graphics', home), false, 'a skill that makes overlays plans for the timeline');
  const calls: RunAIOptions[] = [];
  const recording = { video: path.join(temp, 'rec', 'camera.mp4'), audio: path.join(temp, 'rec', 'mic.wav') };
  const done = await runMakingSkill({ slug: 'samin', id: 'v1', skill: 'screenplay-edit', request: 'edit this', project: project(), from: 0, to: 30, home, recording,
    runAI: fake(async (dir) => {
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x36:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'out', 'final.mp4')]);
      await writeFile(path.join(dir, 'result.json'), JSON.stringify({ finished: { file: 'out/final.mp4', title: 'Screenplay edit' }, text: 'Your edit is ready.' }));
    }, calls) });
  const call = calls[0];
  assert.equal(call.model, 'opus');
  assert.equal(call.budgetUsd, FULL_EDIT_BUDGET_USD);
  assert.ok(call.agent!.dirs.includes(path.join(temp, 'rec')), 'it may read the recording');
  assert.match(call.system ?? '', /full pipeline/);
  assert.equal(done.finished?.type, 'add_clip');
  assert.equal(done.finished?.whole, true);
  assert.equal(done.finished?.media.kind, 'video');
  assert.equal(done.text, 'Your edit is ready.');
});

test('the finished edit passes the same check every card passes before it is applied', async () => {
  const { actionShape } = await import('./companion-actions.js');
  const media = { id: 'm', name: 'Final', path: '/tmp/final.mp4', kind: 'video', duration: 56.6, width: 1920, height: 1080 };
  assert.equal(actionShape.safeParse({ type: 'add_clip', media, start: 0, duration: 56.6, title: '3 Claude skills', whole: true }).success, true);
});

test('a whole edit that stopped keeps why, and the next run of the same skill on this video resumes its folder', async () => {
  const calls: RunAIOptions[] = [];
  const recording = { video: path.join(temp, 'rec', 'camera.mp4'), audio: path.join(temp, 'rec', 'mic.wav') };
  const { AiError } = await import('./ai.js');
  let first = '';
  await assert.rejects(runMakingSkill({ slug: 'samin', id: 'v2', skill: 'screenplay-edit', request: 'edit this', project: project(), from: 0, to: 30, home, recording,
    runAI: async (options) => { first = options.agent!.cwd; await mkdir(path.join(first, 'work'), { recursive: true }); throw new AiError('failed', 'Claude could not finish that.', 'Prompt is too long'); } }), /could not finish/);
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(path.join(first, 'error.txt'), 'utf8'), /Prompt is too long/);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await runMakingSkill({ slug: 'samin', id: 'v2', skill: 'screenplay-edit', request: 'edit this', project: project(), from: 0, to: 30, home, recording,
    runAI: fake(async (dir) => writeFile(path.join(dir, 'result.json'), JSON.stringify({ text: 'Resumed.' })), calls) });
  const brief = await readFile(path.join(calls[0].agent!.cwd, 'brief.md'), 'utf8');
  assert.ok(brief.includes(`Its folder is ${first}`), 'the brief points at the stopped run');
  assert.ok(calls[0].agent!.dirs.includes(first), 'and the run may work in it');
});

test('a whole edit that ends its turn before its video is made is continued from its state on disk', async () => {
  const prompts: string[] = [];
  const recording = { video: path.join(temp, 'rec', 'camera.mp4'), audio: path.join(temp, 'rec', 'mic.wav') };
  const done = await runMakingSkill({ slug: 'samin', id: 'v3', skill: 'screenplay-edit', request: 'edit this', project: project(), from: 0, to: 30, home, recording,
    runAI: async (options) => {
      prompts.push(options.prompt);
      if (prompts.length === 2) await writeFile(path.join(options.agent!.cwd, 'result.json'), JSON.stringify({ text: 'Done after a nudge.' }));
      return { text: prompts.length === 1 ? 'Only the last film is left.' : 'Done.' };
    } });
  assert.equal(prompts.length, 2, 'one continuation, then it stops once result.json is there');
  assert.match(prompts[1], /You stopped before .*result\.json.*Only the last film is left/);
  assert.equal(done.text, 'Done after a nudge.');
});

test('screenplay plans for the timeline by default: told not to cut or render; a finished video only when asked for one', async () => {
  const { rendersInLayers } = await import('./skill-run.js');
  // A skill folder inside a screenplay checkout (its CLI two levels up), as the installed screenplay-edit is.
  const repo = path.join(temp, 'screenplay');
  await mkdir(path.join(repo, 'cli'), { recursive: true });
  await writeFile(path.join(repo, 'cli', 'screenplay.ts'), '');
  const skill = path.join(repo, 'plugins', 'screenplay', 'skills', 'screenplay-layered');
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, 'SKILL.md'), '---\nname: screenplay-layered\ndescription: Edit a raw talking-head recording into a premium motion-graphics tutorial with the screenplay engine.\n---\nRun the loop.');
  await rm(path.join(home, '.claude', 'skills', 'screenplay-layered'), { force: true, recursive: true });
  execFileSync('ln', ['-s', skill, path.join(home, '.claude', 'skills', 'screenplay-layered')]);
  assert.equal(await rendersInLayers('screenplay-layered', 'edit this video', home), true);
  assert.equal(await rendersInLayers('screenplay-layered', 'make the finished video', home), false, 'asked for a finished video');
  assert.equal(await rendersInLayers('screenplay-edit', 'edit this video', home), false, 'not in a screenplay checkout');
  const calls: RunAIOptions[] = [];
  const recording = { video: path.join(temp, 'rec', 'camera.mp4'), audio: path.join(temp, 'rec', 'mic.wav') };
  const done = await runMakingSkill({ slug: 'samin', id: 'v1', skill: 'screenplay-layered', request: 'edit this', project: project(), from: 0, to: 30, home, recording, layers: true,
    runAI: fake(async (dir) => { await writeFile(path.join(dir, 'result.json'), JSON.stringify({ text: 'It could not be planned.' })); }, calls) });
  const system = calls[0].system ?? '';
  assert.match(system, /Do not cut/);
  assert.match(system, /maxGap: 99/);
  assert.match(system, /Do not render the video/);
  assert.match(system, /"layers": \{"work"/);
  assert.doesNotMatch(system, /final render/);
  assert.equal(done.finished, undefined);
  assert.equal(done.text, 'It could not be planned.');
});
