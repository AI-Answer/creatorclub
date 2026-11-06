import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Media } from '../../shared/types.js';
import type { TrendingItem } from '../../shared/club.js';
import { ClubError } from './errors.js';
import { imageKind } from './publisher-routes.js';
import { readProjectIfThere } from './recorder.js';
import * as store from './store.js';
import { findFfmpeg, runTool, toolEnv } from './tools.js';

/*
 * What a thumbnail is made from, beside its idea: the creator's face (a frame of their own camera recording, or a photo they add) and
 * thumbnails that work in their niche (the videos on this video's Board, then the channel's trending videos), plus any picture they
 * add. The sketch shows them, the creator picks which go in, and ChatGPT gets the pictures themselves, each with its role.
 */

export type ReferenceKind = 'face' | 'board' | 'trending' | 'link' | 'upload';
export interface ThumbnailReference {
  id: string;
  kind: ReferenceKind;
  title: string;
  views?: number;
  multiplier?: number;
  /** Goes into the picture: the face, and the creator's pick (by default the two strongest niche thumbnails). */
  selected: boolean;
  /** Its place in the creator's pick, in the order they picked (1st, 2nd…): it keeps its place when others come and go. */
  pick?: number;
}

const YT = /^[\w-]{11}$/;
const UPLOAD = /^upload-[a-z0-9-]{1,60}\.(png|jpg|webp)$/;
const MAX_UPLOAD = 10 * 1024 * 1024;
const refsDir = (slug: string, id: string) => path.join(store.videoDir(slug, id), 'thumbnail-refs');
/** A frame of the creator's recording, made when they have no photo of their own. */
const faceFile = (slug: string) => path.join(store.workspaceDir(slug), 'thumbnail-face.jpg');
/** The photo of their face the creator gave once, for every video's thumbnail: it wins over a recording frame. */
const facePhotos = (slug: string) => ['png', 'jpg', 'webp'].map((ext) => path.join(store.workspaceDir(slug), `thumbnail-face-photo.${ext}`));
const youtubeOf = (url: string | undefined) => /(?:i\.ytimg\.com\/vi\/|youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/.exec(url ?? '')?.[1];

/** The creator's camera recordings, newest video first: where a frame of their face comes from. */
async function cameraMedia(slug: string): Promise<Media[]> {
  const videos = [...(await store.listVideos(slug))].sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)));
  const found: Media[] = [];
  for (const video of videos) {
    const project = await readProjectIfThere(video.recorderProjectId).catch(() => undefined);
    if (!project) continue;
    const ids = new Set([...project.clips.filter((c) => c.track === 'camera').map((c) => c.mediaId), ...(project.recordedTakes ?? []).flatMap((t) => t.tracks.map((track, i) => (track === 'camera' ? t.media[i]?.id : undefined)))]);
    const media = [...project.media, ...(project.recordedTakes ?? []).flatMap((t) => t.media)];
    for (const one of media) if (ids.has(one.id) && one.kind === 'video' && one.duration > 2) found.push(one);
    if (found.length) break;
  }
  return found;
}

const exists = (file: string) => fs.stat(file).then(() => true, () => false);
const photoOf = async (slug: string) => {
  for (const file of facePhotos(slug)) if (await exists(file)) return file;
  return undefined;
};

/**
 * The creator's face: the photo they gave (often before anything is recorded: the thumbnail comes first), else a frame of their newest
 * camera recording, made once and kept with the channel.
 */
async function face(slug: string): Promise<string | undefined> {
  const photo = await photoOf(slug);
  if (photo) return photo;
  const file = faceFile(slug);
  if (await fs.stat(file).then(() => true, () => false)) return file;
  const [camera] = await cameraMedia(slug);
  const ffmpeg = camera && (await findFfmpeg());
  if (!camera || !ffmpeg) return undefined;
  const at = Math.min(camera.duration * 0.3, 20);
  const done = await runTool(ffmpeg, ['-v', 'error', '-nostdin', '-y', '-ss', at.toFixed(2), '-i', camera.path, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', file], { env: toolEnv() });
  return done.code === 0 && (await fs.stat(file).then(() => true, () => false)) ? file : undefined;
}

const chosenFile = (slug: string, id: string) => path.join(refsDir(slug, id), 'chosen.json');
const linksFile = (slug: string, id: string) => path.join(refsDir(slug, id), 'links.json');
type Link = { videoId: string; title: string };
/** At most this many references go into one picture, beside the face. */
export const MAX_CHOSEN = 4;

/** Every reference the creator can pick from: their face, their Board's videos, their niche's trending videos, links and pictures they added. */
async function everything(slug: string, id: string): Promise<ThumbnailReference[]> {
  const refs: ThumbnailReference[] = [];
  const photo = await photoOf(slug);
  if (photo || (await face(slug).catch(() => undefined))) refs.push({ id: 'face', kind: 'face', title: photo ? 'Your photo' : 'You, from your recording', selected: false });
  const seen = new Set<string>();
  const board = (await store.listTiles(slug, id).catch(() => []))
    .filter((t) => youtubeOf(t.meta?.thumbnail) || youtubeOf(t.url))
    .sort((a, b) => (b.meta?.multiplier ?? 0) - (a.meta?.multiplier ?? 0) || (b.meta?.views ?? 0) - (a.meta?.views ?? 0));
  for (const t of board) {
    const video = youtubeOf(t.meta?.thumbnail) ?? youtubeOf(t.url)!;
    if (seen.has(video)) continue;
    seen.add(video);
    refs.push({ id: `board:${video}`, kind: 'board', title: t.title || 'A video on your Board', ...(t.meta?.views ? { views: t.meta.views } : {}), ...(t.meta?.multiplier ? { multiplier: t.meta.multiplier } : {}), selected: false });
  }
  const links = (await store.readJSON<Link[]>(linksFile(slug, id)).catch(() => null)) ?? [];
  for (const l of links) if (YT.test(l.videoId) && !seen.has(l.videoId)) { seen.add(l.videoId); refs.push({ id: `link:${l.videoId}`, kind: 'link', title: l.title, selected: false }); }
  const trending = ((await store.readJSON<TrendingItem[]>(path.join(store.workspaceDir(slug), 'trending.json')).catch(() => null)) ?? [])
    .filter((t) => t.fit && YT.test(t.videoId) && !seen.has(t.videoId))
    .sort((a, b) => (b.vpd ?? 0) - (a.vpd ?? 0))
    .slice(0, 24);
  for (const t of trending) refs.push({ id: `trending:${t.videoId}`, kind: 'trending', title: t.title, views: t.views, selected: false });
  for (const name of (await fs.readdir(refsDir(slug, id)).catch(() => [] as string[])).filter((n) => UPLOAD.test(n)).sort())
    refs.push({ id: `upload:${name}`, kind: 'upload', title: 'Your picture', selected: false });
  return refs;
}

/**
 * The references with what goes into the picture marked `selected`: the creator's own pick, kept with the video, or by default the face
 * and the two strongest niche thumbnails. The face always goes in when there is one.
 */
export async function listReferences(slug: string, id: string): Promise<ThumbnailReference[]> {
  const refs = await everything(slug, id);
  const saved = await store.readJSON<{ ids: string[] }>(chosenFile(slug, id)).catch(() => null);
  const styles = refs.filter((r) => r.kind !== 'face');
  const order = saved ? saved.ids : styles.filter((r) => r.kind === 'board' || r.kind === 'trending').slice(0, 2).map((r) => r.id);
  for (const r of refs) {
    r.selected = r.kind === 'face' || order.includes(r.id);
    if (r.kind !== 'face' && order.includes(r.id)) r.pick = order.indexOf(r.id);
  }
  return refs;
}

/** The creator's pick of style references for this video's thumbnail (the face is not part of it: it always goes in). */
export async function chooseReferences(slug: string, id: string, ids: readonly string[]): Promise<ThumbnailReference[]> {
  const known = new Set((await everything(slug, id)).filter((r) => r.kind !== 'face').map((r) => r.id));
  const kept = [...new Set(ids)].filter((x) => known.has(x)).slice(0, MAX_CHOSEN);
  await fs.mkdir(refsDir(slug, id), { recursive: true });
  await store.writeJSON(chosenFile(slug, id), { ids: kept });
  return listReferences(slug, id);
}

/** A YouTube video (any link to it: watch, youtu.be, Shorts) as a style reference, picked at once. */
export async function addLinkReference(slug: string, id: string, url: string): Promise<ThumbnailReference[]> {
  const videoId = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url.trim())?.[1];
  if (!videoId) throw new ClubError('Paste a link to a YouTube video or Short.');
  const title = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`)
    .then((r): Promise<{ title?: string }> | { title?: string } => (r.ok ? (r.json() as Promise<{ title?: string }>) : {}), (): { title?: string } => ({}))
    .then((d: { title?: string }) => (typeof d.title === 'string' && d.title.trim() ? d.title.trim().slice(0, 200) : 'A video you linked'));
  await referenceFile(slug, id, `link:${videoId}`);
  const links = (await store.readJSON<Link[]>(linksFile(slug, id)).catch(() => null)) ?? [];
  if (!links.some((l) => l.videoId === videoId)) await store.writeJSON(linksFile(slug, id), [...links, { videoId, title }]);
  const now = (await listReferences(slug, id)).filter((r) => r.selected && r.kind !== 'face').map((r) => r.id);
  return chooseReferences(slug, id, [...now.filter((x) => !x.endsWith(videoId)), `link:${videoId}`].slice(-MAX_CHOSEN));
}

/** The file of one reference; a YouTube thumbnail is fetched once and kept with the video. */
export async function referenceFile(slug: string, id: string, ref: string): Promise<string> {
  if (ref === 'face') {
    const file = await face(slug);
    if (!file) throw new ClubError('There is no recording of you yet to take your face from.', 404);
    return file;
  }
  const [kind, value] = ref.split(/:(.*)/s);
  if (kind === 'upload' && UPLOAD.test(value ?? '')) {
    const file = path.join(refsDir(slug, id), value!);
    if (await fs.stat(file).then(() => true, () => false)) return file;
  }
  if ((kind === 'board' || kind === 'trending' || kind === 'link') && YT.test(value ?? '')) {
    const file = path.join(refsDir(slug, id), `yt-${value}.jpg`);
    if (await fs.stat(file).then(() => true, () => false)) return file;
    for (const size of ['maxresdefault', 'hqdefault']) {
      const response = await fetch(`https://i.ytimg.com/vi/${value}/${size}.jpg`).catch(() => undefined);
      if (!response?.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!imageKind(bytes)) continue;
      await fs.mkdir(refsDir(slug, id), { recursive: true });
      await fs.writeFile(file, bytes);
      return file;
    }
    throw new ClubError("Couldn't get that thumbnail from YouTube.", 502);
  }
  throw new ClubError('There is no such reference.', 404);
}

/** A picture the creator adds as a reference (their own photo, a thumbnail they like). */
export async function addReference(slug: string, id: string, bytes: Buffer): Promise<ThumbnailReference> {
  const kind = imageKind(bytes) ?? (bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : undefined);
  if (!kind || bytes.length > MAX_UPLOAD) throw new ClubError('Use a PNG, JPG or WebP picture of up to 10 MB.');
  await fs.mkdir(refsDir(slug, id), { recursive: true });
  const name = `upload-${Date.now().toString(36)}.${kind}`;
  await fs.writeFile(path.join(refsDir(slug, id), name), bytes);
  const now = (await listReferences(slug, id)).filter((r) => r.selected && r.kind !== 'face').map((r) => r.id);
  await chooseReferences(slug, id, [...now, `upload:${name}`].slice(-MAX_CHOSEN));
  return { id: `upload:${name}`, kind: 'upload', title: 'Your picture', selected: true };
}

export async function removeReference(slug: string, id: string, ref: string): Promise<void> {
  const [kind, value] = ref.split(/:(.*)/s);
  if (kind !== 'upload' || !UPLOAD.test(value ?? '')) throw new ClubError('Only a picture you added can be removed.');
  await fs.rm(path.join(refsDir(slug, id), value!), { force: true });
}

/** What each picture is for, in the order they are attached: ChatGPT reads this beside the images. */
export function referenceRoles(refs: readonly { kind: ReferenceKind; title: string }[]): string {
  if (!refs.length) return '';
  return [
    'Reference images, in the order they are attached:',
    ...refs.map((r, i) =>
      r.kind === 'face'
        ? `- Image ${i + 1}: the creator. Put this exact person in the thumbnail as the main subject, with the same face, hair and look, close and large, with the expression the idea needs.`
        : r.kind === 'upload'
          ? `- Image ${i + 1}: a picture the creator added. Use what it shows (a person, a product, a style) as the idea needs.`
          : `- Image ${i + 1}: a thumbnail that does well in this niche ("${r.title}"). Match its energy: how bold, bright and simple it is, how big the face and text are. Do not copy its text, people, logos or layout.`,
    ),
  ].join('\n');
}

/** The photo of the creator's face for all their thumbnails, from their camera or a file; it takes the place of the one before. */
export async function setFacePhoto(slug: string, bytes: Buffer): Promise<void> {
  const kind = imageKind(bytes) ?? (bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : undefined);
  if (!kind || bytes.length > MAX_UPLOAD) throw new ClubError('Use a PNG, JPG or WebP photo of up to 10 MB.');
  for (const file of facePhotos(slug)) await fs.rm(file, { force: true });
  await fs.writeFile(path.join(store.workspaceDir(slug), `thumbnail-face-photo.${kind}`), bytes);
}
