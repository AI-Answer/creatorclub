import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PLAN_JOB_KINDS, type AiProvider, type JobSnapshot, type Outline, type OutlineScene, type Package, type PlanData, type PlanJobKind, type PlanJobResult, type Video } from '../../shared/club.js';
import { AiError, aiLabel, runAI, type RunAIOptions } from './ai.js';
import { readBreakdown } from './breakdown.js';
import type { ChannelData } from './channel.js';
import { loadChannelContext } from './context.js';
import { ClubError } from './errors.js';
import { getJob, snapshot, startJob, type JobContext } from './jobs.js';
import {
  buildExpandPrompt,
  buildOutlinePrompt,
  buildPackagePrompt,
  buildScriptPrompt,
  outlineProblems,
  packageProblems,
  sceneWords,
  spokenWords,
  type JsonPrompt,
  type PromptIdea,
} from './prompts.js';
import * as store from './store.js';

/*
 * The Plan step's saved work and the three AI steps behind it: Package it, Create outline and Write full script instead.
 * Files live in the video's folder: package.json, outline.md (readable markdown that is parsed back) and script.md.
 */

export const PACKAGE_BUDGET_USD = 0.5;
export const OUTLINE_BUDGET_USD = 1;
export const SCRIPT_BUDGET_USD = 1;
export const EXPAND_BUDGET_USD = 0.5;
/** A scene under this share of its word budget gets lengthened once (the board's rule). */
const EXPAND_BELOW = 0.8;
const RECENT_TITLES = 10;

export const packageFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'package.json');
export const outlineFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'outline.md');
export const scriptFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'script.md');

/** Tests pass `runAI` to answer without a real model. */
export interface PlanOptions extends Pick<RunAIOptions, 'extraDirs'> {
  runAI?: typeof runAI;
}

// ---------------------------------------------------------------- shapes

const rating = z.object({ level: z.enum(['high', 'mid', 'low']), note: z.string().max(2000) }).strict();
const text = (max: number) => z.string().max(max);

export const packageShape = z
  .object({
    demand: rating,
    gap: rating,
    show: rating,
    angle: text(2000),
    twist: text(2000),
    titles: z.tuple([text(200), text(200), text(200)]),
    thumbnailText: text(200),
    hook: z.object({ visual: text(2000), spoken: text(2000), text: text(500) }).strict(),
  })
  .strict();

export const SCENE_ID = /^[A-Za-z0-9_-]{1,40}$/;

const sceneShape = z
  .object({
    id: z.string().regex(SCENE_ID).optional(),
    title: text(300),
    talkingPoints: z.array(text(2000)).max(60),
    show: text(4000),
    seconds: z.number().int().min(0).max(36_000),
  })
  .strict();

/** An outline as the person edits it: 1 to 20 scenes. The AI's own answer is held to 4 to 7 by `outlineProblems`. */
export const outlineShape = z.object({ scenes: z.array(sceneShape).min(1).max(20) }).strict();

function parseAnswer<T>(shape: z.ZodType<T>, json: unknown, who: string, what: string): T {
  const parsed = shape.safeParse(json);
  if (!parsed.success) {
    console.error(`[club] ${what} answer rejected:`, parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    throw new AiError('bad-answer', `${who} answered in a shape we could not read.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------- outline.md

const MARKER = '<!-- CreatorClub outline -->';
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const squash = (value: string) => value.replace(/\s+/g, ' ').trim();

/** A new scene id. */
export const newSceneId = () => `s_${randomBytes(4).toString('hex')}`;

/**
 * The outline as markdown: one `###` heading per scene with its time span and its id (an HTML comment), the talking points
 * as bullets, then `Show:`.
 */
export function formatOutline(outline: Pick<Outline, 'scenes'>): string {
  let at = 0;
  const scenes = outline.scenes.map((scene, index) => {
    const start = at;
    at += scene.seconds;
    const id = scene.id ? ` <!-- id:${scene.id} -->` : '';
    const lines = [`### ${index + 1}. ${squash(scene.title) || 'Untitled'} (${clock(start)}–${clock(at)})${id}`];
    for (const point of scene.talkingPoints) if (squash(point)) lines.push(`- ${squash(point)}`);
    if (squash(scene.show)) lines.push(`Show: ${squash(scene.show)}`);
    return lines.join('\n');
  });
  return `${MARKER}\n# Outline\n\n${scenes.join('\n\n')}\n`;
}

const HEADING = /^###\s+(?:\d+[.)]\s+)?(.*?)\s*(?:\((\d+):(\d{1,2})\s*[–—-]\s*(\d+):(\d{1,2})\))?\s*$/;
const HEADING_ID = /\s*<!--\s*id:([A-Za-z0-9_-]{1,40})\s*-->\s*$/;
const toSeconds = (minutes: string, seconds: string) => Number(minutes) * 60 + Number(seconds);

/**
 * Reads an outline back from markdown. Every `###` heading is a scene (with its id when it has one); its bullets are talking
 * points ("Say:" is dropped), and a `Show:` line or bullet is what to show. Also reads the old board's outlines.
 */
export function parseOutline(markdown: string): Outline {
  const scenes: OutlineScene[] = [];
  let scene: OutlineScene | undefined;
  for (const raw of markdown.split('\n')) {
    let line = raw.trim();
    if (/^#{1,2}\s/.test(line)) {
      scene = undefined;
      continue;
    }
    const id = /^###\s/.test(line) ? HEADING_ID.exec(line)?.[1] : undefined;
    if (id) line = line.replace(HEADING_ID, '');
    const heading = HEADING.exec(line);
    if (heading) {
      const [, title, m1, s1, m2, s2] = heading;
      const seconds = m1 !== undefined ? Math.max(0, toSeconds(m2, s2) - toSeconds(m1, s1)) : 0;
      scene = { ...(id ? { id } : {}), title: title.trim(), talkingPoints: [], show: '', seconds };
      scenes.push(scene);
      continue;
    }
    if (!scene || !line) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(line)?.[1];
    const body = (bullet ?? line).trim();
    const show = /^show:\s*(.*)$/i.exec(body)?.[1];
    if (show !== undefined) scene.show = scene.show ? `${scene.show} ${show}` : show;
    else if (bullet !== undefined) {
      const point = body.replace(/^say:\s*/i, '');
      if (point) scene.talkingPoints.push(point);
    } else if (!/^say:\s*$/i.test(body)) {
      // A loose line continues the last talking point.
      const last = scene.talkingPoints.length - 1;
      if (last >= 0) scene.talkingPoints[last] += ` ${body}`;
      else scene.talkingPoints.push(body);
    }
  }
  return { scenes };
}

const titleKey = (title: string) => squash(title).toLowerCase();

/**
 * Gives every scene an id. A scene keeps the id it has (unless another scene already took it); a scene without one takes
 * the id of an earlier scene with the same title that no other scene kept, so an AI re-run keeps the scenes it only rewrote.
 * Anything else is a new scene and gets a new id.
 */
export function adoptSceneIds(scenes: OutlineScene[], previous: OutlineScene[] = []): OutlineScene[] {
  const taken = new Set<string>();
  const kept = scenes.map((scene) => (scene.id && !taken.has(scene.id) ? (taken.add(scene.id), scene.id) : undefined));
  const free = previous.filter((scene) => scene.id && !taken.has(scene.id));
  return scenes.map((scene, index) => {
    let id = kept[index];
    if (!id) {
      const match = free.find((old) => old.id && !taken.has(old.id) && titleKey(old.title) === titleKey(scene.title));
      id = match?.id ?? newSceneId();
      while (taken.has(id)) id = newSceneId();
      taken.add(id);
    }
    return { ...scene, id };
  });
}

// ---------------------------------------------------------------- reading and saving

export async function readPackage(slug: string, id: string): Promise<Package | null> {
  await store.readVideo(slug, id);
  const saved = await store.readJSON<unknown>(packageFile(slug, id));
  if (saved === undefined) return null;
  const parsed = packageShape.safeParse(saved);
  return parsed.success ? parsed.data : null;
}

export async function savePackage(slug: string, id: string, pkg: unknown): Promise<Package> {
  await store.readVideo(slug, id);
  const parsed = packageShape.parse(pkg);
  await store.writeJSON(packageFile(slug, id), parsed);
  return parsed;
}

const readText = (file: string) => fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? undefined : Promise.reject(error)));

/**
 * The outline and, when one was written, the full script. Null when there is no outline or it has no scenes.
 * Scenes of an outline written before ids existed (the old board's) get ids from their place, the same on every read,
 * until the outline is first saved.
 */
export async function readOutline(slug: string, id: string): Promise<Outline | null> {
  await store.readVideo(slug, id);
  const markdown = await readText(outlineFile(slug, id));
  if (markdown === undefined) return null;
  const parsed = parseOutline(markdown);
  if (!parsed.scenes.length) return null;
  const used = new Set(parsed.scenes.map((scene) => scene.id).filter(Boolean));
  const scenes = parsed.scenes.map((scene, index) => (scene.id ? scene : { ...scene, id: used.has(`s_${index + 1}`) ? newSceneId() : `s_${index + 1}` }));
  const script = await readText(scriptFile(slug, id));
  return script?.trim() ? { scenes, fullScript: script } : { scenes };
}

/** "2026-10-28T22-50-18-485Z": names the versions set aside by one run, and is the token Undo and Use it take. */
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
export const VERSION_TOKEN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const versionFile = (file: string, label: string, token: string) => {
  const parsed = path.parse(file);
  return path.join(parsed.dir, `${parsed.name}-${label}-${token}${parsed.ext}`);
};

/** Moves a file aside under a dated name, so nothing the person wrote is ever lost. True when there was a file. */
async function setAside(file: string, label: string, token = stamp()): Promise<boolean> {
  return fs.rename(file, versionFile(file, label, token)).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return false;
    },
  );
}

/** Saves the scenes, giving each an id. An outline carried over from the old board is kept next to it the first time it is replaced. */
export async function saveOutline(slug: string, id: string, outline: unknown): Promise<Outline> {
  await store.readVideo(slug, id);
  const parsed = outlineShape.parse(outline);
  const file = outlineFile(slug, id);
  const existing = await readText(file);
  const previous = (await readOutline(slug, id))?.scenes ?? [];
  if (existing !== undefined && !existing.startsWith(MARKER)) await setAside(file, 'board');
  await store.writeFileAtomic(file, formatOutline({ scenes: adoptSceneIds(parsed.scenes, previous) }));
  return (await readOutline(slug, id)) ?? parsed;
}

/** Saves the full script, or with null goes back to talking points (the script is set aside, not removed). */
export async function saveScript(slug: string, id: string, script: string | null): Promise<Outline | null> {
  await store.readVideo(slug, id);
  if (script === null || !script.trim()) await setAside(scriptFile(slug, id), 'unused');
  else await store.writeFileAtomic(scriptFile(slug, id), script.trimEnd() + '\n');
  return readOutline(slug, id);
}

// ---------------------------------------------------------------- versions: replace with Undo, or hold a late result

const FILES: Record<PlanJobKind, (slug: string, id: string) => string> = { package: packageFile, outline: outlineFile, script: scriptFile };
/** The files a step's result depends on: when any of them changes while the step runs, its result is held, not written. */
const WATCHED: Record<PlanJobKind, PlanJobKind[]> = { package: ['package'], outline: ['outline', 'script'], script: ['outline', 'script'] };

/** The current contents of a step's files, to tell whether the person changed them while the step ran. */
async function snapshotOf(slug: string, id: string, kind: PlanJobKind): Promise<string> {
  const parts = await Promise.all(WATCHED[kind].map((watched) => readText(FILES[watched](slug, id))));
  return JSON.stringify(parts);
}

/**
 * Writes a finished step's result. If the person changed the step while it ran, the result is kept aside as
 * `<file>-new-<token>` and nothing is overwritten (`held`). Otherwise the earlier version is set aside as
 * `<file>-earlier-<token>` (`replaced`, which Undo takes); Create outline sets the full script aside with it.
 */
async function commitResult(slug: string, id: string, kind: PlanJobKind, before: string, content: string): Promise<{ replaced?: string; held?: string }> {
  const token = stamp();
  const file = FILES[kind](slug, id);
  if ((await snapshotOf(slug, id, kind)) !== before) {
    await store.writeFileAtomic(versionFile(file, 'new', token), content);
    return { held: token };
  }
  let replaced = await setAside(file, 'earlier', token);
  if (kind === 'outline') replaced = (await setAside(scriptFile(slug, id), 'earlier', token)) || replaced;
  await store.writeFileAtomic(file, content);
  return replaced ? { replaced: token } : {};
}

const checkToken = (token: string) => {
  if (!VERSION_TOKEN.test(token)) throw new ClubError('That version was not found.', 404);
  return token;
};
const exists = (file: string) => fs.access(file).then(() => true, () => false);

/** Undo after a replace: the versions set aside by that run come back; what replaced them is set aside in turn. */
export async function undoReplace(slug: string, id: string, kind: PlanJobKind, token: string): Promise<void> {
  await store.readVideo(slug, id);
  checkToken(token);
  const kinds: PlanJobKind[] = kind === 'outline' ? ['outline', 'script'] : [kind];
  const back = kinds.map((each) => ({ file: FILES[each](slug, id), earlier: versionFile(FILES[each](slug, id), 'earlier', checkToken(token)) }));
  const found = await Promise.all(back.map((item) => exists(item.earlier)));
  if (!found[0]) throw new ClubError('That version was not found.', 404);
  const now = stamp();
  for (const [index, item] of back.entries()) {
    await setAside(item.file, 'undone', now);
    if (found[index]) await fs.rename(item.earlier, item.file);
  }
}

/** Use it: a held result becomes the current version; the current one is set aside. */
export async function useHeld(slug: string, id: string, kind: PlanJobKind, token: string): Promise<void> {
  await store.readVideo(slug, id);
  const file = FILES[kind](slug, id);
  const held = versionFile(file, 'new', checkToken(token));
  if (!(await exists(held))) throw new ClubError('That version was not found.', 404);
  const content = await fs.readFile(held, 'utf8');
  const now = stamp();
  if (kind === 'outline') {
    const previous = (await readOutline(slug, id))?.scenes ?? [];
    await setAside(file, 'earlier', now);
    await setAside(scriptFile(slug, id), 'earlier', now);
    await store.writeFileAtomic(file, formatOutline({ scenes: adoptSceneIds(parseOutline(content).scenes, previous) }));
  } else {
    await setAside(file, 'earlier', now);
    await store.writeFileAtomic(file, content);
  }
  await setAside(held, 'used', now);
}

/** Held results newer than the step's current file, by step: the newest token of each. */
export async function heldResults(slug: string, id: string): Promise<PlanData['ready']> {
  const dir = store.videoDir(slug, id);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const ready: PlanData['ready'] = {};
  for (const kind of PLAN_JOB_KINDS) {
    const file = FILES[kind](slug, id);
    const { name, ext } = path.parse(file);
    const tokens = names
      .map((entry) => new RegExp(`^${name}-new-(.+)\\${ext}$`).exec(entry)?.[1])
      .filter((token): token is string => !!token && VERSION_TOKEN.test(token))
      .sort();
    const newest = tokens.at(-1);
    if (!newest) continue;
    const [heldAt, currentAt] = await Promise.all([fs.stat(versionFile(file, 'new', newest)).then((s) => s.mtimeMs), fs.stat(file).then((s) => s.mtimeMs, () => 0)]);
    if (heldAt > currentAt) ready[kind] = newest;
  }
  return ready;
}

// ---------------------------------------------------------------- one run per video and step

const runningJobs = new Map<string, string>();
const jobKey = (slug: string, id: string, kind: PlanJobKind) => `${slug}/${id}/${kind}`;

/** Starts a Plan step for a video, or returns the run of that step already going, so a second click never pays twice. */
export function startPlanJob(slug: string, id: string, kind: PlanJobKind, options: PlanOptions = {}): JobSnapshot {
  const key = jobKey(slug, id, kind);
  const running = runningJobs.get(key);
  const job = running ? getJob(running) : undefined;
  if (job?.status === 'running') return snapshot(job);
  const run = { package: runPackage, outline: runOutline, script: runScript }[kind];
  const started = startJob(kind, (context) => (run(slug, id, context, options) as Promise<unknown>).finally(() => runningJobs.get(key) === started.id && runningJobs.delete(key)));
  runningJobs.set(key, started.id);
  return started;
}

/** The runs still going for a video, by step. */
export function runningPlanJobs(slug: string, id: string): PlanData['running'] {
  const found: PlanData['running'] = {};
  for (const kind of PLAN_JOB_KINDS) {
    const jobId = runningJobs.get(jobKey(slug, id, kind));
    if (jobId && getJob(jobId)?.status === 'running') found[kind] = jobId;
  }
  return found;
}

// ---------------------------------------------------------------- the full script, scene by scene

export interface ScriptSection {
  heading: string;
  body: string;
}

/** Splits a script into its `##` scenes. Text before the first `##` (the `#` title) is left out. */
export function scriptSections(script: string): ScriptSection[] {
  const sections: ScriptSection[] = [];
  let current: ScriptSection | undefined;
  for (const line of script.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line.trim());
    if (heading && !line.trim().startsWith('###')) {
      current = { heading: heading[1].trim(), body: '' };
      sections.push(current);
    } else if (current) current.body += `${line}\n`;
  }
  return sections.map((section) => ({ ...section, body: section.body.trim() }));
}

/** Puts the sections back together under the script's own title. */
export function joinScript(title: string, sections: ScriptSection[]): string {
  return [`# ${title}`, ...sections.map((section) => `## ${section.heading}\n\n${section.body}`)].join('\n\n') + '\n';
}

// ---------------------------------------------------------------- running the AI steps

const ideaFor = (video: Video): PromptIdea => {
  const { lane: _lane, dropReason: _drop, ...notes } = video.idea ?? {};
  return { title: video.title, ...notes };
};

async function recentTitles(slug: string): Promise<string[]> {
  const channel = await store.readJSON<ChannelData>(path.join(store.workspaceDir(slug), 'channel.json')).catch(() => undefined);
  return [...(channel?.uploads ?? [])]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, RECENT_TITLES)
    .map((upload) => upload.title)
    .filter(Boolean);
}

interface Asker {
  ask(built: { prompt: string; system?: string; schema?: object }, budgetUsd: number): Promise<{ text: string; json?: unknown }>;
  who: string;
}

async function asker(context: JobContext, options: PlanOptions): Promise<Asker> {
  const provider: AiProvider = (await store.defaultAi()) ?? 'claude';
  const run = options.runAI ?? runAI;
  return {
    who: aiLabel(provider),
    ask: (built, budgetUsd) =>
      run({
        extraDirs: options.extraDirs,
        provider,
        prompt: built.prompt,
        system: built.system,
        jsonSchema: built.schema,
        model: provider === 'claude' ? 'sonnet' : undefined,
        budgetUsd,
        signal: context.signal,
      }),
  };
}

const stopped = (context: JobContext) => {
  if (context.signal.aborted) throw new ClubError('That was stopped.');
};

/** The prompt again, with the problems of the last answer to fix. */
const repair = (built: JsonPrompt, answer: unknown, problems: string[]): JsonPrompt => ({
  ...built,
  prompt: `${built.prompt}\n\nYour last answer was:\n${JSON.stringify(answer)}\n\nIt had these problems. Fix them and answer again with the whole JSON:\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
});

/** Package it: reads the idea and the research board and fills in the package. Fixes the titles once if they break the rules. */
export async function runPackage(slug: string, id: string, context: JobContext, options: PlanOptions = {}): Promise<PlanJobResult<Package>> {
  const say = (message: string) => context.emit({ message });
  const video = await store.readVideo(slug, id);
  const before = await snapshotOf(slug, id, 'package');
  say('Reading the idea and the research board…');
  const [channel, research, titles] = await Promise.all([loadChannelContext(slug), store.listTiles(slug, id), recentTitles(slug)]);
  const built = await buildPackagePrompt(channel, { idea: ideaFor(video), research, recentTitles: titles });
  const ai = await asker(context, options);
  say('Writing the package…');
  let pkg = parseAnswer(packageShape, (await ai.ask(built, PACKAGE_BUDGET_USD)).json, ai.who, 'package');
  stopped(context);
  const problems = packageProblems(pkg);
  if (problems.length) {
    say('Fixing the titles…');
    const second = parseAnswer(packageShape, (await ai.ask(repair(built, pkg, problems), PACKAGE_BUDGET_USD)).json, ai.who, 'package');
    stopped(context);
    if (packageProblems(second).length <= problems.length) pkg = second;
  }
  stopped(context);
  const value = packageShape.parse(pkg);
  return { value, ...(await commitResult(slug, id, 'package', before, JSON.stringify(value, null, 2) + '\n')) };
}

/** The reusable outline of the video this one came from, when it came from a break down that still exists. */
async function reusableOutline(slug: string, video: Video): Promise<string[] | undefined> {
  if (video.source?.kind !== 'breakdown' || !video.source.breakdownId) return undefined;
  const breakdown = await readBreakdown(slug, video.source.breakdownId).catch(() => undefined);
  return breakdown?.reusableOutline.length ? breakdown.reusableOutline : undefined;
}

/**
 * Create outline: 4 to 7 scenes from the idea and the package, following the break down's reusable outline when there is one.
 * The answer is checked with `outlineProblems` and repaired once. A full script written for an earlier outline is set aside.
 */
export async function runOutline(slug: string, id: string, context: JobContext, options: PlanOptions = {}): Promise<PlanJobResult<Outline>> {
  const say = (message: string) => context.emit({ message });
  const video = await store.readVideo(slug, id);
  const before = await snapshotOf(slug, id, 'outline');
  const previous = (await readOutline(slug, id))?.scenes ?? [];
  const [channel, pkg, shape] = await Promise.all([loadChannelContext(slug), readPackage(slug, id), reusableOutline(slug, video)]);
  const built = await buildOutlinePrompt(channel, { idea: ideaFor(video), pkg: pkg ?? undefined, reusableOutline: shape });
  const ai = await asker(context, options);
  say(shape ? 'Following the shape of the video you broke down…' : 'Writing the scenes…');
  let outline = parseAnswer(outlineShape, (await ai.ask(built, OUTLINE_BUDGET_USD)).json, ai.who, 'outline');
  stopped(context);
  const problems = outlineProblems(outline);
  if (problems.length) {
    say('Fixing the outline…');
    const second = parseAnswer(outlineShape, (await ai.ask(repair(built, outline, problems), OUTLINE_BUDGET_USD)).json, ai.who, 'outline');
    stopped(context);
    if (outlineProblems(second).length <= problems.length) outline = second;
  }
  stopped(context);
  // The current outline's ids carry over to scenes with the same title, so their recorder scenes and takes stay with them.
  const value = { scenes: adoptSceneIds(outline.scenes, previous) };
  const result = await commitResult(slug, id, 'outline', before, formatOutline(value));
  return { value: result.held ? value : ((await readOutline(slug, id)) ?? value), ...result };
}

const stripFence = (value: string) => value.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1').trim();

/** Write full script instead: the script in the creator's voice, then each scene under 80% of its word budget lengthened once. */
export async function runScript(slug: string, id: string, context: JobContext, options: PlanOptions = {}): Promise<PlanJobResult<Outline>> {
  const say = (message: string) => context.emit({ message });
  const video = await store.readVideo(slug, id);
  const before = await snapshotOf(slug, id, 'script');
  const outline = await readOutline(slug, id);
  if (!outline) throw new ClubError('Create the outline first.');
  const [channel, pkg] = await Promise.all([loadChannelContext(slug), readPackage(slug, id)]);
  const title = pkg?.titles[0]?.trim() || video.title;
  const ai = await asker(context, options);
  say('Writing the full script…');
  const built = await buildScriptPrompt(channel, { title, idea: ideaFor(video), pkg: pkg ?? undefined, outline: { scenes: outline.scenes }, mode: 'full' });
  let script = stripFence((await ai.ask(built, SCRIPT_BUDGET_USD)).text);
  stopped(context);
  if (!script) throw new AiError('bad-answer', `${ai.who} sent back no script.`);
  const sections = scriptSections(script);
  if (sections.length === outline.scenes.length) {
    for (const [index, section] of sections.entries()) {
      const want = sceneWords(outline.scenes[index].seconds);
      if (!want || spokenWords(section.body) >= want * EXPAND_BELOW) continue;
      say(`Lengthening scene ${index + 1}…`);
      const expand = await buildExpandPrompt(channel, { outline: { scenes: outline.scenes }, script: joinScript(title, sections), heading: section.heading, section: section.body, want });
      // Only the scene's body is wanted; a heading the model adds anyway would split the script into extra scenes.
      const body = stripFence((await ai.ask(expand, EXPAND_BUDGET_USD)).text)
        .split('\n')
        .filter((line) => !/^#{1,2}\s/.test(line.trim()))
        .join('\n')
        .trim();
      stopped(context);
      if (body) sections[index] = { ...section, body };
    }
    script = joinScript(title, sections);
  }
  stopped(context);
  const result = await commitResult(slug, id, 'script', before, script.trimEnd() + '\n');
  return { value: result.held ? { ...outline, fullScript: script } : ((await readOutline(slug, id)) ?? outline), ...result };
}
