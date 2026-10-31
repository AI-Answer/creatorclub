import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubError } from './errors.js';
import { runTool, toolEnv, type ToolOptions } from './tools.js';
import { workspaceDir } from './store.js';

/** One of the channel's recent uploads. `views` and `date` are null when YouTube did not answer for that video. */
export interface Upload {
  id: string;
  title: string;
  views: number | null;
  /** YYYY-MM-DD. */
  date: string | null;
}

/** `channel.json`. */
export interface ChannelData {
  name: string;
  handle: string;
  channelId: string;
  channelUrl: string;
  topics: string[];
  uploads: Upload[];
  fetchedAt: string;
}

export interface Transcript {
  id: string;
  text: string;
}

export const MAX_UPLOADS = 30;
export const MAX_TRANSCRIPTS = 10;
/** A caption file shorter than this is not enough to learn a voice from. */
export const MIN_TRANSCRIPT_WORDS = 300;
export const MAX_TRANSCRIPT_WORDS = 6000;

const NOT_A_CHANNEL = 'Paste a YouTube channel link, like youtube.com/@yourchannel.';
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const HANDLE = /^@[\p{L}\p{N}_.\-]{3,30}$/u;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const NAME = /^[\p{L}\p{N}_.\-]{1,100}$/u;

export interface ChannelRef {
  /** `@name` when the link names a handle. */
  handle?: string;
  /** The canonical channel page, without a tab such as `/videos`. */
  url: string;
}

/** Turns what people paste (`@name`, `youtube.com/@name/videos`, a `/channel/UC…` link) into one canonical channel page. */
export function parseChannelInput(input: string): ChannelRef {
  const text = input.trim();
  if (!text || /\s/.test(text)) throw new ClubError(NOT_A_CHANNEL);
  if (text.startsWith('@')) {
    if (!HANDLE.test(text)) throw new ClubError(NOT_A_CHANNEL);
    return { handle: text, url: `https://www.youtube.com/${text}` };
  }
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ClubError(NOT_A_CHANNEL);
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !HOSTS.has(url.hostname.toLowerCase())) throw new ClubError(NOT_A_CHANNEL);
  let parts: string[];
  try {
    parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new ClubError(NOT_A_CHANNEL);
  }
  const [first, second] = parts;
  if (first?.startsWith('@') && HANDLE.test(first)) return { handle: first, url: `https://www.youtube.com/${first}` };
  if (first === 'channel' && second && CHANNEL_ID.test(second)) return { url: `https://www.youtube.com/channel/${second}` };
  if ((first === 'c' || first === 'user') && second && NAME.test(second)) return { url: `https://www.youtube.com/${first}/${second}` };
  throw new ClubError(NOT_A_CHANNEL);
}

export const sameChannelUrl = (a: string, b: string) => a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();

// ---------------------------------------------------------------- topics

const STOP_WORDS = new Set(
  `about after again also always and any are because been before being best better but can could did does doing done everything for forever from get gets getting going good have here how into its just know like make makes more most much need never new not now one only other our out over really should some still such than that the their them then there these they this those too use used using very was way what when where which while who why will with without would you your tutorial full course insane changed case cases tested replaced`.split(' '),
);

/** Topics from video tags (tags that two or more videos share), else from words the titles keep repeating. */
export function deriveTopics(videos: { title: string; tags?: string[] }[], limit = 5): string[] {
  const count = (items: string[][]) => {
    const seen = new Map<string, { label: string; videos: number }>();
    for (const list of items) {
      for (const label of new Set(list.map((item) => item.trim().toLowerCase()))) {
        if (!label) continue;
        const entry = seen.get(label) ?? { label, videos: 0 };
        entry.videos++;
        seen.set(label, entry);
      }
    }
    return [...seen.values()].filter((entry) => entry.videos >= 2).sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label));
  };
  const fromTags = count(videos.map((video) => video.tags ?? []));
  if (fromTags.length >= 3) return fromTags.slice(0, limit).map((entry) => entry.label);
  const words = count(
    videos.map((video) => video.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))),
  );
  return [...fromTags, ...words].filter((entry, index, all) => all.findIndex((other) => other.label === entry.label) === index).slice(0, limit).map((entry) => entry.label);
}

// ---------------------------------------------------------------- captions

interface Json3 {
  events?: { segs?: { utf8?: string }[] }[];
}

/** Plain text from a YouTube `json3` caption file. */
export function json3ToText(raw: string): string {
  let data: Json3;
  try {
    data = JSON.parse(raw) as Json3;
  } catch {
    return '';
  }
  const pieces: string[] = [];
  for (const event of data.events ?? []) for (const seg of event.segs ?? []) if (seg.utf8) pieces.push(seg.utf8);
  return pieces.join('').replace(/\s+/g, ' ').trim();
}

/** Keeps the first MAX_TRANSCRIPT_WORDS words; returns '' when the text is too short to use. */
export function usableTranscript(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= MIN_TRANSCRIPT_WORDS ? words.slice(0, MAX_TRANSCRIPT_WORDS).join(' ') : '';
}

// ---------------------------------------------------------------- yt-dlp

const isoDate = (yyyymmdd: unknown) => (typeof yyyymmdd === 'string' && /^\d{8}$/.test(yyyymmdd) ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}` : null);

export interface ChannelContext extends ToolOptions {
  ytdlp: string;
  signal?: AbortSignal;
  /** Progress lines for the screen. */
  say?: (message: string) => void;
}

const aborted = (context: ChannelContext) => {
  if (context.signal?.aborted) throw new ClubError('That was stopped.');
};

const YOUTUBE_PROBLEM = "Couldn't read that channel from YouTube. Check the link and try again.";

interface Listing {
  name: string;
  handle: string;
  channelId: string;
  entries: { id: string; title: string }[];
}

async function listChannel(ref: ChannelRef, context: ChannelContext): Promise<Listing> {
  const args = ['--flat-playlist', '--dump-single-json', '--playlist-end', String(MAX_UPLOADS), '--no-warnings', `${ref.url}/videos`];
  const result = await runTool(context.ytdlp, args, { env: toolEnv(context), signal: context.signal });
  aborted(context);
  let data: { channel?: string; uploader?: string; title?: string; uploader_id?: string; channel_id?: string; entries?: { id?: string; title?: string }[] };
  try {
    data = JSON.parse(result.stdout);
  } catch {
    console.error('[club] yt-dlp listing failed:', result.stderr.slice(-300));
    throw new ClubError(YOUTUBE_PROBLEM, 502);
  }
  const entries = (data.entries ?? []).filter((entry): entry is { id: string; title?: string } => typeof entry.id === 'string' && /^[\w-]{6,20}$/.test(entry.id));
  if (entries.length === 0) throw new ClubError("Couldn't find any videos on that channel.", 404);
  const name = (data.channel || data.uploader || data.title?.replace(/ - Videos$/, '') || ref.handle || '').trim();
  if (!name) throw new ClubError(YOUTUBE_PROBLEM, 502);
  const handle = typeof data.uploader_id === 'string' && data.uploader_id.startsWith('@') ? data.uploader_id : ref.handle ?? '';
  return { name, handle, channelId: data.channel_id ?? '', entries: entries.map((entry) => ({ id: entry.id, title: entry.title ?? '' })) };
}

interface VideoDetails extends Upload {
  tags: string[];
  transcript?: string;
}

interface Info {
  title?: unknown;
  view_count?: unknown;
  upload_date?: unknown;
  tags?: unknown;
  language?: unknown;
  automatic_captions?: Record<string, unknown>;
  subtitles?: Record<string, unknown>;
}

/**
 * Which caption track holds what the creator actually says. Videos with dubbed audio list a `-orig` track per
 * language, so the video's own `language` decides; without one, a single `-orig` track is used, else `en-orig`.
 */
export function pickCaptionLanguage(info: Pick<Info, 'language' | 'automatic_captions' | 'subtitles'>): string | undefined {
  const auto = Object.keys(info.automatic_captions ?? {});
  const manual = Object.keys(info.subtitles ?? {});
  const origins = auto.filter((key) => key.endsWith('-orig'));
  const spoken = typeof info.language === 'string' && info.language ? info.language.split('-')[0].toLowerCase() : undefined;
  if (spoken) {
    const match = [...manual, ...origins, ...auto].find((key) => key === spoken || key.split('-')[0].toLowerCase() === spoken);
    if (match) return match;
    return undefined;
  }
  if (origins.length === 1) return origins[0];
  if (origins.includes('en-orig')) return 'en-orig';
  return manual[0] ?? origins[0];
}

/** Runs yt-dlp in `work` with the default player client, then with `mweb`, which YouTube sometimes allows when the default is refused. */
export async function ytdlpTwice(args: string[], work: string, context: ChannelContext, succeeded: (files: string[]) => boolean, clients: (string | undefined)[] = [undefined, 'mweb']): Promise<string[]> {
  let files: string[] = [];
  for (const client of clients) {
    aborted(context);
    await runTool(context.ytdlp, [...args, ...(client ? ['--extractor-args', `youtube:player_client=${client}`] : [])], { env: toolEnv(context), signal: context.signal });
    aborted(context);
    files = await fs.readdir(work);
    if (succeeded(files)) break;
  }
  return files;
}

/** The video's data, and its captions when asked: one call for the data, then one for the caption track the data points to. */
async function readVideo(entry: { id: string; title: string }, withCaptions: boolean, context: ChannelContext): Promise<VideoDetails> {
  const details: VideoDetails = { id: entry.id, title: entry.title, views: null, date: null, tags: [] };
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'creatorclub-yt-'));
  const url = `https://www.youtube.com/watch?v=${entry.id}`;
  const out = ['-o', path.join(work, '%(id)s')];
  const infoName = `${entry.id}.info.json`;
  try {
    const files = await ytdlpTwice(['--skip-download', '--no-warnings', '--write-info-json', ...out, url], work, context, (names) => names.includes(infoName));
    const info = files.includes(infoName) ? await fs.readFile(path.join(work, infoName), 'utf8').then((raw) => JSON.parse(raw) as Info, () => undefined) : undefined;
    if (!info) return details;
    if (typeof info.title === 'string' && info.title) details.title = info.title;
    if (typeof info.view_count === 'number') details.views = info.view_count;
    details.date = isoDate(info.upload_date);
    if (Array.isArray(info.tags)) details.tags = info.tags.filter((tag): tag is string => typeof tag === 'string');
    const language = withCaptions ? pickCaptionLanguage(info) : undefined;
    if (language) {
      const captionName = `${entry.id}.${language}.json3`;
      const after = await ytdlpTwice(
        ['--skip-download', '--no-warnings', '--write-auto-subs', '--write-subs', '--sub-langs', language, '--sub-format', 'json3', ...out, url],
        work,
        context,
        (names) => names.includes(captionName),
      );
      if (after.includes(captionName)) details.transcript = usableTranscript(json3ToText(await fs.readFile(path.join(work, captionName), 'utf8'))) || undefined;
    }
    return details;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** Runs `task` over `items`, `size` at a time, keeping the order of the results. */
export async function pool<T, R>(items: T[], size: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index], index);
      }
    }),
  );
  return results;
}

export interface ChannelRead {
  data: ChannelData;
  transcripts: Transcript[];
}

/** Reads the channel: its name, the last 30 uploads with views and dates, topics, and the captions of the last 10 videos. */
export async function readChannel(ref: ChannelRef, context: ChannelContext): Promise<ChannelRead> {
  context.say?.('Reading your channel…');
  const listing = await listChannel(ref, context);
  const captionCount = Math.min(MAX_TRANSCRIPTS, listing.entries.length);
  context.say?.(`Reading your last ${captionCount} videos…`);
  const details = await pool(listing.entries, 4, (entry, index) => readVideo(entry, index < MAX_TRANSCRIPTS, context));
  const data: ChannelData = {
    name: listing.name,
    handle: listing.handle,
    channelId: listing.channelId,
    channelUrl: ref.url,
    topics: deriveTopics(details),
    uploads: details.map(({ id, title, views, date }) => ({ id, title, views, date })),
    fetchedAt: new Date().toISOString(),
  };
  const transcripts = details.filter((video): video is VideoDetails & { transcript: string } => !!video.transcript).map((video) => ({ id: video.id, text: video.transcript }));
  return { data, transcripts };
}

// ---------------------------------------------------------------- files

export const channelFile = (slug: string) => path.join(workspaceDir(slug), 'channel.json');
export const transcriptsDir = (slug: string) => path.join(workspaceDir(slug), 'own-channel', 'transcripts');

/** The transcripts already saved for a channel. */
export async function savedTranscripts(slug: string): Promise<Transcript[]> {
  let names: string[];
  try {
    names = await fs.readdir(transcriptsDir(slug));
  } catch {
    return [];
  }
  const found = await Promise.all(
    names.filter((name) => name.endsWith('.md') && !name.startsWith('.')).sort().map(async (name) => ({ id: name.slice(0, -3), text: (await fs.readFile(path.join(transcriptsDir(slug), name), 'utf8')).trim() })),
  );
  return found.filter((transcript) => transcript.text);
}
