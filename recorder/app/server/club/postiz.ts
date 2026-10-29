import { createReadStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PublishChannel, PublishProgress } from '../../shared/club.js';
import { PublisherError, type LocalFile, type PostStatus, type Publisher, type PublishRequest, type SentPost } from './publisher.js';

/*
 * Every HTTP detail of Postiz is in this file, so a wrong guess is fixed in one place.
 * Confirmed by Postiz's docs: the Cloud base URL, the raw API key in `Authorization` (no "Bearer"), `GET /integrations`,
 * multipart `POST /upload` answering {id, path}, `POST /posts` with the YouTube settings (title, type, selfDeclaredMadeForKids,
 * thumbnail, tags), 90 posts an hour, 1 GB a video. UNCONFIRMED (written from the Postiz source, not run against a live Postiz):
 * the `date`, `shortLink` and `tags: [{value, label}]` fields of a post, the `[{postId, integration}]` answer, and `GET /posts`
 * with startDate and endDate returning `{posts: [{id, state, releaseURL}]}` where state is QUEUE, PUBLISHED or ERROR.
 */

export const POSTIZ_CLOUD_API = 'https://api.postiz.com/public/v1';
export const POSTIZ_CLOUD_APP = 'https://platform.postiz.com';
export const MAX_VIDEO_BYTES = 1024 ** 3;
export const POSTS_PER_HOUR = 90;

export const BAD_ADDRESS = 'Use a web address like https://postiz.example.com, without a username or password. Plain http only works for this computer or your own network.';
export const BAD_KEY = "Postiz didn't accept that key. Copy it again from Postiz, Settings, Public API.";
export const CANT_REACH_POSTIZ = "Couldn't reach Postiz. Check your connection.";
const POSTIZ_DOWN = 'Postiz had a problem on its side.';
const POST_REJECTED = 'Postiz rejected the post. Check the title, tags and time.';
const NOT_PROCESSED = "Postiz couldn't process the video.";
const TOO_BIG = 'Postiz takes videos up to 1 GB.';
export const UNCONFIRMED = "Postiz didn't confirm the post, so it may or may not be there.";

/** Postiz answered the post without saying it was made. The post may exist, so nothing may be sent again until it is known. */
export class UnconfirmedPostError extends PublisherError {
  constructor(readonly date: Date) {
    super(UNCONFIRMED);
    this.name = 'UnconfirmedPostError';
  }
}

/** This computer, or a host on the person's own network: the only places plain http is accepted. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);
}

/** The person's own Postiz as a clean URL (no credentials, query or fragment), or the sentence that says what is wrong with it. */
function parseAddress(address: string): URL {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new PublisherError(BAD_ADDRESS, 400);
  }
  if (url.username || url.password) throw new PublisherError(BAD_ADDRESS, 400);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && isPrivateHost(url.hostname))) return url;
  throw new PublisherError(BAD_ADDRESS, 400);
}

/** The API address for a Postiz: Cloud when none is given, or the person's own server (`https://host`, or the full `/public/v1` address). */
export function postizApiBase(address?: string | null): string {
  if (!address?.trim()) return POSTIZ_CLOUD_API;
  const url = parseAddress(address);
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/public/v1')) return url.origin + path;
  return `${url.origin}${path.endsWith('/api') ? path : `${path}/api`}/public/v1`;
}

/** Where the person sees their posts in Postiz. */
export function postizAppUrl(address?: string | null): string {
  return address?.trim() ? `${parseAddress(address).origin}/launches` : `${POSTIZ_CLOUD_APP}/launches`;
}

/** What is saved for an address: its origin and path only, never what was typed. Null for Cloud. Throws the sentence for one that is not accepted. */
export function normalizeAddress(address?: string | null): string | null {
  if (!address?.trim()) return null;
  const url = parseAddress(address);
  return url.origin + url.pathname.replace(/\/+$/, '');
}

// ---- the 90 posts an hour, counted here so a refused post is explained before a big upload is wasted
const sent: number[] = [];
const HOUR = 60 * 60 * 1000;

function minutesText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}
const limitMessage = (ms?: number) => `Postiz allows 90 posts an hour and that is used up. Try again in ${ms ? minutesText(ms) : 'a little while'}.`;

function checkHourly(now = Date.now()) {
  while (sent.length && now - sent[0] > HOUR) sent.shift();
  if (sent.length >= POSTS_PER_HOUR) throw new PublisherError(limitMessage(sent[0] + HOUR - now), 429);
}
/** For tests. */
export const resetPostizState = () => (sent.length = 0, uploaded.clear());

// ---- multipart, streamed so a 1 GB video is never held in memory, with the bytes sent counted for progress
function multipart(file: LocalFile, onBytes: (sent: number) => void) {
  const boundary = `----creatorclub${randomBytes(12).toString('hex')}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name.replace(/["\r\n]/g, '_')}"\r\nContent-Type: ${file.type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  async function* parts() {
    yield head;
    let done = 0;
    for await (const chunk of createReadStream(file.path) as AsyncIterable<Buffer>) {
      done += chunk.length;
      yield chunk;
      onBytes(done);
    }
    yield tail;
  }
  return { contentType: `multipart/form-data; boundary=${boundary}`, length: head.length + file.size + tail.length, body: Readable.toWeb(Readable.from(parts())) as ReadableStream };
}

interface Media {
  id: string;
  path: string;
}
// An upload that worked is kept, so Try again after a failed post sends nothing twice.
const uploaded = new Map<string, Media>();
const uploadKey = (key: string, base: string, file: LocalFile) => `${base}|${key.slice(-8)}|${file.path}|${file.size}|${file.version ?? ''}`;

export interface PostizOptions {
  apiKey: string;
  /** The person's own Postiz address. Postiz Cloud when absent. */
  address?: string | null;
  fetch?: typeof fetch;
}

export class PostizPublisher implements Publisher {
  private readonly base: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PostizOptions) {
    this.base = postizApiBase(options.address);
    this.fetcher = options.fetch ?? fetch;
  }

  private async request(path: string, init: RequestInit & { headers?: Record<string, string>; duplex?: 'half' } = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(this.base + path, { ...init, headers: { Authorization: this.options.apiKey, ...init.headers } });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new PublisherError(CANT_REACH_POSTIZ);
    }
    if (response.ok) {
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        throw new PublisherError(NOT_PROCESSED);
      }
    }
    await response.arrayBuffer().catch(() => undefined);
    if (response.status === 401 || response.status === 403) throw new PublisherError(BAD_KEY, 400);
    if (response.status === 413) throw new PublisherError(`${TOO_BIG} This one was too big for it.`);
    if (response.status === 429) throw new PublisherError(limitMessage(retryAfter(response)), 429);
    if (response.status >= 500) throw new PublisherError(POSTIZ_DOWN);
    throw new PublisherError(path.startsWith('/upload') ? NOT_PROCESSED : POST_REJECTED);
  }

  private async channels(signal?: AbortSignal): Promise<PublishChannel[]> {
    const list = await this.request('/integrations', { signal });
    if (!Array.isArray(list)) throw new PublisherError(NOT_PROCESSED);
    return list
      .filter((item): item is { id: string; name?: string; identifier?: string; disabled?: boolean } => typeof item?.id === 'string')
      .filter((item) => item.identifier === 'youtube' && !item.disabled)
      .map((item) => ({ id: item.id, name: item.name || 'YouTube channel' }));
  }

  connect(signal?: AbortSignal) {
    return this.channels(signal);
  }
  listChannels(signal?: AbortSignal) {
    return this.channels(signal);
  }

  private async upload(file: LocalFile, report: (percent: number) => void, signal?: AbortSignal): Promise<Media> {
    const cacheKey = uploadKey(this.options.apiKey, this.base, file);
    const known = uploaded.get(cacheKey);
    if (known) {
      report(100);
      return known;
    }
    const form = multipart(file, (bytes) => report(Math.min(99, Math.floor((bytes / file.size) * 100))));
    const body = (await this.request('/upload', {
      method: 'POST',
      body: form.body,
      duplex: 'half',
      signal,
      headers: { 'Content-Type': form.contentType, 'Content-Length': String(form.length) },
    })) as Partial<Media> | null;
    if (typeof body?.id !== 'string' || typeof body.path !== 'string') throw new PublisherError(NOT_PROCESSED);
    const media = { id: body.id, path: body.path };
    uploaded.set(cacheKey, media);
    report(100);
    return media;
  }

  async publish(request: PublishRequest, progress: (event: PublishProgress) => void, signal?: AbortSignal): Promise<SentPost> {
    if (request.video.size > MAX_VIDEO_BYTES) throw new PublisherError(`${TOO_BIG} This one is ${(request.video.size / 1024 ** 3).toFixed(1)} GB.`);
    checkHourly();
    let last = -1;
    const report = (percent: number) => {
      if (percent === last) return;
      last = percent;
      progress({ step: 'upload', percent, message: percent >= 100 ? 'Sent the video to Postiz' : `Sending the video to Postiz, ${percent}%` });
    };
    report(0);
    const video = await this.upload(request.video, report, signal);
    const thumbnail = request.thumbnail ? await this.upload(request.thumbnail, () => {}, signal) : undefined;
    progress({ step: 'post', message: request.scheduledFor ? 'Scheduling it in Postiz' : 'Asking Postiz to publish it' });
    const date = request.scheduledFor ?? new Date();
    const answer = await this.request('/posts', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: request.scheduledFor ? 'schedule' : 'now',
        date: date.toISOString(),
        shortLink: false,
        tags: [],
        posts: [
          {
            integration: { id: request.channelId },
            value: [{ content: request.description, image: [video] }],
            settings: {
              __type: 'youtube',
              title: request.title,
              type: request.visibility,
              selfDeclaredMadeForKids: request.madeForKids ? 'yes' : 'no',
              ...(thumbnail ? { thumbnail } : {}),
              tags: request.tags.map((tag) => ({ value: tag, label: tag })),
            },
          },
        ],
      }),
    });
    const first = Array.isArray(answer) ? answer[0] : answer;
    const postId = first?.postId ?? first?.id;
    sent.push(Date.now());
    if (typeof postId !== 'string' || !postId) throw new UnconfirmedPostError(date);
    return { postId, date, channelId: request.channelId };
  }

  async status(post: SentPost, signal?: AbortSignal): Promise<PostStatus> {
    const day = 24 * 60 * 60 * 1000;
    const query = new URLSearchParams({ startDate: new Date(post.date.getTime() - day).toISOString(), endDate: new Date(post.date.getTime() + day).toISOString() });
    const answer = (await this.request(`/posts?${query}`, { signal })) as { posts?: unknown } | unknown[] | null;
    const list = Array.isArray(answer) ? answer : Array.isArray(answer?.posts) ? answer.posts : [];
    type Item = { id: string; state?: string; releaseURL?: string; publishDate?: string; integration?: { id?: string } };
    const items = list as Item[];
    // A post whose id was never confirmed is looked for by its channel and the time it was sent for.
    const found = post.postId
      ? items.find((item) => item?.id === post.postId)
      : items.find((item) => item?.integration?.id === post.channelId && Math.abs(new Date(item.publishDate ?? 0).getTime() - post.date.getTime()) < 120_000);
    const state = String(found?.state ?? '').toUpperCase();
    const id = found && !post.postId && typeof found.id === 'string' ? { postId: found.id } : {};
    if (state === 'PUBLISHED') return { state: 'published', ...id, ...(typeof found?.releaseURL === 'string' && found.releaseURL ? { url: found.releaseURL } : {}) };
    if (state === 'ERROR') return { state: 'failed', ...id };
    return { state: 'queued', ...id };
  }
}

function retryAfter(response: Response): number | undefined {
  for (const name of ['retry-after', 'ratelimit-reset', 'x-ratelimit-reset']) {
    const seconds = Number(response.headers.get(name));
    if (Number.isFinite(seconds) && seconds > 0 && seconds < 24 * 3600) return seconds * 1000;
  }
  return undefined;
}
