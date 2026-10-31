import type { Video } from '../../shared/club.js';
import { notFound } from './errors.js';
import { readSignal } from './signals.js';
import * as store from './store.js';
import { readTrendingItem } from './trending.js';

/* "Turn into idea": a post from Signals or a video from Working now becomes an idea, with where it came from kept on the card. */

const TITLE_LENGTH = 80;

/** The first line of a post, cut at a word boundary, to name an idea after it. */
export function titleFromPost(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= TITLE_LENGTH) return flat;
  const cut = flat.slice(0, TITLE_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : TITLE_LENGTH).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/** Finds the idea already made from this source and still on the Ideas list or the Later list, so a second click does not add a copy. */
const madeFrom = (url: string) => (videos: Video[]) => videos.find((video) => video.hidden !== 'skipped' && video.idea?.sources?.some((source) => source.url === url));

export interface IdeaResult {
  video: Video;
  /** False when the source was already an idea and nothing was added. */
  created: boolean;
}

type Post = NonNullable<Awaited<ReturnType<typeof readSignal>>>;
type TrendingItem = NonNullable<Awaited<ReturnType<typeof readTrendingItem>>>;

/** The tile a Signals post makes on a Board: its text, its link and its numbers. */
export function signalTile(post: Post): store.NewTile {
  const who = post.source === 'reddit' ? post.author : `@${post.handle}`;
  const meta = { source: post.source, author: who, likes: post.likes, replies: post.replies, ...(typeof post.views === 'number' ? { views: post.views } : {}) };
  return { kind: 'signal', url: post.url, text: post.text, meta };
}

/** The tile a Working now video makes on a Board, with the numbers Working now had for it. */
export function trendingTile(item: TrendingItem): store.NewTile & { url: string } {
  const meta = {
    platform: 'youtube' as const,
    channel: item.channel,
    views: item.views,
    ageDays: item.ageDays,
    thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
    ...(item.likes !== null ? { likes: item.likes } : {}),
    ...(item.comments !== null ? { comments: item.comments } : {}),
    ...(item.mult !== null ? { multiplier: item.mult } : {}),
  };
  return { kind: 'video', url: `https://www.youtube.com/watch?v=${item.videoId}`, title: item.title, meta };
}

/** An idea from a Signals post. Its notes keep the post text and the post as the source. */
export async function ideaFromSignal(slug: string, id: string): Promise<IdeaResult> {
  const post = await readSignal(slug, id);
  if (!post) throw notFound('post');
  const who = post.source === 'reddit' ? post.author : `@${post.handle}`;
  const title = titleFromPost(post.text) || who;
  const result = await store.createVideoUnless(
    slug,
    { title, stage: 'ideas', source: { kind: 'manual' }, idea: { sources: [{ label: `${title} (${who})`, url: post.url }], note: post.text } },
    madeFrom(post.url),
  );
  // The video's Board starts with the post.
  if (result.created) await store.addTile(slug, result.video.id, signalTile(post));
  return result;
}

/** An idea from a Working now video. Its notes keep the video's title, and the video as the source. */
export async function ideaFromTrending(slug: string, videoId: string): Promise<IdeaResult> {
  const item = await readTrendingItem(slug, videoId);
  if (!item) throw notFound('video');
  const url = `https://www.youtube.com/watch?v=${item.videoId}`;
  const result = await store.createVideoUnless(
    slug,
    { title: item.title, stage: 'ideas', source: { kind: 'manual' }, idea: { sources: [{ label: `${item.title} (${item.channel})`, url }], note: item.title } },
    madeFrom(url),
  );
  // The video's Board starts with the video, with the numbers Working now had for it.
  if (result.created) await store.addTile(slug, result.video.id, trendingTile(item));
  return result;
}
