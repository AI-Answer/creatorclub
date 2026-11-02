import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ClubError, notFound } from './errors.js';
import { arrangeColumn } from '../../shared/club-board.js';
import { freeSpot } from './tile-layout.js';
import {
  CHANNEL_BOARD,
  HELP_STEPS,
  VIDEO_STAGES,
  type AiProvider,
  type HelpStep,
  type IdeaNotes,
  type ResearchTile,
  type TileKind,
  type TileMeta,
  type TilePosition,
  type Video,
  type VideoStage,
  type PublishChannel,
  type PublishVisibility,
  type Workspace,
} from '../../shared/club.js';

/** Workspace root. Read on every call so tests can point CREATORCLUB_DIR at a temp directory. */
export const rootDir = () => {
  if (process.env.CREATORCLUB_DIR) return process.env.CREATORCLUB_DIR;
  const current = path.join(os.homedir(), 'Documents', 'Creator Compiler');
  const previous = path.join(os.homedir(), 'Documents', 'CreatorClub');
  return existsSync(current) || !existsSync(previous) ? current : previous;
};

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
/*
 * A Board is a video's (named by the video's id) or the channel's own, Research (named `CHANNEL_BOARD`). A video's Board keeps its tiles in
 * `videos/<id>/research/` and its notes in `videos/<id>/notes/`; Research keeps its tiles in `research/tiles/` and its notes in `research/notes/`.
 * `boardDir` is the Board's own folder (notes, the files list, the connections and frames, the companion's conversation).
 */
export const isChannelBoard = (board: string) => board === CHANNEL_BOARD;
export const boardDir = (slug: string, board: string) => (isChannelBoard(board) ? path.join(workspaceDir(slug), 'research') : videoDir(slug, board));
export const researchDir = (slug: string, board: string) => (isChannelBoard(board) ? path.join(boardDir(slug, board), 'tiles') : path.join(videoDir(slug, board), 'research'));
/** Throws "not found" unless the Board exists: the video, or for Research the channel. */
export async function requireBoard(slug: string, board: string): Promise<void> {
  if (isChannelBoard(board)) await readWorkspace(slug);
  else await readVideo(slug, board);
}
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
  /** Set once the first-visit "How Creator Compiler works" dialog has been closed. */
  welcomed?: boolean;
  /** The theme the person chose in Settings. */
  appearance?: 'light' | 'dark';
  /** Video ids per channel, most recently opened first. */
  recent?: Record<string, string[]>;
  /** Older builds kept the Gemini API key here. It moves to secrets.json the first time it is read. */
  geminiKey?: string;
  /** Plan steps completed at least once, per channel. Their help lines stop showing. */
  helpSeen?: Record<string, HelpStep[]>;
  /** Skills the person added to Edit or took off it. */
  editSkills?: { on?: string[]; off?: string[] };
  /** Where videos are published. The API key is in secrets.json. */
  publishing?: { address?: string; channel?: PublishChannel; defaultVisibility?: PublishVisibility };
}
const settingsFile = () => path.join(rootDir(), 'settings.json');

/** Read-modify-write on settings.json, one at a time, so two changes never undo each other. */
const updateSettings = (change: (settings: Settings) => Settings) =>
  withLock(`settings:${settingsFile()}`, async () =>
    // Owner-only: files written by older builds can still hold the Gemini API key until it moves.
    writeFileAtomic(settingsFile(), JSON.stringify(change((await readJSON<Settings>(settingsFile())) ?? {}), null, 2) + '\n', 0o600));

// ---------------------------------------------------------------- secrets

/**
 * API keys live outside the workspace root, so they never sync with Documents (iCloud) or travel with a channel folder.
 * CREATORCLUB_SECRETS_DIR overrides the folder. A custom CREATORCLUB_DIR without it keeps its secrets next to it, so a
 * temporary workspace (every test) never reads or writes the real key.
 */
export const secretsDir = () =>
  process.env.CREATORCLUB_SECRETS_DIR || process.env.CREATORCLUB_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Creator Compiler');

interface Secrets {
  /** The person's own Gemini API key. Only ever sent to Google; the screen gets it masked. */
  geminiKey?: string;
  /** The person's own Postiz API key. Only ever sent to their Postiz; the screen is told whether one is saved. */
  postizKey?: string;
}
const secretsFile = () => path.join(secretsDir(), 'secrets.json');

/** Read-modify-write on secrets.json, owner-only, one at a time. */
const updateSecrets = (change: (secrets: Secrets) => Secrets) =>
  withLock(`secrets:${secretsFile()}`, async () =>
    writeFileAtomic(secretsFile(), JSON.stringify(change((await readJSON<Secrets>(secretsFile())) ?? {}), null, 2) + '\n', 0o600));

/** Moves a key an older build saved in settings.json into secrets.json, once. A key already in secrets.json wins. */
async function moveLegacyKey() {
  const legacy = (await readJSON<Settings>(settingsFile()))?.geminiKey;
  if (legacy === undefined) return;
  if (typeof legacy === 'string' && legacy) await updateSecrets((secrets) => (secrets.geminiKey ? secrets : { ...secrets, geminiKey: legacy }));
  await updateSettings(({ geminiKey: _moved, ...settings }) => settings);
}

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

/** The skills the person added to Edit or took off it. */
export async function editSkillChoices(): Promise<{ on: string[]; off: string[] }> {
  const saved = (await readJSON<Settings>(settingsFile()))?.editSkills;
  const names = (list: unknown) => (Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string') : []);
  return { on: names(saved?.on), off: names(saved?.off) };
}

/** Adds a skill to Edit (`true`), takes it off (`false`), or leaves it to the automatic pick (`null`). */
export async function setEditSkill(name: string, on: boolean | null) {
  await updateSettings((settings) => {
    const keep = (list: string[] | undefined) => (list ?? []).filter((each) => each !== name);
    const on_ = keep(settings.editSkills?.on), off = keep(settings.editSkills?.off);
    if (on === true) on_.push(name);
    if (on === false) off.push(name);
    return { ...settings, editSkills: { on: on_, off } };
  });
}

/** The theme chosen in Settings, or undefined while none is chosen. */
export async function appearance(): Promise<'light' | 'dark' | undefined> {
  const value = (await readJSON<Settings>(settingsFile()))?.appearance;
  return value === 'light' || value === 'dark' ? value : undefined;
}

export async function setAppearance(value: 'light' | 'dark') {
  await updateSettings((settings) => ({ ...settings, appearance: value }));
}

/** The saved Gemini API key, for the one place that calls Google with it. Never send this to the screen. */
export async function geminiKey(): Promise<string | undefined> {
  await moveLegacyKey();
  const value = (await readJSON<Secrets>(secretsFile()))?.geminiKey;
  return typeof value === 'string' && value ? value : undefined;
}

/** "••••1234": the last four characters, so the person can tell which key is saved. */
export const maskKey = (key: string) => `••••${key.slice(-4)}`;

export async function maskedGeminiKey(): Promise<string | null> {
  const key = await geminiKey();
  return key ? maskKey(key) : null;
}

export async function setGeminiKey(key: string) {
  await moveLegacyKey();
  await updateSecrets((secrets) => ({ ...secrets, geminiKey: key }));
}

export async function removeGeminiKey() {
  await moveLegacyKey();
  await updateSecrets(({ geminiKey: _removed, ...secrets }) => secrets);
}

/** The saved Postiz API key, for the one place that calls Postiz with it. Never send this to the screen. */
export async function postizKey(): Promise<string | undefined> {
  const value = (await readJSON<Secrets>(secretsFile()))?.postizKey;
  return typeof value === 'string' && value ? value : undefined;
}

export const setPostizKey = (key: string) => updateSecrets((secrets) => ({ ...secrets, postizKey: key }));
export const removePostizKey = () => updateSecrets(({ postizKey: _removed, ...secrets }) => secrets);

export type PublishingSettings = NonNullable<Settings['publishing']>;

export async function publishingSettings(): Promise<PublishingSettings> {
  return (await readJSON<Settings>(settingsFile()))?.publishing ?? {};
}

/** Changes the publishing settings. A field set to undefined is removed. */
export async function updatePublishingSettings(change: Partial<{ [K in keyof PublishingSettings]: PublishingSettings[K] | undefined }>) {
  await updateSettings((settings) => {
    const next = { ...settings.publishing, ...change };
    for (const key of Object.keys(next) as (keyof PublishingSettings)[]) if (next[key] === undefined) delete next[key];
    return { ...settings, publishing: next };
  });
}

export async function welcomed(): Promise<boolean> {
  return (await readJSON<Settings>(settingsFile()))?.welcomed === true;
}

export async function setWelcomed() {
  await updateSettings((settings) => ({ ...settings, welcomed: true }));
}

/** Plan steps whose help line no longer shows in this channel. */
export async function helpSeen(slug: string): Promise<HelpStep[]> {
  const seen = (await readJSON<Settings>(settingsFile()))?.helpSeen?.[assertSlug(slug)] ?? [];
  return HELP_STEPS.filter((step) => seen.includes(step));
}

/** Records that a Plan step was completed once in this channel. */
export async function markHelpSeen(slug: string, step: HelpStep) {
  if (!HELP_STEPS.includes(step)) throw new ClubError('That step does not exist.');
  assertSlug(slug);
  await updateSettings((settings) => {
    const seen = settings.helpSeen?.[slug] ?? [];
    return seen.includes(step) ? settings : { ...settings, helpSeen: { ...settings.helpSeen, [slug]: [...seen, step] } };
  });
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
  // Channels saved before audiences existed have none.
  return { ...workspace, audience: Array.isArray(workspace.audience) ? workspace.audience : [] };
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
export async function createWorkspace(input: Omit<Workspace, 'slug' | 'createdAt' | 'audience'> & { slug?: string; audience?: string[] }): Promise<Workspace> {
  const base = input.slug ?? (slugify(input.name) || 'channel');
  let slug = assertSlug(base);
  for (let n = 2; await readJSON(profileFile(slug)); n++) {
    if (input.slug) throw new ClubError('A channel with that name already exists.', 409);
    slug = `${base}-${n}`;
  }
  const { slug: _ignored, ...fields } = input;
  const workspace: Workspace = { ...fields, audience: fields.audience ?? [], slug, createdAt: now() };
  await writeWorkspace(workspace);
  return workspace;
}

// ---------------------------------------------------------------- videos

/** Runs `fn` after every earlier call with the same key, so read-modify-write cycles never overlap. */
const lockTails = new Map<string, Promise<unknown>>();
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
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

export type NewVideo = Pick<Video, 'title'> & Partial<Pick<Video, 'stage' | 'source' | 'idea' | 'hidden' | 'publishDate' | 'planning' | 'recorderProjectId'>>;

const nextOrder = (videos: Video[], stage: VideoStage) => Math.max(-1, ...videos.filter((v) => v.stage === stage).map((v) => v.order)) + 1;

async function createLocked(slug: string, input: NewVideo, videos: Video[]): Promise<Video> {
  const stage = input.stage ?? 'ideas';
  const at = now();
  const video: Video = {
    ...input,
    id: newId('v'),
    stage,
    order: nextOrder(videos, stage),
    createdAt: at,
    updatedAt: at,
    stageDates: { [stage]: at },
    planning: input.planning ?? { research: false, package: false, outline: false },
  };
  await writeVideo(slug, video);
  return video;
}

export function createVideo(slug: string, input: NewVideo): Promise<Video> {
  return workspaceLock(slug, async () => createLocked(slug, input, await listVideos(slug)));
}

/** Creates a video unless `find` already finds one among the channel's videos. The check and the create happen under one lock, so two calls at once make one video. */
export function createVideoUnless(slug: string, input: NewVideo, find: (videos: Video[]) => Video | undefined): Promise<{ video: Video; created: boolean }> {
  return workspaceLock(slug, async () => {
    const videos = await listVideos(slug);
    const existing = find(videos);
    return existing ? { video: existing, created: false } : { video: await createLocked(slug, input, videos), created: true };
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

export type VideoPatch = Partial<Omit<Video, 'id' | 'stage' | 'createdAt' | 'updatedAt' | 'stageDates' | 'idea'>>;
/** Changes to an idea's notes: a field that is sent replaces the stored one, `null` removes it, a field left out stays. */
export type IdeaPatch = { [K in keyof IdeaNotes]?: IdeaNotes[K] | null };

/** Merges a patch; a null value clears an optional field. `idea` is merged field by field (see `IdeaPatch`), so two edits to different notes never undo each other. */
export function updateVideo(slug: string, id: string, patch: { [K in keyof VideoPatch]: VideoPatch[K] | null } & { idea?: IdeaPatch | null }): Promise<Video> {
  return videoLock(slug, id, async () => {
    const video: Record<string, unknown> = { ...(await readVideo(slug, id)) };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'idea' && value) {
        const notes: Record<string, unknown> = { ...(video.idea as IdeaNotes | undefined) };
        for (const [field, note] of Object.entries(value)) {
          if (note === null) delete notes[field];
          else if (note !== undefined) notes[field] = note;
        }
        video.idea = notes;
      } else if (value === null) delete video[key];
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
  await requireBoard(slug, videoId);
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

/** Runs `fn` with the Board of a video held: no tile is added, placed or seeded by anything else meanwhile. */
export const boardLock = <T>(slug: string, videoId: string, fn: () => Promise<T>) => withLock(`board:${researchDir(slug, videoId)}`, fn);
/** Saves a whole tile, for code that already holds the Board (see `boardLock`). */
export const writeTile = (slug: string, videoId: string, tile: ResearchTile) => writeJSON(tileFile(slug, videoId, tile.id), tile);
export const newTileId = () => newId('t');
export const nowIso = now;

/** Adds a tile in the first free place on the Board. One at a time per video, so two new tiles never take the same place. */
export function addTile(slug: string, videoId: string, input: NewTile): Promise<ResearchTile> {
  return withLock(`board:${researchDir(slug, videoId)}`, async () => {
    const tiles = await listTiles(slug, videoId);
    const id = newId('t');
    const tile: ResearchTile = { id, kind: input.kind, meta: input.meta ?? {}, pos: freeSpot(tiles, input.kind), createdAt: now() };
    if (input.url) tile.url = input.url;
    if (input.title) tile.title = input.title;
    if (input.text) tile.text = input.text;
    if (input.file) {
      tile.file = `${id}-${safeFileName(input.file.name)}`;
      await writeFileAtomic(path.join(researchDir(slug, videoId), tile.file), input.file.data);
    }
    await writeJSON(tileFile(slug, videoId, id), tile);
    return tile;
  });
}

/**
 * A video made from an idea has "The idea" on its Board (why it could work, and how it was rated), and the idea's sources as link tiles when the Board does not show them already.
 * Done once, the first time the Board is read: a marker keeps it from coming back after tiles are removed. A video with no idea gets nothing.
 */
export function seedIdeaTiles(slug: string, videoId: string): Promise<void> {
  return withLock(`board:${researchDir(slug, videoId)}`, async () => {
    // Research is not made from an idea: nothing to seed.
    if (isChannelBoard(videoId)) return;
    const marker = path.join(researchDir(slug, videoId), '.seeded');
    if (await fs.stat(marker).then(() => true, () => false)) return;
    const video = await readVideo(slug, videoId);
    const tiles = await listTiles(slug, videoId);
    const idea = video.idea;
    const pieces: NewTile[] = [];
    if (idea) {
      const meta: TileMeta = { ...(idea.demand ? { demand: idea.demand } : {}), ...(idea.gap ? { gap: idea.gap } : {}), ...(idea.show ? { show: idea.show } : {}) };
      if (idea.why || Object.keys(meta).length) pieces.push({ kind: 'idea', title: 'The idea', text: idea.why ?? '', meta });
      // A source the idea already put on the Board (the breakdown, the video, the post it came from) is not added again.
      for (const source of idea.sources ?? []) if (source.url && !tiles.some((tile) => tile.url === source.url)) pieces.push({ kind: 'link', url: source.url, title: source.label });
    }
    const placed: Pick<ResearchTile, 'kind' | 'pos'>[] = [...tiles];
    for (const [index, piece] of pieces.entries()) {
      const id = newId('t');
      // A millisecond apart, so the idea stays first when the tiles are listed by when they were added.
      const tile: ResearchTile = { id, kind: piece.kind, meta: piece.meta ?? {}, pos: freeSpot(placed, piece.kind), createdAt: new Date(Date.now() + index).toISOString() };
      if (piece.url) tile.url = piece.url;
      if (piece.title) tile.title = piece.title;
      if (piece.text) tile.text = piece.text;
      placed.push(tile);
      await writeJSON(tileFile(slug, videoId, id), tile);
    }
    await writeFileAtomic(marker, 'seeded\n');
  });
}

/** Merges new details into a tile, one change at a time per tile. */
export function updateTile(slug: string, videoId: string, tileId: string, patch: Partial<Pick<ResearchTile, 'title' | 'text' | 'file' | 'meta' | 'pos'>>): Promise<ResearchTile> {
  return withLock(`tile:${tileFile(slug, videoId, tileId)}`, async () => {
    const tile = await readTile(slug, videoId, tileId);
    const updated: ResearchTile = { ...tile, ...patch, meta: { ...tile.meta, ...patch.meta } };
    await writeJSON(tileFile(slug, videoId, tileId), updated);
    return updated;
  });
}

/** The video's tiles, each with a place on the Board: tiles saved before positions existed are placed now, in the order they were added, and keep the place. */
export function listPlacedTiles(slug: string, videoId: string): Promise<ResearchTile[]> {
  return withLock(`board:${researchDir(slug, videoId)}`, async () => {
    const tiles = await listTiles(slug, videoId);
    for (const [index, tile] of tiles.entries()) {
      if (tile.pos) continue;
      const pos: TilePosition = freeSpot(tiles, tile.kind);
      tiles[index] = await withLock(`tile:${tileFile(slug, videoId, tile.id)}`, async () => {
        const current = await readTile(slug, videoId, tile.id);
        if (current.pos) return current;
        const placed = { ...current, pos };
        await writeJSON(tileFile(slug, videoId, tile.id), placed);
        return placed;
      });
    }
    return tiles;
  });
}

export const tileFilePath = (slug: string, videoId: string, tile: ResearchTile) =>
  tile.file ? path.join(researchDir(slug, videoId), path.basename(tile.file)) : undefined;

export async function deleteTile(slug: string, videoId: string, tileId: string) {
  const tile = await readTile(slug, videoId, tileId);
  const file = tileFilePath(slug, videoId, tile);
  if (file) await fs.rm(file, { force: true });
  await fs.rm(path.join(researchDir(slug, videoId), 'transcripts', `${tileId}.json`), { force: true });
  await fs.rm(tileFile(slug, videoId, tileId), { force: true });
}
