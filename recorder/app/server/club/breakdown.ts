import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { AiProvider, Breakdown, BreakdownResult, BreakdownSummary, Video } from '../../shared/club.js';
import { AiError, aiLabel, runAI, watchWithGemini } from './ai.js';
import { json3ToText, pickCaptionLanguage, ytdlpTwice, type ChannelData } from './channel.js';
import { loadChannelContext } from './context.js';
import { ClubError, notFound } from './errors.js';
import type { JobContext } from './jobs.js';
import { buildBreakdownPrompt, type BreakdownSource } from './prompts.js';
import {
  FILE_TOO_BIG,
  FILE_TOO_LONG,
  INSTAGRAM_BLOCKED,
  INSTAGRAM_NO_TEXT,
  MAX_FILE_BYTES,
  MAX_FILE_MINUTES,
  detectSource,
  infoArgs,
  outlierMultiplier,
  parseInfo,
  subtitleArgs,
  usualViews,
  type SourceInfo,
  type SourceRef,
} from './source.js';
import * as store from './store.js';
import { findFfmpeg, prepareYtDlp, runTool, toolEnv, type ToolOptions } from './tools.js';
import { channelUsualViews } from './uploads.js';

/*
 * Break down this video: read a YouTube or Instagram video (or a dropped file), sample frames, find the channel's
 * usual views, and ask the AI why it worked and what to make from it. Nothing is added to the board here.
 */

export const BREAKDOWN_BUDGET_USD = 1;
const BAD_ID = /^bd_[a-f0-9]{12}$/;
const THUMBNAIL_FILE = /^media\.(jpg|jpeg|png|webp)$/;
const YOUTUBE_PROBLEM = "Couldn't read that video from YouTube.";
const STOPPED = 'That was stopped.';

/** Turns an audio file (taken from a dropped video) into text. Returns '' when it cannot (no speech model set up, no audio). Tests pass a fake. */
export type Transcriber = (audioPath: string, workDir: string, signal?: AbortSignal) => Promise<string>;

export interface BreakdownOptions extends ToolOptions {
  transcribe?: Transcriber;
}

export type BreakdownInput = { slug: string; id: string } & ({ url: string } | { file: { path: string; name: string }; contentHash?: string });

export const newBreakdownId = () => `bd_${randomBytes(6).toString('hex')}`;

export function breakdownDir(slug: string, id: string): string {
  if (!BAD_ID.test(id)) throw notFound('breakdown');
  return path.join(store.breakdownsDir(slug), id);
}
export const breakdownFile = (slug: string, id: string) => path.join(breakdownDir(slug, id), 'breakdown.json');
/** The one image kept with a breakdown: the video's thumbnail, or a still from a dropped file. */
export const thumbnailDir = (slug: string, id: string) => path.join(breakdownDir(slug, id), 'thumbnail');
export async function thumbnailFile(slug: string, id: string): Promise<string | undefined> {
  const dir = thumbnailDir(slug, id);
  const name = (await fs.readdir(dir).catch(() => [] as string[])).find((entry) => /^thumbnail\.(jpg|jpeg|png|webp)$/.test(entry));
  return name ? path.join(dir, name) : undefined;
}

export async function readBreakdown(slug: string, id: string): Promise<Breakdown> {
  const found = await store.readJSON<Breakdown>(breakdownFile(slug, id));
  if (!found) throw notFound('breakdown');
  return found;
}

/** Every finished breakdown of a channel, newest first. A folder with no `breakdown.json` yet (one still running) is left out. */
export async function listBreakdowns(slug: string): Promise<BreakdownSummary[]> {
  const ids = (await fs.readdir(store.breakdownsDir(slug)).catch(() => [] as string[])).filter((id) => BAD_ID.test(id));
  const found = await Promise.all(ids.map((id) => store.readJSON<Breakdown>(breakdownFile(slug, id)).catch(() => undefined)));
  return found
    .filter((breakdown): breakdown is Breakdown => !!breakdown)
    .map(({ id, url, platform, createdAt, video }) => ({ id, url, platform, createdAt, title: video.title, channel: video.channel }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------- what the AI sends back

const rating = z.object({ level: z.enum(['high', 'mid', 'low']), note: z.string() });
const line = z.string().trim().min(1);
const resultShape = z.object({
  whyItWorked: z.object({
    titlePackaging: line,
    hookSpeed: line,
    structure: z.array(line).min(1),
    retention: line,
    payoff: line,
    short: z.array(line).min(1),
  }),
  reusableOutline: z.array(line).min(1),
  viewerQuestions: z.array(z.object({ question: line, likes: z.number().transform((n) => Math.max(0, Math.round(n))) })),
  concepts: z.array(z.object({ title: line, angle: line, twist: line, hook: line, demand: rating, gap: rating, show: rating, why: line })).min(1).max(3),
});

export function parseBreakdownResult(json: unknown, who = 'The AI'): BreakdownResult {
  const parsed = resultShape.safeParse(json);
  if (!parsed.success) {
    console.error('[club] breakdown answer rejected:', parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    throw new AiError('bad-answer', `${who} answered in a shape we could not read.`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------- reading the video

/** Only a dropped file is ever processed here, and it is already on this Mac. Nothing is downloaded. */
async function videoDuration(ffmpeg: string, video: string, context: ToolOptions & { signal?: AbortSignal }): Promise<number | undefined> {
  const result = await runTool(ffmpeg, ['-hide_banner', '-nostdin', '-i', video], { env: toolEnv(context), signal: context.signal });
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(result.stderr);
  if (!match) return undefined;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 ? seconds : undefined;
}

type MediaContext = ToolOptions & { signal?: AbortSignal };
const quiet = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];

/** The sound of a video file as 16 kHz mono WAV, the form the speech model reads. Undefined when there is no sound. */
export async function extractAudio(ffmpeg: string, video: string, out: string, context: MediaContext): Promise<string | undefined> {
  const result = await runTool(ffmpeg, [...quiet, '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out], { env: toolEnv(context), signal: context.signal, timeoutMs: 600_000 });
  return result.code === 0 && (await fs.stat(out).then((s) => s.size > 0, () => false)) ? out : undefined;
}

/** One still from the middle of the video, 640 on the long side. Undefined when it cannot be made. */
export async function posterFrame(ffmpeg: string, video: string, duration: number | undefined, out: string, context: MediaContext): Promise<string | undefined> {
  const scale = 'scale=w=if(gt(iw\\,ih)\\,640\\,-2):h=if(gt(iw\\,ih)\\,-2\\,640)';
  const at = duration ? (duration / 2).toFixed(3) : '0';
  const result = await runTool(ffmpeg, [...quiet, '-ss', at, '-i', video, '-frames:v', '1', '-vf', scale, '-q:v', '3', out], { env: toolEnv(context), signal: context.signal, timeoutMs: 120_000 });
  return result.code === 0 && (await fs.stat(out).then((s) => s.size > 0, () => false)) ? out : undefined;
}

const defaultTranscribe: Transcriber = async (audioPath, workDir, signal) => {
  // SceneForge's own local transcription. Always the local speech model, so the audio never leaves this Mac.
  const [{ transcribe }, { readAISettings }] = await Promise.all([import('../ai.js'), import('../storage.js')]);
  const saved = await readAISettings();
  const settings = { ...saved, provider: 'local' as const, model: saved.provider === 'local' ? saved.model : '' };
  const media = { id: 'breakdown', name: path.basename(audioPath), path: audioPath, kind: 'audio' as const, duration: 0, width: 0, height: 0 };
  const { captions } = await transcribe(media, settings, workDir, { signal });
  return captions.map((caption) => caption.text).join(' ').replace(/\s+/g, ' ').trim();
};

interface Fetched {
  info: SourceInfo;
  /** The thumbnail as yt-dlp (or ffmpeg) left it in the work folder. */
  thumbnail?: string;
  transcript: string;
  /** Resolves to the channel's usual views once they are read. Never rejects. */
  usual?: Promise<number | undefined>;
}

interface Run {
  work: string;
  options: BreakdownOptions;
  context: JobContext;
  say: (message: string) => void;
  check: () => void;
  /** Aborted when the job ends, so the channel lookup never outlives it. */
  background: AbortSignal;
}

const readJson = (file: string) => fs.readFile(file, 'utf8').then((raw) => JSON.parse(raw) as unknown, () => undefined);
const listing = (dir: string) => fs.readdir(dir).catch(() => [] as string[]);

/** A link: yt-dlp reads the details, captions, comments and thumbnail. No video or audio is fetched. */
async function fetchRemote(ref: SourceRef, run: Run): Promise<Fetched> {
  const { work, options, context, say, check } = run;
  const ytdlp = await prepareYtDlp(say, options);
  const ytContext = { ...options, ytdlp, signal: context.signal, say };
  const out = path.join(work, 'media.%(ext)s');
  say('Reading the video details…');

  if (ref.platform === 'instagram') {
    // Instagram offers a caption, numbers and a thumbnail. One try: a second client changes nothing there.
    await ytdlpTwice(infoArgs(ref, out), work, ytContext, (found) => found.includes('media.info.json'), [undefined]);
    check();
    const raw = await readJson(path.join(work, 'media.info.json'));
    if (!raw) throw new ClubError(INSTAGRAM_BLOCKED, 502);
    const info = parseInfo(raw, ref);
    if (!info.description) throw new ClubError(INSTAGRAM_NO_TEXT, 422);
    return { info: { ...info, title: info.title || 'Instagram video' }, thumbnail: (await listing(work)).find((name) => THUMBNAIL_FILE.test(name)), transcript: info.description };
  }

  await ytdlpTwice(infoArgs(ref, out), work, ytContext, (found) => found.includes('media.info.json'));
  check();
  const raw = await readJson(path.join(work, 'media.info.json'));
  if (!raw) throw new ClubError(YOUTUBE_PROBLEM, 502);
  const info = parseInfo(raw, ref);
  if (!info.title) throw new ClubError(YOUTUBE_PROBLEM, 502);

  // The channel's last 30 uploads are read while the captions come in.
  const usual = info.channelUrl?.startsWith('https://www.youtube.com/') ? channelUsualViews(info.channelUrl, ref.short === true, { ...options, ytdlp, signal: run.background }) : undefined;

  let transcript = '';
  const language = pickCaptionLanguage(raw as Parameters<typeof pickCaptionLanguage>[0]);
  if (language) {
    const caption = `media.${language}.json3`;
    const found = await ytdlpTwice(subtitleArgs(ref.url, language, out), work, ytContext, (list) => list.includes(caption));
    check();
    if (found.includes(caption)) transcript = json3ToText(await fs.readFile(path.join(work, caption), 'utf8'));
  }
  return { info, thumbnail: (await listing(work)).find((name) => THUMBNAIL_FILE.test(name)), transcript, usual };
}

/** A dropped file: its sound is transcribed and one still becomes the thumbnail. The file itself is removed afterwards. */
async function readDroppedFile(file: { path: string; name: string }, run: Run): Promise<Fetched> {
  const { work, options, context, say, check } = run;
  const ffmpeg = await findFfmpeg(options);
  if (!ffmpeg) throw new ClubError("Couldn't find FFmpeg on this Mac, which is needed to read a video file.", 502);
  if ((await fs.stat(file.path)).size > MAX_FILE_BYTES) throw new ClubError(FILE_TOO_BIG, 413);
  const media = { ...options, signal: context.signal };
  const duration = await videoDuration(ffmpeg, file.path, media);
  check();
  if (duration && duration > MAX_FILE_MINUTES * 60) throw new ClubError(FILE_TOO_LONG, 413);
  const title = path.basename(file.name, path.extname(file.name)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Video';
  const info: SourceInfo = { title, channel: '', views: 0, likes: 0, commentCount: 0, ageDays: 0, thumbnail: '', description: '', comments: [], ...(duration ? { duration } : {}) };

  say('Transcribing the audio…');
  const audio = await extractAudio(ffmpeg, file.path, path.join(work, 'audio.wav'), media);
  check();
  let transcript = '';
  if (audio) {
    transcript = await (options.transcribe ?? defaultTranscribe)(audio, work, context.signal).catch((error) => {
      if (context.signal.aborted) throw error;
      console.error('[club] transcription failed:', error instanceof Error ? error.message : error);
      return '';
    });
    check();
  }
  const poster = await posterFrame(ffmpeg, file.path, duration, path.join(work, 'media.jpg'), media);
  return { info, thumbnail: poster ? path.basename(poster) : undefined, transcript };
}

// ---------------------------------------------------------------- the job

/** Usual views of the user's own channel (the base for judging demand), from the last read of the channel. */
async function ownUsualViews(slug: string): Promise<number | undefined> {
  const channel = await store.readJSON<ChannelData>(path.join(store.workspaceDir(slug), 'channel.json')).catch(() => undefined);
  return usualViews((channel?.uploads ?? []).map((upload) => upload.views));
}

/**
 * Reads the video and asks the AI about it. A YouTube link with a saved Gemini key is watched by Gemini from the link;
 * everything else (and any Gemini failure) goes to Claude with the transcript, comments, numbers and thumbnail.
 * A run that does not finish removes its own folder. A finished one keeps only breakdown.json, the thumbnail and the transcript.
 */
export async function runBreakdown(input: BreakdownInput, context: JobContext, options: BreakdownOptions = {}): Promise<Breakdown> {
  const { slug, id } = input;
  const dir = breakdownDir(slug, id);
  const work = path.join(dir, '.work');
  const say = (message: string) => context.emit({ message });
  const check = () => {
    if (context.signal.aborted) throw new ClubError(STOPPED);
  };
  const background = new AbortController();
  context.signal.addEventListener('abort', () => background.abort(), { once: true });
  let finished = false;
  try {
    await fs.mkdir(work, { recursive: true });
    check();
    const ref = 'url' in input ? detectSource(input.url) : undefined;
    const run: Run = { work, options, context, say, check, background: background.signal };
    const fetched: Fetched = 'file' in input ? await readDroppedFile(input.file, run) : await fetchRemote(ref!, run);
    check();
    const { info } = fetched;
    const platform = ref?.platform ?? 'file';

    // The one image kept: the thumbnail, in a folder of its own so the AI can read it and nothing else.
    let thumbnail: string | undefined;
    if (fetched.thumbnail) {
      thumbnail = path.join(dir, 'thumbnail', `thumbnail${path.extname(fetched.thumbnail).toLowerCase()}`);
      await fs.mkdir(path.dirname(thumbnail), { recursive: true });
      await fs.rename(path.join(work, fetched.thumbnail), thumbnail);
    }

    let usual: number | undefined;
    if (fetched.usual) {
      say('Checking how it did against the channel…');
      usual = await fetched.usual;
      check();
    }
    const multiplier = outlierMultiplier(info.views, usual);

    const transcript = fetched.transcript.trim();
    if (transcript) {
      say(platform === 'instagram' ? 'Reading the caption…' : 'Reading the transcript…');
      await store.writeFileAtomic(path.join(dir, 'transcript.txt'), transcript + '\n');
    }
    if (info.comments.length) say(`Reading ${info.comments.length} ${info.comments.length === 1 ? 'comment' : 'comments'}…`);

    say('Finding what made it work…');
    const channelContext = await loadChannelContext(slug);
    const source: BreakdownSource = {
      title: info.title,
      channel: info.channel || 'not given',
      views: info.views,
      likes: info.likes,
      commentCount: info.commentCount,
      ...(platform === 'file' ? {} : { ageDays: info.ageDays }),
      ...(multiplier !== undefined ? { multiplier } : {}),
      usualViews: await ownUsualViews(slug),
      transcript,
      comments: info.comments,
      existingTitles: (await store.listVideos(slug)).map((video) => video.title),
    };

    let result: BreakdownResult | undefined;
    let watchedWith: Breakdown['watchedWith'];
    const key = ref?.platform === 'youtube' ? await store.geminiKey() : undefined;
    if (key && ref) {
      try {
        const built = await buildBreakdownPrompt(channelContext, source);
        const answer = await watchWithGemini({ apiKey: key, videoUrl: ref.url, prompt: built.prompt, system: built.system, jsonSchema: built.schema, signal: context.signal, fetch: options.fetch });
        result = parseBreakdownResult(answer.json, 'Gemini');
        watchedWith = 'gemini';
      } catch (error) {
        if (context.signal.aborted) throw error;
        // A private or unlisted video, a quota or a bad answer: Claude with the transcript and thumbnail takes over, with no Gemini tag.
        console.error('[club] Gemini could not watch the video:', error instanceof Error ? error.message : error);
      }
    }
    if (!result) {
      const built = await buildBreakdownPrompt(channelContext, { ...source, ...(thumbnail ? { thumbnail: true } : {}) });
      const provider: AiProvider = (await store.defaultAi()) ?? 'claude';
      const answer = await runAI({
        ...options,
        provider,
        prompt: built.prompt,
        system: built.system,
        jsonSchema: built.schema,
        model: provider === 'claude' ? 'sonnet' : undefined,
        budgetUsd: BREAKDOWN_BUDGET_USD,
        images: thumbnail ? [thumbnail] : undefined,
        signal: context.signal,
      });
      result = parseBreakdownResult(answer.json, aiLabel(provider));
    }
    check();

    const breakdown: Breakdown = {
      id,
      ...('contentHash' in input ? { contentHash: input.contentHash } : {}),
      url: ref?.url ?? '',
      platform,
      video: {
        title: info.title,
        channel: info.channel,
        views: info.views,
        likes: info.likes,
        comments: info.commentCount,
        ageDays: info.ageDays,
        thumbnail: thumbnail ? `/api/club/breakdowns/${id}/thumbnail` : info.thumbnail,
        ...(multiplier !== undefined ? { multiplier } : {}),
      },
      createdAt: new Date().toISOString(),
      ...(watchedWith ? { watchedWith } : {}),
      ...result,
    };
    await store.writeJSON(breakdownFile(slug, id), breakdown);
    finished = true;
    return breakdown;
  } finally {
    background.abort();
    if (finished) {
      // Keep breakdown.json, the thumbnail and the transcript. A dropped video is not kept.
      await fs.rm(work, { recursive: true, force: true });
      if ('file' in input) await fs.rm(input.file.path, { force: true });
    } else {
      await fs.rm(dir, { recursive: true, force: true });
      if ('file' in input) await fs.rm(input.file.path, { force: true });
    }
  }
}

// ---------------------------------------------------------------- Add to board

/** Puts one concept of a breakdown on the board as a new video in Ideas. Only the person pressing `Add to board` triggers this. */
export async function addConceptToBoard(slug: string, id: string, index: number): Promise<Video> {
 return store.withLock(`breakdown-concept:${slug}:${id}:${index}`, async () => {
  const breakdown = await readBreakdown(slug, id);
  const concept = breakdown.concepts[index];
  if (!concept) throw notFound('concept');
  const existing = (await store.listVideos(slug)).find((video) => video.source?.breakdownId === id && video.title === concept.title);
  if (existing) throw new ClubError('That concept is already on the board.', 409);
  const video = await store.createVideo(slug, {
    title: concept.title,
    stage: 'ideas',
    source: { kind: 'breakdown', breakdownId: id },
    idea: {
      angle: concept.angle,
      twist: concept.twist,
      hook: concept.hook,
      why: concept.why,
      demand: concept.demand,
      gap: concept.gap,
      show: concept.show,
      sources: [{ label: breakdown.video.title, ...(breakdown.url ? { url: breakdown.url } : {}) }],
    },
  });
  // The video's Board starts with the breakdown it came from.
  await store.addTile(slug, video.id, { kind: 'breakdown', title: breakdown.video.title, ...(breakdown.url ? { url: breakdown.url } : {}), meta: { breakdownId: id } });
  return video;
 });
}

/** Startup-only sweep: no live job can own an unfinished folder yet. */
export async function sweepBreakdownWork(): Promise<void> {
  for (const workspace of await store.listWorkspaces()) {
    for (const id of (await fs.readdir(store.breakdownsDir(workspace.slug)).catch(() => [] as string[])).filter(id => BAD_ID.test(id))) {
      try{const dir = breakdownDir(workspace.slug, id);
      if (!(await store.readJSON(breakdownFile(workspace.slug, id)))) await fs.rm(dir, { recursive: true, force: true });
      else await fs.rm(path.join(dir, '.work'), { recursive: true, force: true });}catch(error){console.error('Could not sweep breakdown work',workspace.slug,id,error);}
    }
  }
}
export async function uploadHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
