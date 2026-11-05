import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PLAN_JOB_KINDS, onepagerShape, type OnePager, type AiProvider, type JobSnapshot, type Outline, type OutlineScene, type Package, type PackageUseResult, type PlanData, type PlanJobKind, type PlanJobResult, type Video } from '../../shared/club.js';
import { describeAngle } from '../../shared/description.js';
import { mergePackage, type PackageGroup } from '../../shared/package-merge.js';
import { chosenIndex, pairThumbs } from '../../shared/package-rules.js';
import { AiError, aiLabel, runAI, type RunAIOptions } from './ai.js';
import { boardTiles } from './board-docs.js';
import { readBreakdown } from './breakdown.js';
import type { ChannelData } from './channel.js';
import { loadChannelContext } from './context.js';
import { ClubError, notFound } from './errors.js';
import { getJob, snapshot, startJob, type JobContext } from './jobs.js';
import {
  buildExpandPrompt,
  buildOutlinePrompt,
  buildPackagePrompt,
  buildOnePagerPrompt,
  onepagerProblems,
  buildSceneScriptPrompt,
  buildScriptPrompt,
  outlineProblems,
  packageProblems,
  sceneWords,
  spokenWords,
  type ChannelContext,
  type JsonPrompt,
  type PromptIdea,
} from './prompts.js';
import * as store from './store.js';

/*
 * The Plan step's saved work and the three AI steps behind it: Package it, Create outline and Write full script instead.
 * Files live in the video's folder: package.json, outline.md (readable markdown that is parsed back) and script.md.
 */

export const PACKAGE_BUDGET_USD = 0.5;
export const ONEPAGER_BUDGET_USD = PACKAGE_BUDGET_USD;
export const OUTLINE_BUDGET_USD = 1;
export const SCRIPT_BUDGET_USD = 1;
export const EXPAND_BUDGET_USD = 0.5;
/** A scene under this share of its word budget gets lengthened once (the board's rule). */
const EXPAND_BELOW = 0.8;
const RECENT_TITLES = 10;

export const packageFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'package.json');
export const onepagerFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'onepager.json');
export const outlineFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'outline.md');
export const scriptFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'script.md');

/** Tests pass `runAI` to answer without a real model. */
export interface PlanOptions extends Pick<RunAIOptions, 'extraDirs'> {
  runAI?: typeof runAI;
  /** Where `~/.claude` is (tests point it elsewhere). */
  home?: string;
  /** Package run only: the group (titles, thumbnail text or hook) the person asked to write again; it is replaced whole. Everything else fills only what is empty. */
  replace?: PackageGroup;
}

// ---------------------------------------------------------------- shapes

const rating = z.object({ level: z.enum(['high', 'mid', 'low']), note: z.string().max(2000) }).strict();
const text = (max: number) => z.string().max(max);

export const packageShape = z
  .object({
    demand: rating.optional(),
    gap: rating.optional(),
    show: rating.optional(),
    angle: text(2000),
    twist: text(2000),
    titles: z.tuple([text(200), text(200), text(200)]),
    thumbnailText: text(200),
    thumbs: z.tuple([text(200), text(200), text(200)]).optional(),
    hook: z.object({ visual: text(2000), spoken: text(2000), text: text(500) }).strict(),
    description: text(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  })
  .strict();

export const SCENE_ID = /^[A-Za-z0-9_-]{1,40}$/;

const sceneShape = z
  .object({
    id: z.string().regex(SCENE_ID).optional(),
    // Derived when the outline is read. It is accepted so an outline sent back as it was read is not refused, and it is not saved here.
    script: text(200_000).optional(),
    title: text(300),
    talkingPoints: z.array(text(2000)).max(60),
    show: text(4000),
    decide: z.array(text(2000)).max(30).optional(),
    seconds: z.number().int().min(0).max(36_000),
  })
  .strict();

/** An outline as the person edits it: 0 to 20 scenes (including deleting the last scene). The AI's own answer is held to 4 to 7 by `outlineProblems`. */
export const outlineShape = z.object({ scenes: z.array(sceneShape).max(20) }).strict();

/** Models sometimes escape a quote twice, leaving a literal `\"` in the text; the creator never means one. */
const unescaped = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(/\\(["'])/g, '$1')
  : Array.isArray(value) ? value.map(unescaped)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unescaped(item)]))
  : value;

export function parseAnswer<T>(shape: z.ZodType<T>, json: unknown, who: string, what: string): T {
  const parsed = shape.safeParse(unescaped(json));
  if (!parsed.success) {
    console.error(`[club] ${what} answer rejected:`, parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    throw new AiError('bad-answer', `${who} answered in a shape we could not read.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------- outline.md

const MARKER = '<!-- Creator Compiler outline -->';
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
    for (const item of scene.decide ?? []) if (squash(item)) lines.push(`To decide: ${squash(item)}`);
    return lines.join('\n');
  });
  return `${MARKER}\n# Outline\n\n${scenes.join('\n\n')}\n`;
}

/** An old outline's note to the creator, `[YOUR CALL: …]`. It is a choice to make, not words to say. */
const YOUR_CALL = /\s*\[YOUR CALL:\s*([^\]]*)\]/gi;

/** Text without its `[YOUR CALL: …]` markers, and the choices they held. */
export function takeDecisions(value: string): { text: string; decide: string[] } {
  const decide: string[] = [];
  const text = value.replace(YOUR_CALL, (_marker, choice: string) => {
    if (squash(choice)) decide.push(squash(choice));
    return ' ';
  });
  return { text: text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(), decide };
}

const addDecisions = (scene: OutlineScene, items: string[]) => {
  if (!items.length) return;
  const known = new Set(scene.decide ?? []);
  scene.decide = [...(scene.decide ?? []), ...items.filter((item) => !known.has(item))];
};

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
    // `[YOUR CALL: …]` notes and `To decide:` lines are choices for the creator: they go to the scene's "To decide" list, never into what is said.
    const { text: said, decide } = takeDecisions((bullet ?? line).trim());
    addDecisions(scene, decide);
    const toDecide = /^to decide:\s*(.*)$/i.exec(said)?.[1];
    if (toDecide !== undefined) {
      if (toDecide.trim()) addDecisions(scene, [squash(toDecide)]);
      continue;
    }
    const body = said;
    if (!body) continue;
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
  return scenes.length ? { scenes } : parsePointsOutline(markdown);
}

const CONFIRM = /\s*\[CONFIRM:[^\]]*\]/g;
const cleanLine = (value: string) => value.replace(CONFIRM, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/**
 * The old board's outline format: a `## Points` section where each `- Point N: title` is a scene and its indented bullets are what to say
 * (`On screen:` is what to show; `Structure:` is a template and is left out; `[CONFIRM: …]` notes to the creator are dropped). Scenes have no length there.
 */
function parsePointsOutline(markdown: string): Outline {
  const scenes: OutlineScene[] = [];
  let inPoints = false;
  let scene: OutlineScene | undefined;
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const heading = /^##\s+(.*)$/.exec(line.trim());
    if (heading && !/^\s/.test(line)) {
      inPoints = /^points$/i.test(heading[1].trim());
      scene = undefined;
      continue;
    }
    if (!inPoints) continue;
    const top = /^[-*]\s+Point\s+\d+\s*[:.\-–]\s*(.*)$/i.exec(line);
    if (top) {
      scene = { title: cleanLine(top[1]) || 'Untitled', talkingPoints: [], show: '', seconds: 0 };
      scenes.push(scene);
      continue;
    }
    const sub = scene && /^\s+[-*]\s+(.*)$/.exec(line);
    if (!scene || !sub) continue;
    const labelled = /^([^:]{1,40}):\s*(.*)$/.exec(cleanLine(sub[1]));
    const label = labelled?.[1].toLowerCase();
    const body = labelled ? labelled[2].trim() : cleanLine(sub[1]);
    if (label === 'structure' || !body) continue;
    if (label === 'on screen') scene.show = body;
    else scene.talkingPoints.push(body);
  }
  return { scenes };
}

/** The package an old board outline holds: the Promise as the angle, the first three Title options, and the recommended hook's spoken line. Null when it has none of them. */
export function packageFromOldOutline(markdown: string): Package | null {
  const sections = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const raw of markdown.split('\n')) {
    const heading = /^##\s+(.*?)\s*$/.exec(raw);
    if (heading) sections.set(heading[1].toLowerCase(), (current = []));
    else current?.push(raw);
  }
  const titles = (sections.get('title options') ?? []).map((line) => /^\s*\d+[.)]\s+(.*)$/.exec(line)?.[1]).filter((title): title is string => !!title).map(cleanLine).filter(Boolean).slice(0, 3);
  const spoken = /"([^"\n]{5,})"/.exec((sections.get('hook') ?? []).join('\n'))?.[1]?.trim() ?? '';
  // The Promise is its first paragraph; what follows can be the planner's own notes about the brief, which are not the promise.
  const angle = describeAngle(cleanLine(((sections.get('promise') ?? []).join('\n').trim().split(/\n\s*\n/)[0]) ?? ''));
  if (!titles.length && !spoken) return null;
  return { angle, twist: '', titles: [titles[0] ?? '', titles[1] ?? '', titles[2] ?? ''], thumbnailText: '', hook: { visual: '', spoken, text: '' } };
}

const isBlank = (value: string | undefined) => !value?.trim();

/** `base` with every empty place filled from `seed`. Nothing that has words or a rating is changed. */
function fillEmpty(base: Package, seed: Package): Package {
  return {
    ...base,
    ...(base.demand || !seed.demand ? {} : { demand: seed.demand }),
    ...(base.gap || !seed.gap ? {} : { gap: seed.gap }),
    ...(base.show || !seed.show ? {} : { show: seed.show }),
    angle: isBlank(base.angle) ? seed.angle : base.angle,
    twist: isBlank(base.twist) ? seed.twist : base.twist,
    thumbnailText: isBlank(base.thumbnailText) ? seed.thumbnailText : base.thumbnailText,
    titles: base.titles.map((title, i) => (isBlank(title) ? seed.titles[i] : title)) as Package['titles'],
    hook: { visual: isBlank(base.hook.visual) ? seed.hook.visual : base.hook.visual, spoken: isBlank(base.hook.spoken) ? seed.hook.spoken : base.hook.spoken, text: isBlank(base.hook.text) ? seed.hook.text : base.hook.text },
  };
}

/**
 * A video that has no package yet starts from what it already has, without an AI call: an old board outline's promise, titles and hook,
 * then the idea's angle, twist, hook and ratings. Once made, the package is never started again.
 */
export function ensurePackage(slug: string, video: Video): Promise<Package | null> {
  const id = video.id;
  // Under the package lock, so a save arriving at the same time is never overwritten. Only a package that was never made is started:
  // one the person cleared (the file exists) stays as they left it.
  return store.withLock(`package:${packageFile(slug, id)}`, async () => {
    if ((await store.readJSON<unknown>(packageFile(slug, id))) !== undefined) return readPackage(slug, id);
    const idea = video.idea;
    const old = await readText(outlineFile(slug, id));
    const seeds: Package[] = [];
    const fromOutline = old === undefined ? null : packageFromOldOutline(old);
    if (fromOutline) seeds.push(fromOutline);
    if (idea && (idea.angle || idea.twist || idea.hook || idea.demand || idea.gap || idea.show)) {
      seeds.push({ ...emptyPackage(), angle: idea.angle ?? '', twist: idea.twist ?? '', hook: { visual: '', spoken: idea.hook ?? '', text: '' }, ...(idea.demand ? { demand: idea.demand } : {}), ...(idea.gap ? { gap: idea.gap } : {}), ...(idea.show ? { show: idea.show } : {}) });
    }
    if (!seeds.length) return null;
    return savePackage(slug, id, seeds.reduce(fillEmpty, emptyPackage()));
  });
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

export async function readOnePager(slug: string, id: string): Promise<OnePager | null> {
  await store.readVideo(slug, id);
  const parsed = onepagerShape.safeParse(await store.readJSON<unknown>(onepagerFile(slug, id)));
  return parsed.success ? parsed.data : null;
}

export async function saveOnePager(slug: string, id: string, value: unknown): Promise<OnePager> {
  await store.readVideo(slug, id);
  const parsed = onepagerShape.parse(value);
  await store.withLock(`onepager:${onepagerFile(slug, id)}`, () => store.writeJSON(onepagerFile(slug, id), parsed));
  return parsed;
}

/**
 * Keeps the video's `planning` flags true to what exists: the package is done once it has a title and a spoken hook, the outline
 * once it has scenes. Read by the card's status line.
 */
export async function syncPlanningFlags(slug: string, id: string): Promise<void> {
  const [video, pkg, outline] = await Promise.all([store.readVideo(slug, id), readPackage(slug, id), readOutline(slug, id)]);
  const packaged = !!pkg && pkg.titles.some((title) => title.trim()) && !!pkg.hook.spoken.trim();
  const outlined = !!outline?.scenes.length;
  if (video.planning.package !== packaged || video.planning.outline !== outlined) await store.updateVideo(slug, id, { planning: { ...video.planning, package: packaged, outline: outlined } });
}

export async function savePackage(slug: string, id: string, pkg: unknown): Promise<Package> {
  await store.readVideo(slug, id);
  const parsed = packageShape.parse(pkg);
  await store.writeJSON(packageFile(slug, id), parsed);
  await syncPlanningFlags(slug, id);
  return parsed;
}

const packagePatch = z.object({ ...packageShape.shape, hook: packageShape.shape.hook.partial(), titles: z.array(text(200).nullable()).length(3) }).partial().strict();

/**
 * Saves part of the package: only the fields sent change (a title slot sent as null stays), so a page that is behind cannot put back what it did not edit.
 * A whole package (every field a package needs) replaces it, which is what Undo sends.
 */
export function patchPackage(slug: string, id: string, body: unknown): Promise<Package> {
  return store.withLock(`package:${packageFile(slug, id)}`, async () => {
    if (packageShape.safeParse(body).success) return savePackage(slug, id, body);
    const patch = packagePatch.parse(body);
    const base = (await readPackage(slug, id)) ?? emptyPackage();
    const { hook, titles, ...rest } = patch;
    // A title slot sent as null is not being changed.
    const merged = titles ? (base.titles.map((title, i) => titles[i] ?? title) as Package['titles']) : base.titles;
    return savePackage(slug, id, { ...base, ...rest, titles: merged, ...(hook ? { hook: { ...base.hook, ...hook } } : {}) });
  });
}

/** A package with nothing written yet: no ratings, blank fields. Use as hook or Use as title fills in the one thing it was given. */
const emptyPackage = (): Package => ({ angle: '', twist: '', titles: ['', '', ''], thumbnailText: '', hook: { visual: '', spoken: '', text: '' } });

/**
 * Use as hook or Use as title: puts a line from the Board chat into the package, making a package when there is none.
 * A title goes first (the first title is the one the video is named by) and the earlier ones follow it, the last one dropping off when all three are full.
 * Saved with `savePackage`, the same path as PUT /package, so a Package it run that is still going holds its result.
 * Returns the package it replaced, for Undo: `PUT /package` with it, or `DELETE /package` when there was none.
 */
export function usePackageText(slug: string, id: string, kind: 'hook' | 'title', line: string): Promise<PackageUseResult> {
  return store.withLock(`package:${packageFile(slug, id)}`, async () => {
    const video = await store.readVideo(slug, id);
    const text = squash(line);
    if (!text) throw new ClubError('Add some text first.');
    if (kind === 'title' && [...text].length > 200) throw new ClubError('That title is too long.');
    const previous = await readPackage(slug, id);
    const base = previous ?? emptyPackage();
    const key = (title: string) => title.trim().toLowerCase();
    // A title moves with its own thumbnail words: the new one goes first (keeping the words it had, if it was already an option).
    const thumbs = base.thumbs ? pairThumbs(base, video.title) : undefined;
    const order = [text, ...base.titles.filter((title) => title.trim() && key(title) !== key(text))].slice(0, 3);
    const titles = [...order, '', ''].slice(0, 3) as Package['titles'];
    const thumbFor = (title: string) => { const at = base.titles.findIndex((one) => one.trim() && key(one) === key(title)); return at >= 0 && thumbs ? thumbs[at] : ''; };
    const next: Package =
      kind === 'hook'
        ? { ...base, hook: { ...base.hook, spoken: text } }
        : { ...base, titles, ...(thumbs ? { thumbs: titles.map((title) => (title ? thumbFor(title) : '')) as [string, string, string] } : {}) };
    return { package: await savePackage(slug, id, next), previous };
  });
}

/** Removes the package (it is set aside, not deleted), so Undo of a first Use as hook or Use as title goes back to no package. */
export async function deletePackage(slug: string, id: string): Promise<void> {
  await store.readVideo(slug, id);
  await setAside(packageFile(slug, id), 'unused');
  await syncPlanningFlags(slug, id);
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
  return withScript(scenes, await readText(scriptFile(slug, id)));
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
  await syncPlanningFlags(slug, id);
  return (await readOutline(slug, id)) ?? parsed;
}

/** Saves the full script, or with null goes back to talking points (the script is set aside, not removed). */
export async function saveScript(slug: string, id: string, script: string | null): Promise<Outline | null> {
  await store.readVideo(slug, id);
  if (script === null || !script.trim()) await setAside(scriptFile(slug, id), 'unused');
  else await store.writeFileAtomic(scriptFile(slug, id), script.trimEnd() + '\n');
  return readOutline(slug, id);
}

/**
 * Hand-edits one scene's script. The scene's part is merged into the script as it is now, in the format the script already has:
 * a script written scene by scene stays that way (the other scenes keep what they have), a full script stays one. A script that has
 * no `##` scenes cannot be split, so it is edited as the full script instead.
 */
export async function saveSceneScript(slug: string, id: string, sceneId: string, text: string): Promise<Outline> {
  await store.readVideo(slug, id);
  const file = scriptFile(slug, id);
  return store.withLock(`script:${file}`, async () => {
    const outline = await readOutline(slug, id);
    const index = outline?.scenes.findIndex((scene) => scene.id === sceneId) ?? -1;
    if (!outline || index < 0) throw notFound('scene');
    const current = await readText(file);
    if (current?.trim() && !scriptSections(current).length) throw new ClubError('This script has no scenes to edit one by one. Edit the full script instead.', 409);
    const body = text.trim();
    if (current === undefined && !body) return outline;
    const pkg = await readPackage(slug, id);
    const video = await store.readVideo(slug, id);
    await store.writeFileAtomic(file, mergeScene(outline.scenes, index, current, body, pkg?.titles[0]?.trim() || video.title));
    return (await readOutline(slug, id)) ?? outline;
  });
}

// ---------------------------------------------------------------- versions: replace with Undo, or hold a late result

const FILES: Record<PlanJobKind, (slug: string, id: string) => string> = { package: packageFile, outline: outlineFile, script: scriptFile, onepager: onepagerFile };
/** The files a step's result depends on: when any of them changes while the step runs, its result is held, not written. */
const WATCHED: Record<PlanJobKind, PlanJobKind[]> = { package: ['package'], outline: ['outline', 'script'], script: ['outline', 'script'], onepager: ['onepager'] };

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
  const write = async () => {
    const token = stamp();
    const file = FILES[kind](slug, id);
    if ((await snapshotOf(slug, id, kind)) !== before) {
      await store.writeFileAtomic(versionFile(file, 'new', token), content);
      return { held: token };
    }
    let replaced = await setAside(file, 'earlier', token);
    if (kind === 'outline') replaced = (await setAside(scriptFile(slug, id), 'earlier', token)) || replaced;
    await store.writeFileAtomic(file, content);
    await syncPlanningFlags(slug, id);
    return replaced ? { replaced: token } : {};
  };
  // A hand-save and a finished one-pager cannot slip between the snapshot check and its write.
  return kind === 'onepager' ? store.withLock(`onepager:${FILES[kind](slug, id)}`, write) : write();
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
  await syncPlanningFlags(slug, id);
}

/** Use it: a held result becomes the current version; the current one is set aside. */
export async function useHeld(slug: string, id: string, kind: PlanJobKind, token: string): Promise<void> {
  await store.readVideo(slug, id);
  const file = FILES[kind](slug, id);
  const held = versionFile(file, 'new', checkToken(token));
  if (!(await exists(held))) throw new ClubError('That version was not found.', 404);
  const content = await fs.readFile(held, 'utf8');
  const now = stamp();
  const heldScene = kind === 'script' ? HELD_SCENE.exec(content)?.[1] : undefined;
  if (heldScene) {
    // A scene's result takes only that scene's place in the script as it is now; edits made elsewhere stay.
    const scenes = (await readOutline(slug, id))?.scenes ?? [];
    const index = scenes.findIndex((scene) => scene.id === heldScene);
    if (index < 0) throw new ClubError('That scene was not found.', 404);
    const current = await readText(file);
    const body = scriptSections(content.replace(HELD_SCENE, ''))[0]?.body ?? '';
    const video = await store.readVideo(slug, id);
    await setAside(file, 'earlier', now);
    await store.writeFileAtomic(file, mergeScene(scenes, index, current, body, video.title));
  } else if (kind === 'outline') {
    const previous = (await readOutline(slug, id))?.scenes ?? [];
    await setAside(file, 'earlier', now);
    await setAside(scriptFile(slug, id), 'earlier', now);
    await store.writeFileAtomic(file, formatOutline({ scenes: adoptSceneIds(parseOutline(content).scenes, previous) }));
  } else {
    await setAside(file, 'earlier', now);
    await store.writeFileAtomic(file, content);
  }
  await setAside(held, 'used', now);
  await syncPlanningFlags(slug, id);
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
/** The scene a running script job writes; empty for the whole script. */
const runningScenes = new Map<string, string>();
const jobKey = (slug: string, id: string, kind: PlanJobKind) => `${slug}/${id}/${kind}`;

/**
 * Starts a Plan step for a video, or returns the run of that step already going, so a second click never pays twice.
 * Write full script instead takes a `sceneId` to write one scene. The script is one file, so only one script run goes at a time per video.
 */
export function startPlanJob(slug: string, id: string, kind: PlanJobKind, options: PlanOptions = {}, sceneId?: string, replace?: PackageGroup): JobSnapshot {
  const key = jobKey(slug, id, kind);
  const running = runningJobs.get(key);
  const job = running ? getJob(running) : undefined;
  if (job?.status === 'running') {
    if ((runningScenes.get(key) ?? '') !== (sceneId ?? '')) throw new ClubError('Wait for the script that is running.', 409);
    return snapshot(job);
  }
  const run: (slug: string, id: string, context: JobContext, options?: PlanOptions) => Promise<unknown> = sceneId && kind === 'script' ? (s, i, context, opts) => runSceneScript(s, i, sceneId, context, opts) : { package: runPackage, outline: runOutline, script: runScript, onepager: runOnePager }[kind];
  const started = startJob(kind, (context) =>
    run(slug, id, context, replace ? { ...options, replace } : options).finally(() => {
      if (runningJobs.get(key) !== started.id) return;
      runningJobs.delete(key);
      runningScenes.delete(key);
    }),
  );
  runningJobs.set(key, started.id);
  runningScenes.set(key, sceneId ?? '');
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

/**
 * A script written one scene at a time starts with this line. It tells a script that covers some scenes from one written as a
 * whole, so the Plan step does not treat a scene's script as the full script. It is left out of everything shown.
 */
const SCENES_MARKER = '<!-- Creator Compiler scene script -->';
const withoutMarker = (script: string) => (script.startsWith(SCENES_MARKER) ? script.slice(SCENES_MARKER.length).replace(/^\n/, '') : script);

/** Puts the sections back together under the script's own title. */
export function joinScript(title: string, sections: ScriptSection[], byScene = false): string {
  return (byScene ? `${SCENES_MARKER}\n` : '') + [`# ${title}`, ...sections.map((section) => `## ${section.heading}\n\n${section.body}`)].join('\n\n') + '\n';
}

const headingKey = (title: string) => title.trim().toLowerCase();

/** A scene's part of the script: the section under its own title, else the section in its place when there are as many sections as scenes. */
export function matchSection(sections: ScriptSection[], scenes: Pick<OutlineScene, 'title'>[], index: number): ScriptSection | undefined {
  return sections.find((section) => headingKey(section.heading) === headingKey(scenes[index].title)) ?? (sections.length === scenes.length ? sections[index] : undefined);
}

/**
 * The outline with what its script says. Each scene gets its part of the script (`script`). `scriptState` says whether no scene, some
 * scenes or every scene has one; it is left out when none does. `fullScript` is the whole script, but only when it covers every
 * scene or was written as one piece: a script written scene by scene is not a full script until every scene has its part.
 */
export function withScript(scenes: OutlineScene[], raw: string | undefined): Outline {
  if (!raw?.trim()) return { scenes };
  const sections = scriptSections(raw);
  const withParts = scenes.map((scene, index) => {
    const found = matchSection(sections, scenes, index)?.body;
    if (!found) return scene;
    // An older script can carry `[YOUR CALL: …]` notes too: they join the scene's "To decide" list and leave the words to say.
    const { text: body, decide } = takeDecisions(found);
    if (!decide.length) return { ...scene, script: found };
    const next: OutlineScene = { ...scene, script: body };
    addDecisions(next, decide);
    return next;
  });
  const written = withParts.filter((scene) => scene.script).length;
  const byScene = raw.startsWith(SCENES_MARKER);
  const scriptState = written === 0 && byScene ? 'none' : byScene && written < scenes.length ? 'partial' : 'full';
  if (scriptState === 'none') return { scenes };
  return { scenes: withParts, scriptState, ...(scriptState === 'full' ? { fullScript: withoutMarker(raw) } : {}) };
}

/** Every outline scene with the script it has now (empty when it has none), plus the sections of the script no scene matched, which are kept. */
function sceneSections(scenes: OutlineScene[], script: string | undefined): { sections: ScriptSection[]; unmatched: ScriptSection[] } {
  const found = scriptSections(script ?? '');
  const claimed = new Set<ScriptSection>();
  const sections = scenes.map((scene, index) => {
    const section = matchSection(found, scenes, index);
    if (section) claimed.add(section);
    return { heading: scene.title.trim() || `Scene ${index + 1}`, body: section?.body ?? '' };
  });
  return { sections, unmatched: found.filter((section) => !claimed.has(section)) };
}

const scriptTitle = (script: string | undefined, fallback: string) => /^#\s+(.+)$/m.exec(script ?? '')?.[1].trim() || fallback;

/** `script` with one scene's part replaced. Other scenes keep what they have, and a script written whole stays one. */
function mergeScene(scenes: OutlineScene[], index: number, script: string | undefined, body: string, fallbackTitle: string): string {
  const { sections, unmatched } = sceneSections(scenes, script);
  sections[index] = { ...sections[index], body };
  return joinScript(scriptTitle(script, fallbackTitle), [...sections, ...unmatched], script === undefined || script.startsWith(SCENES_MARKER));
}

/** What a held scene result is saved as: its scene's id on the first line, then the scene's part as `## heading` and body. */
const HELD_SCENE = /^<!-- scene:([A-Za-z0-9_-]{1,40}) -->\n/;

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

export interface Asker {
  ask(built: { prompt: string; system?: string; schema?: object }, budgetUsd: number): Promise<{ text: string; json?: unknown }>;
  who: string;
}

/** Asks the channel's AI with the options a run was given. `context` only needs to carry the signal that stops the call. */
export async function asker(context: Pick<JobContext, 'signal'>, options: PlanOptions): Promise<Asker> {
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
  const [channel, research, titles] = await Promise.all([loadChannelContext(slug), boardTiles(slug, id), recentTitles(slug)]);
  const earlier = await readPackage(slug, id);
  const built = await buildPackagePrompt(channel, { idea: ideaFor(video), research, recentTitles: titles, ...(options.replace === 'thumbnail' && earlier ? { keepTitles: earlier.titles } : {}) });
  const ai = await asker(context, options);
  say('Writing the package…');
  // The method writes one thumbnail text per title; the chosen title's (the first while none is chosen) is the package's thumbnail text.
  const answered = (json: unknown) => {
    const answer = json && typeof json === 'object' ? (json as { thumbs?: unknown; thumbnailText?: unknown; titles?: unknown }) : {};
    if (!Array.isArray(answer.thumbs) || typeof answer.thumbnailText === 'string') return json;
    const at = Array.isArray(answer.titles) ? answer.titles.findIndex((title) => typeof title === 'string' && title.trim() && title.trim() === video.title.trim()) : -1;
    return { ...answer, thumbnailText: answer.thumbs[Math.max(0, at)] ?? '' };
  };
  let pkg = parseAnswer(packageShape, answered((await ai.ask(built, PACKAGE_BUDGET_USD)).json), ai.who, 'package');
  stopped(context);
  const problems = packageProblems(pkg);
  if (problems.length) {
    say('Fixing the titles…');
    const second = parseAnswer(packageShape, answered((await ai.ask(repair(built, pkg, problems), PACKAGE_BUDGET_USD)).json), ai.who, 'package');
    stopped(context);
    if (packageProblems(second).length <= problems.length) pkg = second;
  }
  stopped(context);
  // Only what is empty takes the run's words; what the person wrote stays, even if they wrote it while the run went.
  const merged = mergePackage(await readPackage(slug, id), packageShape.parse(pkg), options.replace);
  // The package's thumbnail text is always the pair in use (the first while none is): what Publish and the prompts read.
  const value = merged.thumbs ? { ...merged, thumbnailText: merged.thumbs[Math.max(0, chosenIndex(merged.titles, video.title))] } : merged;
  return { value, ...(await commitResult(slug, id, 'package', before, JSON.stringify(value, null, 2) + '\n')) };
}

/** Develops the idea into a short slide; edits made during a run hold its answer for later. */
export async function runOnePager(slug: string, id: string, context: JobContext, options: PlanOptions = {}): Promise<PlanJobResult<OnePager>> {
  const video = await store.readVideo(slug, id);
  const before = await snapshotOf(slug, id, 'onepager');
  context.emit({ message: 'Reading your idea, package and research board…' });
  const [channel, research, titles, pkg, history] = await Promise.all([loadChannelContext(slug), boardTiles(slug, id), recentTitles(slug), readPackage(slug, id), store.readJSON<ChannelData>(path.join(store.workspaceDir(slug), 'channel.json'))]);
  const built = await buildOnePagerPrompt(channel, { idea: ideaFor(video), research, recentTitles: titles, pkg: pkg ?? undefined, uploads: history?.uploads });
  const ai = await asker(context, options);
  context.emit({ message: 'Writing the one-pager…' });
  let value = parseAnswer(onepagerShape, (await ai.ask(built, ONEPAGER_BUDGET_USD)).json, ai.who, 'one-pager');
  stopped(context);
  const problems = onepagerProblems(value);
  if (problems.length) {
    context.emit({ message: 'Checking the one-pager…' });
    value = parseAnswer(onepagerShape, (await ai.ask(repair(built, value, problems), ONEPAGER_BUDGET_USD)).json, ai.who, 'one-pager');
    stopped(context);
    if (onepagerProblems(value).length) throw new AiError('bad-answer', `${ai.who} sent an unfinished one-pager. Try again.`);
  }
  return { value, ...(await commitResult(slug, id, 'onepager', before, JSON.stringify(value, null, 2) + '\n')) };
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
  say('Reading your idea, package and research board…');
  const before = await snapshotOf(slug, id, 'outline');
  const previous = (await readOutline(slug, id))?.scenes ?? [];
  const [channel, pkg, shape, research] = await Promise.all([loadChannelContext(slug), readPackage(slug, id), reusableOutline(slug, video), boardTiles(slug, id)]);
  const built = await buildOutlinePrompt(channel, { idea: ideaFor(video), pkg: pkg ?? undefined, reusableOutline: shape, research });
  const ai = await asker(context, options);
  say(shape ? 'Following the shape of the video you broke down. This takes about a minute…' : 'Writing the scenes. This takes about a minute…');
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

/** Only the scene's body is wanted; a heading the model adds anyway would split the script into extra scenes. */
const bodyOnly = (value: string) =>
  stripFence(value)
    .split('\n')
    .filter((line) => !/^#{1,2}\s/.test(line.trim()))
    .join('\n')
    .trim();

/** Lengthens one scene that is under 80% of its word budget, once. Returns the scene's new body, or its body as it was. */
async function lengthenScene(ai: Asker, channel: ChannelContext, title: string, outline: Outline, sections: ScriptSection[], index: number, say: (message: string) => void, context: JobContext): Promise<string> {
  const section = sections[index];
  const want = sceneWords(outline.scenes[index].seconds);
  if (!want || spokenWords(section.body) >= want * EXPAND_BELOW) return section.body;
  say(`Lengthening scene ${index + 1}…`);
  const expand = await buildExpandPrompt(channel, { outline: { scenes: outline.scenes }, script: joinScript(title, sections), heading: section.heading, section: section.body, want });
  const body = bodyOnly((await ai.ask(expand, EXPAND_BUDGET_USD)).text);
  stopped(context);
  return body || section.body;
}

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
    for (const index of sections.keys()) sections[index] = { ...sections[index], body: await lengthenScene(ai, channel, title, outline, sections, index, say, context) };
    script = joinScript(title, sections);
  }
  stopped(context);
  const result = await commitResult(slug, id, 'script', before, script.trimEnd() + '\n');
  return { value: result.held ? withScript(outline.scenes, script) : ((await readOutline(slug, id)) ?? outline), ...result };
}

/**
 * Writes one scene's result. The scene is merged into the script as it is when the run ends, so edits made to other scenes while it
 * ran stay. It is held, and nothing is written, only when the scene's own part of the script or the outline changed meanwhile; a
 * held result keeps just that scene, so Use it also takes only that scene. The script that was there is set aside as `earlier`.
 */
async function commitSceneResult(slug: string, id: string, sceneId: string, started: { outline: string | undefined; body: string; title: string }, body: string): Promise<{ replaced?: string; held?: string }> {
  const file = scriptFile(slug, id);
  return store.withLock(`script:${file}`, async () => {
    const token = stamp();
    const outline = await readOutline(slug, id);
    const index = outline?.scenes.findIndex((scene) => scene.id === sceneId) ?? -1;
    const current = await readText(file);
    const now = outline && index >= 0 ? sceneSections(outline.scenes, current).sections[index].body : undefined;
    if (!outline || index < 0 || (await readText(outlineFile(slug, id))) !== started.outline || now !== started.body) {
      const heading = outline?.scenes[index]?.title.trim() || 'Scene';
      await store.writeFileAtomic(versionFile(file, 'new', token), `<!-- scene:${sceneId} -->\n## ${heading}\n\n${body}\n`);
      return { held: token };
    }
    const replaced = await setAside(file, 'earlier', token);
    await store.writeFileAtomic(file, mergeScene(outline.scenes, index, current, body, started.title));
    return replaced ? { replaced: token } : {};
  });
}

/**
 * Write this scene: the script of one scene, in the creator's voice. The scene's own words are kept as the draft when it has some.
 * The other scenes keep what the script says for them; a script that does not exist yet starts with every scene empty except this one.
 */
export async function runSceneScript(slug: string, id: string, sceneId: string, context: JobContext, options: PlanOptions = {}): Promise<PlanJobResult<Outline>> {
  const say = (message: string) => context.emit({ message });
  const video = await store.readVideo(slug, id);
  const outlineBefore = await readText(outlineFile(slug, id));
  const outline = await readOutline(slug, id);
  if (!outline) throw new ClubError('Create the outline first.');
  const index = outline.scenes.findIndex((scene) => scene.id === sceneId);
  if (index < 0) throw notFound('scene');
  const [channel, pkg, existing] = await Promise.all([loadChannelContext(slug), readPackage(slug, id), readText(scriptFile(slug, id))]);
  const title = scriptTitle(existing, pkg?.titles[0]?.trim() || video.title);
  const sections = sceneSections(outline.scenes, existing).sections;
  const startBody = sections[index].body;
  const ai = await asker(context, options);
  say(`Writing scene ${index + 1}…`);
  const built = await buildSceneScriptPrompt(channel, { title, idea: ideaFor(video), pkg: pkg ?? undefined, outline: { scenes: outline.scenes }, index, draft: startBody });
  const written = bodyOnly((await ai.ask(built, SCRIPT_BUDGET_USD)).text);
  stopped(context);
  if (!written) throw new AiError('bad-answer', `${ai.who} sent back no script.`);
  sections[index] = { ...sections[index], body: written };
  const body = await lengthenScene(ai, channel, title, outline, sections, index, say, context);
  stopped(context);
  const result = await commitSceneResult(slug, id, sceneId, { outline: outlineBefore, body: startBody, title }, body);
  return { value: (await readOutline(slug, id)) ?? outline, ...result };
}
