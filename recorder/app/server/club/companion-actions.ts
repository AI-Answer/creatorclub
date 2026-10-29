import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CHANGED_SINCE, TAB_ACTIONS, type CompanionAction, type CompanionActionType, type CompanionChanged, type CompanionTab } from '../../shared/companion.js';
import { ClubError } from './errors.js';
import type { Package } from '../../shared/club.js';
import { outlineFile, packageFile, patchPackage, readOutline, readPackage, saveOutline, savePackage, saveScript, scriptFile, syncPlanningFlags, usePackageText } from './planning.js';
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

// ---------------------------------------------------------------- versions and Undo

/*
 * Undo works on what the action changed and nothing else: one package field, the title it put first, one scene, the note it added, or
 * (Draft scenes) the outline and script it replaced. It goes back only while that part still holds what the action wrote; once the
 * person or another action changed it, Undo refuses rather than overwrite newer work, and the earlier version stays on disk.
 */

export { CHANGED_SINCE };
const VERSIONS_KEPT = 20;

const versionsDir = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'companion-versions');
const VERSION_ID = /^cv_[a-f0-9]{12}$/;

type PackageField = 'hook' | 'thumbnailText' | 'description';
interface SceneText {
  title: string;
  talkingPoints: string[];
}

/** What Undo needs, by the kind of change. Edit's actions (3b) add a kind for their project transactions. */
type Undo =
  | { kind: 'package-field'; field: PackageField; before: string | null; after: string }
  | { kind: 'title'; title: string; dropped?: string }
  | { kind: 'scene'; sceneId: string; before: SceneText; after: SceneText }
  | { kind: 'tile'; tileId: string; text: string }
  | { kind: 'outline'; outline: { before: string | null; after: string | null }; script: { before: string | null; after: string | null } };

interface Version {
  action: CompanionActionType;
  at: string;
  changed: CompanionChanged[];
  undo: Undo;
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

interface Handler<T extends CompanionAction> {
  changed: CompanionChanged[];
  apply: (slug: string, id: string, action: T) => Promise<{ result: string; undo: Undo }>;
}

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
      return { result: 'Set as your first title', undo: { kind: 'title', title, ...(dropped ? { dropped } : {}) } };
    },
  },
  add_note: {
    changed: ['board'],
    apply: async (slug, id, action) => {
      const tile = await store.addTile(slug, id, { kind: 'note', text: action.text });
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

const lock = (slug: string, id: string) => `companion-apply:${store.videoDir(slug, id)}`;

/** Applies one action and saves its version. Returns the version id and a line saying what changed. */
export async function applyAction(slug: string, id: string, action: CompanionAction): Promise<{ version: string; result: string; changed: CompanionChanged[] }> {
  const handler = HANDLERS[action.type] as Handler<CompanionAction>;
  return store.withLock(lock(slug, id), async () => {
    const { result, undo } = await handler.apply(slug, id, action);
    const version = `cv_${randomBytes(6).toString('hex')}`;
    const saved: Version = { action: action.type, at: new Date().toISOString(), changed: handler.changed, undo };
    await store.writeJSON(path.join(versionsDir(slug, id), `${version}.json`), saved);
    await prune(slug, id);
    return { version, result, changed: handler.changed };
  });
}

/** Puts back what the version changed, or refuses with CHANGED_SINCE when that part changed after it. */
async function undoChange(slug: string, id: string, version: string, undo: Undo): Promise<void> {
  switch (undo.kind) {
    case 'package-field':
      return store.withLock(packageLock(slug, id), async () => {
        const pkg = await readPackage(slug, id);
        if (!pkg || fieldOf(pkg, undo.field) !== undo.after) throw new ClubError(CHANGED_SINCE, 409);
        await savePackage(slug, id, withField(pkg, undo.field, undo.before));
      });
    case 'title':
      return store.withLock(packageLock(slug, id), async () => {
        const pkg = await readPackage(slug, id);
        const at = pkg?.titles.findIndex((title) => title === undo.title) ?? -1;
        if (!pkg || at < 0) throw new ClubError(CHANGED_SINCE, 409);
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
      const tile = await store.readTile(slug, id, undo.tileId).catch(() => undefined);
      if (!tile) return; // already taken off the board
      if ((tile.text ?? '') !== undo.text) throw new ClubError(CHANGED_SINCE, 409);
      await store.deleteTile(slug, id, undo.tileId);
      return;
    }
    case 'outline': {
      const files = { outline: outlineFile(slug, id), script: scriptFile(slug, id) };
      const now = { outline: await readText(files.outline), script: await readText(files.script) };
      if (now.outline !== undo.outline.after || now.script !== undo.script.after) {
        // The earlier scenes stay on disk under a clear name, so nothing is lost.
        for (const key of ['outline', 'script'] as const) {
          const before = undo[key].before;
          if (before === null) continue;
          const { dir, name, ext } = path.parse(files[key]);
          await store.writeFileAtomic(path.join(dir, `${name}-before-companion-${version}${ext}`), before);
        }
        throw new ClubError(CHANGED_SINCE, 409);
      }
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

/** Undo of one applied card. Each card's Undo is independent of the others. */
export async function undoVersion(slug: string, id: string, version: string): Promise<CompanionChanged[]> {
  if (!VERSION_ID.test(version)) throw new ClubError('That version was not found.', 404);
  return store.withLock(lock(slug, id), async () => {
    const saved = await store.readJSON<Version>(path.join(versionsDir(slug, id), `${version}.json`)).catch(() => undefined);
    if (!saved?.undo) throw new ClubError('That version was not found.', 404);
    await undoChange(slug, id, version, saved.undo);
    await syncPlanningFlags(slug, id);
    return saved.changed;
  });
}
