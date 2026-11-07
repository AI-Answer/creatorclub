import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { EditAction } from '../../shared/companion.js';
import { projectDuration, type Project } from '../../shared/types.js';
import { SKILL_NAME, editSkill } from '../../shared/skills.js';
import { bundledSkillsDir, listSkills } from './skills.js';
import { isSoundTag } from '../../shared/sound-tags.js';
import { AiError, runAI, type AIEvent, type RunAIOptions } from './ai.js';
import { sceneforge } from './recorder.js';
import * as store from './store.js';
import { SCREENPLAY_STAGE, renderLayers, screenplayRoot } from './screenplay-layers.js';

/*
 * A skill run on Edit: one of the creator's own Claude Code skills runs for real (its scripts and tools), in a folder of this video.
 * What it decides comes back as the companion's own edit cards (cuts, captions, zooms, text, motion graphics), each previewed on the
 * timeline and applied or undone like any card; only what those cannot show (a rendered picture or animation) comes back as one file,
 * as a card that places it on the Overlays row.
 * The chat's usual replies stay as they are: they only read a skill's instructions and never run anything.
 */

/** The folder, inside each video's folder, that skill runs work in. Only files in it can be placed by a card. */
export const SKILL_RUNS = 'skill-runs';
/** What one skill run may spend. */
export const SKILL_RUN_BUDGET_USD = 3;
const SKILL_RUN_MS = 20 * 60_000;
/**
 * A skill that edits the whole recording itself (screenplay, editroom) runs its own pipeline: its director and reviewers, renders and
 * checks. It gets the best model, room to spend and time to finish, and its multi-agent workflows.
 */
export const FULL_EDIT_BUDGET_USD = 25;
const FULL_EDIT_MS = 90 * 60_000;
/** How many times a whole edit that ended its turn early is continued. */
const WHOLE_EDIT_CONTINUES = 4;
/** A skill may hand parts to subagents (`Agent`), as the video skills do; a whole-recording edit also runs its workflows. */
const TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent'];
const FULL_EDIT_TOOLS = [...TOOLS, 'Workflow'];
/** A skill whose own description says it edits a raw recording into a finished video, such as screenplay-edit or editroom's edit-video. */
const WHOLE_EDIT = /\b(edit|turn)s? a raw (?:talking-head )?recording into\b|\braw recording (?:in|into)\b|\braw recording,? (?:\w+ )?finished video\b/i;
export async function editsWholeRecording(name: string, home = os.homedir()): Promise<boolean> {
  const skill = (await listSkills(home)).find((each) => each.name === name);
  return !!skill && !skill.forEdit && WHOLE_EDIT.test(skill.description);
}
/**
 * A whole edit by screenplay goes on the creator's timeline by default: the skill plans the graphics, the app renders them and places one
 * block per scene beside the creator's own cut and tile. Asked for a finished video, it makes the finished video instead.
 */
export async function rendersInLayers(name: string, request: string, home = os.homedir()): Promise<boolean> {
  if (FINISHED_VIDEO.test(request) || !(await editsWholeRecording(name, home))) return false;
  const dir = await skillFolder(name, home);
  return !!dir && !!(await screenplayRoot(dir));
}
const FINISHED_VIDEO = /\b(?:finished|whole|full|complete) video\b|\brender (?:it|the (?:whole )?video)\b/i;
const execFileAsync = promisify(execFile);
const MEDIA = /\.(mp4|mov|webm|m4v|png|jpe?g|gif)$/i;

const resultShape = z
  .object({
    file: z.string().max(300).optional(),
    title: z.string().max(80).optional(),
    start: z.number().min(0).max(36_000).optional(),
    duration: z.number().positive().max(600).optional(),
    text: z.string().max(2000).optional(),
    /** Changes to this timeline, in the companion's action shapes; checked like a reply's before they become cards. */
    actions: z.array(z.unknown()).max(60).optional(),
    /** A whole-recording edit: the finished video, which takes the place of the timeline. */
    finished: z.object({ file: z.string().max(300), title: z.string().max(80).optional() }).strip().optional(),
    /** A whole edit planned for the timeline: its work folder, whose graphics the app renders and places. */
    layers: z.object({ work: z.string().max(400), title: z.string().max(80).optional() }).strip().optional(),
    /** Several files, each placed at its own time (one proof shot per claim). */
    files: z.array(z.object({ file: z.string().max(300), title: z.string().max(80).optional(), start: z.number().min(0).max(36_000).optional(), duration: z.number().positive().max(600).optional() }).strip()).max(20).optional(),
  })
  .passthrough();

/** A .mov as a VP9 WebM beside it, with its alpha kept. */
async function toWebm(file: string): Promise<string> {
  const out = file.replace(/\.mov$/i, '.webm');
  await execFileAsync(process.env.SCENEFORGE_FFMPEG || 'ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', file, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-an', out]);
  return out;
}

/** The skill's folder, when it is installed: `~/.claude/skills/<name>` with a SKILL.md. */
export async function skillFolder(name: string, home = os.homedir()): Promise<string | undefined> {
  if (!SKILL_NAME.test(name)) return undefined;
  // The creator's own skill first, then one that comes with Creator Compiler.
  for (const root of [path.join(home, '.claude', 'skills'), bundledSkillsDir()]) {
    if (!root) continue;
    const dir = await fs.realpath(path.join(root, name)).catch(() => undefined);
    if (dir && (await fs.stat(path.join(dir, 'SKILL.md')).catch(() => undefined))?.isFile()) return dir;
  }
  return undefined;
}

/** An installed skill that is on Edit (your choice, the skill's own flag, or the automatic pick): only these run for real there. */
export async function isVideoSkillInstalled(name: string, home = os.homedir()): Promise<boolean> {
  if (!(await skillFolder(name, home))) return false;
  const skill = (await listSkills(home)).find((each) => each.name === name);
  return !!skill && editSkill(skill, await store.editSkillChoices()).on;
}

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** What the skill is told about the video: its size and length, the stretch it is for, what is said there and the notes on it. */
export function skillBrief(p: Project, from: number, to: number, request: string): string {
  const said = p.captions.filter((c) => c.end > from && c.start < to && !isSoundTag(c.text)).map((c) => `- ${clock(c.start)} ${c.text.trim()}`);
  const notes = (p.markers ?? []).filter((m) => m.time >= from - 0.5 && m.time <= to + 0.5 && m.name?.trim()).map((m) => `- ${clock(m.time)} ${m.name!.trim()}`);
  const length = p.clips.reduce((end, c) => Math.max(end, c.start + (c.sourceOut - c.sourceIn) / Math.max(0.05, c.speed)), 0);
  return [
    `# The video`,
    `- Picture: ${p.canvas.width}×${p.canvas.height} at ${p.canvas.fps} fps, ${clock(length)} long.`,
    `- The stretch this is for: ${clock(from)} to ${clock(to)} (${Math.round((to - from) * 10) / 10} s).`,
    said.length ? `\n# What is said there\n${said.join('\n')}` : '',
    notes.length ? `\n# The creator's notes there\n${notes.join('\n')}` : '',
    `\n# What the creator asked\n${request.trim() || 'Use the skill for this stretch.'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Every spoken word in the stretch with the second it starts, so a plan can put a graphic on the word that triggers it. */
const WORDS_KEPT = 4000;
export function wordTimes(p: Project, from: number, to: number): string {
  const words = p.captions.flatMap((c) => c.words ?? []).filter((w) => w.end > from && w.start < to && w.text.trim() && !isSoundTag(w.text)).slice(0, WORDS_KEPT);
  return words.length ? `\n\n# Word times (seconds)\n${words.map((w) => `[${w.start.toFixed(2)}] ${w.text.trim()}`).join(' ')}` : '';
}

/** The newest earlier run of `skill` in this video's runs folder that never wrote its result: a whole edit that stopped part way. */
async function unfinishedRun(runs: string, skill: string, self: string): Promise<string | undefined> {
  const names = (await fs.readdir(runs).catch(() => [] as string[])).filter((name) => name.endsWith(`-${skill}`) && path.join(runs, name) !== self).sort().reverse();
  for (const name of names) {
    const folder = path.join(runs, name);
    if (await fs.stat(path.join(folder, 'result.json')).then(() => true, () => false)) continue;
    if (await fs.stat(path.join(folder, 'work')).then((stat) => stat.isDirectory(), () => false)) return folder;
  }
  return undefined;
}

/**
 * The recording a whole-recording edit starts from: the timeline as it is cut now, rendered by the app's own export (so picture and sound
 * stay in sync across every cut), with no graphics, text, zooms, captions or stage, the camera full frame. Plus its sound as a WAV.
 */
export async function prepareRecording(project: Project, dir: string, signal?: AbortSignal): Promise<{ video: string; audio: string }> {
  const plain: Project = structuredClone(project);
  plain.motion = [];
  plain.elements = [];
  plain.zooms = [];
  delete (plain as { look?: unknown }).look;
  plain.captionStyle = { ...plain.captionStyle, enabled: false };
  for (const clip of plain.clips) {
    if (clip.stage) delete clip.stage;
    if (clip.track === 'camera') Object.assign(clip.transform, { x: 0, y: 0, width: 1, height: 1, borderRadius: 0 });
  }
  const out = path.join(dir, 'source');
  await fs.mkdir(out, { recursive: true });
  const media = await import('../media.js');
  const job = media.startExport(plain, { format: 'mp4', quality: 'high', burnCaptions: false }, out);
  for (;;) {
    if (signal?.aborted) {
      media.cancelJob(job.id);
      throw new AiError('cancelled', 'That was stopped.');
    }
    const now = media.getJob(job.id);
    if (now?.status === 'complete' && now.outputPath) break;
    if (!now || now.status === 'failed' || now.status === 'cancelled' || now.status === 'interrupted') throw new AiError('bad-answer', `Couldn't prepare the recording: ${now?.error ?? 'the export stopped'}.`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const rendered = media.getJob(job.id)!.outputPath!;
  const video = path.join(out, 'camera.mp4'),
    audio = path.join(out, 'mic.wav');
  await fs.rename(rendered, video);
  await execFileAsync(process.env.SCENEFORGE_FFMPEG || 'ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '48000', audio]);
  return { video, audio };
}

const STEP: Record<string, string> = { Read: 'Reading the skill', Glob: 'Reading the skill', Grep: 'Reading the skill', Write: 'Writing files', Edit: 'Writing files', Bash: 'Running the skill' };

export interface SkillRunOptions {
  slug: string;
  id: string;
  skill: string;
  request: string;
  project: Project;
  /** The stretch of the timeline it is for. */
  from: number;
  to: number;
  images?: string[];
  home?: string;
  signal?: AbortSignal;
  onStep?: (label: string) => void;
  runAI?: (options: RunAIOptions) => ReturnType<typeof runAI>;
  /** The timeline as the companion describes it (clips with ids, captions, zooms, motion blocks), for actions that name them. */
  timeline?: string;
  /** The edit actions the run may answer with, one line each with its JSON. */
  actionHelp?: string;
  /** More for the brief: the sources on the video's Board, and how to make a proof shot. */
  notes?: string;
  /**
   * A whole-recording edit: the video as it is cut now, rendered without graphics, as the skill's raw footage (`video`, with its sound,
   * and the same sound as `audio`). The skill makes the finished video, which comes back to take the timeline's place.
   */
  recording?: { video: string; audio: string };
  /** With `recording`: the skill plans the graphics and the app places them on the timeline, one block per scene (screenplay). */
  layers?: boolean;
}

/** Keep recent runs and unfinished work; never prune a folder referenced by a recent run. */
export async function pruneSkillRuns(slug: string, id: string) {
  const dir = path.join(store.videoDir(slug, id), SKILL_RUNS);
  const names = (await fs.readdir(dir).catch(() => [] as string[])).sort().reverse();
  const recordings = names.filter(name => /^recording-\d+$/.test(name));
  for (const name of recordings.slice(3)) await fs.rm(path.join(dir, name), { recursive: true, force: true });
  const runs = names.filter(name => /^\d{4}-.*-[a-z][a-z0-9-]*$/.test(name));
  for (const name of runs.slice(5)) {
    // Unfinished work can still be resumed; retain the newest few unfinished runs separately.
    const file = path.join(dir, name, 'result.json');
    if (await fs.stat(file).then(() => true, () => false)) await fs.rm(path.join(dir, name), { recursive: true, force: true });
  }
  const unfinished = [];
  for (const name of runs) if (!(await fs.stat(path.join(dir, name, 'result.json')).then(() => true, () => false))) unfinished.push(name);
  for (const name of unfinished.slice(5)) await fs.rm(path.join(dir, name), { recursive: true, force: true });
}

/** Runs the skill and turns what it made into an `add_clip` action, or explains in one line why there is nothing to place. */
type ClipAction = Extract<EditAction, { type: 'add_clip' }>;
export async function runMakingSkill(o: SkillRunOptions): Promise<{ text: string; action?: ClipAction; clips?: ClipAction[]; actions?: unknown[]; finished?: ClipAction }> {
  await pruneSkillRuns(o.slug, o.id);
  const skillDir = await skillFolder(o.skill, o.home);
  if (!skillDir) throw new AiError('bad-answer', `There is no skill called ${o.skill} in your Claude Code.`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(store.videoDir(o.slug, o.id), SKILL_RUNS, `${stamp}-${o.skill}`);
  await fs.mkdir(path.join(dir, 'out'), { recursive: true });
  // A whole edit that stopped before it finished left its work on disk; the next run of the same skill on this video picks it up.
  const earlier = o.recording ? await unfinishedRun(path.dirname(dir), o.skill, dir) : undefined;
  const resume = earlier ? `\n\n# An earlier run\nAn earlier run of this skill on this video stopped before it finished. Its folder is ${earlier}: its state is on disk. Resume from it, in that folder, instead of starting over: redo only the stages that are missing or stale, then copy the final video here as below.` : '';
  const recording = o.recording ? `\n\n# The recording\n- ${o.recording.video}: the camera with its sound, as the video is cut now in Creator Compiler (${o.project.canvas.width}×${o.project.canvas.height}, ${Math.round(projectDuration(o.project))} s). Use it as the raw camera footage.\n- ${o.recording.audio}: the same sound, as the microphone track.` : '';
  await fs.writeFile(path.join(dir, 'brief.md'), skillBrief(o.project, o.from, o.to, o.request) + recording + resume + (o.actionHelp ? wordTimes(o.project, o.from, o.to) : '') + (o.timeline ? `\n\n# The timeline now\n${o.timeline}` : '') + (o.notes ? `\n\n${o.notes}` : ''));
  if (o.actionHelp) await fs.writeFile(path.join(dir, 'actions.md'), `# Changes you can make to this timeline\nWrite them in result.json as "actions": [...], one object each, in the order to apply them. Give every time in seconds on the timeline as it is now, before any of your cuts: the app adds the cards in order and moves each later time through the cuts before it.\n\n${o.actionHelp}\n`);
  const seconds = Math.max(1, Math.round((o.to - o.from) * 10) / 10);
  const system = [
    `You are running the creator's own skill "${o.skill}" for one stretch of their video. Its instructions are in ${path.join(skillDir, 'SKILL.md')}: read them first and follow them, using the skill's own files and scripts in ${skillDir}.`,
    `Work only inside ${dir}. Read ${path.join(dir, 'brief.md')} for the video, the stretch and the request. Do not ask questions: decide from the brief and say what you assumed.`,
    `Use the skill's own pipeline and commands as it describes them, including its command-line tools through npx; only fall back to another way when one of them fails, and say so.`,
    ...(o.recording && o.layers
      ? [
          `This skill edits the whole recording, but here it plans the graphics for the creator's own timeline: Creator Compiler renders them and places one block per scene beside the creator's own cut and camera. Run its pipeline as its SKILL.md describes, on the recording listed in ${path.join(dir, 'brief.md')}, with its own work folder inside ${dir}, with these changes. Never upload or publish anything.`,
          `Do not cut: the recording is already cut the way the creator wants it. After init and transcribe, write cuts.yaml in the work folder as "maxGap: 99", "cuts: []", "accepted: []", "manual: []", "keep: []" (one per line), then run aroll. Skip the cut review. Fixing misheard words in words.json, as the skill says, is still right.`,
          `Plan the beats, write edit.yaml, run check until 0 errors, and review with sheets and stills, as the skill says. Do not render the video (no screenplay render): Creator Compiler renders it.`,
          `The creator's taste, on top of the skill's: a graphic only where it makes the point clearer, in the creator's words, and nothing for moments that add nothing. No terminal command logs or tool-call lines on screen: show what the thing does, not the commands. No source or capture labels ("github.com · captured ..."). Never show the same point twice. Crop proof to the one line that matters. The face full screen, with a headline over it when it helps, for the hook, punchlines, stories and the goodbye. A before and after for every contrast the creator draws.`,
          `Do not end your turn until result.json is written: wait for every agent you start, and run each step in the foreground with a long Bash timeout.`,
          `This run has no Workflow tool. Where the skill says to run a workflow script, run its agents yourself with the Agent tool, and keep your own context small.`,
          `Then write ${path.join(dir, 'result.json')}: {"layers": {"work": "<the work folder>", "title": "<short name>"}, "text": "<one or two plain sentences for the creator on what the graphics show>"}. If it could not be planned, write {"text": "<one plain sentence on what stopped it>"} instead.`,
        ]
      : o.recording
      ? [
          `This skill edits the whole recording itself. Run its full pipeline as its SKILL.md describes, on the recording listed in ${path.join(dir, 'brief.md')}, with its own work folder inside ${dir}: its cut, its director, its graphics, its checks and reviews, and its final render. Do the full quality path, not a quick draft. Never upload or publish anything.`,
          `Do not end your turn until the final video is rendered and result.json is written: wait for every agent you start (never start them in the background), and do not stop to report progress.`,
          `Its steps take minutes (transcribing, cutting, rendering). Run each in the foreground with a long Bash timeout and wait for it; do not start them in the background or poll for them.`,
          `This run has no Workflow tool. Where the skill says to run a workflow script, read that script and run its agents yourself with the Agent tool, in the same order and in parallel where it runs them in parallel, with the same prompts, models and checks, and write the files the script would write. Keep your own context small: tell each agent to write what it makes to files and to answer you in one short line, and read those files only when the next step needs them.`,
          `When the final video is rendered, copy it to ${path.join(dir, 'out')} and write ${path.join(dir, 'result.json')}: {"finished": {"file": "out/<name>.mp4", "title": "<short name>"}, "text": "<one or two plain sentences for the creator on what you made>"}. If it could not be finished, write {"text": "<one plain sentence on what stopped it>"} instead.`,
        ]
      : o.actionHelp
      ? [
          `Prefer changes to this timeline over rendering. When what the skill does can be done with the changes listed in ${path.join(dir, 'actions.md')} (cuts, captions, zooms, text, motion graphics), use the skill's method and rules to decide them and write them as actions; do not render the video. Put each graphic on the word that triggers it, using the word times in the brief. They come back to the creator as cards to preview, apply or undo.`,
          `Make a file only for a picture or an animation those changes cannot show: one finished file in ${path.join(dir, 'out')}, a video (.mp4, .mov or .webm) or a picture (.png), ${o.project.canvas.width}×${o.project.canvas.height}, only as long as it needs. It goes over the video on the Overlays row, so a see-through background works.`,
          `Then write ${path.join(dir, 'result.json')}: {"actions": [...], "text": "<one or two sentences on the plan>"}, and for files you made add "files": [{"file": "out/<name>", "title": "...", "start": <seconds>, "duration": <seconds>}], one per file, each at the moment it belongs to. If the skill has nothing to do here, write {"text": "<one sentence why>"}.`,
        ]
      : [
          `Make one finished file in ${path.join(dir, 'out')}: a video (.mp4, .mov or .webm) or a picture (.png), ${o.project.canvas.width}×${o.project.canvas.height}, about ${seconds} s long if it moves. It goes over the video on the Overlays row, so a see-through background is best: a .webm (VP9 with alpha) plays in the editor; a .mov (ProRes 4444) is turned into one.`,
          `Then write ${path.join(dir, 'result.json')}: {"file": "out/<name>", "title": "<short name for the card>", "start": <seconds into the video>, "duration": <seconds>}. If the skill cannot make a file for this, write {"text": "<one sentence why>"} instead.`]),
    `Finish with one or two plain sentences on what you made.`,
  ].join('\n\n');
  const agentDirs = [dir, path.dirname(skillDir), ...(o.recording ? [await fs.realpath(skillDir), path.dirname(o.recording.video), ...(earlier ? [earlier] : [])] : [])];
  const call = (prompt: string) => (o.runAI ?? runAI)({
    provider: 'claude',
    prompt,
    system,
    model: o.recording ? 'opus' : 'sonnet',
    budgetUsd: o.recording ? FULL_EDIT_BUDGET_USD : SKILL_RUN_BUDGET_USD,
    timeoutMs: o.recording ? FULL_EDIT_MS : SKILL_RUN_MS,
    signal: o.signal,
    images: o.images,
    // The whole skills folder: a skill often reads its sibling skills (motion-graphics reads ../hyperframes).
    agent: { cwd: dir, dirs: agentDirs, tools: o.recording ? FULL_EDIT_TOOLS : TOOLS },
    // A whole edit's steps (transcribing, cutting, rendering) take minutes each: one shell command may run up to an hour, not two minutes.
    ...(o.recording ? { env: { BASH_DEFAULT_TIMEOUT_MS: String(30 * 60_000), BASH_MAX_TIMEOUT_MS: String(60 * 60_000) } } : {}),
    onEvent: (event: AIEvent) => {
      if (event.type === 'tool' && STEP[event.name]) o.onStep?.(STEP[event.name]);
    },
  }).catch(async (error: unknown) => {
    // Why it stopped, kept in its folder: the creator sees one line, and the next run (or a person) can read the rest.
    const detail = error instanceof AiError ? `${error.message}\n\n${error.detail ?? ''}` : String(error);
    await fs.writeFile(path.join(dir, 'error.txt'), detail.slice(0, 20_000)).catch(() => {});
    throw error;
  });
  let answer = await call(`Run the skill for this stretch: ${o.request.trim() || o.skill}`);
  // A whole edit is long: a run that ends its turn before the video is made (waiting on an agent, say) is continued from its state on disk.
  for (let again = 0; o.recording && again < WHOLE_EDIT_CONTINUES && !(await fs.stat(path.join(dir, 'result.json')).then(() => true, () => false)); again++) {
    if (o.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
    o.onStep?.('Still editing');
    const goal = o.layers ? `edit.yaml checks with 0 errors and ${path.join(dir, 'result.json')} is written` : `the final video is rendered, copied to ${path.join(dir, 'out')} and ${path.join(dir, 'result.json')} is written`;
    answer = await call(`You stopped before ${path.join(dir, 'result.json')} was written. Your last words were: "${answer.text.trim().slice(0, 400)}". Continue the skill's pipeline from its state on disk (the folders named in ${path.join(dir, 'brief.md')} and your work folder), without redoing finished stages, until ${goal}. Wait for every agent you start; do not end your turn before then.`);
  }

  const raw = await fs.readFile(path.join(dir, 'result.json'), 'utf8').catch(() => '');
  const parsed = raw ? resultShape.safeParse(JSON.parse(raw)) : undefined;
  const result = parsed?.success ? parsed.data : {};
  const said = answer.text.trim();
  const actions = result.actions?.length ? result.actions : undefined;
  const plan = result.text?.trim() || said;
  if (result.layers && o.layers) {
    // The plan's graphics, rendered by the app and cut into one see-through block per scene, for the creator's own timeline.
    const root = await fs.realpath(dir);
    const work = await fs.realpath(path.resolve(dir, result.layers.work)).catch(() => '');
    if (!work || !(work === root || work.startsWith(root + path.sep) || (earlier && work.startsWith((await fs.realpath(earlier)) + path.sep)))) return { text: `${plan}\n\nIts work folder is not one it made for this video, so nothing changed.`.trim() };
    const made = await renderLayers({ skillDir, work, out: path.join(dir, 'out'), signal: o.signal, onStep: o.onStep });
    const { registerMedia, CACHE_DIR } = await sceneforge();
    const { probeMedia } = await import('../media.js');
    const blocks = [];
    for (const b of made.blocks) {
      const media = await probeMedia(b.file, CACHE_DIR);
      media.name = b.title;
      blocks.push({ media: await registerMedia(media), start: b.start, duration: b.duration, title: b.title });
    }
    if (!blocks.length) return { text: `${plan}\n\nThe plan has no graphics to place.`.trim() };
    const title = (result.layers.title?.trim() || o.skill).slice(0, 80);
    const end = Math.max(...blocks.map((b) => b.start + b.duration));
    return { text: plan || `${title} is ready.`, finished: { type: 'add_clip', media: blocks[0].media, start: 0, duration: end, title, layers: { blocks, stages: made.stages, stage: SCREENPLAY_STAGE } } };
  }
  if (result.finished) {
    // The finished edit replaces the timeline: one video, its own cut, with its sound.
    const root = await fs.realpath(dir);
    const file = await fs.realpath(path.resolve(dir, result.finished.file)).catch(() => '');
    if (!file.startsWith(path.join(root, 'out') + path.sep) || !/\.(mp4|mov|m4v|webm)$/i.test(file)) return { text: `${plan}\n\nThe finished video is not one it made in its folder, so nothing changed.`.trim() };
    o.onStep?.('Getting it ready');
    const { registerMedia, CACHE_DIR } = await sceneforge();
    const { probeMedia } = await import('../media.js');
    const media = await probeMedia(file, CACHE_DIR);
    const title = (result.finished.title?.trim() || o.skill).slice(0, 80);
    media.name = title;
    const saved = await registerMedia(media);
    if (saved.kind !== 'video') return { text: `${plan}\n\nWhat it made is not a video, so nothing changed.`.trim() };
    return { text: plan || `${title} is ready.`, finished: { type: 'add_clip', media: saved, start: 0, duration: saved.duration, title, whole: true } };
  }
  const wanted = [...(result.file ? [{ file: result.file, title: result.title, start: result.start, duration: result.duration }] : []), ...(result.files ?? [])];
  if (!wanted.length) return actions ? { text: plan || `${o.skill} made a plan for the timeline.`, actions } : { text: result.text ?? (said || `${o.skill} finished without making a file for the timeline.`) };

  const root = await fs.realpath(dir);
  const clips: ClipAction[] = [];
  const skipped: string[] = [];
  o.onStep?.('Getting it ready');
  const { registerMedia, CACHE_DIR } = await sceneforge();
  const { probeMedia } = await import('../media.js');
  for (const each of wanted) {
    // The file must be one the run made in its own out folder, of a kind the timeline plays.
    const file = await fs.realpath(path.resolve(dir, each.file)).catch(() => '');
    if (!file.startsWith(path.join(root, 'out') + path.sep) || !MEDIA.test(file)) {
      skipped.push(`${each.file} is not one it made in its folder`);
      continue;
    }
    // The editor plays in Chromium, which has no ProRes: a .mov becomes a VP9 WebM, keeping its see-through background.
    const playable = /\.mov$/i.test(file) ? await toWebm(file) : file;
    const media = await probeMedia(playable, CACHE_DIR);
    if (media.kind === 'audio') {
      skipped.push(`${path.basename(file)} is a sound file; the Overlays row takes pictures and video`);
      continue;
    }
    const title = (each.title?.trim() || o.skill).slice(0, 80);
    media.name = title;
    const saved = await registerMedia(media);
    const start = Math.max(0, each.start ?? o.from);
    const duration = Math.max(0.5, Math.min(600, each.duration ?? (saved.kind === 'image' ? Math.min(seconds, 5) : saved.duration || seconds)));
    clips.push({ type: 'add_clip', media: saved, start, duration, title });
  }
  const note = skipped.length ? `\n\nLeft out: ${skipped.join('; ')}.` : '';
  if (!clips.length && !actions) return { text: `${plan}${note || '\n\nThere is nothing to place.'}`.trim() };
  return { text: `${plan || `${clips[0]?.title ?? o.skill} is ready.`}${note}`, ...(clips[0] ? { action: clips[0], clips } : {}), ...(actions ? { actions } : {}) };
}
