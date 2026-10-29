import path from 'node:path';
import type { SignalEntry, SignalItem, SignalMedia, SignalsConfig, SignalsRefreshResult, SignalsResponse, Workspace } from '../../shared/club.js';
import { ClubError } from './errors.js';
import { startJobOnce, type JobContext } from './jobs.js';
import { reasonFor, signalText } from './relevance.js';
import * as store from './store.js';
import { findTreg, runTool, toolEnv, type ToolOptions } from './tools.js';

/*
 * Signals: what people post on X and Reddit about the channel's space. Real posts with their real numbers; nothing is scored by a model.
 * Reddit is read through its public JSON listing. X is read through the treg command line tool when it is installed.
 * Files, in the channel folder, keep the shapes of the old board's: `signals.json` ({updatedAt, items, errors}) and `signals-config.json`.
 */

export const DEFAULTS = { maxAgeDays: 7, minXLikes: 500, minRedditScore: 50, maxPerSource: 10 };
export const X_NEEDS_TREG = 'X posts refresh when treg is connected.';
export const REDDIT_USER_AGENT = 'macos:creatorclub:1.0 (local desktop app that reads public posts for the person using it)';

const signalsFile = (slug: string) => path.join(store.workspaceDir(slug), 'signals.json');
const configFile = (slug: string) => path.join(store.workspaceDir(slug), 'signals-config.json');

interface SignalsFile {
  updatedAt: string | null;
  items: SignalItem[];
  errors: string[];
}

// ---------------------------------------------------------------- files

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined);

/** `signals-config.json`, with anything unusable left out. The three source lists are always there, empty when nothing is set. */
export async function readSignalsConfig(slug: string): Promise<SignalsConfig> {
  const read = await store.readJSON<Record<string, unknown>>(configFile(slug));
  const raw = read && typeof read === 'object' ? read : {};
  const config: SignalsConfig = { x: strings(raw.x), xTopics: strings(raw.xTopics), reddit: strings(raw.reddit) };
  for (const key of ['minXLikes', 'maxAgeDays', 'minRedditScore', 'maxPerSource'] as const) {
    const value = count(raw[key]);
    if (value !== undefined) config[key] = value;
  }
  return config;
}

export const writeSignalsConfig = (slug: string, config: SignalsConfig) => store.writeJSON(configFile(slug), config);

const isItem = (value: unknown): value is SignalItem => {
  const s = value as SignalItem | null;
  return !!s && typeof s === 'object' && typeof s.id === 'string' && (s.source === 'x' || s.source === 'reddit') && typeof s.text === 'string' && typeof s.createdAt === 'string';
};

async function readFile(slug: string): Promise<SignalsFile> {
  const raw = await store.readJSON<{ updatedAt?: unknown; items?: unknown; errors?: unknown }>(signalsFile(slug));
  return {
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
    items: Array.isArray(raw?.items) ? raw.items.filter(isItem) : [],
    errors: strings(raw?.errors),
  };
}

export async function readSignal(slug: string, id: string): Promise<SignalItem | undefined> {
  return (await readFile(slug)).items.find((item) => item.id === id);
}

/** How a post ranks: likes and replies, softened by age. The same measure the old board sorted by. */
const score = (item: SignalItem) => (item.likes + 3 * item.replies) / Math.sqrt(Math.max(item.ageHours, 6));

/** Signals for a channel, ranked for it: posts that match its topics or audience first (each with its reason), the rest with `fit: false`. */
export async function rankedSignals(slug: string, workspace: Pick<Workspace, 'topics' | 'audience'>): Promise<SignalsResponse> {
  const file = await readFile(slug);
  const entries: SignalEntry[] = file.items.map((item) => {
    const reason = reasonFor(signalText(item), workspace.topics, workspace.audience);
    return { ...item, fit: reason !== null, reason };
  });
  entries.sort((a, b) => Number(b.fit) - Number(a.fit) || score(b) - score(a));
  return { items: entries, updatedAt: file.updatedAt, errors: file.errors };
}

// ---------------------------------------------------------------- reading posts

type Raw = Record<string, unknown>;
const rec = (value: unknown): Raw => (value && typeof value === 'object' ? (value as Raw) : {});
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const numOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const clean = (text: unknown) => str(text).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
const ageHours = (seconds: number, nowMs: number) => Math.round(((nowMs / 1000 - seconds) / 3600) * 10) / 10;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x200B;': '' };
/** Reddit's listing escapes a few characters in titles. */
const unescapeHtml = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39|#x200B);/g, (match) => ENTITIES[match]);

/** One Reddit post as listed by `/r/<sub>/top.json`, or undefined when it is too old, too quiet or not for all ages. */
export function redditItem(post: Raw, sub: string, limits: { maxAgeDays: number; minRedditScore: number }, nowMs: number): SignalItem | undefined {
  const created = num(post.created_utc);
  const id = str(post.id);
  if (!created || !id || post.over_18 === true || ageHours(created, nowMs) > limits.maxAgeDays * 24 || num(post.score) < limits.minRedditScore) return undefined;
  const media: SignalMedia | null =
    post.post_hint === 'image' && str(post.url) ? { type: 'image', url: str(post.url) } : post.is_video === true ? { type: 'video', url: null } : null;
  return {
    id: `r-${id}`,
    source: 'reddit',
    author: `r/${str(post.subreddit) || sub}`,
    handle: str(post.author),
    text: unescapeHtml(clean(post.title)).slice(0, 300),
    flair: typeof post.link_flair_text === 'string' ? post.link_flair_text : null,
    media,
    url: `https://www.reddit.com${str(post.permalink)}`,
    likes: num(post.score),
    replies: num(post.num_comments),
    createdAt: iso(created),
    ageHours: ageHours(created, nowMs),
  };
}

const SUBREDDIT = /^[A-Za-z0-9_]{2,21}$/;

async function redditItems(sub: string, limits: { maxAgeDays: number; minRedditScore: number }, doFetch: typeof fetch, signal: AbortSignal, nowMs: number): Promise<SignalItem[] | null> {
  if (!SUBREDDIT.test(sub)) return null;
  try {
    const response = await doFetch(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=25`, {
      headers: { 'User-Agent': REDDIT_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    if (!response.ok) return null;
    const children = rec(rec(await response.json()).data).children;
    if (!Array.isArray(children)) return null;
    return children.flatMap((child) => redditItem(rec(rec(child).data), sub, limits, nowMs) ?? []);
  } catch {
    return null;
  }
}

/** Calls an endpoint of the treg command line tool. Null when it fails or answers with an error. */
export type TregCall = (endpoint: string, payload?: unknown, query?: string[], signal?: AbortSignal) => Promise<Raw | null>;

/** The treg command line tool, found like the other helper programs. Undefined when it is not installed. */
export type TregFinder = () => Promise<TregCall | undefined>;

/** treg's own settings (TREG_*) and the certificate settings of a company network go through; the app's other variables do not. */
const TREG_ENV = /^(TREG_[A-Z0-9_]*|SSL_CERT_FILE|NODE_EXTRA_CA_CERTS)$/;
export const tregEnv = (options: ToolOptions): NodeJS.ProcessEnv => ({
  ...toolEnv(options),
  ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => TREG_ENV.test(key) && value !== undefined)),
});

export const findTregCall = (options: ToolOptions): TregFinder => async () => {
  const file = await findTreg(options);
  if (!file) return undefined;
  return async (endpoint, payload, query = [], signal) => {
    const args = ['call', endpoint, '--header', 'X-Treg-Route-Max-Cost: 0.01'];
    if (payload !== undefined) args.push('--method', 'POST', '--data', JSON.stringify(payload));
    for (const q of query) args.push('--query', q);
    const result = await runTool(file, args, { env: tregEnv(options), signal, timeoutMs: 90_000 });
    try {
      const out = JSON.parse(result.stdout) as unknown;
      return out && typeof out === 'object' && !Array.isArray(out) && !(out as Raw).error ? (out as Raw) : null;
    } catch {
      return null;
    }
  };
};

function xMedia(media: unknown): SignalMedia | null {
  for (const item of Array.isArray(media) ? media : []) {
    const m = rec(item);
    if (str(m.url)) return { type: m.type === 'video' ? 'video' : 'image', url: str(m.url), w: numOrNull(m.width), h: numOrNull(m.height) };
  }
  return null;
}

/** An account's recent posts (replies left out). Null when treg could not answer. */
async function xAccountItems(handle: string, maxAgeDays: number, treg: TregCall, signal: AbortSignal, nowMs: number): Promise<SignalItem[] | null> {
  const tweets = rec(rec(rec(await treg('anyapi.x.user.posts', { handle }, [], signal))?.output).data).tweets;
  if (!Array.isArray(tweets)) return null;
  return tweets.flatMap((row) => {
    const t = rec(row);
    const created = num(t.createdUtc);
    const text = clean(t.text);
    if (!created || t.isReply === true || !text || ageHours(created, nowMs) > maxAgeDays * 24) return [];
    return [{
      id: `x-${str(t.id)}`,
      source: 'x' as const,
      author: str(t.authorName) || handle,
      handle: str(t.authorHandle) || handle,
      text: text.slice(0, 400),
      url: str(t.url) || `https://x.com/${handle}/status/${str(t.id)}`,
      likes: num(t.likes),
      replies: num(t.replies),
      shares: num(t.retweets),
      views: numOrNull(t.views),
      media: xMedia(t.media),
      createdAt: iso(created),
      ageHours: ageHours(created, nowMs),
    }];
  });
}

/** The top posts for an X search. Null when treg could not answer. */
async function xTopicItems(topic: string, maxAgeDays: number, minLikes: number, treg: TregCall, signal: AbortSignal, nowMs: number): Promise<SignalItem[] | null> {
  const since = new Date(nowMs - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  const query = `${topic} min_faves:${minLikes} since:${since} -filter:replies lang:en`;
  const rows = rec(rec(rec(await treg('anyapi.x.search.posts', { query, queryType: 'Top', limit: 20 }, [], signal))?.output).data).items;
  if (!Array.isArray(rows)) return null;
  return rows.flatMap((row) => {
    const t = rec(row);
    const created = num(t.createdUtc);
    const text = clean(t.text);
    if (!created || t.isReply === true || !text) return [];
    return [{
      id: `x-${str(t.id)}`,
      source: 'x' as const,
      author: str(t.authorName) || str(t.authorUsername),
      handle: str(t.authorUsername),
      text: text.slice(0, 400),
      flair: topic.replace(/^"|"$/g, ''),
      url: str(t.url) || `https://x.com/i/web/status/${str(t.id)}`,
      likes: num(t.likeCount),
      replies: num(t.replyCount),
      shares: num(t.retweetCount),
      views: numOrNull(t.viewCount),
      media: xMedia(t.media),
      createdAt: iso(created),
      ageHours: ageHours(created, nowMs),
    }];
  });
}

// ---------------------------------------------------------------- refreshing

export interface SignalsSources {
  /** Defaults to the global fetch. Tests pass a stand-in. */
  fetch?: typeof fetch;
  /** Finds treg. Defaults to looking for the command line tool. */
  treg: TregFinder;
}

export const hasSources = (config: SignalsConfig) => !!(config.x?.length || config.xTopics?.length || config.reddit?.length);
export const NO_SOURCES = 'Add a subreddit or an X account first.';

/**
 * Reads every source in `signals-config.json` and writes `signals.json`. A source that cannot be read keeps its earlier posts
 * (until they are older than the limit) and is listed in `errors`. Without treg, the stored X posts stay as they are.
 */
export async function refreshSignals(slug: string, context: JobContext, sources: SignalsSources, nowMs = Date.now()): Promise<SignalsRefreshResult> {
  const config = await readSignalsConfig(slug);
  if (!hasSources(config)) throw new ClubError(NO_SOURCES, 409);
  const limits = {
    maxAgeDays: config.maxAgeDays ?? DEFAULTS.maxAgeDays,
    minRedditScore: config.minRedditScore ?? DEFAULTS.minRedditScore,
  };
  const minXLikes = config.minXLikes ?? DEFAULTS.minXLikes;
  const perSource = config.maxPerSource ?? DEFAULTS.maxPerSource;
  const say = (message: string) => context.emit({ message });
  const stored = (await readFile(slug)).items.map((item) => ({ ...item, ageHours: ageHours(Date.parse(item.createdAt) / 1000, nowMs) }));
  const known = new Set(stored.map((item) => item.id));
  const withinLimit = (item: SignalItem) => item.ageHours <= limits.maxAgeDays * 24;
  const doFetch = sources.fetch ?? fetch;
  const treg = config.x?.length || config.xTopics?.length ? await sources.treg() : undefined;

  const items: SignalItem[] = [];
  const errors: string[] = [];
  let note: string | undefined;
  const check = () => {
    if (context.signal.aborted) throw new ClubError('That was stopped.');
  };
  /** A source that failed: its earlier posts stay. */
  const keep = (error: string, belongs: (item: SignalItem) => boolean) => {
    errors.push(error);
    items.push(...stored.filter((item) => belongs(item) && withinLimit(item)));
  };

  for (const sub of config.reddit ?? []) {
    check();
    say(`Reading r/${sub}…`);
    const got = await redditItems(sub, limits, doFetch, context.signal, nowMs);
    if (got) items.push(...got);
    else keep(`r/${sub}`, (item) => item.source === 'reddit' && item.author.toLowerCase() === `r/${sub}`.toLowerCase());
  }
  if (treg) {
    for (const handle of config.x ?? []) {
      check();
      say(`Reading @${handle}…`);
      const got = await xAccountItems(handle, limits.maxAgeDays, treg, context.signal, nowMs).catch(() => null);
      if (got) items.push(...got);
      else keep(`X @${handle}`, (item) => item.source === 'x' && !item.flair && item.handle.toLowerCase() === handle.toLowerCase());
    }
    for (const topic of config.xTopics ?? []) {
      check();
      say(`Searching X for ${topic.replace(/^"|"$/g, '')}…`);
      const got = await xTopicItems(topic, limits.maxAgeDays, minXLikes, treg, context.signal, nowMs).catch(() => null);
      if (got) items.push(...got);
      else keep(`X search ${topic}`, (item) => item.source === 'x' && item.flair === topic.replace(/^"|"$/g, ''));
    }
  } else if (config.x?.length || config.xTopics?.length) {
    items.push(...stored.filter((item) => item.source === 'x'));
    note = X_NEEDS_TREG;
  }
  check();

  const seen = new Set<string>();
  const unique = items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
  unique.sort((a, b) => score(b) - score(a));
  const perKey = new Map<string, number>();
  const kept = unique.filter((item) => {
    const key = item.source === 'reddit' ? item.author : 'x';
    const used = (perKey.get(key) ?? 0) + 1;
    perKey.set(key, used);
    return used <= perSource * (key === 'x' ? 3 : 1);
  });
  const file: SignalsFile = { updatedAt: new Date(nowMs).toISOString(), items: kept, errors };
  await store.writeJSON(signalsFile(slug), file);
  return { posts: kept.length, added: kept.filter((item) => !known.has(item.id)).length, errors, ...(note ? { note } : {}) };
}

/** Starts the refresh job. A second start while one runs gets the running one. */
export const startSignalsRefresh = (slug: string, sources: SignalsSources) =>
  startJobOnce(`signals:${store.workspaceDir(slug)}`, 'signals-refresh', (context) => refreshSignals(slug, context, sources));
