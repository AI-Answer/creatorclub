import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { EditAction } from '../../shared/companion.js';
import type { Project } from '../../shared/types.js';
import { SKILL_NAME, editSkill } from '../../shared/skills.js';
import { bundledSkillsDir, listSkills } from './skills.js';
import { isSoundTag } from '../../shared/sound-tags.js';
import { AiError, runAI, type AIEvent, type RunAIOptions } from './ai.js';
import { sceneforge } from './recorder.js';
import * as store from './store.js';

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
/** A skill may hand parts to subagents (`Agent`), as the video skills do. */
const TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent'];
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
}

/** Runs the skill and turns what it made into an `add_clip` action, or explains in one line why there is nothing to place. */
type ClipAction = Extract<EditAction, { type: 'add_clip' }>;
export async function runMakingSkill(o: SkillRunOptions): Promise<{ text: string; action?: ClipAction; clips?: ClipAction[]; actions?: unknown[] }> {
  const skillDir = await skillFolder(o.skill, o.home);
  if (!skillDir) throw new AiError('bad-answer', `There is no skill called ${o.skill} in your Claude Code.`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(store.videoDir(o.slug, o.id), SKILL_RUNS, `${stamp}-${o.skill}`);
  await fs.mkdir(path.join(dir, 'out'), { recursive: true });
  await fs.writeFile(path.join(dir, 'brief.md'), skillBrief(o.project, o.from, o.to, o.request) + (o.actionHelp ? wordTimes(o.project, o.from, o.to) : '') + (o.timeline ? `\n\n# The timeline now\n${o.timeline}` : '') + (o.notes ? `\n\n${o.notes}` : ''));
  if (o.actionHelp) await fs.writeFile(path.join(dir, 'actions.md'), `# Changes you can make to this timeline\nWrite them in result.json as "actions": [...], one object each, in the order to apply them. Give every time in seconds on the timeline as it is now, before any of your cuts: the app adds the cards in order and moves each later time through the cuts before it.\n\n${o.actionHelp}\n`);
  const seconds = Math.max(1, Math.round((o.to - o.from) * 10) / 10);
  const system = [
    `You are running the creator's own skill "${o.skill}" for one stretch of their video. Its instructions are in ${path.join(skillDir, 'SKILL.md')}: read them first and follow them, using the skill's own files and scripts in ${skillDir}.`,
    `Work only inside ${dir}. Read ${path.join(dir, 'brief.md')} for the video, the stretch and the request. Do not ask questions: decide from the brief and say what you assumed.`,
    `Use the skill's own pipeline and commands as it describes them, including its command-line tools through npx; only fall back to another way when one of them fails, and say so.`,
    ...(o.actionHelp
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
  const answer = await (o.runAI ?? runAI)({
    provider: 'claude',
    prompt: `Run the skill for this stretch: ${o.request.trim() || o.skill}`,
    system,
    model: 'sonnet',
    budgetUsd: SKILL_RUN_BUDGET_USD,
    timeoutMs: SKILL_RUN_MS,
    signal: o.signal,
    images: o.images,
    // The whole skills folder: a skill often reads its sibling skills (motion-graphics reads ../hyperframes).
    agent: { cwd: dir, dirs: [dir, path.dirname(skillDir)], tools: TOOLS },
    onEvent: (event: AIEvent) => {
      if (event.type === 'tool' && STEP[event.name]) o.onStep?.(STEP[event.name]);
    },
  });

  const raw = await fs.readFile(path.join(dir, 'result.json'), 'utf8').catch(() => '');
  const parsed = raw ? resultShape.safeParse(JSON.parse(raw)) : undefined;
  const result = parsed?.success ? parsed.data : {};
  const said = answer.text.trim();
  const actions = result.actions?.length ? result.actions : undefined;
  const plan = result.text?.trim() || said;
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
