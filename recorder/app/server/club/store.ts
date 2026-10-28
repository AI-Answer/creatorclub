import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ClubError, notFound } from './errors.js';
import { arrangeColumn } from '../../shared/club-board.js';
import {
  VIDEO_STAGES,
  type AiProvider,
  type ResearchTile,
  type TileKind,
  type TileMeta,
  type Video,
  type VideoStage,
  type Workspace,
} from '../../shared/club.js';

/** Workspace root. Read on every call so tests can point CREATORCLUB_DIR at a temp directory. */
export const rootDir = () => process.env.CREATORCLUB_DIR || path.join(os.homedir(), 'Documents', 'CreatorClub');

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const assertSlug = (slug: string) => {
  if (!SLUG.test(slug)) throw new ClubError('That channel name is not valid.');
  return slug;
};
const assertId = (id: string, what: string) => {
  if (!ID.test(id)) throw notFound(what);
  return id;
};

export const workspaceDir = (slug: string) => path.join(rootDir(), assertSlug(slug));
export const videoDir = (slug: string, id: string) => path.join(workspaceDir(slug), 'videos', assertId(id, 'video'));
export const researchDir = (slug: string, id: string) => path.join(videoDir(slug, id), 'research');
export const breakdownsDir = (slug: string) => path.join(workspaceDir(slug), 'breakdowns');

const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`;
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

// ---------------------------------------------------------------- JSON files

/** Returns undefined when the file does not exist. */
export async function readJSON<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Writes to a temp file next to the target, then renames, so readers never see a partial file. */
export async function writeFileAtomic(file: string, data: string | Buffer, mode?: number) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temp, data, mode === undefined ? undefined : { mode });
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

export const writeJSON = (file: string, value: unknown) => writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');

// ---------------------------------------------------------------- settings

interface Settings {
  currentWorkspace?: string;
  defaultAi?: AiProvider;
  /** Set once the first-visit "How CreatorClub works" dialog has been closed. */
  welcomed?: boolean;
  /** Video ids per channel, most recently opened first. */
  recent?: Record<string, string[]>;
  /** The person's own Gemini API key. Only ever sent to Google; the screen gets it masked. */
  geminiKey?: string;
}
const settingsFile = () => path.join(rootDir(), 'settings.json');

/** Read-modify-write on settings.json, one at a time, so two changes never undo each other. */
const updateSettings = (change: (settings: Settings) => Settings) =>
  withLock(`settings:${settingsFile()}`, async () =>
    // Owner-only: the file can hold the Gemini API key.
    writeFileAtomic(settingsFile(), JSON.stringify(change((await readJSON<Settings>(settingsFile())) ?? {}), null, 2) + '\n', 0o600));

/** The current workspace slug, or undefined when none is chosen or its folder is gone. */
export async function currentWorkspace(): Promise<string | undefined> {
  const slug = (await readJSON<Settings>(settingsFile()))?.currentWorkspace;
  if (!slug || !SLUG.test(slug)) return undefined;
  return (await readWorkspace(slug).catch(() => undefined)) ? slug : undefined;
}

export async function setCurrentWorkspace(slug: string) {
  await readWorkspace(assertSlug(slug));
  await updateSettings((settings) => ({ ...settings, currentWorkspace: slug }));
}

/** The AI that runs prompts, or undefined until one is chosen or the first one connects. */
export async function defaultAi(): Promise<AiProvider | undefined> {
  const value = (await readJSON<Settings>(settingsFile()))?.defaultAi;
  return value === 'claude' || value === 'codex' ? value : undefined;
}

export async function setDefaultAi(provider: AiProvider) {
  await updateSettings((settings) => ({ ...settings, defaultAi: provider }));
}

/** Sets the default AI only when none is set yet. */
export async function setDefaultAiIfUnset(provider: AiProvider): Promise<void> {
  await updateSettings((settings) => (settings.defaultAi === 'claude' || settings.defaultAi === 'codex' ? settings : { ...settings, defaultAi: provider }));
}

/** The saved Gemini API key, for the one place that calls Google with it. Never send this to the screen. */
export async function geminiKey(): Promise<string | undefined> {
  const value = (await readJSON<Settings>(settingsFile()))?.geminiKey;
  return typeof value === 'string' && value ? value : undefined;
}

/** "••••1234": the last four characters, so the person can tell which key is saved. */
export const maskKey = (key: string) => `••••${key.slice(-4)}`;

export async function maskedGeminiKey(): Promise<string | null> {
  const key = await geminiKey();
  return key ? maskKey(key) : null;
}

export async function setGeminiKey(key: string) {
  await updateSettings((settings) => ({ ...settings, geminiKey: key }));
}

export async function removeGeminiKey() {
  await updateSettings(({ geminiKey: _removed, ...settings }) => settings);
}

export async function welcomed(): Promise<boolean> {
  return (await readJSON<Settings>(settingsFile()))?.welcomed === true;
}

export async function setWelcomed() {
  await updateSettings((settings) => ({ ...settings, welcomed: true }));
}

const RECENT_LIMIT = 8;

/** Videos opened lately in a channel, newest first. Videos that no longer exist are left out. */
export async function recentVideoIds(slug: string): Promise<string[]> {
  const ids = (await readJSON<Settings>(settingsFile()))?.recent?.[assertSlug(slug)] ?? [];
  const exists = await Promise.all(ids.map((id) => readJSON(videoFile(slug, id)).then((v) => !!v, () => false)));
  return ids.filter((_, i) => exists[i]);
}

export async function markOpened(slug: string, id: string) {
  await readVideo(slug, id);
  await updateSettings((settings) => {
    const others = (settings.recent?.[slug] ?? []).filter((other) => other !== id);
    return { ...settings, recent: { ...settings.recent, [slug]: [id, ...others].slice(0, RECENT_LIMIT) } };
  });
}

// ---------------------------------------------------------------- workspaces

const profileFile = (slug: string) => path.join(workspaceDir(slug), 'profile.json');

export async function listWorkspaces(): Promise<Workspace[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(rootDir());
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const found = await Promise.all(entries.filter((name) => SLUG.test(name)).map((slug) => readWorkspace(slug).catch(() => undefined)));
  return found.filter((w): w is Workspace => !!w).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readWorkspace(slug: string): Promise<Workspace> {
  const workspace = await readJSON<Workspace>(profileFile(slug));
  if (!workspace) throw notFound('channel');
  return workspace;
}

export async function writeWorkspace(workspace: Workspace) {
  await writeJSON(profileFile(workspace.slug), workspace);
  await fs.mkdir(path.join(workspaceDir(workspace.slug), 'videos'), { recursive: true });
  await fs.mkdir(breakdownsDir(workspace.slug), { recursive: true });
}

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

/** Creates a workspace; the slug comes from the name unless given, and gets a numeric suffix on collision. */
export async function createWorkspace(input: Omit<Workspace, 'slug' | 'createdAt'> & { slug?: string }): Promise<Workspace> {
  const base = input.slug ?? (slugify(input.name) || 'channel');
  let slug = assertSlug(base);
  for (let n = 2; await readJSON(profileFile(slug)); n++) {
    if (input.slug) throw new ClubError('A channel with that name already exists.', 409);
    slug = `${base}-${n}`;
  }
  const { slug: _ignored, ...fields } = input;
  const workspace: Workspace = { ...fields, slug, createdAt: now() };
  await writeWorkspace(workspace);
  return workspace;
}

// ---------------------------------------------------------------- videos

/** Runs `fn` after every earlier call with the same key, so read-modify-write cycles never overlap. */
const lockTails = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (lockTails.get(key) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  lockTails.set(key, tail);
  void tail.then(() => lockTails.get(key) === tail && lockTails.delete(key));
  return run;
}
// Lock order is always workspace first, then video, so the two never deadlock.
const workspaceLock = <T>(slug: string, fn: () => Promise<T>) => withLock(`ws:${workspaceDir(slug)}`, fn);
const videoLock = <T>(slug: string, id: string, fn: () => Promise<T>) => withLock(`video:${videoFile(slug, id)}`, fn);

const videoFile = (slug: string, id: string) => path.join(videoDir(slug, id), 'video.json');

export async function readVideo(slug: string, id: string): Promise<Video> {
  const video = await readJSON<Video>(videoFile(slug, id));
  if (!video) throw notFound('video');
  return video;
}

export async function writeVideo(slug: string, video: Video) {
  await writeJSON(videoFile(slug, video.id), video);
}

const byStageThenOrder = (a: Video, b: Video) =>
  VIDEO_STAGES.indexOf(a.stage) - VIDEO_STAGES.indexOf(b.stage) || a.order - b.order || a.createdAt.localeCompare(b.createdAt);

export async function listVideos(slug: string): Promise<Video[]> {
  let ids: string[];
  try {
    ids = await fs.readdir(path.join(workspaceDir(slug), 'videos'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const videos = await Promise.all(ids.filter((id) => ID.test(id)).map((id) => readVideo(slug, id).catch(() => undefined)));
  return videos.filter((v): v is Video => !!v).sort(byStageThenOrder);
}

export type NewVideo = Pick<Video, 'title'> & Partial<Pick<Video, 'stage' | 'source' | 'idea' | 'hidden' | 'publishDate' | 'planning'>>;

const nextOrder = (videos: Video[], stage: VideoStage) => Math.max(-1, ...videos.filter((v) => v.stage === stage).map((v) => v.order)) + 1;

export function createVideo(slug: string, input: NewVideo): Promise<Video> {
  return workspaceLock(slug, async () => {
    const stage = input.stage ?? 'ideas';
    const at = now();
    const video: Video = {
      ...input,
      id: newId('v'),
      stage,
      order: nextOrder(await listVideos(slug), stage),
      createdAt: at,
      updatedAt: at,
      stageDates: { [stage]: at },
      planning: input.planning ?? { research: false, package: false, outline: false },
    };
    await writeVideo(slug, video);
    return video;
  });
}

/** Adds a video that already has its id, dates and stage (the board migration). Refuses to replace an existing video. */
export function importVideo(slug: string, video: Video): Promise<Video> {
  return workspaceLock(slug, () =>
    videoLock(slug, video.id, async () => {
      if (await readJSON(videoFile(slug, video.id))) throw new ClubError('That video is already in this channel.', 409);
      await writeVideo(slug, video);
      return video;
    }),
  );
}

export type VideoPatch = Partial<Omit<Video, 'id' | 'stage' | 'createdAt' | 'updatedAt' | 'stageDates'>>;

/** Merges a patch; a null value clears an optional field. */
export function updateVideo(slug: string, id: string, patch: { [K in keyof VideoPatch]: VideoPatch[K] | null }): Promise<Video> {
  return videoLock(slug, id, async () => {
    const video: Record<string, unknown> = { ...(await readVideo(slug, id)) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete video[key];
      else if (value !== undefined) video[key] = value;
    }
    const updated = { ...video, updatedAt: now() } as unknown as Video;
    await writeVideo(slug, updated);
    return updated;
  });
}

export interface MoveOptions {
  /** Put the video just before this one in the stage. Without it, or when it is not in that stage, the video goes last. */
  beforeId?: string | null;
  /** Put these stage dates back instead of recording a new one (Undo). */
  stageDates?: Video['stageDates'];
}

/** Moves a video to a stage and a place in it, records when it got there, and renumbers that stage. */
export async function moveVideo(slug: string, id: string, stage: VideoStage, options: MoveOptions = {}): Promise<Video> {
  if (!VIDEO_STAGES.includes(stage)) throw new ClubError('That stage does not exist.');
  return workspaceLock(slug, async () => {
    const videos = await listVideos(slug);
    const video = videos.find((v) => v.id === id);
    if (!video) throw notFound('video');
    const column = arrangeColumn(videos, id, stage, options.beforeId);
    const at = now();
    let result = video;
    for (const [order, columnId] of column.entries()) {
      const moving = columnId === id;
      if (!moving && videos.find((v) => v.id === columnId)?.order === order) continue;
      if (moving && video.stage === stage && video.order === order && !options.stageDates) continue;
      const written = await videoLock(slug, columnId, async () => {
        const current = await readVideo(slug, columnId);
        const next: Video = { ...current, order };
        if (moving) {
          next.stage = stage;
          next.updatedAt = at;
          next.stageDates = options.stageDates ?? (current.stage === stage ? current.stageDates : { ...current.stageDates, [stage]: at });
        }
        await writeVideo(slug, next);
        return next;
      });
      if (moving) result = written;
    }
    return result;
  });
}

/** Removes the video's folder inside the workspace (its package, outline and research). Recordings live in SceneForge. */
export function deleteVideo(slug: string, id: string): Promise<void> {
  return videoLock(slug, id, async () => {
    await readVideo(slug, id);
    await fs.rm(videoDir(slug, id), { recursive: true, force: true });
  });
}

// ---------------------------------------------------------------- research tiles

export interface NewTile {
  kind: TileKind;
  url?: string;
  title?: string;
  text?: string;
  meta?: TileMeta;
  file?: { name: string; data: Buffer };
}

const tileFile = (slug: string, videoId: string, tileId: string) => path.join(researchDir(slug, videoId), `${assertId(tileId, 'tile')}.json`);
const safeFileName = (name: string) => path.basename(name).replace(/[^\w.\- ]/g, '_').slice(-80) || 'file';

export async function listTiles(slug: string, videoId: string): Promise<ResearchTile[]> {
  await readVideo(slug, videoId);
  let names: string[];
  try {
    names = await fs.readdir(researchDir(slug, videoId));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const tiles = await Promise.all(
    names.filter((n) => n.endsWith('.json') && !n.startsWith('.')).map((n) => readJSON<ResearchTile>(path.join(researchDir(slug, videoId), n)).catch(() => undefined)),
  );
  return tiles.filter((t): t is ResearchTile => !!t).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readTile(slug: string, videoId: string, tileId: string): Promise<ResearchTile> {
  const tile = await readJSON<ResearchTile>(tileFile(slug, videoId, tileId));
  if (!tile) throw notFound('tile');
  return tile;
}

export async function addTile(slug: string, videoId: string, input: NewTile): Promise<ResearchTile> {
  await readVideo(slug, videoId);
  const id = newId('t');
  const tile: ResearchTile = { id, kind: input.kind, meta: input.meta ?? {}, createdAt: now() };
  if (input.url) tile.url = input.url;
  if (input.title) tile.title = input.title;
  if (input.text) tile.text = input.text;
  if (input.file) {
    tile.file = `${id}-${safeFileName(input.file.name)}`;
    await writeFileAtomic(path.join(researchDir(slug, videoId), tile.file), input.file.data);
  }
  await writeJSON(tileFile(slug, videoId, id), tile);
  return tile;
}

export const tileFilePath = (slug: string, videoId: string, tile: ResearchTile) =>
  tile.file ? path.join(researchDir(slug, videoId), path.basename(tile.file)) : undefined;

export async function deleteTile(slug: string, videoId: string, tileId: string) {
  const tile = await readTile(slug, videoId, tileId);
  const file = tileFilePath(slug, videoId, tile);
  if (file) await fs.rm(file, { force: true });
  await fs.rm(tileFile(slug, videoId, tileId), { force: true });
}
