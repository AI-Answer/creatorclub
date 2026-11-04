import express, { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CHANNEL_BOARD, SEED_BELOW, HELP_STEPS, PLAN_JOB_KINDS, TILE_KINDS, VIDEO_STAGES, type Workspace } from '../../shared/club.js';
import { PACKAGE_GROUPS } from '../../shared/package-merge.js';
import { aiStatus } from './ai.js';
import { listSkills, previewFile, withPlayer } from './skills.js';
import { SKILL_NAME, editSkill } from '../../shared/skills.js';
import { startConnect, type ConnectOptions } from './connect.js';
import { ClubError, GENERIC_FAILURE, notFound } from './errors.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { addConceptToBoard, breakdownDir, listBreakdowns, newBreakdownId, readBreakdown, runBreakdown, thumbnailFile, type Transcriber } from './breakdown.js';
import { cancelJob, getJob, runningOnce, snapshot, startJob, startJobOnce, watchJob } from './jobs.js';
import { parseChannelInput } from './channel.js';
import { FILE_TOO_BIG, MAX_FILE_BYTES, detectSource } from './source.js';
import { addChannel, rebuildVoice, startFresh } from './onboard.js';
import { SCENE_ID, deletePackage, ensurePackage, heldResults, patchPackage, readOutline, readPackage, runningPlanJobs, saveOutline, savePackage, saveScript, saveSceneScript, startPlanJob, undoReplace, usePackageText, useHeld, type PlanOptions } from './planning.js';
import { continueToRecording, outlineChangedScene, videoFromProject } from './recorder.js';
import { publishVideo, ytDlpViews, type ViewsReader } from './publish.js';
import { publishingRoutes, type PublishingOptions } from './publisher-routes.js';
import { recordingsDiskSpace } from './disk.js';
import { readTranscript, startTileRead } from './research.js';
import * as boardDocs from './board-docs.js';
import { announceBoard, subscribeBoard } from './board-watch.js';
import { mcpLauncher } from '../mcp-launcher.js';
import { captureProof, proofBody } from './proof.js';
import { pacingIssues, pacingText } from '../../shared/pacing.js';
import { editProject } from './companion-edit.js';
import { applyAction } from './companion-actions.js';
import { sceneforge } from './recorder.js';
import * as canvas from './board-canvas.js';
import { addToResearch, addToResearchBody, startVideoBody, startVideoFrom } from './research-board.js';
import { applyCard, applyCards, askBody, askCompanion, attachmentFile, cardBody, cardsBody, readThread, saveAttachment, undoCard } from './companion.js';
import { imageKind } from './publisher-routes.js';

import { lock as companionLock } from './companion-actions.js';
import { AGENT_HEADER, agentActionsBody, agentBoard, agentConnectBody, connectAgentApp, agentUndoBody, agentVideo, applyAgentActions, undoAgentAction } from './agent.js';
import { editSilences } from './companion-edit.js';
import { videoScenes, videosMoveFacts, videosScenes } from './scenes.js';
import { HEIGHT_MAX, HEIGHT_MIN, POSITION_MAX, WIDTH_MAX, WIDTH_MIN } from './tile-layout.js';
import { findTregCall, hasSources, NO_SOURCES, rankedSignals, readSignalsConfig, startSignalsRefresh, writeSignalsConfig, type SignalsSources } from './signals.js';
import { ideaFromSignal, ideaFromTrending } from './trend-ideas.js';
import { voiceSummary } from './voice.js';
import { rankedTrending, readFollowed, startTrendingRefresh, startTrendingSeed, writeFollowed, ytDlpSearchSource, ytDlpSource, type SearchSourceFactory, type UploadsSourceFactory } from './trending.js';
import * as store from './store.js';
import type { ToolOptions } from './tools.js';

/** One picture for the chat, held in memory while it is checked. */
const chatUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 10 * 1024 * 1024 } });

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

const ideaText = z.string().max(5000).nullable();
const ideaRating = z.object({ level: z.enum(['high', 'mid', 'low']), note: z.string().max(2000) }).strict();
// What the idea drawer edits in place. A field set to null is removed.
const ideaPatchBody = z.object({ why: ideaText, angle: ideaText, twist: ideaText, hook: ideaText, note: ideaText, dropReason: ideaText, demand: ideaRating, gap: ideaRating, show: ideaRating }).partial().strict();

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
  // The length the person is aiming for, in seconds.
  targetSeconds: z.number().int().min(60).max(36_000).nullable(),
  idea: ideaPatchBody,
}).partial().strict();

const workspaceFields = {
  name: z.string().trim().min(1).max(120),
  person: z.string().trim().max(120).optional(),
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

const ratingShape = z.object({ level: z.enum(['high', 'mid', 'low']), note: z.string().max(2000) }).strict();
const tileMeta = z
  .object({
    views: z.number(),
    channel: z.string(),
    multiplier: z.number(),
    thumbnail: z.string(),
    likes: z.number(),
    comments: z.number(),
    ageDays: z.number(),
    platform: z.enum(['youtube', 'instagram']),
    source: z.enum(['x', 'reddit']),
    author: z.string().max(200),
    replies: z.number(),
    breakdownId: z.string().regex(/^bd_[a-f0-9]{12}$/),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    demand: ratingShape,
    gap: ratingShape,
    show: ratingShape,
  })
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

// Moving a tile, renaming it, or editing a note. A tile's width is optional; one left out stays as it is.
const tilePatchBody = z
  .object({
    pos: z.object({ x: z.number().finite().min(0).max(POSITION_MAX), y: z.number().finite().min(0).max(POSITION_MAX), w: z.number().finite().min(WIDTH_MIN).max(WIDTH_MAX).optional(), h: z.number().finite().min(HEIGHT_MIN).max(HEIGHT_MAX).optional() }).strict(),
    title: z.string().max(500),
    text: z.string().max(boardDocs.MAX_DOC_BYTES),
    base: z.string().max(64),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nothing to change' });
const packageUseBody = z.object({ kind: z.enum(['hook', 'title']), text: z.string().trim().min(1).max(2000) }).strict();
const sceneScriptBody = z.object({ text: z.string().max(200_000) }).strict();
const packageRunBody = z.object({ replace: z.enum(PACKAGE_GROUPS).optional() }).strict();
const scriptRunBody = z.object({ sceneId: z.string().regex(SCENE_ID).optional() }).strict();

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 50 * 1024 * 1024 } });
// Dropped Markdown and text files: each is checked against the note size limit afterwards, so one that is too large is reported and the rest still come in.
const docsUpload = multer({ storage: multer.memoryStorage(), limits: { files: 20, fileSize: 5 * 1024 * 1024 } });
const notesFolderBody = z.object({ path: z.string().trim().min(1).max(1000).nullable() }).strict();
const pinBody = z.object({ path: z.string().min(1).max(300) }).strict();

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
const signalsRefreshBody = z.object({ only: z.array(z.string().trim().min(1).max(200)).min(1).max(100).optional() }).strict();
const moveBody = z.object({ stage, beforeId: z.string().nullable().optional(), stageDates: stageDates.optional() }).strict();
const geminiKeyBody = z.object({ key: z.string().trim().min(20).max(200).regex(/^[\w-]+$/) }).strict();
const settingsBody = z.object({ defaultAi: z.enum(['claude', 'codex']), appearance: z.enum(['system', 'light', 'dark']) }).partial().strict().refine((body) => Object.keys(body).length > 0, { message: 'nothing to save' });
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
  /** Publishing to Postiz: how a finished export is found, and the waits. Tests pass stand-ins; SceneForge's server passes its export history. */
  publishing?: Omit<PublishingOptions, 'readViews'>;
  /** Where Working now reads followed channels from. Defaults to yt-dlp, metadata only. Tests pass a stand-in. */
  uploads?: UploadsSourceFactory;
  /** Where Working now searches topics for a channel that follows nobody yet. Defaults to yt-dlp `ytsearch`, metadata only. Tests pass a stand-in. */
  search?: SearchSourceFactory;
  /** Where Signals reads from: `fetch` for Reddit's public listing and `treg` for X. Tests pass stand-ins. */
  signals?: Partial<SignalsSources>;
}

export function clubRouter({ ai = {}, transcribe, runAI, readViews = ytDlpViews(ai), publishing = {}, uploads = ytDlpSource(ai), search = ytDlpSearchSource(ai), signals = {} }: ClubRouterOptions = {}): Router {
  const signalSources: SignalsSources = { treg: findTregCall(ai), ...signals };
  const plan: PlanOptions = { extraDirs: ai.extraDirs, runAI };
  const router = Router();
  // A change an outside agent (the MCP server, which sends this header) makes to a Board shows on any open Board at once.
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.get(AGENT_HEADER)) {
      const board = /^\/(?:videos\/([A-Za-z0-9_-]{1,64})|(channel))\//.exec(req.path);
      if (board) res.on('finish', () => {
        if (res.statusCode >= 400) return;
        void store.currentWorkspace().then((slug) => { if (slug) announceBoard(slug, board[1] ?? CHANNEL_BOARD); }, () => {});
      });
    }
    next();
  });
  router.use(express.json({ limit: '5mb' }));

  // ---- Recorder: free space where takes are saved, for the low-disk warning.
  router.get('/disk', handler(async (_req, res) => res.json(await recordingsDiskSpace())));

  // ---- the person's own Claude Code skills, for the companion's "/" picker
  router.get('/skills', handler(async (_req, res) => res.json(await listSkills())));
  // Which skills are on Edit and why; the person adds one, takes one off, or leaves it to the automatic pick (null).
  router.get('/skills/edit', handler(async (_req, res) => {
    const choices = await store.editSkillChoices();
    res.json((await listSkills()).map((skill) => editSkill(skill, choices)));
  }));
  router.put('/skills/edit/:name', handler(async (req, res) => {
    const name = param(req, 'name');
    if (!SKILL_NAME.test(name)) throw notFound('skill');
    await store.setEditSkill(name, z.object({ on: z.boolean().nullable() }).strict().parse(req.body).on);
    const choices = await store.editSkillChoices();
    res.json((await listSkills()).map((skill) => editSkill(skill, choices)));
  }));
  // A file from inside one of the person's skills that shows what it makes. A page runs sandboxed: no access to the app, its data or its cookies.
  router.get('/skills/:name/preview', handler(async (req, res) => {
    const file = typeof req.query.file === 'string' ? req.query.file : '';
    const found = await previewFile(param(req, 'name'), file);
    if (!found) throw notFound('preview');
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (/\.html?$/i.test(found)) {
      res.type('html').send(withPlayer(await fs.readFile(found, 'utf8')));
      return;
    }
    res.sendFile(found, { dotfiles: 'allow' });
  }));

  // ---- AI
  router.get('/ai/status', handler(async (_req, res) => res.json(await aiStatus(ai))));
  router.post('/ai/connect', handler((req, res) => {
    const { provider, reconnect } = connectBody.parse(req.body);
    res.status(202).json(startConnect(provider, { ...ai, reconnect }));
  }));

  // ---- settings
  router.get('/settings', handler(async (_req, res) => {
    const slug = await store.currentWorkspace();
    res.json({ defaultAi: (await store.defaultAi()) ?? null, welcomed: await store.welcomed(), appearance: (await store.appearance()) ?? null, geminiKey: await store.maskedGeminiKey(), helpSeen: slug ? await store.helpSeen(slug) : [] });
  }));
  // A Plan step was completed once in this channel: its help line stops showing.
  router.post('/settings/help/:step', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const step = z.enum(HELP_STEPS).parse(param(req, 'step'));
    await store.markHelpSeen(slug, step);
    res.json({ helpSeen: await store.helpSeen(slug) });
  }));
  router.put('/settings', handler(async (req, res) => {
    const { defaultAi, appearance } = settingsBody.parse(req.body);
    if (defaultAi) await store.setDefaultAi(defaultAi);
    if (appearance) await store.setAppearance(appearance);
    res.json({ defaultAi: (await store.defaultAi()) ?? null, appearance: (await store.appearance()) ?? null });
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
  router.get('/workspaces/:slug/voice', handler(async (req, res) => {
    const slug = param(req, 'slug');
    await store.readWorkspace(slug);
    res.json(await voiceSummary(slug));
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
    // A channel that follows fewer than SEED_BELOW channels also reads a YouTube search on its topics.
    res.status(202).json((await readFollowed(slug)).length < SEED_BELOW ? startTrendingSeed(slug, search, uploads) : startTrendingRefresh(slug, uploads));
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
  // `only` reads just the sources that failed last time (Try again beside their error); the others keep their posts.
  router.post('/signals/refresh', handler(async (req, res) => {
    const slug = await requireWorkspace();
    if (!hasSources(await readSignalsConfig(slug))) throw new ClubError(NO_SOURCES, 409);
    const { only } = signalsRefreshBody.parse(req.body ?? {});
    res.status(202).json(startSignalsRefresh(slug, signalSources, only));
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
  router.post('/videos/from-project', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const { projectId } = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict().parse(req.body);
    const result = await videoFromProject(slug, projectId);
    res.status(result.created ? 201 : 200).json(result.video);
  }));
  router.get('/recent', handler(async (_req, res) => res.json(await store.recentVideoIds(await requireWorkspace()))));
  // Every video that is not published, in one request. Registered before /videos/:id so "scenes" is not read as an id.
  router.get('/videos/scenes', handler(async (_req, res) => res.json(await videosScenes(await requireWorkspace()))));
  // What a move by hand depends on, for every video: the board refuses a move the server would refuse, before it is tried.
  router.get('/videos/move-facts', handler(async (_req, res) => res.json(await videosMoveFacts(await requireWorkspace(), publishing.projectExported))));
  router.get('/videos/:id', handler(async (req, res) => res.json(await store.readVideo(await requireWorkspace(), param(req, 'id')))));
  // A proof shot: the real page behind a claim, scrolled to the words and highlighted, saved in the video's folder and registered as
  // media. With `at`, it is also placed on the Overlays row as one undoable change; with `runDir` (a skill run of this video), it is
  // copied into that run's out folder so the run can hand it back as a card.
  router.post('/videos/:id/proof', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const body = proofBody.extend({ at: z.number().min(0).max(36_000).optional(), duration: z.number().min(0.5).max(60).optional(), title: z.string().trim().max(80).optional(), runDir: z.string().max(1000).optional() }).strict().parse(req.body);
    // A run folder is checked before anything is captured: only a skill run of this video.
    const runs = body.runDir ? await fs.realpath(path.join(store.videoDir(slug, id), 'skill-runs')).catch(() => '') : '';
    const run = body.runDir ? await fs.realpath(body.runDir).catch(() => '') : '';
    if (body.runDir && (!runs || !run.startsWith(runs + path.sep))) throw new ClubError('That is not a skill run of this video.');
    // The window sits on the look's stage colour, so a shot matches the stage it is shown on.
    const look = await editProject(slug, id).then(({ project }) => project.look, () => undefined);
    const shot = await captureProof(path.join(store.videoDir(slug, id), 'proof'), body.url, body.phrase ?? '', { background: look?.stage?.background });
    let copied: string | undefined;
    if (run) {
      await fs.mkdir(path.join(run, 'out'), { recursive: true });
      copied = path.join(run, 'out', path.basename(shot.file));
      await fs.copyFile(shot.file, copied);
    }
    let applied: { version: string; result: string } | undefined;
    if (body.at !== undefined) {
      const { registerMedia, CACHE_DIR } = await sceneforge();
      const { probeMedia } = await import('../media.js');
      const media = await probeMedia(shot.file, CACHE_DIR);
      const title = body.title || new URL(shot.url).hostname.replace(/^www\./, '');
      media.name = title;
      const saved = await registerMedia(media);
      const done = await applyAction(slug, id, { type: 'add_clip', media: saved, start: body.at, duration: body.duration ?? 4, title }, {});
      applied = { version: done.version, result: done.result };
    }
    res.json({ ...shot, ...(copied ? { copied: path.relative(path.dirname(path.dirname(copied)), copied) } : {}), ...(applied ? { applied } : {}) });
  }));
  // Settings › Your AI agent: adds the Creator Compiler MCP to Claude Code or Codex in one click.
  router.post('/agent/connect', handler(async (req, res) => res.json(await connectAgentApp(agentConnectBody.parse(req.body).app, mcpLauncher()))));
  // The pacing check on the video's recording as it is now (screenplay's rules): what an agent fixes before it calls an edit done.
  router.get('/videos/:id/agent/pacing', handler(async (req, res) => {
    const { project } = await editProject(await requireWorkspace(), param(req, 'id'));
    res.json({ issues: pacingIssues(project), text: pacingText(project) || 'Something changes on screen at least every 6 s, and no graphics overlap.' });
  }));
  router.get('/videos/:id/agent', handler(async (req, res) => res.json(await agentVideo(await requireWorkspace(), param(req, 'id')))));
  router.put('/videos/:id', handler(async (req, res) => {
    res.json(await store.updateVideo(await requireWorkspace(), param(req, 'id'), videoPatchBody.parse(req.body)));
  }));
  router.delete('/videos/:id', handler(async (req, res) => {
    await store.deleteVideo(await requireWorkspace(), param(req, 'id'));
    res.status(204).end();
  }));
  router.post('/videos/:id/move', handler(async (req, res) => {
    const { stage: target, ...options } = moveBody.parse(req.body);
    const slug = await requireWorkspace();
    const video = await store.readVideo(slug, param(req, 'id'));
    res.json(await store.moveVideo(slug, video.id, target, options));
  }));
  // Mark as published: the YouTube link and the date are saved and the card moves to Published. Views are read once afterwards.
  router.post('/videos/:id/publish', handler(async (req, res) => {
    const { youtubeUrl } = publishBody.parse(req.body);
    res.json((await publishVideo(await requireWorkspace(), param(req, 'id'), youtubeUrl, readViews)).video);
  }));
  publishingRoutes(router, { handler, requireWorkspace }, { ...publishing, readViews });
  router.post('/videos/:id/opened', handler(async (req, res) => {
    await store.markOpened(await requireWorkspace(), param(req, 'id'));
    res.status(204).end();
  }));

  // ---- Boards: a video's (`/videos/:id/…`) and the channel's own, Research (`/channel/…`). The same routes serve both; `CHANNEL_BOARD` is never a video id,
  // so a video route can never reach Research.
  router.param('id', (_req, _res, next, id) => next(id === CHANNEL_BOARD ? notFound('video') : undefined));
  router.put('/board/notes-folder', handler(async (req, res) => {
    const { path: folder } = notesFolderBody.parse(req.body);
    res.json({ path: await boardDocs.setNotesFolder(await requireWorkspace(), folder) });
  }));
  const boards: readonly (readonly [string, (req: Request) => string])[] = [['/videos/:id', (req) => param(req, 'id')], ['/channel', () => CHANNEL_BOARD]];
  for (const [prefix, boardOf] of boards) {
    // ---- research tiles
    router.get(`${prefix}/research`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const id = boardOf(req);
      res.json(await boardDocs.boardTiles(slug, id));
    }));
    router.post(`${prefix}/research`, upload.single('file'), handler(async (req, res) => {
      const slug = await requireWorkspace();
      const body = newTileBody.parse(req.body);
      const file = req.file ? { name: req.file.originalname, data: req.file.buffer } : undefined;
      // A note can be added empty: it lands on the Board ready to be written in.
      const needs = { link: body.url, video: body.url, text: body.text, note: true, image: file ?? body.url, signal: body.text, breakdown: body.meta?.breakdownId, idea: body.text, mine: body.meta?.videoId }[body.kind];
      if (!needs) throw new ClubError(body.kind === 'text' ? 'Add some text first.' : body.kind === 'signal' ? 'Add the post first.' : body.kind === 'breakdown' ? 'Pick a breakdown first.' : body.kind === 'mine' ? 'Pick one of your videos first.' : 'Add a link or a file first.');
      if (body.kind === 'breakdown') await readBreakdown(slug, body.meta!.breakdownId!);
      if (body.kind === 'mine') await store.readVideo(slug, body.meta!.videoId!);
      // A note is a Markdown file in the video's folder.
      if (body.kind === 'note') return res.status(201).json(await boardDocs.addNote(slug, boardOf(req), body.text));
      res.status(201).json(await store.addTile(slug, boardOf(req), { ...body, file }));
    }));
    // Moves a tile on the Board, renames it, or edits a note. Writes only what was sent.
    router.patch(`${prefix}/research/:tileId`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const { pos, base, ...rest } = tilePatchBody.parse(req.body);
      const id = boardOf(req);
      let tile = await store.readTile(slug, id, param(req, 'tileId'));
      if (rest.text !== undefined && tile.kind !== 'note' && tile.kind !== 'text' && tile.kind !== 'idea') throw new ClubError('Only notes, text and ideas can be edited.');
      if (tile.kind === 'note' && !tile.doc) {
        await boardDocs.syncBoard(slug, id);
        tile = await store.readTile(slug, id, tile.id);
      }
      // A note's text is saved to its file, not to the tile. If the file changed since the editor read it, the other version is kept and the answer says so.
      if (tile.doc) {
        let conflict: { copy: string } | undefined;
        if (rest.text !== undefined) ({ conflict } = await boardDocs.saveNote(slug, id, tile, rest.text, base));
        const placed = pos ? await store.updateTile(slug, id, tile.id, { pos: { ...tile.pos, ...pos } }) : tile;
        const [shown] = await boardDocs.hydrate(slug, id, [placed]);
        res.json({ ...shown, ...(conflict ? { conflict } : {}) });
        return;
      }
      res.json(await store.updateTile(slug, id, tile.id, { ...rest, ...(pos ? { pos: { ...tile.pos, ...pos } } : {}) }));
    }));
    router.get(`${prefix}/research/:tileId/file`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const tile = await store.readTile(slug, boardOf(req), param(req, 'tileId'));
      const file = store.tileFilePath(slug, boardOf(req), tile);
      if (!file) throw notFound('file');
      res.sendFile(file, { dotfiles: 'allow' });
    }));
    // A YouTube or Instagram tile's details, outlier chip and transcript are read in the background.
    router.post(`${prefix}/research/:tileId/read`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const tile = await store.readTile(slug, boardOf(req), param(req, 'tileId'));
      if (tile.kind !== 'video' || !tile.url) throw new ClubError('Only video tiles can be read.');
      detectSource(tile.url);
      res.status(202).json(startTileRead(slug, boardOf(req), tile.id, ai));
    }));
    router.get(`${prefix}/research/:tileId/transcript`, handler(async (req, res) => {
      res.json(await readTranscript(await requireWorkspace(), boardOf(req), param(req, 'tileId')));
    }));
    router.delete(`${prefix}/research/:tileId`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      await boardDocs.removeNote(slug, boardOf(req), param(req, 'tileId'));
      await canvas.pruneLinks(slug, boardOf(req), [param(req, 'tileId')]);
      res.status(204).end();
    }));

    // ---- for outside agents (MCP): the Board as cards and text, and the companion's actions applied directly, each with its own Undo
    router.get(`${prefix}/agent/board`, handler(async (req, res) => res.json(await agentBoard(await requireWorkspace(), boardOf(req)))));
    router.post(`${prefix}/agent/actions`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      res.json(await applyAgentActions(slug, boardOf(req), agentActionsBody.parse(req.body)));
    }));
    router.post(`${prefix}/agent/actions/undo`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      res.json(await undoAgentAction(slug, boardOf(req), agentUndoBody.parse(req.body).version));
    }));

    // ---- the Board's connections (lines between two cards, with an optional label) and frames (named rectangles that group cards)
    router.get(`${prefix}/board/canvas`, handler(async (req, res) => res.json(await canvas.readCanvas(await requireWorkspace(), boardOf(req)))));
    router.post(`${prefix}/board/links`, handler(async (req, res) => res.status(201).json(await canvas.addLink(await requireWorkspace(), boardOf(req), canvas.linkBody.parse(req.body)))));
    router.patch(`${prefix}/board/links/:linkId`, handler(async (req, res) => res.json(await canvas.updateLink(await requireWorkspace(), boardOf(req), param(req, 'linkId'), canvas.linkPatchBody.parse(req.body)))));
    router.delete(`${prefix}/board/links/:linkId`, handler(async (req, res) => {
      await canvas.removeLink(await requireWorkspace(), boardOf(req), param(req, 'linkId'));
      res.status(204).end();
    }));
    router.post(`${prefix}/board/frames`, handler(async (req, res) => res.status(201).json(await canvas.addFrame(await requireWorkspace(), boardOf(req), canvas.frameBody.parse(req.body)))));
    router.patch(`${prefix}/board/frames/:frameId`, handler(async (req, res) => res.json(await canvas.updateFrame(await requireWorkspace(), boardOf(req), param(req, 'frameId'), canvas.framePatchBody.parse(req.body)))));
    router.delete(`${prefix}/board/frames/:frameId`, handler(async (req, res) => {
      await canvas.removeFrame(await requireWorkspace(), boardOf(req), param(req, 'frameId'));
      res.status(204).end();
    }));

    // ---- the Board's files: where the video's folder is, the Notes folder, files dropped or pinned, and news when a file changes
    router.get(`${prefix}/board/files`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      await store.requireBoard(slug, boardOf(req));
      res.json(await boardDocs.boardFiles(slug, boardOf(req)));
    }));
    router.post(`${prefix}/board/import`, docsUpload.array('files', 20), handler(async (req, res) => {
      const slug = await requireWorkspace();
      await store.requireBoard(slug, boardOf(req));
      const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map((file) => ({ name: file.originalname, data: file.buffer }));
      if (!files.length) throw new ClubError('Drop a Markdown or text file.');
      res.status(201).json(await boardDocs.importFiles(slug, boardOf(req), files));
    }));
    // Cards removed from the Board for files that are still in the video's folder come back.
    router.post(`${prefix}/board/hidden/show`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      await store.requireBoard(slug, boardOf(req));
      res.json({ shown: await boardDocs.showHidden(slug, boardOf(req)) });
    }));
    router.post(`${prefix}/board/pin`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      await store.requireBoard(slug, boardOf(req));
      res.status(201).json(await boardDocs.pinNote(slug, boardOf(req), pinBody.parse(req.body).path));
    }));
    // One message, "files", each time a Markdown or text file in the video's folder or the Notes folder appears, changes or goes.
    router.get(`${prefix}/board/events`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const id = boardOf(req);
      await store.requireBoard(slug, id);
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
      res.flushHeaders();
      res.write('retry: 2000\n\n');
      const stop = subscribeBoard(slug, id, () => res.write('event: files\ndata: {}\n\n'));
      const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15_000);
      heartbeat.unref();
      res.on('close', () => {
        clearInterval(heartbeat);
        stop();
      });
    }));
  }

  // ---- Research: cards from Discover and Videos, and a new video from a selection
  router.post('/channel/research/add', handler(async (req, res) => {
    const added = await addToResearch(await requireWorkspace(), addToResearchBody.parse(req.body));
    res.status(added.created ? 201 : 200).json(added);
  }));
  router.post('/channel/research/start-video', handler(async (req, res) => res.status(201).json(await startVideoFrom(await requireWorkspace(), startVideoBody.parse(req.body)))));

  // ---- planning: package, outline, full script, and the hand-off to the recorder
  router.get('/videos/:id/plan', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    const video = await store.readVideo(slug, id);
    const [pkg, outline, ready] = await Promise.all([runningPlanJobs(slug, id).package ? readPackage(slug, id) : ensurePackage(slug, video), readOutline(slug, id), heldResults(slug, id)]);
    const changedScene = await outlineChangedScene(video, outline);
    res.json({ package: pkg, outline, ...(changedScene ? { changedScene } : {}), running: runningPlanJobs(slug, id), ready });
  }));
  // Plan's own saves take the same per-video lock as the companion's Undo, so Undo's check and its write see the same files.
  const planSave = async <T>(req: Request, save: (slug: string, id: string) => Promise<T>) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    return store.withLock(companionLock(slug, id), () => save(slug, id));
  };
  router.put('/videos/:id/package', handler(async (req, res) => res.json(await planSave(req, (slug, id) => patchPackage(slug, id, req.body)))));
  // Removes the package (set aside, not deleted): Undo of a first Use as hook or Use as title.
  router.delete('/videos/:id/package', handler(async (req, res) => {
    await planSave(req, deletePackage);
    res.status(204).end();
  }));
  // "Use as hook" and "Use as title" from the Board chat. Saves through the same path as PUT /package, so a package job that is running holds its result.
  router.post('/videos/:id/package/text', handler(async (req, res) => {
    const { kind, text } = packageUseBody.parse(req.body);
    res.json(await planSave(req, (slug, id) => usePackageText(slug, id, kind, text)));
  }));
  router.put('/videos/:id/outline', handler(async (req, res) => res.json(await planSave(req, (slug, id) => saveOutline(slug, id, req.body)))));
  router.put('/videos/:id/script', handler(async (req, res) => {
    const { script } = scriptBody.parse(req.body);
    res.json({ outline: await planSave(req, (slug, id) => saveScript(slug, id, script)) });
  }));
  // Hand-edits one scene's part of the script, whether the script was written scene by scene or whole.
  router.put('/videos/:id/script/scene/:sceneId', handler(async (req, res) => {
    const sceneId = param(req, 'sceneId');
    if (!SCENE_ID.test(sceneId)) throw notFound('scene');
    const { text } = sceneScriptBody.parse(req.body);
    res.json({ outline: await planSave(req, (slug, id) => saveSceneScript(slug, id, sceneId, text)) });
  }));
  for (const kind of PLAN_JOB_KINDS) {
    // Package it, Create outline and Write full script instead. A second start while one runs gets the running one.
    router.post(`/videos/:id/${kind}`, handler(async (req, res) => {
      const slug = await requireWorkspace();
      const id = param(req, 'id');
      await store.readVideo(slug, id);
      // Write full script instead, or with a `sceneId` the script of that one scene.
      const sceneId = kind === 'script' ? scriptRunBody.parse(req.body ?? {}).sceneId : undefined;
      if (kind === 'script') {
        const outline = await readOutline(slug, id);
        if (!outline) throw new ClubError('Create the outline first.');
        if (sceneId && !outline.scenes.some((scene) => scene.id === sceneId)) throw notFound('scene');
      }
      const replace = kind === 'package' ? packageRunBody.parse(req.body ?? {}).replace : undefined;
      res.status(202).json(startPlanJob(slug, id, kind, plan, sceneId, replace));
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
  router.post('/videos/:id/recorder', handler(async (req, res) => {
    const { quick } = z.object({ quick: z.boolean().optional() }).strict().parse(req.body ?? {});
    res.json(await continueToRecording(await requireWorkspace(), param(req, 'id'), quick));
  }));
  // The outline's scenes with the takes the recording project holds for each. Read only.
  router.get('/videos/:id/scenes', handler(async (req, res) => res.json(await videoScenes(await requireWorkspace(), param(req, 'id')))));

  // ---- the companion: one conversation per video across the steps. The reply streams through /jobs/:id/events.
  // Research has a conversation of its own, at /channel/companion.
  for (const [prefix, boardOf] of boards) {
    router.get(`${prefix}/companion`, handler(async (req, res) => res.json(await readThread(await requireWorkspace(), boardOf(req)))));
    router.post(`${prefix}/companion`, handler(async (req, res) => {
      res.status(202).json(await askCompanion(await requireWorkspace(), boardOf(req), askBody.parse(req.body), plan));
    }));
    router.post(`${prefix}/companion/attachments`, chatUpload.single('file'), handler(async (req, res) => {
      const kind = req.file ? imageKind(req.file.buffer) : undefined;
      if (!req.file || !kind) throw new ClubError('Use a PNG or JPG picture of up to 10 MB.');
      res.status(201).json(await saveAttachment(await requireWorkspace(), boardOf(req), req.file.buffer, kind));
    }));
    router.get(`${prefix}/companion/attachments/:name`, handler(async (req, res) => {
      const file = attachmentFile(await requireWorkspace(), boardOf(req), param(req, 'name'));
      if (!file) throw notFound('picture');
      res.sendFile(file, { dotfiles: 'allow' });
    }));
    router.post(`${prefix}/companion/:messageId/cards/apply-all`, handler(async (req, res) => {
      res.json(await applyCards(await requireWorkspace(), boardOf(req), param(req, 'messageId'), cardsBody.parse(req.body ?? {})));
    }));
    for (const action of ['apply', 'undo'] as const) {
      router.post(`${prefix}/companion/:messageId/cards/:index/${action}`, handler(async (req, res) => {
        const index = Number(param(req, 'index'));
        if (!Number.isInteger(index) || index < 0 || index > 19) throw notFound('card');
        const run = action === 'apply' ? applyCard : undoCard;
        res.json(await run(await requireWorkspace(), boardOf(req), param(req, 'messageId'), index, cardBody.parse(req.body ?? {})));
      }));
    }
  }
  // The audio plan the editor previews a cut of pauses with, so the preview matches what Apply does.
  router.get('/videos/:id/companion/silences', handler(async (req, res) => res.json(await editSilences(await requireWorkspace(), param(req, 'id')))));

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
    // A video is broken down once at a time and once in all: a finished breakdown of it is returned as it is, and one that is still running is joined.
    const ref = detectSource(url);
    const finished = (await listBreakdowns(slug)).find((found) => found.url === ref.url);
    if (finished) {
      res.json(await readBreakdown(slug, finished.id));
      return;
    }
    const key = `breakdown:${slug}:${ref.url}`;
    const running = runningOnce(key);
    if (running) {
      res.status(202).json(running);
      return;
    }
    if (!req.complete || res.socket?.destroyed) return;
    const job = startJobOnce(key, 'breakdown', (context) => runBreakdown({ slug, id, url }, context, work));
    res.once('close', () => {
      if (!res.writableFinished) cancelJob(job.id);
    });
    res.status(202).json(job);
  }));

  router.get('/breakdowns', handler(async (_req, res) => res.json(await listBreakdowns(await requireWorkspace()))));
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
