import type { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PUBLISH_VISIBILITIES, type PublishChannel, type PublishingState, type PublishRecord, type PublishVisibility } from '../../shared/club.js';
import { ClubError } from './errors.js';
import { runningOnce, startJobOnce } from './jobs.js';
import { normalizeAddress, postizAppUrl, PostizPublisher, MAX_VIDEO_BYTES, UnconfirmedPostError, UNCONFIRMED } from './postiz.js';
import { PublisherError, type LocalFile, type Publisher } from './publisher.js';
import { publishVideo, type ViewsReader } from './publish.js';
import * as store from './store.js';

/** The finished export a video is sent from, found by its id in SceneForge's export history. */
export interface ExportedFile {
  path: string;
  name: string;
  size: number;
  /** The recording project the export came from. */
  projectId: string;
}
export type ExportLookup = (exportId: string) => Promise<ExportedFile | undefined>;

export interface PublishingOptions {
  /** Finds a finished export. Without it, nothing can be published. */
  exportFile?: ExportLookup;
  readViews: ViewsReader;
  /** How long Publish now waits for Postiz to report the video on YouTube, and how often it asks. */
  waitMs?: number;
  pollMs?: number;
  /** Tests point this at their own fetch. */
  fetch?: typeof fetch;
}

const key = z.object({ key: z.string().trim().min(1).max(400), address: z.string().trim().max(300).optional() }).strict();
const settingsBody = z.object({ defaultVisibility: z.enum(PUBLISH_VISIBILITIES as [PublishVisibility, ...PublishVisibility[]]), channelId: z.string().trim().min(1).max(200) }).partial().strict();
const startBody = z
  .object({
    exportId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(5000),
    tags: z.array(z.string().trim().min(1).max(60)).max(30),
    visibility: z.enum(PUBLISH_VISIBILITIES as [PublishVisibility, ...PublishVisibility[]]),
    madeForKids: z.boolean(),
    scheduledFor: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const THUMBNAIL_MAX = 2 * 1024 * 1024;
const THUMBNAIL_EXTENSIONS = ['png', 'jpg', 'webp'] as const;
const THUMBNAIL_TYPE: Record<(typeof THUMBNAIL_EXTENSIONS)[number], string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const NOT_AN_IMAGE = 'Use a PNG, JPG or WebP image, up to 2 MB.';

/** What the bytes are, whatever the client called them: PNG, JPEG or WebP by their first bytes. */
export function imageKind(bytes: Buffer): (typeof THUMBNAIL_EXTENSIONS)[number] | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return undefined;
}
const thumbnailUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: THUMBNAIL_MAX } });
const NEEDS_EXPORT = 'Export the video again, then publish.';
const WAITING = 'Postiz is uploading it to YouTube.';
export const ALREADY_SENT = 'Postiz already has this video. Check again to see where it is.';
export const ALREADY_UNCONFIRMED = 'Postiz may already have this video. Check again to see whether it is there.';
/** An unconfirmed post that Postiz still does not list after this long is taken as not made, so it can be sent again. */
const UNCONFIRMED_GIVE_UP_MS = 10 * 60 * 1000;
export const NOT_THERE = "Postiz doesn't have it. You can send it again.";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

const recordFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'postiz.json');
const thumbnailFiles = (slug: string, id: string) => THUMBNAIL_EXTENSIONS.map((ext) => path.join(store.videoDir(slug, id), `thumbnail.${ext}`));
async function thumbnailOf(slug: string, id: string): Promise<LocalFile | undefined> {
  for (const file of thumbnailFiles(slug, id)) {
    const stat = await fs.stat(file).catch(() => undefined);
    if (stat) {
      // The content hash keeps an upload that was kept from being reused for a different image.
      const version = createHash('sha256').update(await fs.readFile(file)).digest('hex');
      return { path: file, name: path.basename(file), size: stat.size, type: THUMBNAIL_TYPE[path.extname(file).slice(1) as (typeof THUMBNAIL_EXTENSIONS)[number]], version };
    }
  }
  return undefined;
}

export async function publishingState(): Promise<PublishingState> {
  const settings = await store.publishingSettings();
  return {
    postiz: { connected: Boolean(await store.postizKey()), address: savedAddress(settings), channel: settings.channel ?? null },
    defaultVisibility: settings.defaultVisibility ?? 'public',
  };
}

/** A saved address that is not accepted any more (or was edited by hand) is ignored, so Postiz Cloud is used. */
function savedAddress(settings: store.PublishingSettings): string | null {
  try {
    return normalizeAddress(settings.address);
  } catch {
    return null;
  }
}

/**
 * The address in use: the person's own, else Postiz Cloud. CREATORCLUB_POSTIZ_URL only points a test or a walkthrough at a stand-in
 * Postiz, and is ignored unless NODE_ENV is test or CREATORCLUB_TEST is 1, so it can never redirect a real install.
 */
export const effectiveAddress = (settings: store.PublishingSettings) =>
  savedAddress(settings) ?? ((process.env.NODE_ENV === 'test' || process.env.CREATORCLUB_TEST === '1') && process.env.CREATORCLUB_POSTIZ_URL ? process.env.CREATORCLUB_POSTIZ_URL : null);

async function connectedPublisher(options: PublishingOptions): Promise<{ publisher: Publisher; address: string | null }> {
  const apiKey = await store.postizKey();
  if (!apiKey) throw new ClubError('Connect Postiz first.', 409);
  const address = effectiveAddress(await store.publishingSettings());
  return { publisher: new PostizPublisher({ apiKey, address, fetch: options.fetch }), address };
}

export function publishingRoutes(router: Router, deps: { handler: (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) => void; requireWorkspace: () => Promise<string> }, options: PublishingOptions) {
  const { handler, requireWorkspace } = deps;
  const param = (req: Request, name: string) => String(req.params[name]);

  router.get('/publishing', handler(async (_req, res) => res.json(await publishingState())));
  router.put('/publishing', handler(async (req, res) => {
    const body = settingsBody.parse(req.body);
    if (body.channelId) {
      const { publisher } = await connectedPublisher(options);
      const channel = (await publisher.listChannels()).find((item) => item.id === body.channelId);
      if (!channel) throw new ClubError("That channel isn't connected in Postiz.", 400);
      await store.updatePublishingSettings({ channel });
    }
    if (body.defaultVisibility) await store.updatePublishingSettings({ defaultVisibility: body.defaultVisibility });
    res.json(await publishingState());
  }));

  // Saves the key only once Postiz accepts it. A Postiz with one YouTube channel has it picked at once.
  router.put('/publishing/postiz', handler(async (req, res) => {
    const body = key.parse(req.body);
    const address = normalizeAddress(body.address);
    const channels = await new PostizPublisher({ apiKey: body.key, address: address ?? effectiveAddress({}), fetch: options.fetch }).connect();
    await store.setPostizKey(body.key);
    const settings = await store.publishingSettings();
    const keep = settings.channel && channels.find((channel) => channel.id === settings.channel!.id);
    await store.updatePublishingSettings({ address: address ?? undefined, channel: keep ?? (channels.length === 1 ? channels[0] : undefined) });
    res.json({ state: await publishingState(), channels });
  }));
  router.delete('/publishing/postiz', handler(async (_req, res) => {
    await store.removePostizKey();
    await store.updatePublishingSettings({ channel: undefined });
    res.json(await publishingState());
  }));
  router.get('/publishing/postiz/channels', handler(async (_req, res) => {
    const { publisher } = await connectedPublisher(options);
    res.json({ channels: await publisher.listChannels() satisfies PublishChannel[] });
  }));

  // ---- the thumbnail the person picked for this video (optional: Postiz uses YouTube's own pick without one)
  router.post('/videos/:id/thumbnail', thumbnailUpload.single('file'), handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const ext = req.file ? imageKind(req.file.buffer) : undefined;
    if (!req.file || !ext) throw new ClubError(NOT_AN_IMAGE);
    for (const file of thumbnailFiles(slug, id)) await fs.rm(file, { force: true });
    await store.writeFileAtomic(path.join(store.videoDir(slug, id), `thumbnail.${ext}`), req.file.buffer);
    res.status(204).end();
  }));
  router.get('/videos/:id/thumbnail', handler(async (req, res) => {
    const file = await thumbnailOf(await requireWorkspace(), param(req, 'id'));
    // No image is not an error: the screen asks on every visit.
    if (!file) return res.status(204).end();
    res.type(file.type).sendFile(file.path);
  }));
  router.delete('/videos/:id/thumbnail', handler(async (req, res) => {
    const slug = await requireWorkspace();
    for (const file of thumbnailFiles(slug, param(req, 'id'))) await fs.rm(file, { force: true });
    res.status(204).end();
  }));
  router.use('/videos/:id/thumbnail', (error: Error, _req: Request, res: Response, next: NextFunction) =>
    error instanceof multer.MulterError ? res.status(400).json({ error: NOT_AN_IMAGE }) : next(error));

  // ---- publish
  router.get('/videos/:id/postiz', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const record = await store.readJSON<PublishRecord>(recordFile(slug, id));
    if (!record) return res.json(null);
    // A video Postiz was still sending, or has scheduled, may have gone out since: ask once, and keep what we have if Postiz cannot be reached.
    if (record.state === 'queued') {
      try {
        const { publisher } = await connectedPublisher(options);
        return res.json(await refresh(slug, id, record, publisher, options.readViews));
      } catch {
        // Nothing to add: the saved record is still right.
      }
    }
    res.json(record);
  }));

  router.post('/videos/:id/postiz', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    const body = startBody.parse(req.body);
    const video = await store.readVideo(slug, id);
    // Pressing Publish again while it runs follows the same job. Once Postiz has (or may have) the video, a second post is never made.
    const running = runningOnce(`postiz:${slug}:${id}`);
    if (running) return res.status(202).json(running);
    const prior = await store.readJSON<PublishRecord>(recordFile(slug, id));
    if (prior && prior.state !== 'failed') throw new ClubError(prior.unconfirmed ? ALREADY_UNCONFIRMED : ALREADY_SENT, 409);
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : undefined;
    if (scheduledFor && scheduledFor.getTime() < Date.now() + 60_000) throw new ClubError('Pick a time in the future.');
    const settings = await store.publishingSettings();
    if (!settings.channel) throw new ClubError('Pick the YouTube channel first.', 409);
    const { publisher, address } = await connectedPublisher(options);
    const exported = await options.exportFile?.(body.exportId);
    if (!exported || !video.recorderProjectId || exported.projectId !== video.recorderProjectId) throw new ClubError(NEEDS_EXPORT, 409);
    if (exported.size > MAX_VIDEO_BYTES) throw new PublisherError(`Postiz takes videos up to 1 GB. This one is ${(exported.size / 1024 ** 3).toFixed(1)} GB.`, 400);
    const file: LocalFile = { path: exported.path, name: exported.name, size: exported.size, type: 'video/mp4', version: body.exportId };
    const channelId = settings.channel.id;
    res.status(202).json(startJobOnce(`postiz:${slug}:${id}`, 'publish', async ({ emit, signal }) => {
      emit({ step: 'check', message: 'Checking the exported video' });
      const base = { title: body.title, visibility: body.visibility, channelId, ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}), state: 'queued' as const, postizUrl: postizAppUrl(address) };
      let sent;
      try {
        sent = await publisher.publish({ channelId, title: body.title, description: body.description, tags: body.tags, visibility: body.visibility, madeForKids: body.madeForKids, scheduledFor, video: file, thumbnail: await thumbnailOf(slug, id) }, emit, signal);
      } catch (error) {
        // The post may exist. Keep what is needed to look for it, so nothing is sent twice.
        if (error instanceof UnconfirmedPostError) await store.writeJSON(recordFile(slug, id), { ...base, postId: '', unconfirmed: true, sentAt: error.date.toISOString(), message: UNCONFIRMED } satisfies PublishRecord);
        throw error;
      }
      let record: PublishRecord = { ...base, postId: sent.postId, sentAt: new Date().toISOString() };
      await store.writeJSON(recordFile(slug, id), record);
      if (scheduledFor) await store.updateVideo(slug, id, { publishDate: scheduledFor.toISOString() });
      else {
        // Postiz sends it to YouTube in its own time. Wait a while for the link, then let the screen ask again.
        emit({ step: 'wait', message: WAITING });
        const until = Date.now() + (options.waitMs ?? 90_000);
        for (;;) {
          const status = await publisher.status(sent, signal).catch(() => ({ state: 'queued' as const }));
          record = await settle(slug, id, record, status, options.readViews);
          if (record.state !== 'queued' || Date.now() >= until || signal.aborted) break;
          await sleep(options.pollMs ?? 3000, signal);
        }
      }
      if (record.state === 'failed') throw new PublisherError(record.message!);
      return record;
    }));
  }));
}

export const POSTIZ_FAILED = "Postiz couldn't post it to YouTube. Open Postiz to see why.";

/** Asks Postiz where a saved record stands and applies it. */
async function refresh(slug: string, id: string, record: PublishRecord, publisher: Publisher, readViews: ViewsReader): Promise<PublishRecord> {
  const status = await publisher.status({ postId: record.postId, date: new Date(record.scheduledFor ?? record.sentAt), channelId: record.channelId });
  if (record.unconfirmed) {
    if (status.postId) {
      // Found by its channel and time: from here it is an ordinary post.
      const { unconfirmed: _found, message: _none, ...known } = record;
      record = { ...known, postId: status.postId };
      await store.writeJSON(recordFile(slug, id), record);
    } else if (Date.now() - new Date(record.sentAt).getTime() > UNCONFIRMED_GIVE_UP_MS) {
      const gone: PublishRecord = { ...record, state: 'failed', message: NOT_THERE };
      await store.writeJSON(recordFile(slug, id), gone);
      return gone;
    } else return record;
  }
  return settle(slug, id, record, status, readViews);
}

/**
 * Applies what Postiz says to the saved record. It is `published` only once the video has really moved to Published, which needs a
 * YouTube link; Postiz saying published without a usable link leaves the record queued, and the screen offers pasting the link.
 */
async function settle(slug: string, id: string, record: PublishRecord, status: { state: PublishRecord['state']; url?: string }, readViews: ViewsReader): Promise<PublishRecord> {
  if (status.state === 'queued') return record;
  let next: PublishRecord;
  if (status.state === 'failed') next = { ...record, state: 'failed', message: POSTIZ_FAILED };
  else {
    if (!status.url) return record;
    try {
      const { video } = await publishVideo(slug, id, status.url, readViews);
      next = { ...record, state: 'published', url: video.youtubeUrl ?? status.url };
    } catch {
      return record;
    }
  }
  await store.writeJSON(recordFile(slug, id), next);
  return next;
}
