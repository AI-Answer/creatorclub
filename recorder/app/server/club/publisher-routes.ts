import type { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {imageExtension} from './board-images.js';
import {findFfmpeg,runTool,toolEnv} from './tools.js';
import { PUBLISH_VISIBILITIES, type PublishChannel, type PublishingState, type PublishRecord, type PublishVisibility } from '../../shared/club.js';
import { ClubError } from './errors.js';
import { runningOnce, startJobOnce } from './jobs.js';
import { normalizeAddress, postizAppUrl, PostizPublisher, MAX_VIDEO_BYTES, UnconfirmedPostError, UNCONFIRMED } from './postiz.js';
import { PublisherError, type LocalFile, type Publisher } from './publisher.js';
import { publishVideo, type ViewsReader } from './publish.js';
import * as store from './store.js';
import { coverMediaIds } from './video-cover.js';
import { readProjectIfThere, sceneforge } from './recorder.js';

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
const THUMBNAIL_EXTENSIONS = ['png', 'jpg'] as const;
const THUMBNAIL_TYPE: Record<(typeof THUMBNAIL_EXTENSIONS)[number], string> = { png: 'image/png', jpg: 'image/jpeg' };
const NOT_AN_IMAGE = 'Use a PNG or JPG image of up to 2 MB.';

/** What the bytes are, whatever the client called them: PNG or JPEG by their first bytes (the types YouTube accepts for a thumbnail). */
export function imageKind(bytes: Buffer): (typeof THUMBNAIL_EXTENSIONS)[number] | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return undefined;
}
/** Shared with the thumbnail studio: publishing and the Idea page read these exact files. */
export async function setThumbnail(slug:string,id:string,bytes:Buffer):Promise<void>{
 await store.readVideo(slug,id);
 let ext=imageKind(bytes);
 if((!ext&&!imageExtension(bytes))||bytes.length>20*1024*1024)throw new ClubError(NOT_AN_IMAGE);
 if(!ext||bytes.length>THUMBNAIL_MAX){
  const ffmpeg=await findFfmpeg();if(!ffmpeg)throw new ClubError('Install ffmpeg to resize this image for YouTube.');
  const scratch=await fs.mkdtemp(path.join(store.videoDir(slug,id),'.thumbnail-'));
  try{
   const source=path.join(scratch,'source'+imageExtension(bytes)),output=path.join(scratch,'thumbnail.jpg');
   await fs.writeFile(source,bytes,{flag:'wx'});
   const result=await runTool(ffmpeg,['-v','error','-i',source,'-frames:v','1','-vf','scale=1280:720:force_original_aspect_ratio=decrease','-q:v','3',output],{env:toolEnv({}),timeoutMs:30_000});
   if(result.code!==0)throw new ClubError('Could not resize that thumbnail for YouTube.');
   bytes=await fs.readFile(output);ext=imageKind(bytes);
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
 }
 if(!ext||bytes.length>THUMBNAIL_MAX)throw new ClubError(NOT_AN_IMAGE);
 await store.withLock(`thumbnail:${store.videoDir(slug,id)}`,async()=>{
  await store.writeFileAtomic(path.join(store.videoDir(slug,id),`thumbnail.${ext}`),bytes);
  for(const other of THUMBNAIL_EXTENSIONS)if(other!==ext)await fs.rm(path.join(store.videoDir(slug,id),`thumbnail.${other}`),{force:true});
 });
}
const thumbnailUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: THUMBNAIL_MAX } });
/** A reference picture for a thumbnail: a photo of the creator or a thumbnail they like. */
const referenceUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
const NEEDS_EXPORT = 'Export the video again, then publish.';
const WAITING = 'Postiz is uploading it to YouTube.';
export const ALREADY_SENT = 'Postiz already has this video, so check again to see where it is.';
export const ALREADY_UNCONFIRMED = 'Postiz may already have this video, so check again to see whether it is there.';
export const FORGOTTEN = 'You said it is not in Postiz, so this video can be sent again.';
export const CANT_FORGET_PUBLISHED = 'This video is already published, so there is nothing to send again.';
export const STILL_SENDING = 'Postiz is still being sent this video, so wait for it to finish.';
export const NOTHING_SENT = 'This video has not been sent to Postiz.';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

const recordLock = <T>(slug: string, id: string, fn: () => Promise<T>) => store.withLock(`postiz-record:${store.videoDir(slug, id)}`, fn);
const recordFile = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'postiz.json');
const thumbnailFiles = (slug: string, id: string) => THUMBNAIL_EXTENSIONS.map((ext) => path.join(store.videoDir(slug, id), `thumbnail.${ext}`));
export async function thumbnailOf(slug: string, id: string): Promise<LocalFile | undefined> {
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
    await setThumbnail(slug, id, req.file.buffer);
    res.status(204).end();
  }));
  // The sketch's thumbnail, drawn by the creator's own ChatGPT account: a job, followed like any other.
  router.post('/videos/:id/thumbnail/chatgpt', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { makeThumbnailWithChatGPT } = await import('./chatgpt-thumbnail.js');
    const chosen = z.object({ references: z.array(z.string().max(120)).max(12).optional() }).strip().parse(req.body ?? {}).references;
    res.status(202).json(startJobOnce(`chatgpt-thumbnail:${slug}:${id}`, 'chatgpt-thumbnail', (context) => makeThumbnailWithChatGPT(slug, id, context, undefined, chosen)));
  }));
  // What a thumbnail is made from: the creator's face, thumbnails that work in the niche, pictures they add.
  router.get('/videos/:id/thumbnail/references', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { listReferences } = await import('./thumbnail-references.js');
    res.json(await listReferences(slug, id));
  }));
  router.get('/videos/:id/thumbnail/references/:ref/image', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { referenceFile } = await import('./thumbnail-references.js');
    const file = await referenceFile(slug, id, param(req, 'ref'));
    const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }).type(types[path.extname(file)] ?? 'image/jpeg').sendFile(file, { dotfiles: 'allow' });
  }));
  // Other titles, to pick from under the title.
  router.post('/videos/:id/title-ideas', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { titleIdeas } = await import('./title-ideas.js');
    const abort = new AbortController();
    req.on('close', () => { if (!res.writableEnded) abort.abort(); });
    res.json({ titles: await titleIdeas(slug, id, abort.signal) });
  }));
  // Thumbnail ideas you can see: three concepts, then a quick ChatGPT preview of each; picking one puts it on the sketch and as the thumbnail.
  router.post('/videos/:id/thumbnail/ideas', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const chosen = z.object({ references: z.array(z.string().max(120)).max(12).optional() }).strip().parse(req.body ?? {}).references;
    const { thumbnailIdeas } = await import('./thumbnail-ideas.js');
    res.status(202).json(startJobOnce(`thumbnail-ideas:${slug}:${id}`, 'thumbnail-ideas', (context) => thumbnailIdeas(slug, id, context, chosen)));
  }));
  router.get('/videos/:id/thumbnail/ideas/:run/:n/image', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { ideaPreview } = await import('./thumbnail-ideas.js');
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }).type('image/png').sendFile(await ideaPreview(slug, id, param(req, 'run'), Number(param(req, 'n'))), { dotfiles: 'allow' });
  }));
  router.post('/videos/:id/thumbnail/ideas/:run/:n/use', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { useIdea } = await import('./thumbnail-ideas.js');
    res.json(await useIdea(slug, id, param(req, 'run'), Number(param(req, 'n'))));
  }));
  // The creator's face for every thumbnail: a photo they take or pick once, often before anything is recorded.
  router.post('/thumbnail-face', referenceUpload.single('file'), handler(async (req, res) => {
    const slug = await requireWorkspace();
    if (!req.file) throw new ClubError('Choose a photo.');
    const { setFacePhoto } = await import('./thumbnail-references.js');
    await setFacePhoto(slug, req.file.buffer);
    res.status(204).end();
  }));
  router.put('/videos/:id/thumbnail/references/chosen', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { chooseReferences } = await import('./thumbnail-references.js');
    res.json(await chooseReferences(slug, id, z.object({ ids: z.array(z.string().max(120)).max(12) }).strict().parse(req.body).ids));
  }));
  router.post('/videos/:id/thumbnail/references/link', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const { addLinkReference } = await import('./thumbnail-references.js');
    res.json(await addLinkReference(slug, id, z.object({ url: z.string().max(500) }).strict().parse(req.body).url));
  }));
  router.post('/videos/:id/thumbnail/references', referenceUpload.single('file'), handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    if (!req.file) throw new ClubError('Choose a picture.');
    const { addReference } = await import('./thumbnail-references.js');
    res.json(await addReference(slug, id, req.file.buffer));
  }));
  router.delete('/videos/:id/thumbnail/references/:ref', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    const { removeReference } = await import('./thumbnail-references.js');
    await removeReference(slug, id, param(req, 'ref'));
    res.status(204).end();
  }));
  router.get('/videos/:id/thumbnail', handler(async (req, res) => {
    const file = await thumbnailOf(await requireWorkspace(), param(req, 'id'));
    // No image is not an error: the screen asks on every visit.
    if (!file) return res.status(204).end();
    res.type(file.type).sendFile(file.path, { dotfiles: 'allow' });
  }));
  // The picture a list shows for a video: the thumbnail the person picked, else a frame of its recording. Nothing (204) before either exists.
  router.get('/videos/:id/cover', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    const own = await thumbnailOf(slug, id);
    if (own) return res.type(own.type).sendFile(own.path, { dotfiles: 'allow' });
    const project = await readProjectIfThere((await store.readVideo(slug, id)).recorderProjectId);
    if (!project) return res.status(204).end();
    const { readMedia, CACHE_DIR } = await sceneforge();
    const { thumbnail } = await import('../media.js');
    for (const mediaId of coverMediaIds(project)) {
      const media = await readMedia(mediaId).catch(() => undefined)
        ?? project.media.find(item => item.id === mediaId)
        ?? project.recordedTakes?.flatMap(take => take.media).find(item => item.id === mediaId);
      if (!media) continue;
      const frame = await thumbnail(media, CACHE_DIR).catch(() => undefined);
      if (frame) return res.type('image/jpeg').sendFile(frame, { dotfiles: 'allow' });
    }
    return res.status(204).end();
  }));
  router.delete('/videos/:id/thumbnail', handler(async (req, res) => {
    const slug = await requireWorkspace();
    await store.withLock(`thumbnail:${store.videoDir(slug, param(req, 'id'))}`, async () => {
      for (const file of thumbnailFiles(slug, param(req, 'id'))) await fs.rm(file, { force: true });
    });
    res.status(204).end();
  }));
  router.use('/videos/:id/thumbnail', (error: Error, _req: Request, res: Response, next: NextFunction) =>
    error instanceof multer.MulterError ? res.status(400).json({ error: NOT_AN_IMAGE }) : next(error));

  // ---- publish
  router.get('/videos/:id/postiz', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    const record = await recoverUpload(slug,id);
    if (!record) return res.json(null);
    // A send still running in this server: say which job, so a reopened Publish screen follows it instead of offering Publish again.
    const running = runningOnce(`postiz:${slug}:${id}`);
    if (running) return res.json({ ...record, runningJobId: running.id });
    // A video Postiz was still sending, or has scheduled, may have gone out since: ask once, and keep what we have if Postiz cannot be reached.
    if ((record.state === 'queued' || record.state === 'posting' || record.state === 'published')) {
      try {
        const { publisher } = await connectedPublisher(options);
        return res.json(await refresh(slug, id, record, publisher, options.readViews));
      } catch {
        // Nothing to add: the saved record is still right.
      }
    }
    res.json(record);
  }));

  // "I checked Postiz and it is not there": the only way a queued or unconfirmed record is let go, so one the person deleted in Postiz never blocks the video.
  // It changes the record to failed and nothing else, and never for a video that is published.
  router.post('/videos/:id/postiz/forget', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    await store.readVideo(slug, id);
    if (runningOnce(`postiz:${slug}:${id}`)) throw new ClubError(STILL_SENDING, 409);
    const next = await recordLock(slug, id, async () => {
      const record = await store.readJSON<PublishRecord>(recordFile(slug, id));
      if (!record) throw new ClubError(NOTHING_SENT, 409);
      if (record.state === 'published') throw new ClubError(CANT_FORGET_PUBLISHED, 409);
      if (runningOnce(`postiz:${slug}:${id}`)) throw new ClubError(STILL_SENDING, 409);
      const next: PublishRecord = { ...record, state: 'failed', message: FORGOTTEN };
      await store.writeJSON(recordFile(slug, id), next);
      return next;
    });
    res.json(next);
  }));

  router.post('/videos/:id/postiz', handler(async (req, res) => {
    const slug = await requireWorkspace();
    const id = param(req, 'id');
    const body = startBody.parse(req.body);
    const video = await store.readVideo(slug, id);
    // Pressing Publish again while it runs follows the same job. Once Postiz has (or may have) the video, a second post is never made.
    const running = runningOnce(`postiz:${slug}:${id}`);
    if (running) return res.status(202).json(running);
    const prior = await recoverUpload(slug,id);
    if (prior && prior.state !== 'failed') {
      if (prior.state === 'posting' || prior.unconfirmed) {
        const { publisher } = await connectedPublisher(options);
        await refresh(slug, id, prior, publisher, options.readViews);
      }
      throw new ClubError(prior.unconfirmed || prior.state === 'posting' ? ALREADY_UNCONFIRMED : ALREADY_SENT, 409);
    }
    const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : undefined;
    if (scheduledFor && scheduledFor.getTime() < Date.now() + 60_000) throw new ClubError('Pick a time in the future.');
    const settings = await store.publishingSettings();
    if (!settings.channel) throw new ClubError('Pick the YouTube channel first.', 409);
    const { publisher, address } = await connectedPublisher(options);
    const exported = await options.exportFile?.(body.exportId);
    if (!exported || !video.recorderProjectId || exported.projectId !== video.recorderProjectId) throw new ClubError(NEEDS_EXPORT, 409);
    if (exported.size > MAX_VIDEO_BYTES) throw new PublisherError(`Postiz takes videos up to 1 GB, and this one is ${(exported.size / 1024 ** 3).toFixed(1)} GB.`, 400);
    const file: LocalFile = { path: exported.path, name: exported.name, size: exported.size, type: 'video/mp4', version: body.exportId };
    const channelId = settings.channel.id;
    res.status(202).json(startJobOnce(`postiz:${slug}:${id}`, 'publish', async ({ emit, signal }) => store.withLock(`postiz-send:${store.videoDir(slug, id)}`, async () => {
      emit({ step: 'check', message: 'Checking the exported video' });
      const base = { title: body.title, visibility: body.visibility, channelId, ...(scheduledFor ? { scheduledFor: scheduledFor.toISOString() } : {}), state: 'queued' as const, postizUrl: postizAppUrl(address) };
      const intent: PublishRecord = { ...base, state: 'uploading', postId: '', sentAt: new Date().toISOString(), idempotencyKey: `cc_${randomBytes(16).toString('hex')}`, content: body.description, mediaVersion: body.exportId };
      await recordLock(slug, id, async () => {
        const latest = await store.readJSON<PublishRecord>(recordFile(slug, id));
        if (latest && latest.state !== 'failed') throw new ClubError(ALREADY_SENT, 409);
        await store.writeJSON(recordFile(slug, id), intent);
      });
      let sent;
      try {
        sent = await publisher.publish({ idempotencyKey: intent.idempotencyKey, beforePost: async post => {
          signal.throwIfAborted();
          intent.state='posting';
          intent.sentAt = post.date.toISOString();
          intent.mediaId = post.mediaId;
          await recordLock(slug, id, async () => {
            const current = await store.readJSON<PublishRecord>(recordFile(slug, id));
            if (!current || current.idempotencyKey !== intent.idempotencyKey || current.state !== 'uploading') throw new ClubError(ALREADY_SENT, 409);
            await store.writeJSON(recordFile(slug, id), intent);
          });
        }, channelId, title: body.title, description: body.description, tags: body.tags, visibility: body.visibility, madeForKids: body.madeForKids, scheduledFor, video: file, thumbnail: await thumbnailOf(slug, id) }, emit, signal);
      } catch (error) {
        // The post may exist. Keep what is needed to look for it, so nothing is sent twice.
        await recordLock(slug, id, async () => {
          const current = await store.readJSON<PublishRecord>(recordFile(slug, id));
          if (!current || current.idempotencyKey !== intent.idempotencyKey || !['uploading','posting'].includes(current.state)) return;
          await store.writeJSON(recordFile(slug, id), error instanceof UnconfirmedPostError
            ? { ...intent, unconfirmed: true, sentAt: error.date.toISOString(), message: UNCONFIRMED }
            : { ...intent, state: 'failed', message: error instanceof ClubError ? error.message : 'Publishing stopped before the post was sent.' });
        });
        throw error;
      }
      let record: PublishRecord = { ...intent, state: 'queued', postId: sent.postId };
      record = await recordLock(slug, id, async () => {
        const current = await store.readJSON<PublishRecord>(recordFile(slug, id));
        if (current && current.idempotencyKey === intent.idempotencyKey && current.state !== 'posting') return current;
        await store.writeJSON(recordFile(slug, id), record);
        return record;
      });
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
    })));
  }));
  startPublishingSettle(options);
}

/** Uploading cannot have sent a post; a dead worker's upload can safely be retried. */
export async function recoverUpload(slug:string,id:string):Promise<PublishRecord|null>{
 return recordLock(slug,id,async()=>{const record=await store.readJSON<PublishRecord>(recordFile(slug,id));if(!record||record.state!=='uploading'||runningOnce(`postiz:${slug}:${id}`))return record??null;const next:PublishRecord={...record,state:'failed',message:'Uploading stopped before the post was sent. You can retry.'};await store.writeJSON(recordFile(slug,id),next);return next;});
}

export const POSTIZ_FAILED = "Postiz couldn't post it to YouTube. Open Postiz to see why.";

/** Asks Postiz where a saved record stands and applies it. */
export async function refresh(slug: string, id: string, record: PublishRecord, publisher: Publisher, readViews: ViewsReader): Promise<PublishRecord> {
  const status = await publisher.status({ postId: record.postId, date: new Date(record.scheduledFor ?? record.sentAt), channelId: record.channelId, idempotencyKey: record.idempotencyKey, title: record.title, content: record.content, mediaId: record.mediaId }, AbortSignal.timeout(30_000));
  return settle(slug, id, record, status, readViews);
}

/** Every writer re-reads the intent under the same lock; a forgotten/replaced intent wins over a slow refresh. */
export async function settle(slug: string, id: string, record: PublishRecord, status: { state: 'queued' | 'published' | 'failed'; url?: string; postId?: string }, readViews: ViewsReader): Promise<PublishRecord> {
  return recordLock(slug, id, async () => {
    const current = await store.readJSON<PublishRecord>(recordFile(slug, id));
    if (!current) return record;
    if (current.idempotencyKey !== record.idempotencyKey || current.sentAt !== record.sentAt || current.state === 'failed') return current;
    let next = current;
    if (status.postId && current.state !== 'published') { const { unconfirmed: _found, message: _none, ...known } = current; next = { ...known, postId: status.postId, state: 'queued' }; }
    if (status.state === 'failed' && current.state !== 'published') next = { ...next, state: 'failed', message: POSTIZ_FAILED };
    else if (status.state === 'published' && status.url) {
      const { youtubeId } = await import('./publish.js');
      try { next = { ...next, state: 'published', stageApplied: current.state === 'published' ? current.stageApplied : false, url: `https://www.youtube.com/watch?v=${youtubeId(status.url)}` }; } catch { return current; }
    }
    // Commit the record first. A later read/background pass repairs a failed stage move.
    await store.writeJSON(recordFile(slug, id), next);
    if (next.state === 'published' && next.url && next.stageApplied === false) {
      try {
        await publishVideo(slug, id, next.url, readViews);
        next = { ...next, stageApplied: true };
        await store.writeJSON(recordFile(slug, id), next);
      } catch { /* The next pass repairs the handoff. */ }
    }
    return next;
  });
}

const settlingRoots = new Set<string>();
export async function settleQueuedPublishing(options: PublishingOptions): Promise<void> {
  let publisher:Publisher|undefined;
  for (const workspace of await store.listWorkspaces()) {
    for (const video of await store.listVideos(workspace.slug)) {
      const record = await recoverUpload(workspace.slug,video.id).catch(error=>{console.error('Could not recover publish record',workspace.slug,video.id,error);return null;});
      if (!record || runningOnce(`postiz:${workspace.slug}:${video.id}`)||record.state==='failed') continue;
      if(!(await store.postizKey()))continue;
      publisher??=(await connectedPublisher(options)).publisher;
      if (record.state === 'queued' || record.state === 'posting') await refresh(workspace.slug, video.id, record, publisher, options.readViews).catch(() => undefined);
      else if (record.state === 'published' && record.url && record.stageApplied === false) await settle(workspace.slug, video.id, record, { state: 'published', url: record.url }, options.readViews).catch(() => undefined);
    }
  }
}
function startPublishingSettle(options: PublishingOptions) {
  // Router construction is the club server's startup path. Tests opt out to control network/time explicitly.
  if (process.env.NODE_ENV === 'test' || process.env.CREATORCLUB_TEST === '1' || settlingRoots.has(store.rootDir())) return;
  settlingRoots.add(store.rootDir());
  let busy = false;
  const run = async () => { if (busy) return; busy = true; try { await settleQueuedPublishing(options); } catch { /* Retry next pass. */ } finally { busy = false; } };
  void run();
  setInterval(() => void run(), 3 * 60_000).unref();
}
