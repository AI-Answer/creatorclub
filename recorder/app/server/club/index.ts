import express, { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PLAN_JOB_KINDS, PLAN_STEPS, TILE_KINDS, VIDEO_STAGES, type Workspace } from '../../shared/club.js';
import { aiStatus } from './ai.js';
import { startConnect, type ConnectOptions } from './connect.js';
import { ClubError, GENERIC_FAILURE, notFound } from './errors.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addConceptToBoard, breakdownDir, newBreakdownId, readBreakdown, runBreakdown, thumbnailFile, type Transcriber } from './breakdown.js';
import { cancelJob, getJob, snapshot, startJob, watchJob } from './jobs.js';
import { parseChannelInput } from './channel.js';
import { FILE_TOO_BIG, MAX_FILE_BYTES, detectSource } from './source.js';
import { addChannel, rebuildVoice, startFresh } from './onboard.js';
import { heldResults, readOutline, readPackage, runningPlanJobs, saveOutline, savePackage, saveScript, startPlanJob, undoReplace, useHeld, type PlanOptions } from './planning.js';
import { continueToRecording, outlineChangedScene } from './recorder.js';
import { publishVideo, ytDlpViews, type ViewsReader } from './publish.js';
import { recordingsDiskSpace } from './disk.js';
import { readTranscript, startTileRead } from './research.js';
import { findTregCall, hasSources, NO_SOURCES, rankedSignals, readSignalsConfig, startSignalsRefresh, writeSignalsConfig, type SignalsSources } from './signals.js';
import { ideaFromSignal, ideaFromTrending } from './trend-ideas.js';
import { rankedTrending, readFollowed, startTrendingRefresh, writeFollowed, ytDlpSource, type UploadsSourceFactory } from './trending.js';
import * as store from './store.js';
import type { ToolOptions } from './tools.js';

const source = z.object({ kind: z.enum(['breakdown', 'manual']), breakdownId: z.string().optional() }).strict();
const planning = z.object({ research: z.boolean(), package: z.boolean(), outline: z.boolean() }).strict();
const stage = z.enum(VIDEO_STAGES);
const hidden = z.enum(['later', 'skipped']);

const newVideoBody = z.object({
  title: z.string().trim().min(1).max(300),
  stage: stage.optional(),
  source: source.optional(),
  hidden: hidden.optional(),
  publishDate: z.string().optional(),
  planning: planning.optional(),
}).strict();

// null clears an optional field. Stage changes go through /move so the stage date is recorded.
const videoPatchBody = z.object({
  title: z.string().trim().min(1).max(300),
  order: z.number().int(),
  source: source.nullable(),
  planning,
  recorderProjectId: z.string().nullable(),
  publishDate: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  views: z.number().int().nonnegative().nullable(),
  viewsCheckedAt: z.string().nullable(),
  hidden: hidden.nullable(),
}).partial().strict();

const workspaceFields = {
  name: z.string().trim().min(1).max(120),
  handle: z.string().trim().max(120).default(''),
  channelUrl: z.string().trim().max(500).default(''),
  topics: z.array(z.string().trim().min(1)).default([]),
  audience: z.array(z.string().trim().min(1)).default([]),
  about: z.string().default(''),
  cta: z.string().default(''),
};
const newWorkspaceBody = z.object({ ...workspaceFields, slug: z.string().optional() }).strict();
const addChannelBody = z.object({ channelUrl: z.string().trim().min(1).max(500) }).strict();
const voiceBody = z.object({
  answers: z.object({
    voice: z.string().trim().min(1).max(2000),
    audience: z.string().trim().min(1).max(2000),
    moves: z.string().trim().max(2000).default(''),
  }).strict().optional(),
}).strict();
const workspacePatchBody = z.object(workspaceFields).partial().strict();
const answer = z.string().trim().max(2000).optional();
const freshBody = z.object({
  name: workspaceFields.name,
  topics: workspaceFields.topics,
  audience: workspaceFields.audience,
  voice: z.object({ voice: answer, audience: answer, moves: answer }).strict().optional(),
}).strict();

const followedBody = z.array(z.object({
  name: z.string().trim().min(1).max(120),
  channelId: z.string().regex(/^UC[\w-]{22}$/).optional(),
  handle: z.string().trim().max(60).optional(),
  url: z.string().trim().max(500).optional(),
  median: z.number().positive().optional(),
}).strict().refine((channel) => channel.url || channel.handle || channel.channelId, { message: 'needs a link, a handle or a channel id' })).max(100);
const xHandle = z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/).transform((handle) => handle.replace(/^@/, ''));
const subreddit = z.string().trim().regex(/^(?:r\/)?[A-Za-z0-9_]{2,21}$/).transform((name) => name.replace(/^r\//, ''));
const limit = z.number().int().nonnegative().max(1_000_000);
const signalsConfigBody = z.object({
  x: z.array(xHandle).max(50),
  xTopics: z.array(z.string().trim().min(1).max(100)).max(50),
  reddit: z.array(subreddit).max(50),
  minXLikes: limit,
  maxAgeDays: z.number().int().min(1).max(30),
  minRedditScore: limit,
  maxPerSource: z.number().int().min(1).max(100),
}).partial().strict();
const signalIdeaBody = z.object({ id: z.string().min(1).max(100) }).strict();
const trendingIdeaBody = z.object({ videoId: z.string().regex(/^[\w-]{6,20}$/) }).strict();

const tileMeta = z
  .object({ views: z.number(), channel: z.string(), multiplier: z.number(), thumbnail: z.string(), likes: z.number(), comments: z.number(), ageDays: z.number(), platform: z.enum(['youtube', 'instagram']) })
  .partial()
  .strict();
const scriptBody = z.object({ script: z.string().max(200_000).nullable() }).strict();
const versionBody = z.object({ token: z.string().max(64) }).strict();
// Multipart fields arrive as strings, so meta may be a JSON string.
const newTileBody = z.object({
  kind: z.enum(TILE_KINDS),
  url: z.string().trim().min(1).optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  meta: z.preprocess((v) => (typeof v === 'string' ? JSON.parse(v) : v), tileMeta).optional(),
}).strict();

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 50 * 1024 * 1024 } });

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);
const NOT_A_FILE = 'Drop a video file, like an mp4 or a mov.';
type BreakdownRequest = Request & { breakdown?: { slug: string; id: string; dir: string } };
const breakdownBody = z.object({ url: z.string().trim().min(1).max(2000) }).strict();
// A dropped video goes straight into its breakdown's folder, so it is never held in memory.
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, done) => {
      const dir = (req as BreakdownRequest).breakdown?.dir;
      done(dir ? null : new Error('no breakdown folder'), dir ?? '');
    },
    filename: (_req, file, done) => done(null, `video${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (_req, file, done) => done(null, VIDEO_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())),
  limits: { files: 1, fileSize: MAX_FILE_BYTES },
});

const handler = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);
const param = (req: Request, name: string) => String(req.params[name]);

/** Every route except the workspace list works on the current workspace. */
async function requireWorkspace(): Promise<string> {
  const slug = await store.currentWorkspace();
  if (!slug) throw new ClubError('Set up a channel first.', 409);
  return slug;
}

const connectBody = z.object({ provider: z.enum(['claude', 'codex']), reconnect: z.boolean().optional() }).strict();
const stageDates = z.record(stage, z.string()).refine((dates) => Object.keys(dates).length > 0);
const moveBody = z.object({ stage, beforeId: z.string().nullable().optional(), stageDates: stageDates.optional() }).strict();
const geminiKeyBody = z.object({ key: z.string().trim().min(20).max(200).regex(/^[\w-]+$/) }).strict();
const settingsBody = z.object({ defaultAi: z.enum(['claude', 'codex']) }).strict();
const publishBody = z.object({ youtubeUrl: z.string().trim().min(1).max(2000) }).strict();

export interface ClubRouterOptions {
  /** Where to look for the AI command line tools and yt-dlp, and how fast to poll them. Tests point these at fake tools. */
  ai?: ConnectOptions & ToolOptions;
  /** Turns a video file with no captions into text. Defaults to SceneForge's local transcription. */
  transcribe?: Transcriber;
  /** Runs the Plan step's prompts. Tests pass a stand-in so no model is called. */
  runAI?: PlanOptions['runAI'];
  /** Reads a published video's view count. Defaults to yt-dlp (metadata only). Tests pass a stand-in. */
  readViews?: ViewsReader;
  /** Where Working now reads followed channels from. Defaults to yt-dlp, metadata only. Tests pass a stand-in. */
  uploads?: UploadsSourceFactory;
  /** Where Signals reads from: `fetch` for Reddit's public listing and `treg` for X. Tests pass stand-ins. */
  signals?: Partial<SignalsSources>;
}

export function clubRouter({ ai = {}, transcribe, runAI, readViews = ytDlpViews(ai), uploads = ytDlpSource(ai), signals = {} }: ClubRouterOptions = {}): Router {
  const signalSources: SignalsSources = { treg: findTregCall(ai), ...signals };
  const plan: PlanOptions = { extraDirs: ai.extraDirs, runAI };
  const router = Router();
  router.use(express.json({ limit: '5mb' }));

  // ---- Recorder: free space where takes are saved, for the low-disk warning.
  router.get('/disk', handler(async (_req, res) => res.json(await recordingsDiskSpace())));

  // ---- AI
  router.get('/ai/status', handler(async (_req, res) => res.json(await aiStatus(ai))));
  router.post('/ai/connect', handler((req, res) => {
    const { provider, reconnect } = connectBody.parse(req.body);
    res.status(202).json(startConnect(provider, { ...ai, reconnect }));
  }));

  // ---- settings
  router.get('/settings', handler(async (_req, res) => {
    const slug = await store.currentWorkspace();
    res.json({ defaultAi: (await store.defaultAi()) ?? null, welcomed: await store.welcomed(), geminiKey: await store.maskedGeminiKey(), helpSeen: slug ? await store.helpSeen(slug) : [] });
  }));
  // A Plan step was completed once in this channel: its help line stops showing.
  router.post('/settings/help/:step', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const step = z.enum(PLAN_STEPS).parse(param(req, 'step'));
    await store.markHelpSeen(slug, step);
    res.json({ helpSeen: await store.helpSeen(slug) });
  }));
  router.put('/settings', handler(async (req, res) => {
    await store.setDefaultAi(settingsBody.parse(req.body).defaultAi);
    res.json({ defaultAi: await store.defaultAi() });
  }));

  // The Gemini API key lets Break down watch YouTube videos. It is saved locally and only ever returned masked.
  router.put('/settings/gemini-key', handler(async (req, res) => {
    await store.setGeminiKey(geminiKeyBody.parse(req.body).key);
    res.json({ geminiKey: await store.maskedGeminiKey() });
  }));
  router.delete('/settings/gemini-key', handler(async (_req, res) => {
    await store.removeGeminiKey();
    res.json({ geminiKey: null });
  }));

  router.post('/settings/welcomed', handler(async (_req, res) => {
    await store.setWelcomed();
    res.json({ welcomed: true });
  }));

  // ---- jobs
  router.get('/jobs/:id', handler((req, res) => {
    const job = getJob(param(req, 'id'));
    if (!job) throw notFound('job');
    res.json(snapshot(job));
  }));
  router.delete('/jobs/:id', handler((req, res) => {
    const job = cancelJob(param(req, 'id'));
    if (!job) throw notFound('job');
    res.json(job);
  }));
  router.get('/jobs/:id/events', (req, res) => {
    const job = getJob(param(req, 'id'));
    if (!job) {
      res.status(404).json({ error: notFound('job').message });
      return;
    }
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.flushHeaders();
    const lastId = Number(req.headers['last-event-id'] ?? 0) || 0;
    let heartbeat: NodeJS.Timeout | undefined;
    let stop = () => {};
    const close = () => {
      clearInterval(heartbeat);
      stop();
      if (!res.writableEnded) res.end();
    };
    stop = watchJob(job, lastId, (event) => {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      if (event.type !== 'progress') setImmediate(close);
    });
    if (job.status === 'running') {
      heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15_000);
      heartbeat.unref();
      res.on('close', close);
    } else {
      close();
    }
  });

  // ---- workspaces
  router.get('/workspaces', handler(async (_req, res) => {
    res.json({ current: (await store.currentWorkspace()) ?? null, workspaces: await store.listWorkspaces() });
  }));
  router.post('/workspaces', handler(async (req, res) => {
    // A channel link starts a job that reads the channel; a bare name creates an empty channel at once.
    if (req.body && typeof req.body === 'object' && 'channelUrl' in req.body) {
      const { channelUrl } = addChannelBody.parse(req.body);
      parseChannelInput(channelUrl);
      res.status(202).json(startJob('add-channel', (context) => addChannel(channelUrl, context, ai)));
      return;
    }
    const workspace = await store.createWorkspace(newWorkspaceBody.parse(req.body));
    if (!(await store.currentWorkspace())) await store.setCurrentWorkspace(workspace.slug);
    res.status(201).json(workspace);
  }));
  // A channel with no YouTube channel behind it: a name, topics, who it is for, and optionally the voice answers.
  router.post('/workspaces/fresh', handler(async (req, res) => res.status(201).json(await startFresh(freshBody.parse(req.body)))));
  router.get('/workspaces/:slug', handler(async (req, res) => res.json(await store.readWorkspace(param(req, 'slug')))));
  router.put('/workspaces/:slug', handler(async (req, res) => {
    const existing = await store.readWorkspace(param(req, 'slug'));
    const updated: Workspace = { ...existing, ...workspacePatchBody.parse(req.body), slug: existing.slug, createdAt: existing.createdAt };
    await store.writeWorkspace(updated);
    res.json(updated);
  }));
  router.post('/workspaces/:slug/voice', handler(async (req, res) => {
    const slug = param(req, 'slug');
    await store.readWorkspace(slug);
    const { answers } = voiceBody.parse(req.body ?? {});
    res.status(202).json(startJob('voice', (context) => rebuildVoice(slug, answers, context, ai)));
  }));
  router.post('/workspaces/:slug/current', handler(async (req, res) => {
    await store.setCurrentWorkspace(param(req, 'slug'));
    res.json({ current: param(req, 'slug') });
  }));

  // ---- Working now and Signals. Both are read for the current channel and ranked for it; the refreshes are jobs.
  router.get('/trending', handler(async (_req, res) => {
    const slug = await requireWorkspace();
    res.json(await rankedTrending(slug, await store.readWorkspace(slug)));
  }));
  router.post('/trending/refresh', handler(async (_req, res) => {
    const slug = await requireWorkspace();
    if (!(await readFollowed(slug)).length) throw new ClubError('Follow a channel first.', 409);
    res.status(202).json(startTrendingRefresh(slug, uploads));
  }));
  router.post('/trending/idea', handler(async (req, res) => {
    const { videoId } = trendingIdeaBody.parse(req.body);
    const { video, created } = await ideaFromTrending(await requireWorkspace(), videoId);
    res.status(created ? 201 : 200).json(video);
  }));
  router.get('/signals', handler(async (_req, res) => {
    const slug = await requireWorkspace();
    res.json(await rankedSignals(slug, await store.readWorkspace(slug)));
  }));
  router.post('/signals/refresh', handler(async (_req, res) => {
    const slug = await requireWorkspace();
    if (!hasSources(await readSignalsConfig(slug))) throw new ClubError(NO_SOURCES, 409);
    res.status(202).json(startSignalsRefresh(slug, signalSources));
  }));
  router.post('/signals/idea', handler(async (req, res) => {
    const { id } = signalIdeaBody.parse(req.body);
    const { video, created } = await ideaFromSignal(await requireWorkspace(), id);
    res.status(created ? 201 : 200).json(video);
  }));
  // The channels to watch and the places to read posts from. Settings edits both.
  router.get('/followed', handler(async (_req, res) => res.json(await readFollowed(await requireWorkspace()))));
  router.put('/followed', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const channels = followedBody.parse(req.body).map((channel) => ({
      ...channel,
      ...(channel.url ? { url: parseChannelInput(channel.url).url } : {}),
      ...(channel.handle ? { handle: parseChannelInput(channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`).handle } : {}),
    }));
    await writeFollowed(slug, channels);
    res.json(channels);
  }));
  router.get('/signals-config', handler(async (_req, res) => res.json(await readSignalsConfig(await requireWorkspace()))));
  router.put('/signals-config', handler(async (req, res) => {
    const slug = await requireWorkspace();
    // Fields that are sent replace the stored ones; fields left out stay. An empty list clears a source.
    await writeSignalsConfig(slug, { ...(await readSignalsConfig(slug)), ...signalsConfigBody.parse(req.body) });
    res.json(await readSignalsConfig(slug));
  }));

  // ---- videos
  router.get('/videos', handler(async (_req, res) => res.json(await store.listVideos(await requireWorkspace()))));
  router.post('/videos', handler(async (req, res) => {
    res.status(201).json(await store.createVideo(await requireWorkspace(), newVideoBody.parse(req.body)));
  }));
  router.get('/recent', handler(async (_req, res) => res.json(await store.recentVideoIds(await requireWorkspace()))));
  router.get('/videos/:id', handler(async (req, res) => res.json(await store.readVideo(await requireWorkspace(), param(req, 'id')))));
  router.put('/videos/:id', handler(async (req, res) => {
    res.json(await store.updateVideo(await requireWorkspace(), param(req, 'id'), videoPatchBody.parse(req.body)));
  }));
  router.delete('/videos/:id', handler(async (req, res) => {
    await store.deleteVideo(await requireWorkspace(), param(req, 'id'));
    res.status(204).end();
  }));
  router.post('/videos/:id/move', handler(async (req, res) => {
    const { stage: target, ...options } = moveBody.parse(req.body);
    res.json(await store.moveVideo(await requireWorkspace(), param(req, 'id'), target, options));
  }));
  // Mark as published: the YouTube link and the date are saved and the card moves to Published. Views are read once afterwards.
  router.post('/videos/:id/publish', handler(async (req, res) => {
    const { youtubeUrl } = publishBody.parse(req.body);
    res.json((await publishVideo(await requireWorkspace(), param(req, 'id'), youtubeUrl, readViews)).video);
  }));
  router.post('/videos/:id/opened', handler(async (req, res) => {
    await store.markOpened(await requireWorkspace(), param(req, 'id'));
    res.status(204).end();
  }));

  // ---- research tiles
  router.get('/videos/:id/research', handler(async (req, res) => res.json(await store.listTiles(await requireWorkspace(), param(req, 'id')))));
  router.post('/videos/:id/research', upload.single('file'), handler(async (req, res) => {
    const body = newTileBody.parse(req.body);
    const file = req.file ? { name: req.file.originalname, data: req.file.buffer } : undefined;
    const needs = { link: body.url, video: body.url, text: body.text, note: body.text, image: file ?? body.url }[body.kind];
    if (!needs) throw new ClubError(body.kind === 'text' || body.kind === 'note' ? 'Add some text first.' : 'Add a link or a file first.');
    res.status(201).json(await store.addTile(await requireWorkspace(), param(req, 'id'), { ...body, file }));
  }));
  router.get('/videos/:id/research/:tileId/file', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const tile = await store.readTile(slug, param(req, 'id'), param(req, 'tileId'));
    const file = store.tileFilePath(slug, param(req, 'id'), tile);
    if (!file) throw notFound('file');
    res.sendFile(file, { dotfiles: 'allow' });
  }));
  // A YouTube or Instagram tile's details, outlier chip and transcript are read in the background.
  router.post('/videos/:id/research/:tileId/read', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const tile = await store.readTile(slug, param(req, 'id'), param(req, 'tileId'));
    if (tile.kind !== 'video' || !tile.url) throw new ClubError('Only video tiles can be read.');
    detectSource(tile.url);
    res.status(202).json(startTileRead(slug, param(req, 'id'), tile.id, ai));
  }));
  router.get('/videos/:id/research/:tileId/transcript', handler(async (req, res) => {
    res.json(await readTranscript(await requireWorkspace(), param(req, 'id'), param(req, 'tileId')));
  }));
  router.delete('/videos/:id/research/:tileId', handler(async (req, res) => {
    await store.deleteTile(await requireWorkspace(), param(req, 'id'), param(req, 'tileId'));
    res.status(204).end();
  }));

  // ---- planning: package, outline, full script, and the hand-off to the recorder
  router.get('/videos/:id/plan', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    const video = await store.readVideo(slug, id);
    const [pkg, outline, ready] = await Promise.all([readPackage(slug, id), readOutline(slug, id), heldResults(slug, id)]);
    const changedScene = await outlineChangedScene(video, outline);
    res.json({ package: pkg, outline, ...(changedScene ? { changedScene } : {}), running: runningPlanJobs(slug, id), ready });
  }));
  router.put('/videos/:id/package', handler(async (req, res) => res.json(await savePackage(await requireWorkspace(), param(req, 'id'), req.body))));
  router.put('/videos/:id/outline', handler(async (req, res) => res.json(await saveOutline(await requireWorkspace(), param(req, 'id'), req.body))));
  router.put('/videos/:id/script', handler(async (req, res) => {
    res.json({ outline: await saveScript(await requireWorkspace(), param(req, 'id'), scriptBody.parse(req.body).script) });
  }));
  for (const kind of PLAN_JOB_KINDS) {
    // Package it, Create outline and Write full script instead. A second start while one runs gets the running one.
    router.post(`/videos/:id/${kind}`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const id = param(req, 'id');
      await store.readVideo(slug, id);
      if (kind === 'script' && !(await readOutline(slug, id))) throw new ClubError('Create the outline first.');
      res.status(202).json(startPlanJob(slug, id, kind, plan));
    }));
    // "Replaced the outline · Undo" puts back what a run replaced; "New outline ready · Use it" takes a result that was held.
    for (const action of ['undo', 'use'] as const) {
      router.post(`/videos/:id/${kind}/${action}`, handler(async (req, res) => {
        const slug = await requireWorkspace();
        const id = param(req, 'id');
        const { token } = versionBody.parse(req.body);
        await (action === 'undo' ? undoReplace(slug, id, kind, token) : useHeld(slug, id, kind, token));
        const [pkg, outline] = await Promise.all([readPackage(slug, id), readOutline(slug, id)]);
        res.json({ package: pkg, outline });
      }));
    }
  }
  router.post('/videos/:id/recorder', handler(async (req, res) => res.json(await continueToRecording(await requireWorkspace(), param(req, 'id')))));

  // ---- breakdowns
  // JSON {url} for a link, or a multipart upload with a video `file`. Either starts a job whose result is the breakdown.
  // A request that is refused, fails or is dropped halfway leaves no folder behind, and an upload that is dropped starts no job.
  const forget = (req: BreakdownRequest) => (req.breakdown ? fs.rm(req.breakdown.dir, { recursive: true, force: true }).catch(() => {}) : Promise.resolve());
  router.post('/breakdowns', (req: BreakdownRequest, _res, next) => {
    requireWorkspace().then(async (slug) => {
      const id = newBreakdownId();
      req.breakdown = { slug, id, dir: breakdownDir(slug, id) };
      if (req.is('multipart/form-data')) await fs.mkdir(req.breakdown.dir, { recursive: true });
      next();
    }, next);
  }, (req: BreakdownRequest, res, next) => {
    videoUpload.single('file')(req, res, (error?: unknown) => {
      if (!error) return next();
      void forget(req).then(() => next(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? new ClubError(FILE_TOO_BIG, 413) : error));
    });
  }, handler(async (req: BreakdownRequest, res) => {
    const { slug, id } = req.breakdown!;
    const work = { ...ai, transcribe };
    const start = (input: Parameters<typeof runBreakdown>[0]) => {
      // The person may have left while the upload ran. Nothing starts for a request that is already gone.
      if (!req.complete || res.socket?.destroyed) {
        void forget(req);
        return;
      }
      const job = startJob('breakdown', (context) => runBreakdown(input, context, work));
      // If the answer never reaches them, the job is stopped: it removes its own files.
      res.once('close', () => {
        if (!res.writableFinished) cancelJob(job.id);
      });
      res.status(202).json(job);
    };
    if (req.is('multipart/form-data')) {
      if (!req.file) {
        await forget(req);
        throw new ClubError(NOT_A_FILE);
      }
      start({ slug, id, file: { path: req.file.path, name: req.file.originalname } });
      return;
    }
    const { url } = breakdownBody.parse(req.body);
    detectSource(url);
    start({ slug, id, url });
  }));

  router.get('/breakdowns/:id', handler(async (req, res) => res.json(await readBreakdown(await requireWorkspace(), param(req, 'id')))));
  router.get('/breakdowns/:id/thumbnail', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const file = await thumbnailFile(slug, param(req, 'id'));
    if (!file) throw notFound('thumbnail');
    res.sendFile(file, { dotfiles: 'allow' });
  }));
  router.post('/breakdowns/:id/concepts/:index/add', handler(async (req, res) => {
    const index = Number(param(req, 'index'));
    if (!Number.isInteger(index) || index < 0) throw notFound('concept');
    res.status(201).json(await addConceptToBoard(await requireWorkspace(), param(req, 'id'), index));
  }));

  router.use((error: Error & { status?: number }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Some details were not valid.', issues: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    } else if (error instanceof ClubError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof multer.MulterError || error instanceof SyntaxError) {
      res.status(400).json({ error: 'That could not be read.' });
    } else {
      console.error('[club]', error.message);
      res.status(500).json({ error: GENERIC_FAILURE });
    }
  });
  return router;
}
