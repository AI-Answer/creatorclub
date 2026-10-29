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

/** The idea already made from this source and still on the Ideas list or the Later list, so a second click does not add a copy. */
async function existingIdea(slug: string, url: string): Promise<Video | undefined> {
  return (await store.listVideos(slug)).find((video) => video.hidden !== 'skipped' && video.idea?.sources?.some((source) => source.url === url));
}

export interface IdeaResult {
  video: Video;
  /** False when the source was already an idea and nothing was added. */
  created: boolean;
}

/** An idea from a Signals post. Its notes keep the post text and the post as the source. */
export async function ideaFromSignal(slug: string, id: string): Promise<IdeaResult> {
  const post = await readSignal(slug, id);
  if (!post) throw notFound('post');
  const existing = await existingIdea(slug, post.url);
  if (existing) return { video: existing, created: false };
  const who = post.source === 'reddit' ? post.author : `@${post.handle}`;
  const title = titleFromPost(post.text) || who;
  const video = await store.createVideo(slug, {
    title,
    stage: 'ideas',
    source: { kind: 'manual' },
    idea: { sources: [{ label: `${title} (${who})`, url: post.url }], note: post.text },
  });
  return { video, created: true };
}

/** An idea from a Working now video. Its notes keep the video's title, and the video as the source. */
export async function ideaFromTrending(slug: string, videoId: string): Promise<IdeaResult> {
  const item = await readTrendingItem(slug, videoId);
  if (!item) throw notFound('video');
  const url = `https://www.youtube.com/watch?v=${item.videoId}`;
  const existing = await existingIdea(slug, url);
  if (existing) return { video: existing, created: false };
  const video = await store.createVideo(slug, {
    title: item.title,
    stage: 'ideas',
    source: { kind: 'manual' },
    idea: { sources: [{ label: `${item.title} (${item.channel})`, url }], note: item.title },
  });
  return { video, created: true };
}
