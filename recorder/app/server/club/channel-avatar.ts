import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Workspace } from '../../shared/club.js';
import { parseChannelInput } from './channel.js';
import * as store from './store.js';

export type AvatarFetch = typeof fetch;
const MAX_BYTES = 2 * 1024 * 1024;
const pending = new Map<string, Promise<Workspace>>();
const retryAfter = new Map<string, number>();
const imageFile = (slug: string) => path.join(store.workspaceDir(slug), 'channel-avatar');
const metaFile = (slug: string) => path.join(store.workspaceDir(slug), 'channel-avatar.json');
const avatarUrl = (slug: string) => `/api/club/workspaces/${encodeURIComponent(slug)}/avatar`;

/** Only YouTube's image hosts can supply a channel picture. */
function imageUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw.replace(/&amp;/g, '&').replace(/&#(?:38|x26);/gi, '&'));
    if (url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && /(^|\.)(googleusercontent\.com|ggpht\.com)$/.test(url.hostname)) return url.href;
  } catch { /* An absent picture is fine. */ }
}

/** A channel page's Open Graph picture, or its channel metadata avatar when the meta tag is absent. */
export function parseChannelAvatar(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map((match) => [match[1].toLowerCase(), match[3]]));
    if ((attrs.get('property') ?? attrs.get('name'))?.toLowerCase() === 'og:image') {
      const url = imageUrl(attrs.get('content') ?? '');
      if (url) return url;
    }
  }
  const raw = /"channelMetadataRenderer"\s*:\s*\{[\s\S]*?"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*("(?:\\.|[^"\\])*")/.exec(html)?.[1];
  if (raw) { try { return imageUrl(JSON.parse(raw)); } catch { /* Keep the initials. */ } }
}

/** Recognise the cached raster bytes, rather than trusting a remote content type. */
export function avatarMime(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP') return 'image/webp';
}

/** Read a bounded response. Redirects are refused so image hosts cannot redirect to local services. */
async function readRemote(url: string, limit: number, fetcher: AvatarFetch, signal: AbortSignal): Promise<Buffer> {
  const response = await fetcher(url, { signal, redirect: 'error', headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*' } });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > limit) throw new Error('No channel picture');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Channel picture too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Backfill a channel once, cache it beside its profile, and leave initials available when YouTube cannot answer. */
export async function ensureChannelAvatar(workspace: Workspace, fetcher: AvatarFetch = fetch): Promise<Workspace> {
  if (!workspace.channelUrl && !workspace.handle) return workspace;
  let source: string;
  try { source = parseChannelInput(workspace.channelUrl || workspace.handle).url; } catch { return workspace; }
  const key = `${store.workspaceDir(workspace.slug)}:${source}`;
  const active = pending.get(key);
  if (active) return active;
  const task = (async () => {
    try {
      const meta = await store.readJSON<{ source: string }>(metaFile(workspace.slug));
      if (meta?.source === source && avatarMime(await fs.readFile(imageFile(workspace.slug)))) return { ...workspace, avatarUrl: avatarUrl(workspace.slug) };
    } catch { /* Fetch a missing or broken cache. */ }
    if ((retryAfter.get(key) ?? 0) > Date.now()) return { ...workspace, avatarUrl: undefined };
    retryAfter.set(key, Date.now() + 60 * 60 * 1000);
    try {
      const signal = AbortSignal.timeout(6000);
      const html = await readRemote(source, 5 * 1024 * 1024, fetcher, signal);
      const url = parseChannelAvatar(html.toString('utf8'));
      if (!url) return { ...workspace, avatarUrl: undefined };
      const bytes = await readRemote(url, MAX_BYTES, fetcher, signal);
      if (!avatarMime(bytes)) return { ...workspace, avatarUrl: undefined };
      return store.profileLock(workspace.slug, async () => {
      const latest = await store.readWorkspace(workspace.slug);
      if ((latest.channelUrl || latest.handle) !== (workspace.channelUrl || workspace.handle)) return latest;
      await fs.writeFile(imageFile(workspace.slug), bytes);
      await store.writeJSON(metaFile(workspace.slug), { source });
      const updated = { ...latest, avatarUrl: avatarUrl(workspace.slug) };
      await store.writeWorkspace(updated);
      return updated;
      });
    } catch { return { ...workspace, avatarUrl: undefined }; }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

/** A cached raster only; the browser never fetches YouTube's avatar host. */
export async function cachedChannelAvatar(slug: string): Promise<{ bytes: Buffer; mime: string } | undefined> {
  await store.readWorkspace(slug);
  const bytes = await fs.readFile(imageFile(slug)).catch(() => undefined);
  const mime = bytes && avatarMime(bytes);
  return bytes && mime ? { bytes, mime } : undefined;
}
