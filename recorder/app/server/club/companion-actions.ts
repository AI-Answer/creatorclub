import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CHANGED_SINCE, DEFAULT_PAUSE_LEVEL, TAB_ACTIONS, isEditAction, type CompanionAction, type CompanionActionType, type CompanionChanged, type CompanionTab, type EditAction } from '../../shared/companion.js';
import type { MotionTemplateId, Project } from '../../shared/types.js';
import { MOTION_TEMPLATES, MOTION_TEMPLATE_IDS } from '../../shared/motion/templates.js';
import { editActionProblem } from '../../src/editing-actions.js';
import { applyEdit, undoEdit, type TimelineUndo } from './companion-edit.js';
import type { EditOptions } from '../../src/editing-actions.js';
import { addNote, hydrate, removeNote } from './board-docs.js';
import { addFrame, FRAME_TITLE_MAX, frameAround, readCanvas, removeFrame } from './board-canvas.js';
import { startVideoFrom, videoSignature } from './research-board.js';
import { ClubError } from './errors.js';
import type { BoardFrame, Package, VideoScene } from '../../shared/club.js';
import { outlineFile, packageFile, parseOutline, patchPackage, readOutline, readPackage, saveOutline, savePackage, saveScript, scriptFile, syncPlanningFlags, usePackageText } from './planning.js';
import { videoScenes } from './scenes.js';
import { titleProblems } from './prompts.js';
import * as store from './store.js';

/*
 * The companion's actions. Each one has a shape the model's answer is checked against, the steps it may be offered on, and how it
 * applies. Applying one saves a version under `companion-versions/` that says what the action changed, so Undo can put back exactly
 * that. Edit's project actions (3b) add their own handlers and an undo of their own kind.
 */

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const line = (max: number) => z.string().transform(squash).pipe(z.string().min(1).max(max));
const block = (max: number) => z.string().transform((text) => text.trim()).pipe(z.string().min(1).max(max));
const SCENE_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Timeline seconds: finite, never negative, at most ten hours. Whether a time lies inside the video is checked against the timeline. */
const time = z.number().finite().min(0).max(36_000);
const CLIP_ID = z.string().min(1).max(100);
const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/);
const POSITION = z.enum(['top', 'center', 'bottom']);
const TILE_ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const draftScene = z
  .object({
    title: line(300),
    talkingPoints: z.array(line(2000)).max(60),
    show: z.string().max(4000).default(''),
    seconds: z.number().int().min(0).max(36_000),
  })
  .strict();

export const actionShape = z.discriminatedUnion('type', [
  z.object({ type: z.literal('use_hook'), text: line(2000) }).strict(),
  z.object({ type: z.literal('use_title'), text: line(200).refine((title) => !titleProblems(title).length, { message: 'breaks the title rules' }) }).strict(),
  z.object({ type: z.literal('set_thumbnail_text'), text: line(200) }).strict(),
  z.object({ type: z.literal('add_note'), text: block(20_000) }).strict(),
  z.object({ type: z.literal('set_scene'), sceneId: z.string().regex(SCENE_ID), title: line(300).optional(), talkingPoints: z.array(line(2000)).min(1).max(60).optional() }).strict(),
  z.object({ type: z.literal('draft_scenes'), scenes: z.array(draftScene).min(1).max(20) }).strict(),
  z.object({ type: z.literal('set_description'), text: block(5000) }).strict(),
  // Research: the cards are named by their ids on the channel's Board; that they are there is checked against the Board.
  z.object({ type: z.literal('group_tiles'), title: line(FRAME_TITLE_MAX), tileIds: z.array(TILE_ID).min(2).max(40) }).strict(),
  z.object({ type: z.literal('start_video'), title: line(300), tileIds: z.array(TILE_ID).min(1).max(40) }).strict(),
  // Edit: sizes are capped here; clip ids and times are checked against the timeline (`editActionProblem`).
  z.object({ type: z.literal('cut_pauses'), level: z.enum(['gentle', 'balanced', 'tight']).default(DEFAULT_PAUSE_LEVEL) }).strict(),
  z.object({ type: z.literal('remove_fillers') }).strict(),
  z.object({ type: z.literal('close_gaps') }).strict(),
  z.object({ type: z.literal('split_at'), time, clipId: CLIP_ID.optional() }).strict(),
  z.object({ type: z.literal('trim_clip'), clipId: CLIP_ID, side: z.enum(['start', 'end']), time }).strict(),
  z.object({ type: z.literal('delete_range'), start: time, end: time }).strict(),
  z
    .object({ type: z.literal('set_caption_style'), enabled: z.boolean().optional(), fontSize: z.number().int().min(12).max(160).optional(), color: COLOR.optional(), background: COLOR.optional(), position: POSITION.optional(), maxWords: z.number().int().min(1).max(20).optional() })
    .strict(),
  z.object({ type: z.literal('add_caption'), start: time, end: time, text: line(300) }).strict(),
  z.object({ type: z.literal('add_text'), start: time, duration: z.number().min(0.2).max(60), text: line(200), position: POSITION.optional() }).strict(),
  z.object({ type: z.literal('set_zoom'), start: time, duration: z.number().min(0.3).max(120), scale: z.number().min(1.05).max(4), x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional(), target: z.enum(['screen', 'camera']).optional() }).strict(),
  z
    .object({ type: z.literal('add_motion_block'), template: z.enum(MOTION_TEMPLATE_IDS as [MotionTemplateId, ...MotionTemplateId[]]), style: z.string().max(20).optional(), start: time, duration: z.number().min(1).max(20).optional(), text: line(80), detail: line(120).optional(), x: z.number().min(0).max(1).optional(), y: z.number().min(0).max(1).optional() })
    .strict(),
  z.object({ type: z.literal('normalize_audio') }).strict(),
])
  .refine((action) => action.type !== 'set_scene' || action.title !== undefined || action.talkingPoints !== undefined, { message: 'changes nothing' })
  .refine((action) => (action.type !== 'delete_range' && action.type !== 'add_caption') || action.end > action.start, { message: 'ends before it starts' })
  .refine((action) => action.type !== 'add_caption' || action.end - action.start <= 30, { message: 'longer than 30 seconds' })
  .refine((action) => action.type !== 'add_motion_block' || action.style === undefined || MOTION_TEMPLATES[action.template].styles.some((style) => style.id === action.style), { message: 'is not a style of that template' })
  .refine((action) => action.type !== 'add_motion_block' || action.template === 'callout' || (action.x === undefined && action.y === undefined), { message: 'only a callout has a point' });

export const MAX_CARDS = 6;

/**
 * The model's actions that the screen can apply: known types offered on this step, in a valid shape, naming scenes that exist.
 * Everything else is left out and listed in `rejected` with the reason, for the log.
 */
export function validateActions(
  raw: readonly unknown[],
  { tab, sceneIds, tileIds = [], project, editOptions }: { tab: CompanionTab; sceneIds: readonly string[]; /** Research: the ids of the cards on the channel's Board. */ tileIds?: readonly string[]; project?: Project; editOptions?: EditOptions },
): { actions: CompanionAction[]; rejected: string[] } {
  const actions: CompanionAction[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const type = item && typeof item === 'object' ? String((item as { type?: unknown }).type) : typeof item;
    const parsed = actionShape.safeParse(item);
    if (!parsed.success) {
      rejected.push(`${type}: ${parsed.error.issues[0]?.message ?? 'not valid'}`);
      continue;
    }
    const action = parsed.data as CompanionAction;
    if (!TAB_ACTIONS[tab].includes(action.type)) {
      rejected.push(`${type}: not offered on ${tab}`);
      continue;
    }
    if (action.type === 'set_scene' && !sceneIds.includes(action.sceneId)) {
      rejected.push(`${type}: no scene ${action.sceneId}`);
      continue;
    }
    if (action.type === 'group_tiles' || action.type === 'start_video') {
      const unknown = action.tileIds.find((id) => !tileIds.includes(id));
      if (unknown) {
        rejected.push(`${type}: no card ${unknown}`);
        continue;
      }
      action.tileIds = [...new Set(action.tileIds)];
      if (action.type === 'group_tiles' && action.tileIds.length < 2) {
        rejected.push(`${type}: fewer than 2 cards`);
        continue;
      }
    }
    // An Edit action is offered only when it applies to the timeline as it is: its clips exist, its times are inside the video.
    if (isEditAction(action)) {
      const problem = project ? editActionProblem(project, action, editOptions) : 'no recording';
      if (problem) {
        rejected.push(`${type}: ${problem}`);
        continue;
      }
    }
    const key = JSON.stringify(action).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  if (actions.length > MAX_CARDS) rejected.push(`${actions.length - MAX_CARDS} more than ${MAX_CARDS}`);
  return { actions: actions.slice(0, MAX_CARDS), rejected };
}

// ---------------------------------------------------------------- versions and Undo

/*
 * Undo works on what the action changed and nothing else: one package field, the title it put first, one scene, the note it added, or
 * (Draft scenes) the outline and script it replaced. It goes back only while that part still holds what the action wrote; once the
 * person or another action changed it, Undo refuses rather than overwrite newer work, and the earlier version stays on disk.
 */

export { CHANGED_SINCE };
export const KEPT_ASIDE = "Your earlier scenes are kept in the video's folder.";
export const TAKES_RECORDED = "Takes were recorded for these scenes, so this can't be undone.";
const VERSIONS_KEPT = 20;

const versionsDir = (slug: string, id: string) => path.join(store.boardDir(slug, id), 'companion-versions');
const VERSION_ID = /^cv_[a-f0-9]{12}$/;

type PackageField = 'hook' | 'thumbnailText' | 'description';
interface SceneText {
  title: string;
  talkingPoints: string[];
}

/** What Undo needs, by the kind of change. */
type Undo =
  | TimelineUndo
  | { kind: 'package-field'; field: PackageField; before: string | null; after: string }
  | { kind: 'title'; title: string; dropped?: string; before: string[]; after: string[] }
  | { kind: 'scene'; sceneId: string; before: SceneText; after: SceneText }
  | { kind: 'tile'; tileId: string; text: string }
  | { kind: 'frame'; frame: BoardFrame }
  | { kind: 'video'; videoId: string; signature: string }
  | { kind: 'outline'; outline: { before: string | null; after: string | null }; script: { before: string | null; after: string | null } };

interface Version {
  action: CompanionActionType;
  at: string;
  changed: CompanionChanged[];
  undo: Undo;
  /** Set once undone, so a later card's Undo knows this one no longer holds its part. */
  undone?: boolean;
  /** Orders versions made in the same millisecond. */
  order?: number;
}

let sequence = 0;
const nextOrder = () => Date.now() * 1000 + (sequence++ % 1000);
const newer = (a: Version, b: Version) => (a.order !== undefined && b.order !== undefined ? a.order > b.order : a.at > b.at);

/** The part of the video an undo puts back: two versions with the same part are undone newest first. */
function partOf(undo: Undo): string {
  switch (undo.kind) {
    case 'package-field':
      return `package:${undo.field}`;
    case 'title':
      return 'package:titles';
    case 'scene':
    case 'outline':
      return 'outline';
    case 'tile':
      return `tile:${undo.tileId}`;
    case 'frame':
      return `frame:${undo.frame.id}`;
    case 'video':
      return `video:${undo.videoId}`;
    case 'timeline':
      return `timeline:${undo.projectId}`;
  }
}

const readText = (file: string) => fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? null : Promise.reject(error)));
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const packageLock = (slug: string, id: string) => `package:${packageFile(slug, id)}`;

const fieldOf = (pkg: Package | null, field: PackageField): string | null =>
  !pkg ? null : field === 'hook' ? pkg.hook.spoken : field === 'thumbnailText' ? pkg.thumbnailText : (pkg.description ?? null);

function withField(pkg: Package, field: PackageField, value: string | null): Package {
  if (field === 'hook') return { ...pkg, hook: { ...pkg.hook, spoken: value ?? '' } };
  if (field === 'thumbnailText') return { ...pkg, thumbnailText: value ?? '' };
  const { description: _old, ...rest } = pkg;
  return value === null ? rest : { ...rest, description: value };
}

/** A timeline change also returns the project as saved and its revision, for the open editor. */
interface Applied {
  result: string;
  /** `start_video`: the idea it made. */
  videoId?: string;
  undo: Undo;
  project?: Project;
  revision?: string;
  /** A timeline card: the timeline it was applied on, kept on the card. */
  appliedOn?: string;
}
interface Handler<T extends CompanionAction> {
  changed: CompanionChanged[];
  apply: (slug: string, id: string, action: T, options: ApplyOptions) => Promise<Applied>;
}
/** `revision`: the revision of the recording project the editor saved last (timeline cards). `appliedOn`: applying an undone timeline card again, only on this timeline. */
export interface ApplyOptions {
  revision?: string;
  appliedOn?: string;
}
const edit: Handler<EditAction> = {
  changed: ['timeline'],
  apply: async (slug, id, action, options) => {
    const done = await applyEdit(slug, id, action, options.revision, options.appliedOn);
    return { ...done, appliedOn: done.undo.beforeHash };
  },
};

/** Sets one package field, keeping what it held for Undo. */
const setField = (field: PackageField, result: string) => async (slug: string, id: string, action: { text: string }) => {
  const before = fieldOf(await readPackage(slug, id), field);
  const saved = field === 'hook' ? (await usePackageText(slug, id, 'hook', action.text)).package : await patchPackage(slug, id, { [field]: action.text });
  return { result, undo: { kind: 'package-field' as const, field, before, after: fieldOf(saved, field) ?? '' } };
};

const HANDLERS: { [K in CompanionActionType]: Handler<Extract<CompanionAction, { type: K }>> } = {
  use_hook: { changed: ['package'], apply: setField('hook', 'Set as your spoken hook') },
  set_thumbnail_text: { changed: ['package'], apply: setField('thumbnailText', 'Set as your thumbnail text') },
  set_description: { changed: ['package'], apply: setField('description', 'Set as your description') },
  use_title: {
    changed: ['package'],
    apply: async (slug, id, action) => {
      const before = (await readPackage(slug, id))?.titles ?? ['', '', ''];
      const { package: saved } = await usePackageText(slug, id, 'title', action.text);
      const title = saved.titles[0];
      // A third title can fall off the end when a new one goes first: Undo puts it back.
      const dropped = before.find((old) => old.trim() && !saved.titles.some((now) => now.trim().toLowerCase() === old.trim().toLowerCase()));
      return { result: 'Set as your first title', undo: { kind: 'title', title, ...(dropped ? { dropped } : {}), before: [...before], after: [...saved.titles] } };
    },
  },
  add_note: {
    changed: ['board'],
    apply: async (slug, id, action) => {
      // A note on the Board is a Markdown file in the video's folder; the text Undo compares with is what that file holds.
      const tile = await addNote(slug, id, action.text);
      return { result: 'Added to the board', undo: { kind: 'tile', tileId: tile.id, text: tile.text ?? '' } };
    },
  },
  set_scene: {
    changed: ['outline'],
    apply: async (slug, id, action) => {
      const outline = await readOutline(slug, id);
      const index = outline?.scenes.findIndex((scene) => scene.id === action.sceneId) ?? -1;
      if (!outline || index < 0) throw new ClubError('That scene is no longer in the plan.', 409);
      const old = outline.scenes[index];
      const next = { title: action.title ?? old.title, talkingPoints: action.talkingPoints ?? old.talkingPoints };
      const scenes = outline.scenes.map(({ script: _script, ...scene }, at) => (at === index ? { ...scene, ...next } : scene));
      await saveOutline(slug, id, { scenes });
      return { result: `Updated scene ${index + 1}`, undo: { kind: 'scene', sceneId: action.sceneId, before: { title: old.title, talkingPoints: old.talkingPoints }, after: next } };
    },
  },
  draft_scenes: {
    changed: ['outline'],
    apply: async (slug, id, action) => {
      const [outlineBefore, scriptBefore] = await Promise.all([readText(outlineFile(slug, id)), readText(scriptFile(slug, id))]);
      const count = (await readOutline(slug, id))?.scenes.length ?? 0;
      await saveOutline(slug, id, { scenes: action.scenes });
      // New scenes start without a script: the old one is set aside, as Create outline does.
      if (scriptBefore !== null) await saveScript(slug, id, null);
      const [outlineAfter, scriptAfter] = await Promise.all([readText(outlineFile(slug, id)), readText(scriptFile(slug, id))]);
      return {
        result: count ? `Replaced ${plural(count, 'scene')} with ${action.scenes.length}` : `Added ${plural(action.scenes.length, 'scene')}`,
        undo: { kind: 'outline', outline: { before: outlineBefore, after: outlineAfter }, script: { before: scriptBefore, after: scriptAfter } },
      };
    },
  },
  group_tiles: {
    changed: ['board'],
    apply: async (slug, id, action) => {
      const tiles = (await store.listTiles(slug, id)).filter((tile) => action.tileIds.includes(tile.id));
      if (tiles.length < 2) throw new ClubError('Those cards are no longer on the board.', 409);
      const frame = await addFrame(slug, id, { title: action.title, ...frameAround(tiles) });
      return { result: `Grouped ${plural(tiles.length, 'card')} in “${frame.title}”`, undo: { kind: 'frame', frame } };
    },
  },
  start_video: {
    changed: ['videos'],
    apply: async (slug, id, action) => {
      if (!store.isChannelBoard(id)) throw new ClubError('A new video is started from Research.', 409);
      const known = new Set((await store.listTiles(slug, id)).map((tile) => tile.id));
      const tileIds = action.tileIds.filter((tileId) => known.has(tileId));
      if (!tileIds.length) throw new ClubError('Those cards are no longer on the board.', 409);
      const { video, tiles } = await startVideoFrom(slug, { tileIds, title: action.title });
      return { result: `Started “${video.title}” with ${plural(tiles, 'card')}`, videoId: video.id, undo: { kind: 'video', videoId: video.id, signature: await videoSignature(slug, video.id) } };
    },
  },
  cut_pauses: edit,
  remove_fillers: edit,
  close_gaps: edit,
  split_at: edit,
  trim_clip: edit,
  delete_range: edit,
  set_caption_style: edit,
  add_caption: edit,
  add_text: edit,
  set_zoom: edit,
  add_motion_block: edit,
  normalize_audio: edit,
};

export const changedBy = (type: CompanionActionType) => HANDLERS[type].changed;

/** Keeps the newest versions of a video; older ones go (their cards can no longer be undone). */
async function prune(slug: string, id: string) {
  const dir = versionsDir(slug, id);
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((name) => /^cv_[a-f0-9]{12}\.json$/.test(name));
  if (names.length <= VERSIONS_KEPT) return;
  const dated = await Promise.all(names.map(async (name) => ({ name, at: (await fs.stat(path.join(dir, name))).mtimeMs })));
  dated.sort((a, b) => b.at - a.at);
  for (const old of dated.slice(VERSIONS_KEPT)) await fs.rm(path.join(dir, old.name), { force: true });
}

/** One lock per video for every write that Undo checks: the companion's applies and undos, and Plan's own saves. */
export const lock = (slug: string, id: string) => `companion-apply:${store.boardDir(slug, id)}`;

/** Applies one action and saves its version. Returns the version id and a line saying what changed. */
export async function applyAction(slug: string, id: string, action: CompanionAction, options: ApplyOptions = {}): Promise<{ version: string; result: string; changed: CompanionChanged[]; project?: Project; revision?: string; appliedOn?: string; videoId?: string }> {
  const handler = HANDLERS[action.type] as Handler<CompanionAction>;
  return store.withLock(lock(slug, id), async () => {
    const { result, undo, project, revision, appliedOn, videoId } = await handler.apply(slug, id, action, options);
    const version = `cv_${randomBytes(6).toString('hex')}`;
    const saved: Version = { action: action.type, at: new Date().toISOString(), order: nextOrder(), changed: handler.changed, undo };
    await store.writeJSON(path.join(versionsDir(slug, id), `${version}.json`), saved);
    await prune(slug, id);
    return { version, result, changed: handler.changed, ...(project ? { project, revision } : {}), ...(appliedOn ? { appliedOn } : {}), ...(videoId ? { videoId } : {}) };
  });
}

/** Puts back what the version changed, or refuses with CHANGED_SINCE when that part changed after it. */
async function undoChange(slug: string, id: string, version: string, undo: Undo, options: ApplyOptions): Promise<{ project: Project; revision: string } | void> {
  switch (undo.kind) {
    case 'timeline':
      return undoEdit(slug, id, undo, options.revision);
    case 'package-field':
      return store.withLock(packageLock(slug, id), async () => {
        const pkg = await readPackage(slug, id);
        if (!pkg || fieldOf(pkg, undo.field) !== undo.after) throw new ClubError(CHANGED_SINCE, 409);
        await savePackage(slug, id, withField(pkg, undo.field, undo.before));
      });
    case 'title':
      return store.withLock(packageLock(slug, id), async () => {
        const pkg = await readPackage(slug, id);
        if (!pkg) throw new ClubError(CHANGED_SINCE, 409);
        // Untouched since: the titles go back exactly as they were.
        if (same(pkg.titles, undo.after)) return void (await savePackage(slug, id, { ...pkg, titles: undo.before as Package['titles'] }));
        // The title was already there before the card moved it first: removing it would take away the person's own title.
        const key = (title: string) => title.trim().toLowerCase();
        if (undo.before.some((title) => key(title) === key(undo.title))) throw new ClubError(CHANGED_SINCE, 409);
        const at = pkg.titles.findIndex((title) => title === undo.title);
        if (at < 0) throw new ClubError(CHANGED_SINCE, 409);
        const rest = pkg.titles.filter((_, index) => index !== at);
        const back = undo.dropped && !rest.some((title) => title.trim().toLowerCase() === undo.dropped!.trim().toLowerCase()) ? undo.dropped : '';
        const titles = [...rest.filter((title) => title.trim()), ...(back ? [back] : [])].slice(0, 3);
        while (titles.length < 3) titles.push('');
        await savePackage(slug, id, { ...pkg, titles: titles as Package['titles'] });
      });
    case 'scene': {
      const outline = await readOutline(slug, id);
      const index = outline?.scenes.findIndex((scene) => scene.id === undo.sceneId) ?? -1;
      const scene = index >= 0 ? outline!.scenes[index] : undefined;
      if (!scene || scene.title !== undo.after.title || !same(scene.talkingPoints, undo.after.talkingPoints)) throw new ClubError(CHANGED_SINCE, 409);
      await saveOutline(slug, id, { scenes: outline!.scenes.map(({ script: _script, ...each }, at) => (at === index ? { ...each, ...undo.before } : each)) });
      return;
    }
    case 'tile': {
      const stored = await store.readTile(slug, id, undo.tileId).catch(() => undefined);
      if (!stored) return; // already taken off the board
      // The note's text is what its file holds now, so a note written in since is not taken off. Removing it sets the file the app made aside, so it does not come back.
      const [tile] = await hydrate(slug, id, [stored]);
      if (!tile.doc?.missing && (tile.text ?? '') !== undo.text) throw new ClubError(CHANGED_SINCE, 409);
      await removeNote(slug, id, undo.tileId);
      return;
    }
    case 'frame': {
      // The frame goes only while it is as the card made it: renamed, moved or resized since, it stays.
      const { frames } = await readCanvas(slug, id);
      const now = frames.find((frame) => frame.id === undo.frame.id);
      if (!now) return;
      if (!same(now, undo.frame)) throw new ClubError(CHANGED_SINCE, 409);
      await removeFrame(slug, id, undo.frame.id);
      return;
    }
    case 'video': {
      // The idea goes only while nothing was done with it: same title and stage, the same cards and notes, no scenes yet.
      const now = await videoSignature(slug, undo.videoId).catch(() => undefined);
      if (now === undefined) return;
      if (now !== undo.signature) throw new ClubError(CHANGED_SINCE, 409);
      await store.deleteVideo(slug, undo.videoId);
      return;
    }
    case 'outline': {
      const files = { outline: outlineFile(slug, id), script: scriptFile(slug, id) };
      const now = { outline: await readText(files.outline), script: await readText(files.script) };
      if (now.outline !== undo.outline.after || now.script !== undo.script.after) {
        // The earlier scenes stay on disk under a clear name, so nothing is lost.
        let kept = false;
        for (const key of ['outline', 'script'] as const) {
          const before = undo[key].before;
          if (before === null) continue;
          const { dir, name, ext } = path.parse(files[key]);
          await store.writeFileAtomic(path.join(dir, `${name}-before-companion-${version}${ext}`), before);
          kept = true;
        }
        throw new ClubError(kept ? `${CHANGED_SINCE} ${KEPT_ASIDE}` : CHANGED_SINCE, 409);
      }
      // Takes live in the recording project, linked to scenes by id, so recording one changes neither file: a drafted scene that
      // has takes would lose them from view if the old scenes came back.
      const earlier = new Set(undo.outline.before === null ? [] : parseOutline(undo.outline.before).scenes.map((scene) => scene.id).filter(Boolean));
      const recorded = (await takes(slug, id).catch(() => [])).filter((scene) => !earlier.has(scene.id) && scene.takes.length > 0);
      if (recorded.length) throw new ClubError(TAKES_RECORDED, 409);
      for (const key of ['outline', 'script'] as const) {
        const before = undo[key].before;
        if (before !== null) await store.writeFileAtomic(files[key], before);
        else if (now[key] !== null) {
          const { dir, name, ext } = path.parse(files[key]);
          await fs.rename(files[key], path.join(dir, `${name}-undone-${version}${ext}`));
        }
      }
      return;
    }
  }
}

/** A newer applied card that changed the same part, and is not undone: it must be undone first. */
async function newerOnSamePart(slug: string, id: string, version: string, saved: Version): Promise<boolean> {
  const dir = versionsDir(slug, id);
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((name) => /^cv_[a-f0-9]{12}\.json$/.test(name) && name !== `${version}.json`);
  for (const name of names) {
    const other = await store.readJSON<Version>(path.join(dir, name)).catch(() => undefined);
    if (other?.undo && !other.undone && newer(other, saved) && partOf(other.undo) === partOf(saved.undo)) return true;
  }
  return false;
}

/** Whether a version can still be undone: its file was not pruned. */
export const versionExists = (slug: string, id: string, version: string) =>
  VERSION_ID.test(version) ? fs.access(path.join(versionsDir(slug, id), `${version}.json`)).then(() => true, () => false) : Promise.resolve(false);

/**
 * Undo of one applied card. Each card's Undo stands on its own: it puts back only its own part, and refuses when that part
 * changed since, by hand or by a newer card that is still applied.
 */
export async function undoVersion(slug: string, id: string, version: string, options: ApplyOptions = {}): Promise<{ changed: CompanionChanged[]; project?: Project; revision?: string }> {
  if (!VERSION_ID.test(version)) throw new ClubError('That version was not found.', 404);
  return store.withLock(lock(slug, id), async () => {
    const file = path.join(versionsDir(slug, id), `${version}.json`);
    const saved = await store.readJSON<Version>(file).catch(() => undefined);
    if (!saved?.undo) throw new ClubError('That version was not found.', 404);
    if (await newerOnSamePart(slug, id, version, saved)) throw new ClubError(CHANGED_SINCE, 409);
    const put = await undoChange(slug, id, version, saved.undo, options);
    await store.writeJSON(file, { ...saved, undone: true });
    if (saved.undo.kind !== 'timeline' && !store.isChannelBoard(id)) await syncPlanningFlags(slug, id);
    return { changed: saved.changed, ...(put ? put : {}) };
  });
}

/** Tests replace how the scenes' takes are read. */
let takes: (slug: string, id: string) => Promise<VideoScene[]> = videoScenes;
export const readTakesWith = (reader: typeof takes) => {
  takes = reader;
};
