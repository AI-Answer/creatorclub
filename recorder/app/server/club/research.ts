import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { JobSnapshot, ResearchTile, TileMeta, TranscriptChapter } from '../../shared/club.js';
import { pickCaptionLanguage, ytdlpTwice } from './channel.js';
import { ClubError } from './errors.js';
import { startJobOnce, type JobContext } from './jobs.js';
import { detectSource, outlierMultiplier, parseInfo, subtitleArgs, type SourceRef } from './source.js';
import * as store from './store.js';
import { prepareYtDlp, type ToolOptions } from './tools.js';
import { channelUsualViews } from './uploads.js';

/*
 * Video tiles on the research board: a YouTube or Instagram link becomes a tile with its title, channel, numbers and the
 * outlier chip, plus the transcript split into the video's chapters. Uses Break down's helpers; no video or audio is fetched.
 */

const YOUTUBE_PROBLEM = "Couldn't read that video from YouTube.";
const INSTAGRAM_PROBLEM = "Couldn't read that video from Instagram.";
/** Without chapters, the transcript is shown in blocks of this many seconds. */
const BLOCK_SECONDS = 120;
const THUMBNAIL_FILE = /^media\.(jpg|jpeg|png|webp)$/;

export const transcriptFile = (slug: string, videoId: string, tileId: string) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tileId)) throw new ClubError('That tile was not found.', 404);
  return path.join(store.researchDir(slug, videoId), 'transcripts', `${tileId}.json`);
};

export async function readTranscript(slug: string, videoId: string, tileId: string): Promise<TranscriptChapter[]> {
  await store.readTile(slug, videoId, tileId);
  return (await store.readJSON<TranscriptChapter[]>(transcriptFile(slug, videoId, tileId))) ?? [];
}

// ---------------------------------------------------------------- captions with times

interface Json3 {
  events?: { tStartMs?: number; segs?: { utf8?: string }[] }[];
}

/** The caption file's lines with their start times, in seconds. */
export function timedCaptions(raw: string): { start: number; text: string }[] {
  let data: Json3;
  try {
    data = JSON.parse(raw) as Json3;
  } catch {
    return [];
  }
  const lines: { start: number; text: string }[] = [];
  for (const event of data.events ?? []) {
    const text = (event.segs ?? []).map((seg) => seg.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (text) lines.push({ start: Math.max(0, (event.tStartMs ?? 0) / 1000), text });
  }
  return lines;
}

/** Groups caption lines under the video's chapters, or into blocks of two minutes when it has none. Empty chapters are dropped. */
export function chapterize(lines: { start: number; text: string }[], chapters: { title: string; start: number }[] = []): TranscriptChapter[] {
  const marks = chapters.length
    ? [...chapters].sort((a, b) => a.start - b.start).map((chapter, index) => ({ title: chapter.title, start: index === 0 ? 0 : chapter.start }))
    : Array.from({ length: Math.floor((lines.at(-1)?.start ?? 0) / BLOCK_SECONDS) + 1 }, (_, index) => ({ title: '', start: index * BLOCK_SECONDS }));
  const grouped: TranscriptChapter[] = marks.map((mark) => ({ ...mark, text: '' }));
  for (const line of lines) {
    let at = 0;
    while (at + 1 < marks.length && marks[at + 1].start <= line.start) at++;
    grouped[at].text = grouped[at].text ? `${grouped[at].text} ${line.text}` : line.text;
  }
  return grouped.filter((chapter) => chapter.text);
}

const readChapters = (raw: Record<string, unknown>) =>
  (Array.isArray(raw.chapters) ? raw.chapters : [])
    .filter((chapter): chapter is { title?: unknown; start_time?: unknown } => typeof chapter === 'object' && chapter !== null)
    .map((chapter) => ({ title: typeof chapter.title === 'string' ? chapter.title.trim() : '', start: typeof chapter.start_time === 'number' ? chapter.start_time : 0 }));

// ---------------------------------------------------------------- reading a video tile

const readJson = (file: string) => fs.readFile(file, 'utf8').then((raw) => JSON.parse(raw) as Record<string, unknown>, () => undefined);

interface Read {
  title: string;
  meta: TileMeta;
  chapters: TranscriptChapter[];
  /** A thumbnail image left in the work folder (Instagram, whose image links expire). */
  thumbnail?: string;
}

async function readYouTube(ref: SourceRef, work: string, context: ToolOptions & { ytdlp: string; signal: AbortSignal; say: (message: string) => void }): Promise<Read> {
  const out = path.join(work, 'media.%(ext)s');
  await ytdlpTwice(['--skip-download', '--no-warnings', '--no-playlist', '--write-info-json', '-o', out, ref.url], work, context, (files) => files.includes('media.info.json'));
  const raw = await readJson(path.join(work, 'media.info.json'));
  if (!raw) throw new ClubError(YOUTUBE_PROBLEM, 502);
  const info = parseInfo(raw, ref);
  if (!info.title) throw new ClubError(YOUTUBE_PROBLEM, 502);
  // The channel's last 30 uploads are read while the captions come in.
  const usual = info.channelUrl?.startsWith('https://www.youtube.com/') ? channelUsualViews(info.channelUrl, ref.short === true, context) : Promise.resolve(undefined);
  let chapters: TranscriptChapter[] = [];
  const language = pickCaptionLanguage(raw as Parameters<typeof pickCaptionLanguage>[0]);
  if (language) {
    context.say('Reading the transcript…');
    const caption = `media.${language}.json3`;
    const found = await ytdlpTwice(subtitleArgs(ref.url, language, out), work, context, (files) => files.includes(caption));
    if (found.includes(caption)) chapters = chapterize(timedCaptions(await fs.readFile(path.join(work, caption), 'utf8')), readChapters(raw));
  }
  context.say('Checking how it did against the channel…');
  const multiplier = outlierMultiplier(info.views, await usual);
  return {
    title: info.title,
    chapters,
    meta: {
      platform: 'youtube',
      channel: info.channel,
      views: info.views,
      likes: info.likes,
      comments: info.commentCount,
      ageDays: info.ageDays,
      thumbnail: info.thumbnail,
      ...(multiplier !== undefined ? { multiplier } : {}),
    },
  };
}

async function readInstagram(ref: SourceRef, work: string, context: ToolOptions & { ytdlp: string; signal: AbortSignal; say: (message: string) => void }): Promise<Read> {
  const out = path.join(work, 'media.%(ext)s');
  await ytdlpTwice(['--skip-download', '--no-warnings', '--no-playlist', '--write-info-json', '--write-thumbnail', '-o', out, ref.url], work, context, (files) => files.includes('media.info.json'), [undefined]);
  const raw = await readJson(path.join(work, 'media.info.json'));
  if (!raw) throw new ClubError(INSTAGRAM_PROBLEM, 502);
  const info = parseInfo(raw, ref);
  const thumbnail = (await fs.readdir(work)).find((name) => THUMBNAIL_FILE.test(name));
  return {
    title: info.title || 'Instagram video',
    chapters: info.description ? [{ title: 'Caption', start: 0, text: info.description }] : [],
    thumbnail: thumbnail ? path.join(work, thumbnail) : undefined,
    meta: { platform: 'instagram', channel: info.channel, views: info.views, likes: info.likes, comments: info.commentCount, ageDays: info.ageDays },
  };
}

/** Reads a video tile's details and transcript and saves them with the tile. */
export async function readVideoTile(slug: string, videoId: string, tileId: string, context: JobContext, options: ToolOptions = {}): Promise<ResearchTile> {
  const tile = await store.readTile(slug, videoId, tileId);
  if (!tile.url) throw new ClubError('That tile has no link.');
  const ref = detectSource(tile.url);
  const say = (message: string) => context.emit({ message });
  const ytdlp = await prepareYtDlp(say, options);
  say('Reading the video details…');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'creatorclub-tile-'));
  try {
    const toolContext = { ...options, ytdlp, signal: context.signal, say };
    const read = ref.platform === 'youtube' ? await readYouTube(ref, work, toolContext) : await readInstagram(ref, work, toolContext);
    if (context.signal.aborted) throw new ClubError('That was stopped.');
    let file: string | undefined;
    if (read.thumbnail) {
      file = `${tileId}-thumbnail${path.extname(read.thumbnail).toLowerCase()}`;
      await store.writeFileAtomic(path.join(store.researchDir(slug, videoId), file), await fs.readFile(read.thumbnail));
    }
    if (read.chapters.length) await store.writeJSON(transcriptFile(slug, videoId, tileId), read.chapters);
    return await store.updateTile(slug, videoId, tileId, {
      title: read.title,
      ...(file ? { file } : {}),
      meta: { ...read.meta, ...(read.chapters.length ? { transcript: true } : {}) },
    });
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** Starts reading a video tile, or follows its still-settling read. */
export function startTileRead(slug: string, videoId: string, tileId: string, options: ToolOptions = {}): JobSnapshot {
  return startJobOnce(`research:${slug}/${videoId}/${tileId}`, 'research-video', context => readVideoTile(slug, videoId, tileId, context, options));
}
