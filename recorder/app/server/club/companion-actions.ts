import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { TAB_ACTIONS, type CompanionAction, type CompanionActionType, type CompanionChanged, type CompanionTab } from '../../shared/companion.js';
import { ClubError } from './errors.js';
import { outlineFile, packageFile, patchPackage, readOutline, saveOutline, saveScript, scriptFile, syncPlanningFlags, usePackageText } from './planning.js';
import { titleProblems } from './prompts.js';
import * as store from './store.js';

/*
 * The companion's actions. Each one has a shape the model's answer is checked against, the steps it may be offered on, the files it
 * changes and how it applies. Applying one saves the files it touches as they were and as they became (a version under
 * `companion-versions/`), so Undo can put them back. Edit's project actions (3b) add their own handlers and an undo of their own kind.
 */

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const line = (max: number) => z.string().transform(squash).pipe(z.string().min(1).max(max));
const block = (max: number) => z.string().transform((text) => text.trim()).pipe(z.string().min(1).max(max));
const SCENE_ID = /^[A-Za-z0-9_-]{1,40}$/;

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
]).refine((action) => action.type !== 'set_scene' || action.title !== undefined || action.talkingPoints !== undefined, { message: 'changes nothing' });

export const MAX_CARDS = 6;

/**
 * The model's actions that the screen can apply: known types offered on this step, in a valid shape, naming scenes that exist.
 * Everything else is left out and listed in `rejected` with the reason, for the log.
 */
export function validateActions(raw: readonly unknown[], { tab, sceneIds }: { tab: CompanionTab; sceneIds: readonly string[] }): { actions: CompanionAction[]; rejected: string[] } {
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
    const key = JSON.stringify(action).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }
  if (actions.length > MAX_CARDS) rejected.push(`${actions.length - MAX_CARDS} more than ${MAX_CARDS}`);
  return { actions: actions.slice(0, MAX_CARDS), rejected };
}

// ---------------------------------------------------------------- versions

const versionsDir = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'companion-versions');
const VERSION_ID = /^cv_[a-f0-9]{12}$/;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

interface FileVersion {
  /** The file's name in the video's folder. */
  file: string;
  before: string | null;
  after: string | null;
}

/** What one applied action changed. `files` is the only undo kind of the planning steps; Edit's actions add theirs. */
interface Version {
  action: CompanionActionType;
  at: string;
  files: FileVersion[];
  /** Tiles the action added to the Board. */
  tiles: string[];
  changed: CompanionChanged[];
}

const readText = (file: string) => fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? null : Promise.reject(error)));

interface Handler<T extends CompanionAction> {
  /** Files in the video's folder the action may change. */
  files: (slug: string, id: string) => string[];
  changed: CompanionChanged[];
  apply: (slug: string, id: string, action: T) => Promise<{ result: string; tiles?: string[] }>;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const planFiles = (slug: string, id: string) => [outlineFile(slug, id), scriptFile(slug, id)];

const HANDLERS: { [K in CompanionActionType]: Handler<Extract<CompanionAction, { type: K }>> } = {
  use_hook: {
    files: (slug, id) => [packageFile(slug, id)],
    changed: ['package'],
    apply: async (slug, id, action) => {
      await usePackageText(slug, id, 'hook', action.text);
      return { result: 'Set as your spoken hook' };
    },
  },
  use_title: {
    files: (slug, id) => [packageFile(slug, id)],
    changed: ['package'],
    apply: async (slug, id, action) => {
      await usePackageText(slug, id, 'title', action.text);
      return { result: 'Set as your first title' };
    },
  },
  set_thumbnail_text: {
    files: (slug, id) => [packageFile(slug, id)],
    changed: ['package'],
    apply: async (slug, id, action) => {
      await patchPackage(slug, id, { thumbnailText: action.text });
      return { result: 'Set as your thumbnail text' };
    },
  },
  set_description: {
    files: (slug, id) => [packageFile(slug, id)],
    changed: ['package'],
    apply: async (slug, id, action) => {
      await patchPackage(slug, id, { description: action.text });
      return { result: 'Set as your description' };
    },
  },
  add_note: {
    files: () => [],
    changed: ['board'],
    apply: async (slug, id, action) => {
      const tile = await store.addTile(slug, id, { kind: 'note', text: action.text });
      return { result: 'Added to the board', tiles: [tile.id] };
    },
  },
  set_scene: {
    files: planFiles,
    changed: ['outline'],
    apply: async (slug, id, action) => {
      const outline = await readOutline(slug, id);
      const index = outline?.scenes.findIndex((scene) => scene.id === action.sceneId) ?? -1;
      if (!outline || index < 0) throw new ClubError('That scene is no longer in the plan.', 409);
      const scenes = outline.scenes.map(({ script: _script, ...scene }, at) =>
        at === index ? { ...scene, ...(action.title ? { title: action.title } : {}), ...(action.talkingPoints ? { talkingPoints: action.talkingPoints } : {}) } : scene,
      );
      await saveOutline(slug, id, { scenes });
      return { result: `Updated scene ${index + 1}` };
    },
  },
  draft_scenes: {
    files: planFiles,
    changed: ['outline'],
    apply: async (slug, id, action) => {
      const before = (await readOutline(slug, id))?.scenes.length ?? 0;
      await saveOutline(slug, id, { scenes: action.scenes });
      // New scenes start without a script: the old one is set aside, as Create outline does.
      if (before) await saveScript(slug, id, null);
      return { result: before ? `Replaced ${plural(before, 'scene')} with ${action.scenes.length}` : `Added ${plural(action.scenes.length, 'scene')}` };
    },
  },
};

export const changedBy = (type: CompanionActionType) => HANDLERS[type].changed;

/** Applies one action and saves its version. Returns the version id and a line saying what changed. */
export async function applyAction(slug: string, id: string, action: CompanionAction): Promise<{ version: string; result: string; changed: CompanionChanged[] }> {
  const handler = HANDLERS[action.type] as Handler<CompanionAction>;
  const files = handler.files(slug, id);
  return store.withLock(`companion-apply:${store.videoDir(slug, id)}`, async () => {
    const before = await Promise.all(files.map(readText));
    const { result, tiles = [] } = await handler.apply(slug, id, action);
    const after = await Promise.all(files.map(readText));
    const version = `cv_${randomBytes(6).toString('hex')}`;
    const saved: Version = {
      action: action.type,
      at: new Date().toISOString(),
      files: files.map((file, index) => ({ file: path.basename(file), before: before[index], after: after[index] })).filter((item) => item.before !== item.after),
      tiles,
      changed: handler.changed,
    };
    await store.writeJSON(path.join(versionsDir(slug, id), `${version}.json`), saved);
    return { version, result, changed: handler.changed };
  });
}

/**
 * Undo: each file goes back to what it was before the action. What is there now is kept beside it as `<name>-undone-<time>`, so an
 * edit made after the action is never lost; tiles the action added are taken off the Board.
 */
export async function undoVersion(slug: string, id: string, version: string): Promise<CompanionChanged[]> {
  if (!VERSION_ID.test(version)) throw new ClubError('That version was not found.', 404);
  return store.withLock(`companion-apply:${store.videoDir(slug, id)}`, async () => {
    const saved = await store.readJSON<Version>(path.join(versionsDir(slug, id), `${version}.json`));
    if (!saved) throw new ClubError('That version was not found.', 404);
    const now = stamp();
    for (const item of saved.files) {
      const file = path.join(store.videoDir(slug, id), path.basename(item.file));
      const current = await readText(file);
      if (current === item.before) continue;
      if (current !== null) {
        const { name, ext } = path.parse(file);
        await fs.rename(file, path.join(path.dirname(file), `${name}-undone-${now}${ext}`));
      }
      if (item.before !== null) await store.writeFileAtomic(file, item.before);
    }
    for (const tile of saved.tiles) await store.deleteTile(slug, id, tile).catch(() => {});
    await syncPlanningFlags(slug, id);
    return saved.changed;
  });
}
