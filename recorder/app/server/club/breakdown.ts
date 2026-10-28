import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { AiProvider, Breakdown, BreakdownResult, Video } from '../../shared/club.js';
import { AiError, geminiReady, runAI, runGeminiWatch } from './ai.js';
import { json3ToText, pickCaptionLanguage, ytdlpTwice, type ChannelData } from './channel.js';
import { loadChannelContext } from './context.js';
import { ClubError, notFound } from './errors.js';
import type { JobContext } from './jobs.js';
import { buildBreakdownPrompt, type BreakdownSource } from './prompts.js';
import {
  FRAME_COUNT,
  INSTAGRAM_BLOCKED,
  detectSource,
  infoArgs,
  outlierMultiplier,
  parseInfo,
  subtitleArgs,
  usualViews,
  videoArgs,
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
const VIDEO_FILE = /^media\.(mp4|mkv|webm|mov|m4v)$/;
const YOUTUBE_PROBLEM = "Couldn't read that video from YouTube. Check the link and try again.";
const STOPPED = 'That was stopped.';

/** Turns a video file into text. Returns '' when it cannot (no speech model set up, no audio). Tests pass a fake. */
export type Transcriber = (videoPath: string, workDir: string, signal?: AbortSignal) => Promise<string>;

export interface BreakdownOptions extends ToolOptions {
  transcribe?: Transcriber;
}

export type BreakdownInput = { slug: string; id: string } & ({ url: string } | { file: { path: string; name: string } });

export const newBreakdownId = () => `bd_${randomBytes(6).toString('hex')}`;

export function breakdownDir(slug: string, id: string): string {
  if (!BAD_ID.test(id)) throw notFound('breakdown');
  return path.join(store.breakdownsDir(slug), id);
}
export const breakdownFile = (slug: string, id: string) => path.join(breakdownDir(slug, id), 'breakdown.json');
export const framesDir = (slug: string, id: string) => path.join(breakdownDir(slug, id), 'frames');

export async function readBreakdown(slug: string, id: string): Promise<Breakdown> {
  const found = await store.readJSON<Breakdown>(breakdownFile(slug, id));
  if (!found) throw notFound('breakdown');
  return found;
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

const SCALE = 'scale=w=if(gt(iw\\,ih)\\,640\\,-2):h=if(gt(iw\\,ih)\\,-2\\,640)';

async function videoDuration(ffmpeg: string, video: string, context: ToolOptions & { signal?: AbortSignal }): Promise<number | undefined> {
  const result = await runTool(ffmpeg, ['-hide_banner', '-nostdin', '-i', video], { env: toolEnv(context), signal: context.signal });
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(result.stderr);
  if (!match) return undefined;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 ? seconds : undefined;
}

/** 20 frames, evenly spread, each taken from the middle of its slice of the video. Returns their paths in order. */
export async function sampleFrames(ffmpeg: string, video: string, duration: number | undefined, dir: string, context: ToolOptions & { signal?: AbortSignal }): Promise<string[]> {
  await fs.mkdir(dir, { recursive: true });
  const interval = duration ? duration / FRAME_COUNT : 5;
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  if (duration) args.push('-ss', interval / 2 < 0.05 ? '0' : (interval / 2).toFixed(3));
  args.push('-i', video, '-vf', `fps=${(1 / interval).toFixed(6)},${SCALE}`, '-frames:v', String(FRAME_COUNT), '-q:v', '4', path.join(dir, 'frame-%02d.jpg'));
  await runTool(ffmpeg, args, { env: toolEnv(context), signal: context.signal, timeoutMs: 300_000 });
  return (await fs.readdir(dir)).filter((name) => /^frame-\d{2}\.jpg$/.test(name)).sort().map((name) => path.join(dir, name));
}

const defaultTranscribe: Transcriber = async (videoPath, workDir, signal) => {
  // SceneForge's own local transcription. Always the local speech model, so the audio never leaves this Mac.
  const [{ transcribe }, { readAISettings }] = await Promise.all([import('../ai.js'), import('../storage.js')]);
  const saved = await readAISettings();
  const settings = { ...saved, provider: 'local' as const, model: saved.provider === 'local' ? saved.model : '' };
  const media = { id: 'breakdown', name: path.basename(videoPath), path: videoPath, kind: 'video' as const, duration: 0, width: 0, height: 0 };
  const { captions } = await transcribe(media, settings, workDir, { signal });
  return captions.map((caption) => caption.text).join(' ').replace(/\s+/g, ' ').trim();
};

interface Fetched {
  info: SourceInfo;
  videoPath?: string;
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
}

const readJson = (file: string) => fs.readFile(file, 'utf8').then((raw) => JSON.parse(raw) as unknown, () => undefined);

async function fetchRemote(ref: SourceRef, run: Run): Promise<Fetched> {
  const { work, options, context, say, check } = run;
  const ytdlp = await prepareYtDlp(say, options);
  const ytContext = { ...options, ytdlp, signal: context.signal, say };
  const out = path.join(work, 'media.%(ext)s');
  const hasVideo = (names: string[]) => names.some((name) => VIDEO_FILE.test(name));
  say('Getting the video…');

  if (ref.platform === 'instagram') {
    // Instagram keeps no comments or captions that yt-dlp can reach; the video and its numbers come in one call.
    const names = await ytdlpTwice(videoArgs(ref, out), work, ytContext, hasVideo, [undefined]);
    check();
    const video = names.find((name) => VIDEO_FILE.test(name));
    if (!video) throw new ClubError(INSTAGRAM_BLOCKED, 502);
    const info = parseInfo(await readJson(path.join(work, 'media.info.json')), ref);
    return { info: { ...info, title: info.title || 'Instagram video' }, videoPath: path.join(work, video), transcript: '' };
  }

  await ytdlpTwice(infoArgs(ref, out), work, ytContext, (found) => found.includes('media.info.json'));
  check();
  const raw = await readJson(path.join(work, 'media.info.json'));
  if (!raw) throw new ClubError(YOUTUBE_PROBLEM, 502);
  const info = parseInfo(raw, ref);
  await fs.rm(path.join(work, 'media.info.json'), { force: true });
  if (!info.title) throw new ClubError(YOUTUBE_PROBLEM, 502);

  // The channel's last 30 uploads are read while the rest downloads.
  const usual = info.channelUrl ? channelUsualViews(info.channelUrl, ref.short === true, { ...options, ytdlp, signal: context.signal }) : undefined;

  let transcript = '';
  const language = pickCaptionLanguage(raw as Parameters<typeof pickCaptionLanguage>[0]);
  if (language) {
    const caption = `media.${language}.json3`;
    const found = await ytdlpTwice(subtitleArgs(ref.url, language, out), work, ytContext, (list) => list.includes(caption));
    check();
    if (found.includes(caption)) transcript = json3ToText(await fs.readFile(path.join(work, caption), 'utf8'));
  }

  // A video that will not download still has its captions and comments to work from.
  const downloaded = await ytdlpTwice(videoArgs(ref, out), work, ytContext, hasVideo);
  check();
  const video = downloaded.find((name) => VIDEO_FILE.test(name));
  return { info, videoPath: video ? path.join(work, video) : undefined, transcript, usual };
}

function fileInfo(name: string): SourceInfo {
  const title = path.basename(name, path.extname(name)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Video';
  return { title, channel: '', views: 0, likes: 0, commentCount: 0, ageDays: 0, thumbnail: '', comments: [] };
}

// ---------------------------------------------------------------- the job

/** Usual views of the user's own channel (the base for judging demand), from the last read of the channel. */
async function ownUsualViews(slug: string): Promise<number | undefined> {
  const channel = await store.readJSON<ChannelData>(path.join(store.workspaceDir(slug), 'channel.json')).catch(() => undefined);
  return usualViews((channel?.uploads ?? []).map((upload) => upload.views));
}

export async function runBreakdown(input: BreakdownInput, context: JobContext, options: BreakdownOptions = {}): Promise<Breakdown> {
  const { slug, id } = input;
  const dir = breakdownDir(slug, id);
  const work = path.join(dir, '.work');
  const say = (message: string) => context.emit({ message });
  const check = () => {
    if (context.signal.aborted) throw new ClubError(STOPPED);
  };
  await fs.mkdir(work, { recursive: true });
  try {
    const ref = 'url' in input ? detectSource(input.url) : undefined;
    const run: Run = { work, options, context, say, check };
    const fetched: Fetched = 'file' in input ? { info: fileInfo(input.file.name), videoPath: input.file.path, transcript: '' } : await fetchRemote(ref!, run);
    check();
    const { info } = fetched;
    const platform = ref?.platform ?? 'file';

    // Keep the video next to the breakdown; the rest of the downloaded files stay in .work.
    let videoPath = fetched.videoPath;
    if (ref && videoPath) {
      const kept = path.join(dir, `video${path.extname(videoPath)}`);
      await fs.rename(videoPath, kept);
      videoPath = kept;
    }

    const ffmpeg = await findFfmpeg(options);
    if (!ffmpeg && !ref) throw new ClubError("Couldn't find FFmpeg on this Mac, which is needed to read a video file.", 502);
    let frames: string[] = [];
    if (ffmpeg && videoPath) {
      const duration = (await videoDuration(ffmpeg, videoPath, { ...options, signal: context.signal })) ?? info.duration;
      frames = await sampleFrames(ffmpeg, videoPath, duration, path.join(dir, 'frames'), { ...options, signal: context.signal });
      check();
      if (frames.length) say(`Looking at ${frames.length} frames…`);
    }

    let usual: number | undefined;
    if (fetched.usual) {
      say('Checking how it did against the channel…');
      usual = await fetched.usual;
      check();
    }
    const multiplier = outlierMultiplier(info.views, usual);

    let transcript = fetched.transcript.trim();
    if (!transcript && videoPath) {
      say('Transcribing the audio…');
      transcript = await (options.transcribe ?? defaultTranscribe)(videoPath, work, context.signal).catch((error) => {
        if (context.signal.aborted) throw error;
        console.error('[club] transcription failed:', error instanceof Error ? error.message : error);
        return '';
      });
      check();
    }
    if (transcript) {
      say('Reading the transcript…');
      await store.writeFileAtomic(path.join(dir, 'transcript.txt'), transcript + '\n');
    }
    if (info.comments.length) {
      say(`Reading ${info.comments.length} ${info.comments.length === 1 ? 'comment' : 'comments'}…`);
      await store.writeJSON(path.join(dir, 'comments.json'), info.comments);
    }

    say('Finding what made it work…');
    const channelContext = await loadChannelContext(slug);
    const existingTitles = (await store.listVideos(slug)).map((video) => video.title);
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
      existingTitles,
    };

    let result: BreakdownResult | undefined;
    let watchedWith: Breakdown['watchedWith'];
    if (videoPath && (await geminiReady(options))) {
      try {
        const built = await buildBreakdownPrompt(channelContext, source);
        const answer = await runGeminiWatch({ ...options, prompt: built.prompt, system: built.system, jsonSchema: built.schema, videoPath, signal: context.signal });
        result = parseBreakdownResult(answer.json, 'Gemini');
        watchedWith = 'gemini';
      } catch (error) {
        if (context.signal.aborted) throw error;
        // Gemini is an extra. Claude with the frames is the way that always works.
        console.error('[club] Gemini could not watch the video:', error instanceof Error ? error.message : error);
      }
    }
    if (!result) {
      const built = await buildBreakdownPrompt(channelContext, { ...source, frames: frames.length });
      const provider: AiProvider = (await store.defaultAi()) ?? 'claude';
      const answer = await runAI({
        ...options,
        provider,
        prompt: built.prompt,
        system: built.system,
        jsonSchema: built.schema,
        model: provider === 'claude' ? 'sonnet' : undefined,
        budgetUsd: BREAKDOWN_BUDGET_USD,
        images: frames.length ? frames : undefined,
        signal: context.signal,
      });
      result = parseBreakdownResult(answer.json, provider === 'claude' ? 'Claude' : 'Codex');
    }
    check();

    const breakdown: Breakdown = {
      id,
      url: ref?.url ?? '',
      platform,
      video: {
        title: info.title,
        channel: info.channel,
        views: info.views,
        likes: info.likes,
        comments: info.commentCount,
        ageDays: info.ageDays,
        thumbnail: info.thumbnail || (frames.length ? `/api/club/breakdowns/${id}/frames/${path.basename(frames[0])}` : ''),
        ...(multiplier !== undefined ? { multiplier } : {}),
      },
      createdAt: new Date().toISOString(),
      ...(watchedWith ? { watchedWith } : {}),
      ...result,
    };
    await store.writeJSON(breakdownFile(slug, id), breakdown);
    return breakdown;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- Add to board

/** Puts one concept of a breakdown on the board as a new video in Ideas. Only the person pressing `Add to board` triggers this. */
export async function addConceptToBoard(slug: string, id: string, index: number): Promise<Video> {
  const breakdown = await readBreakdown(slug, id);
  const concept = breakdown.concepts[index];
  if (!concept) throw notFound('concept');
  const existing = (await store.listVideos(slug)).find((video) => video.source?.breakdownId === id && video.title === concept.title);
  if (existing) throw new ClubError('That concept is already on the board.', 409);
  return store.createVideo(slug, {
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
}
