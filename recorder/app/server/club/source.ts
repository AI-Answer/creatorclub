import { ClubError } from './errors.js';

/*
 * The pure parts of Break down: which link it is, the yt-dlp commands for it, what to take out of yt-dlp's answer,
 * and the outlier maths. Nothing here starts a program.
 */

export type Platform = 'youtube' | 'instagram';

export interface SourceRef {
  platform: Platform;
  /** The link without tracking or playlist parts. */
  url: string;
  id: string;
  /** A YouTube Short. Its channel is compared with the channel's other Shorts. */
  short?: boolean;
}

export const NOT_A_VIDEO = 'Paste a YouTube or Instagram link, or drop a video file.';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am', 'www.instagr.am']);
const YOUTUBE_ID = /^[\w-]{11}$/;
const INSTAGRAM_ID = /^[\w-]{5,40}$/;
const INSTAGRAM_KINDS = new Set(['reel', 'reels', 'p', 'tv']);

/** Tells YouTube from Instagram and cuts the link down to the video. Anything else is refused with one sentence. */
export function detectSource(input: string): SourceRef {
  const text = input.trim();
  if (!text || /\s/.test(text)) throw new ClubError(NOT_A_VIDEO);
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ClubError(NOT_A_VIDEO);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ClubError(NOT_A_VIDEO);
  const host = url.hostname.toLowerCase();
  let parts: string[];
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new ClubError(NOT_A_VIDEO);
  }
  const watch = (id: string, short?: boolean): SourceRef => ({ platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, id, ...(short ? { short } : {}) });

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    if (YOUTUBE_ID.test(parts[0] ?? '')) return watch(parts[0]);
    throw new ClubError(NOT_A_VIDEO);
  }
  if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = parts;
    if (first === 'watch' && YOUTUBE_ID.test(url.searchParams.get('v') ?? '')) return watch(url.searchParams.get('v')!);
    if (first === 'shorts' && YOUTUBE_ID.test(second ?? '')) return watch(second, true);
    if ((first === 'live' || first === 'embed' || first === 'v') && YOUTUBE_ID.test(second ?? '')) return watch(second);
    throw new ClubError(NOT_A_VIDEO);
  }
  if (INSTAGRAM_HOSTS.has(host)) {
    // Posts live at /reel/<id>/, and also at /<user>/reel/<id>/.
    const at = parts.findIndex((part) => INSTAGRAM_KINDS.has(part));
    const kind = parts[at];
    const id = parts[at + 1];
    if (at >= 0 && at <= 1 && INSTAGRAM_ID.test(id ?? '')) return { platform: 'instagram', url: `https://www.instagram.com/${kind === 'reels' ? 'reel' : kind}/${id}/`, id };
    throw new ClubError(NOT_A_VIDEO);
  }
  throw new ClubError(NOT_A_VIDEO);
}

// ---------------------------------------------------------------- yt-dlp commands

/** Top 40 comments, no replies. yt-dlp sorts by newest unless told `top`. */
export const COMMENT_ARGS = 'youtube:max_comments=40,all,0,0;comment_sort=top';
export const MAX_COMMENTS = 40;
export const INSTAGRAM_BLOCKED = 'Instagram blocked the download. Drop the video file here instead.';
export const INSTAGRAM_NO_TEXT = 'That reel has no caption to read. Drop the video file here instead.';

/** A dropped video file: the most that is read. Nothing else is ever downloaded. */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_FILE_MINUTES = 30;
export const FILE_TOO_BIG = 'That file is larger than 500 MB, which is the most Break down reads.';
export const FILE_TOO_LONG = 'That video is longer than 30 minutes, which is the most Break down reads.';

/**
 * Everything but the video: yt-dlp writes `<out>.info.json` (with the top comments inside it for YouTube) and the thumbnail
 * image. No video or audio is ever fetched.
 */
export function infoArgs(ref: SourceRef, out: string): string[] {
  const args = ['--skip-download', '--no-warnings', '--no-playlist', '--write-info-json', '--write-thumbnail'];
  if (ref.platform === 'youtube') args.push('--write-comments', '--extractor-args', COMMENT_ARGS);
  return [...args, '-o', out, ref.url];
}

/** One caption track as `<out>.<lang>.json3`. */
export function subtitleArgs(url: string, language: string, out: string): string[] {
  return ['--skip-download', '--no-warnings', '--no-playlist', '--write-auto-subs', '--write-subs', '--sub-langs', language, '--sub-format', 'json3', '-o', out, url];
}

/** The channel's recent uploads, without opening each video. */
export function listingArgs(channelUrl: string, short: boolean, count: number): string[] {
  return ['--flat-playlist', '--dump-single-json', '--playlist-end', String(count), '--no-warnings', `${channelUrl.replace(/\/+$/, '')}/${short ? 'shorts' : 'videos'}`];
}

/** View counts of whole videos: one tab separated line each, `NA` where YouTube gave none. */
export function viewsArgs(ids: string[]): string[] {
  return ['--skip-download', '--no-warnings', '--ignore-errors', '--no-playlist', '--print', '%(id)s\t%(view_count)s', ...ids.map((id) => `https://www.youtube.com/watch?v=${id}`)];
}

export function parseViewLines(output: string): Map<string, number> {
  const views = new Map<string, number>();
  for (const line of output.split('\n')) {
    const [id, count] = line.trim().split('\t');
    if (id && /^\d+$/.test(count ?? '')) views.set(id, Number(count));
  }
  return views;
}

/** What Working now needs of whole videos: views, likes, comments and the upload time, one tab separated line each. Metadata only; `NA` where YouTube gave none. */
export function statsArgs(ids: string[]): string[] {
  return ['--skip-download', '--no-warnings', '--ignore-errors', '--no-playlist', '--print', '%(id)s\t%(view_count)s\t%(like_count)s\t%(comment_count)s\t%(timestamp)s\t%(upload_date)s', ...ids.map((id) => `https://www.youtube.com/watch?v=${id}`)];
}

/** YouTube's "this month" upload filter on a search results page (`sp`). Checked against yt-dlp: every result is from the last month, where `ytsearchN:` also returns years-old videos. */
const THIS_MONTH = 'EgQIBBAB';

/** One YouTube search for a topic, metadata only: the top `count` results from the last month, one tab separated line each (see `parseSearchLines`). */
export function searchArgs(topic: string, count: number): string[] {
  return ['--skip-download', '--no-warnings', '--ignore-errors', '--playlist-end', String(count), '--print', '%(id)s\t%(view_count)s\t%(like_count)s\t%(comment_count)s\t%(timestamp)s\t%(upload_date)s\t%(channel_id)s\t%(channel)s\t%(title)s', `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}&sp=${THIS_MONTH}`];
}

export interface VideoStats {
  views: number;
  likes: number | null;
  comments: number | null;
  /** Milliseconds since 1970. Undefined when YouTube gave neither a time nor a date. */
  uploadedAt?: number;
}

/** Reads `statsArgs` output. A video with no view count is left out. */
export function parseStatLines(output: string): Map<string, VideoStats> {
  const stats = new Map<string, VideoStats>();
  const count = (value: string | undefined) => (/^\d+$/.test(value ?? '') ? Number(value) : null);
  for (const line of output.split('\n')) {
    const [id, views, likes, comments, timestamp, date] = line.trim().split('\t');
    const viewCount = count(views);
    if (!id || viewCount === null) continue;
    const day = /^(\d{4})(\d{2})(\d{2})$/.exec(date ?? '');
    const uploadedAt = /^\d+$/.test(timestamp ?? '') ? Number(timestamp) * 1000 : day ? Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : undefined;
    stats.set(id, { views: viewCount, likes: count(likes), comments: count(comments), ...(uploadedAt === undefined ? {} : { uploadedAt }) });
  }
  return stats;
}

export interface SearchHit extends VideoStats {
  id: string;
  title: string;
  channel: string;
  /** Set when YouTube gave a channel id. */
  channelId?: string;
}

/** Reads `searchArgs` output. A video with no view count, no channel or no title is left out. */
export function parseSearchLines(output: string): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const line of output.split('\n')) {
    const columns = line.replace(/\r$/, '').split('\t');
    const [id, , , , , , channelId, channel] = columns;
    const title = columns.slice(8).join(' ').trim();
    const stat = parseStatLines(columns.slice(0, 6).join('\t')).get(id);
    if (!stat || !channel || channel === 'NA' || !title || title === 'NA') continue;
    hits.push({ id, title, channel, ...(/^UC[\w-]{22}$/.test(channelId ?? '') ? { channelId } : {}), ...stat });
  }
  return hits;
}

// ---------------------------------------------------------------- outlier maths

/** Eden's method needs a few uploads to mean anything; under this many there is no number. */
export const MIN_UPLOADS = 3;

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The usual views of a channel: the median of its recent uploads. Undefined with too few of them. */
export function usualViews(views: (number | null | undefined)[]): number | undefined {
  const known = views.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (known.length < MIN_UPLOADS) return undefined;
  return median(known);
}

/** Views divided by the channel's usual views, to two decimals. No follower adjustment. Undefined when the usual views are unknown or zero. */
export function outlierMultiplier(views: number, usual: number | undefined): number | undefined {
  if (!usual || usual <= 0 || !Number.isFinite(views) || views < 0) return undefined;
  return Math.round((views / usual) * 100) / 100;
}

// ---------------------------------------------------------------- reading yt-dlp's answer

export interface SourceComment {
  likes: number;
  text: string;
}

export interface SourceInfo {
  title: string;
  channel: string;
  channelUrl?: string;
  views: number;
  likes: number;
  commentCount: number;
  ageDays: number;
  duration?: number;
  thumbnail: string;
  /** The poster's own text: an Instagram reel's caption. */
  description: string;
  comments: SourceComment[];
}

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const uploadedAt = (info: Record<string, unknown>): number | undefined => {
  if (typeof info.timestamp === 'number' && Number.isFinite(info.timestamp)) return info.timestamp * 1000;
  const date = typeof info.upload_date === 'string' ? /^(\d{4})(\d{2})(\d{2})$/.exec(info.upload_date) : null;
  return date ? Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])) : undefined;
};

/** The top comments, best first: top level only, at most 40. */
export function topComments(raw: unknown): SourceComment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && (item.parent === undefined || item.parent === 'root'))
    .map((item) => ({ likes: number(item.like_count), text: text(item.text) }))
    .filter((comment) => comment.text)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, MAX_COMMENTS);
}

/** What the screen and the prompt need from a yt-dlp `.info.json`. `now` is for tests. */
export function parseInfo(raw: unknown, ref: SourceRef, now = Date.now()): SourceInfo {
  const info = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const caption = text(info.description).split('\n')[0].slice(0, 120);
  const title = text(info.title) || caption;
  const posted = uploadedAt(info);
  return {
    title,
    channel: text(info.channel) || text(info.uploader) || text(info.uploader_id),
    ...(text(info.channel_url) ? { channelUrl: text(info.channel_url) } : {}),
    views: number(info.view_count),
    likes: number(info.like_count),
    commentCount: number(info.comment_count),
    ageDays: posted === undefined ? 0 : Math.max(0, Math.floor((now - posted) / 86_400_000)),
    ...(typeof info.duration === 'number' && info.duration > 0 ? { duration: info.duration } : {}),
    thumbnail: ref.platform === 'youtube' ? `https://i.ytimg.com/vi/${ref.id}/hqdefault.jpg` : '',
    description: text(info.description),
    comments: topComments(info.comments),
  };
}
