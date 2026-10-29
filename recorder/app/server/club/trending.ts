import path from 'node:path';
import type { FollowedChannel, JobSnapshot, TrendingEntry, TrendingItem, TrendingRefreshResult, TrendingResponse, Workspace } from '../../shared/club.js';
import { parseChannelInput, pool } from './channel.js';
import { ClubError } from './errors.js';
import { startJobOnce, type JobContext } from './jobs.js';
import { reasonFor, trendText } from './relevance.js';
import { listingArgs, outlierMultiplier, parseStatLines, statsArgs, usualViews, type VideoStats } from './source.js';
import * as store from './store.js';
import { prepareYtDlp, runTool, toolEnv, type ToolOptions } from './tools.js';

/*
 * Working now: videos from followed channels that are doing better than usual. Everything is read with yt-dlp metadata only
 * (a flat listing of each channel's last 30 uploads, then their numbers); no video or audio is downloaded.
 * Files, in the channel folder, keep the shapes of the old board's: `trending.json` (a list), `followed.json` (a list) and `meta.json`.
 */

export const UPLOADS_READ = 30;
/** Videos older than this leave the list. */
export const KEEP_DAYS = 30;
const DAY = 86_400_000;
const BATCH = 4;
const PARALLEL = 8;

const trendingFile = (slug: string) => path.join(store.workspaceDir(slug), 'trending.json');
const followedFile = (slug: string) => path.join(store.workspaceDir(slug), 'followed.json');
const metaFile = (slug: string) => path.join(store.workspaceDir(slug), 'meta.json');

// ---------------------------------------------------------------- files

const isChannel = (value: unknown): value is FollowedChannel => {
  const c = value as FollowedChannel | null;
  return !!c && typeof c === 'object' && typeof c.name === 'string' && !!c.name.trim() && !!(c.url || c.handle || c.channelId);
};

/** The channels followed in a channel. Rows that cannot be used are left out. */
export async function readFollowed(slug: string): Promise<FollowedChannel[]> {
  const list = await store.readJSON<unknown>(followedFile(slug));
  return Array.isArray(list) ? list.filter(isChannel) : [];
}

export const writeFollowed = (slug: string, channels: FollowedChannel[]) => store.writeJSON(followedFile(slug), channels);

const isItem = (value: unknown): value is TrendingItem => {
  const t = value as TrendingItem | null;
  return !!t && typeof t === 'object' && typeof t.videoId === 'string' && typeof t.title === 'string' && typeof t.views === 'number';
};

async function readItems(slug: string): Promise<TrendingItem[]> {
  const list = await store.readJSON<unknown>(trendingFile(slug));
  return Array.isArray(list) ? list.filter(isItem) : [];
}

export async function readTrendingItem(slug: string, videoId: string): Promise<TrendingItem | undefined> {
  return (await readItems(slug)).find((item) => item.videoId === videoId);
}

async function lastRefresh(slug: string): Promise<string | null> {
  const meta = await store.readJSON<{ lastRefresh?: unknown }>(metaFile(slug));
  return typeof meta?.lastRefresh === 'string' ? meta.lastRefresh : null;
}

/** The channel page to read for a followed channel: its link, else its handle, else its channel id. Undefined when none is usable. */
export function followedUrl(channel: FollowedChannel): string | undefined {
  try {
    if (channel.url) return parseChannelInput(channel.url).url;
    if (channel.handle) return parseChannelInput(channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`).url;
    if (channel.channelId && /^UC[\w-]{22}$/.test(channel.channelId)) return `https://www.youtube.com/channel/${channel.channelId}`;
  } catch {
    // not a usable channel
  }
  return undefined;
}

// ---------------------------------------------------------------- reading

/** Working now for a channel: every video, ranked for it. Videos that match its topics or audience come first, each with its reason; the rest have `fit: false`. */
export async function rankedTrending(slug: string, workspace: Pick<Workspace, 'topics' | 'audience'>): Promise<TrendingResponse> {
  const [items, updatedAt, followed] = await Promise.all([readItems(slug), lastRefresh(slug), readFollowed(slug)]);
  const entries: TrendingEntry[] = items.map((item) => {
    const reason = reasonFor(trendText(item), workspace.topics, workspace.audience);
    return { ...item, mult: item.mult ?? null, fit: reason !== null, reason };
  });
  entries.sort((a, b) => Number(b.fit) - Number(a.fit) || b.vpd - a.vpd);
  return { items: entries, updatedAt, followed: followed.length };
}

// ---------------------------------------------------------------- yt-dlp

/** Where Working now reads from. Tests pass a stand-in. */
export interface UploadsSource {
  /** A channel's latest uploads, newest first, without opening each video. */
  list(channelUrl: string, signal?: AbortSignal): Promise<{ id: string; title: string }[]>;
  /** Numbers for whole videos. A video YouTube gave no view count for is missing from the answer. */
  stats(ids: string[], signal?: AbortSignal): Promise<Map<string, VideoStats>>;
}
export type UploadsSourceFactory = (say: (message: string) => void) => Promise<UploadsSource>;

/** yt-dlp, metadata only: `--flat-playlist` for the listing, `--skip-download --print` for the numbers. */
export function ytDlpUploads(ytdlp: string, options: ToolOptions = {}): UploadsSource {
  return {
    async list(channelUrl, signal) {
      const result = await runTool(ytdlp, listingArgs(channelUrl, false, UPLOADS_READ), { env: toolEnv(options), signal });
      const data = JSON.parse(result.stdout) as { entries?: { id?: unknown; title?: unknown }[] };
      return (data.entries ?? [])
        .filter((entry): entry is { id: string; title?: unknown } => typeof entry.id === 'string' && /^[\w-]{6,20}$/.test(entry.id))
        .map((entry) => ({ id: entry.id, title: typeof entry.title === 'string' ? entry.title : '' }));
    },
    async stats(ids, signal) {
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));
      const found = new Map<string, VideoStats>();
      await pool(batches, PARALLEL, async (batch) => {
        const result = await runTool(ytdlp, statsArgs(batch), { env: toolEnv(options), signal, timeoutMs: 180_000 });
        for (const [id, stat] of parseStatLines(result.stdout)) found.set(id, stat);
      });
      return found;
    },
  };
}

/** The default source: a yt-dlp that is already there, or the official build downloaded once. */
export const ytDlpSource = (options: ToolOptions): UploadsSourceFactory => async (say) => ytDlpUploads(await prepareYtDlp(say, options), options);

// ---------------------------------------------------------------- refreshing

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Appends today's reading to a video's history; a second reading on the same day replaces the first. */
function addReading(history: TrendingItem['history'], day: string, views: number): TrendingItem['history'] {
  const rest = history.at(-1)?.d === day ? history.slice(0, -1) : history;
  return [...rest, { d: day, v: views }];
}

/**
 * Reads each followed channel's last 30 uploads, works out each recent video's multiplier (its views over the median of those
 * 30 uploads, which needs at least 3 with views), views per day and history, and keeps videos up to 30 days old.
 * A channel that cannot be read keeps its earlier videos. Nothing is written when no channel could be read.
 */
export async function refreshTrending(slug: string, context: JobContext, makeSource: UploadsSourceFactory, nowMs = Date.now()): Promise<TrendingRefreshResult> {
  const followed = await readFollowed(slug);
  if (!followed.length) throw new ClubError('Follow a channel first.', 409);
  const say = (message: string) => context.emit({ message });
  const source = await makeSource(say);
  const existing = await readItems(slug);
  const known = new Map(existing.map((item) => [item.videoId, item]));
  const today = isoDay(nowMs);

  const fresh = new Map<string, TrendingItem>();
  const medians = new Map<FollowedChannel, number>();
  const failed: string[] = [];
  for (const [index, channel] of followed.entries()) {
    if (context.signal.aborted) throw new ClubError('That was stopped.');
    say(`Reading ${channel.name} (${index + 1} of ${followed.length})…`);
    const url = followedUrl(channel);
    try {
      if (!url) throw new Error('no usable link');
      const entries = (await source.list(url, context.signal)).slice(0, UPLOADS_READ);
      if (!entries.length) throw new Error('no uploads');
      const stats = await source.stats(entries.map((entry) => entry.id), context.signal);
      if (context.signal.aborted) throw new ClubError('That was stopped.');
      // yt-dlp failing (bot check, rate limit, timeout) shows up as missing numbers, not as an error: too few means the channel was not read.
      if (stats.size < Math.ceil(entries.length / 4)) throw new Error(`numbers for ${stats.size} of ${entries.length} uploads`);
      const usual = usualViews(entries.map((entry) => stats.get(entry.id)?.views)) ?? channel.median;
      if (usual !== undefined && usual > 0) medians.set(channel, usual);
      for (const entry of entries) {
        const stat = stats.get(entry.id);
        if (!stat || stat.uploadedAt === undefined) continue;
        const ageDays = Math.max(0, (nowMs - stat.uploadedAt) / DAY);
        if (ageDays > KEEP_DAYS) continue;
        const old = known.get(entry.id);
        fresh.set(entry.id, {
          videoId: entry.id,
          title: entry.title || old?.title || '',
          channel: channel.name,
          kind: 'followed',
          views: stat.views,
          likes: stat.likes,
          comments: stat.comments,
          published: isoDay(stat.uploadedAt),
          ageDays: round1(ageDays),
          vpd: Math.round(stat.views / Math.max(ageDays, 0.25)),
          mult: outlierMultiplier(stat.views, usual) ?? null,
          history: addReading(old?.history ?? [], today, stat.views),
          firstSeen: old?.firstSeen ?? today,
          fit: true,
        });
      }
    } catch (error) {
      if (context.signal.aborted) throw error;
      console.error(`[club] trending: could not read ${channel.name}:`, error instanceof Error ? error.message : error);
      failed.push(channel.name);
    }
  }
  if (failed.length === followed.length) throw new ClubError("Couldn't read the channels you follow. Check your connection and try again.", 502);

  // Videos not read this time (a channel that failed, or a video the listing no longer shows) stay until they are 30 days old.
  const kept = existing.filter((item) => !fresh.has(item.videoId) && nowMs - Date.parse(item.published) <= KEEP_DAYS * DAY);
  const items = [...fresh.values(), ...kept].sort((a, b) => b.vpd - a.vpd);
  const added = [...fresh.keys()].filter((id) => !known.has(id)).length;
  await store.writeJSON(trendingFile(slug), items);
  // followed.json may have been edited while the job ran: only the medians are merged into what is there now.
  if (medians.size) {
    const latest = await readFollowed(slug);
    const byKey = (c: FollowedChannel) => followedUrl(c) ?? c.name;
    const usualByKey = new Map([...medians].map(([channel, usual]) => [byKey(channel), usual]));
    await writeFollowed(slug, latest.map((channel) => (usualByKey.has(byKey(channel)) ? { ...channel, median: usualByKey.get(byKey(channel)) } : channel)));
  }
  await store.writeJSON(metaFile(slug), { lastRefresh: new Date(nowMs).toISOString(), newVideos: added });
  return { videos: items.length, added, channels: followed.length - failed.length, failed };
}

/** Starts the refresh job. A second start while one runs gets the running one. */
export const startTrendingRefresh = (slug: string, makeSource: UploadsSourceFactory): JobSnapshot =>
  startJobOnce(`trending:${store.workspaceDir(slug)}`, 'trending-refresh', (context) => refreshTrending(slug, context, makeSource));
