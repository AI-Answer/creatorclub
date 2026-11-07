import { youtubeId } from './publish.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIDEO_STAGES, type ConceptRating, type IdeaNotes, type Video, type VideoStage } from '../../shared/club.js';
import { ClubError } from './errors.js';
import { stripPromotions } from './prompts.js';
import * as store from './store.js';

/*
 * One-time import of the old Samin board's workspace (`workspaces/samin/`) into a Creator Compiler workspace.
 * The source is only read, never written.
 */

type Placement = { stage: VideoStage; hidden?: 'later' | 'skipped' };

/** PLAN.md "Migration": new → Ideas; picked and outline → Planning; recorded → Editing; edited → Publishing; published → Published; parked and dropped stay hidden. */
const STATUS: Record<string, Placement> = {
  new: { stage: 'ideas' },
  picked: { stage: 'planning' },
  outline: { stage: 'planning' },
  recorded: { stage: 'editing' },
  edited: { stage: 'publishing' },
  published: { stage: 'published' },
  parked: { stage: 'ideas', hidden: 'later' },
  dropped: { stage: 'ideas', hidden: 'skipped' },
};

export function placeIdea(status: unknown, id: string): Placement {
  const placement = typeof status === 'string' ? STATUS[status] : undefined;
  if (!placement) throw new ClubError(`The idea "${id}" has a status this import does not know: ${String(status)}.`);
  return placement;
}

/** Old stage-date keys, mapped to the stage they started. */
const DATE_KEY: Record<string, VideoStage> = { new: 'ideas', picked: 'planning', outline: 'planning', recorded: 'editing', edited: 'publishing', published: 'published' };

// ---------------------------------------------------------------- clean-up

/** Takes the club, community, course and affiliate pitches out of the voice guide (the profile says no club in the call to action). Same rule the prompts apply. */
export function cleanVoice(text: string): { text: string; dropped: number } {
  const cleaned = stripPromotions(text);
  return { text: cleaned, dropped: text.split('\n').length - cleaned.split('\n').length };
}

const NAME = /\b(?:Jake|Ed)\b/;
const headingLevel = (line: string) => /^(#{1,6})\s/.exec(line)?.[1].length ?? 0;

/** Removes the Jake and Ed playbook references: attribution bullets, "(Jake: …)" asides, and any section left empty. */
export function cleanOutline(text: string): string {
  let lines: string[] = [];
  for (const line of text.split('\n')) {
    if (/^\s*[-*]\s+\*\*(?:Jake|Ed)\b/.test(line)) continue;
    const cleaned = line.replace(/\s*\((?:Jake|Ed)\b[^()]*\)/g, '');
    if (cleaned !== line && !cleaned.trim()) continue;
    if (NAME.test(cleaned)) continue;
    lines.push(cleaned);
  }
  // A heading with nothing under it (before the next heading of its level or higher) goes too.
  lines = lines.filter((line, index) => {
    const level = headingLevel(line);
    if (!level) return true;
    for (let next = index + 1; next < lines.length; next++) {
      if (headingLevel(lines[next])) return headingLevel(lines[next]) > level;
      if (lines[next].trim()) return true;
    }
    return false;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

// ---------------------------------------------------------------- import

const isoFromMs = (value: unknown, fallback: string) => (typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : fallback);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const rating = (value: unknown): ConceptRating | undefined => {
  const r = value as Partial<ConceptRating> | null;
  return r && ['high', 'mid', 'low'].includes(r.level as string) && typeof r.note === 'string' ? { level: r.level!, note: r.note } : undefined;
};

type Idea = Record<string, unknown>;

function ideaNotes(idea: Idea): IdeaNotes {
  const notes: IdeaNotes = {};
  const set = <K extends keyof IdeaNotes>(key: K, value: IdeaNotes[K] | undefined) => value !== undefined && (notes[key] = value);
  set('lane', text(idea.lane));
  set('why', text(idea.why));
  set('demand', rating(idea.demand));
  set('gap', rating(idea.gap));
  set('show', rating(idea.show));
  set('angle', text(idea.angle));
  set('twist', text(idea.twist));
  set('hook', text(idea.hook));
  set('note', text(idea.note));
  set('dropReason', text(idea.dropReason));
  if (Array.isArray(idea.sources) && idea.sources.length) {
    set('sources', idea.sources.flatMap((s: { label?: unknown; url?: unknown }) => (typeof s?.label === 'string' ? [{ label: s.label, ...(typeof s.url === 'string' ? { url: s.url } : {}) }] : [])));
  }
  return notes;
}

function ideaToVideo(idea: Idea, index: number, hasOutline: boolean): Video {
  const id = String(idea.id ?? '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ClubError(`An idea has an id this import cannot use: "${id}".`);
  const title = text(idea.title);
  if (!title) throw new ClubError(`The idea "${id}" has no title.`);
  const placement = placeIdea(idea.status, id);
  let stage = placement.stage;
  const hidden = placement.hidden;
  let youtubeUrl: string | undefined;
  const oldUrl = text(idea.youtubeUrl) ?? text(idea.publishedUrl) ?? text(idea.url);
  if (stage === 'published') {
    try { youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId(oldUrl ?? '')}`; }
    catch { stage = 'publishing'; }
  }
  const createdAt = isoFromMs(idea.createdAt, new Date().toISOString());
  const updatedAt = isoFromMs(idea.updatedAt, createdAt);
  const stageDates: Video['stageDates'] = {};
  for (const [key, ms] of Object.entries((idea.stageDates as Record<string, unknown> | undefined) ?? {})) {
    const target = DATE_KEY[key];
    if (!target || typeof ms !== 'number') continue;
    const at = isoFromMs(ms, createdAt);
    if (!stageDates[target] || at < stageDates[target]!) stageDates[target] = at;
  }
  stageDates.ideas ??= createdAt;
  stageDates[stage] ??= updatedAt;
  const video: Video = {
    id,
    title,
    stage,
    order: typeof idea.order === 'number' ? idea.order : index,
    createdAt,
    updatedAt,
    stageDates,
    planning: { research: false, package: false, outline: hasOutline },
    ...(youtubeUrl ? { youtubeUrl, publishedAt: stageDates.published ?? updatedAt } : {}),
  };
  if (hidden) video.hidden = hidden;
  const notes = ideaNotes(idea);
  if (Object.keys(notes).length) video.idea = notes;
  return video;
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** The board's Working now and Signals files, copied as they are. `config.json` (the old board's search queries) is not needed: Working now reads followed channels. */
export const BOARD_DATA_FILES = ['trending.json', 'signals.json', 'followed.json', 'signals-config.json', 'meta.json'] as const;

/**
 * Copies the board's Working now and Signals files into a channel folder. Copy only: the source is never touched,
 * a file that is already there and newer than the source (or the same) is left alone, and running it again changes nothing.
 * Returns the files that were copied.
 */
export async function copyBoardData(sourceDir: string, slug: string, target = store.workspaceDir(slug)): Promise<string[]> {
  const copied: string[] = [];
  for (const name of BOARD_DATA_FILES) {
    const from = path.join(sourceDir, name);
    const data = await fs.readFile(from).catch((error: NodeJS.ErrnoException) => (error.code === 'ENOENT' ? undefined : Promise.reject(error)));
    if (!data) continue;
    const to = path.join(target, name);
    const existing = await fs.stat(to).catch(() => undefined);
    if (existing && (existing.mtimeMs >= (await fs.stat(from)).mtimeMs || (await fs.readFile(to)).equals(data))) continue;
    await store.writeFileAtomic(to, data);
    copied.push(name);
  }
  return copied;
}

export interface MigrationReport {
  slug: string;
  videos: number;
  byStage: Record<VideoStage, number>;
  hidden: { later: number; skipped: number };
  outlines: number;
  /** Outline folders in the source with no matching idea. They are not imported. */
  unmatchedOutlines: number;
  files: { voice: boolean; criteria: boolean; structure: boolean };
  voiceLinesDropped: number;
  /** Working now and Signals files copied from the board. */
  boardData: string[];
}

/** Imports a board workspace folder. Throws if the target channel already exists. */
export async function migrateBoard(sourceDir: string, options: { slug?: string } = {}): Promise<MigrationReport> {
  const profileText = await readIfExists(path.join(sourceDir, 'profile.json'));
  if (!profileText) throw new ClubError('That folder has no profile.json, so it is not a board workspace.');
  const profile = JSON.parse(profileText) as Record<string, unknown>;
  const name = text(profile.name);
  if (!name) throw new ClubError('The board profile has no channel name.');
  const ideasText = await readIfExists(path.join(sourceDir, 'ideas.json'));
  const ideas: Idea[] = ideasText ? JSON.parse(ideasText) : [];
  if (!Array.isArray(ideas)) throw new ClubError('ideas.json is not a list of ideas.');

  // Read and convert everything before writing anything, so a bad idea leaves no half-imported channel.
  const outlines = new Map<string, string>();
  for (const idea of ideas) {
    const outline = await readIfExists(path.join(sourceDir, 'videos', String(idea.id), 'outline.md'));
    if (outline?.trim()) outlines.set(String(idea.id), cleanOutline(outline));
  }
  const videos = ideas.map((idea, index) => ideaToVideo(idea, index, outlines.has(String(idea.id))));
  const voiceText = await readIfExists(path.join(sourceDir, 'voice.md'));
  const voice = voiceText === undefined ? undefined : cleanVoice(voiceText);
  const criteria = await readIfExists(path.join(sourceDir, 'criteria.md'));
  const structure = await readIfExists(path.join(sourceDir, 'structure.md'));
  let videoFolders: string[] = [];
  try {
    videoFolders = (await fs.readdir(path.join(sourceDir, 'videos'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    // no videos folder
  }

  const requested = options.slug ?? text(profile.slug) ?? store.slugify(name);
  const slug = requested;
  const target = store.workspaceDir(slug); // Validate the requested slug before staging anything.
  await fs.mkdir(store.rootDir(), { recursive: true });
  const dir = await fs.mkdtemp(path.join(store.rootDir(), '.migration-'));
  const workspace = {
    slug, createdAt: new Date().toISOString(), audience: [], name,
    handle: text(profile.handle) ?? '', channelUrl: text(profile.channelUrl) ?? '',
    topics: Array.isArray(profile.topics) ? profile.topics.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    about: text(profile.about) ?? '', cta: text(profile.cta) ?? '', knowledge: [],
  };
  let boardData: string[];
  try {
    await store.writeJSON(path.join(dir, 'profile.json'), workspace);
    await fs.mkdir(path.join(dir, 'breakdowns'));
    if (voice) await store.writeFileAtomic(path.join(dir, 'voice.md'), voice.text);
    if (criteria !== undefined) await store.writeFileAtomic(path.join(dir, 'criteria.md'), criteria);
    if (structure !== undefined) await store.writeFileAtomic(path.join(dir, 'structure.md'), structure);
    for (const video of videos) {
      const videoDir = path.join(dir, 'videos', video.id);
      await store.writeJSON(path.join(videoDir, 'video.json'), video);
      const outline = outlines.get(video.id);
      if (outline) await store.writeFileAtomic(path.join(videoDir, 'outline.md'), outline);
    }
    boardData = await copyBoardData(sourceDir, slug, dir);
    await store.withLock(`workspace-create:${store.rootDir()}`, async () => {
      if (await fs.stat(target).then(() => true, () => false)) throw new ClubError('A channel with that name already exists.', 409);
      await fs.rename(dir, target);
    });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
  if (!(await store.currentWorkspace())) await store.setCurrentWorkspace(slug);

  const byStage = Object.fromEntries(VIDEO_STAGES.map((stage) => [stage, videos.filter((v) => v.stage === stage && !v.hidden).length])) as Record<VideoStage, number>;
  const ideaIds = new Set(ideas.map((idea) => String(idea.id)));
  return {
    slug: workspace.slug,
    videos: videos.length,
    byStage,
    hidden: { later: videos.filter((v) => v.hidden === 'later').length, skipped: videos.filter((v) => v.hidden === 'skipped').length },
    outlines: outlines.size,
    unmatchedOutlines: videoFolders.filter((folder) => !ideaIds.has(folder)).length,
    files: { voice: !!voice, criteria: criteria !== undefined, structure: structure !== undefined },
    voiceLinesDropped: voice?.dropped ?? 0,
    boardData,
  };
}

// ---------------------------------------------------------------- command line

async function main() {
  const args = process.argv.slice(2);
  const slugAt = args.indexOf('--slug');
  const slug = slugAt >= 0 ? args.splice(slugAt, 2)[1] : undefined;
  const [source] = args;
  if (!source) {
    console.error('Usage: npm run club:migrate -- <path-to-board-workspace> [--slug name]');
    process.exit(2);
  }
  try {
    const report = await migrateBoard(path.resolve(source), { slug });
    console.log(`Imported into ${store.workspaceDir(report.slug)}`);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof ClubError ? error.message : error);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
