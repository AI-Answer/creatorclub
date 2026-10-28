import express, { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { TILE_KINDS, VIDEO_STAGES, type Workspace } from '../../shared/club.js';
import { aiStatus } from './ai.js';
import { startConnect, type ConnectOptions } from './connect.js';
import { ClubError, GENERIC_FAILURE, notFound } from './errors.js';
import { cancelJob, getJob, snapshot, startJob, watchJob } from './jobs.js';
import { parseChannelInput } from './channel.js';
import { addChannel, rebuildVoice } from './onboard.js';
import * as store from './store.js';
import type { ToolOptions } from './tools.js';

const rating = z.object({ level: z.enum(['high', 'mid', 'low']), note: z.string() }).strict();
const concept = z.object({ angle: rating, twist: rating, hook: rating, demand: rating, gap: rating, show: rating }).strict();
const source = z.object({ kind: z.enum(['breakdown', 'manual']), breakdownId: z.string().optional() }).strict();
const planning = z.object({ research: z.boolean(), package: z.boolean(), outline: z.boolean() }).strict();
const stage = z.enum(VIDEO_STAGES);
const hidden = z.enum(['later', 'skipped']);

const newVideoBody = z.object({
  title: z.string().trim().min(1).max(300),
  stage: stage.optional(),
  source: source.optional(),
  concept: concept.optional(),
  hidden: hidden.optional(),
  publishDate: z.string().optional(),
  planning: planning.optional(),
}).strict();

// null clears an optional field. Stage changes go through /move so the stage date is recorded.
const videoPatchBody = z.object({
  title: z.string().trim().min(1).max(300),
  order: z.number().int(),
  source: source.nullable(),
  concept: concept.nullable(),
  planning,
  recorderProjectId: z.string().nullable(),
  publishDate: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  hidden: hidden.nullable(),
}).partial().strict();

const workspaceFields = {
  name: z.string().trim().min(1).max(120),
  handle: z.string().trim().max(120).default(''),
  channelUrl: z.string().trim().max(500).default(''),
  topics: z.array(z.string().trim().min(1)).default([]),
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

const tileMeta = z.object({ views: z.number(), channel: z.string(), multiplier: z.number(), thumbnail: z.string() }).partial().strict();
// Multipart fields arrive as strings, so meta may be a JSON string.
const newTileBody = z.object({
  kind: z.enum(TILE_KINDS),
  url: z.string().trim().min(1).optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  meta: z.preprocess((v) => (typeof v === 'string' ? JSON.parse(v) : v), tileMeta).optional(),
}).strict();

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 50 * 1024 * 1024 } });

const handler = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);
const param = (req: Request, name: string) => String(req.params[name]);

/** Every route except the workspace list works on the current workspace. */
async function requireWorkspace(): Promise<string> {
  const slug = await store.currentWorkspace();
  if (!slug) throw new ClubError('Set up a channel first.', 409);
  return slug;
}

const connectBody = z.object({ provider: z.enum(['claude', 'codex', 'gemini']), reconnect: z.boolean().optional() }).strict();
const settingsBody = z.object({ defaultAi: z.enum(['claude', 'codex']) }).strict();

export interface ClubRouterOptions {
  /** Where to look for the AI command line tools and yt-dlp, and how fast to poll them. Tests point these at fake tools. */
  ai?: ConnectOptions & ToolOptions;
}

export function clubRouter({ ai = {} }: ClubRouterOptions = {}): Router {
  const router = Router();
  router.use(express.json({ limit: '5mb' }));

  // ---- AI
  router.get('/ai/status', handler(async (_req, res) => res.json(await aiStatus(ai))));
  router.post('/ai/connect', handler((req, res) => {
    const { provider, reconnect } = connectBody.parse(req.body);
    res.status(202).json(startConnect(provider, { ...ai, reconnect }));
  }));

  // ---- settings
  router.get('/settings', handler(async (_req, res) => res.json({ defaultAi: (await store.defaultAi()) ?? null })));
  router.put('/settings', handler(async (req, res) => {
    await store.setDefaultAi(settingsBody.parse(req.body).defaultAi);
    res.json({ defaultAi: await store.defaultAi() });
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

  // ---- videos
  router.get('/videos', handler(async (_req, res) => res.json(await store.listVideos(await requireWorkspace()))));
  router.post('/videos', handler(async (req, res) => {
    res.status(201).json(await store.createVideo(await requireWorkspace(), newVideoBody.parse(req.body)));
  }));
  router.get('/videos/:id', handler(async (req, res) => res.json(await store.readVideo(await requireWorkspace(), param(req, 'id')))));
  router.put('/videos/:id', handler(async (req, res) => {
    res.json(await store.updateVideo(await requireWorkspace(), param(req, 'id'), videoPatchBody.parse(req.body)));
  }));
  router.delete('/videos/:id', handler(async (req, res) => {
    await store.deleteVideo(await requireWorkspace(), param(req, 'id'));
    res.status(204).end();
  }));
  router.post('/videos/:id/move', handler(async (req, res) => {
    const { stage: target } = z.object({ stage }).strict().parse(req.body);
    res.json(await store.moveVideo(await requireWorkspace(), param(req, 'id'), target));
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
  router.delete('/videos/:id/research/:tileId', handler(async (req, res) => {
    await store.deleteTile(await requireWorkspace(), param(req, 'id'), param(req, 'tileId'));
    res.status(204).end();
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
