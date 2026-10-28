import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ClubError, notFound } from './errors.js';
import {
  VIDEO_STAGES,
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
export async function writeFileAtomic(file: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temp, data);
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
}
const settingsFile = () => path.join(rootDir(), 'settings.json');

/** The current workspace slug, or undefined when none is chosen or its folder is gone. */
export async function currentWorkspace(): Promise<string | undefined> {
  const slug = (await readJSON<Settings>(settingsFile()))?.currentWorkspace;
  if (!slug || !SLUG.test(slug)) return undefined;
  return (await readWorkspace(slug).catch(() => undefined)) ? slug : undefined;
}

export async function setCurrentWorkspace(slug: string) {
  await readWorkspace(assertSlug(slug));
  const settings = (await readJSON<Settings>(settingsFile())) ?? {};
  await writeJSON(settingsFile(), { ...settings, currentWorkspace: slug });
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

export type NewVideo = Pick<Video, 'title'> & Partial<Pick<Video, 'stage' | 'source' | 'concept' | 'hidden' | 'publishDate' | 'planning'>>;

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

/** Moves a video to the end of another stage and records when it got there. */
export async function moveVideo(slug: string, id: string, stage: VideoStage): Promise<Video> {
  if (!VIDEO_STAGES.includes(stage)) throw new ClubError('That stage does not exist.');
  return workspaceLock(slug, () =>
    videoLock(slug, id, async () => {
      const video = await readVideo(slug, id);
      if (video.stage === stage) return video;
      const at = now();
      const moved: Video = {
        ...video,
        stage,
        order: nextOrder(await listVideos(slug), stage),
        updatedAt: at,
        stageDates: { ...video.stageDates, [stage]: at },
      };
      await writeVideo(slug, moved);
      return moved;
    }),
  );
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
