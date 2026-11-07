import type { Video } from '../../shared/club.js';
import { ClubError } from './errors.js';
import { detectSource, parseViewLines, viewsArgs } from './source.js';
import * as store from './store.js';
import { findYtDlp, runTool, toolEnv, type ToolOptions } from './tools.js';

export const NOT_A_YOUTUBE_LINK = 'Paste the YouTube link of the uploaded video.';

/** The video's id on YouTube, from any YouTube link (watch, youtu.be, shorts). Anything else is refused with one sentence. */
export function youtubeId(input: string): string {
  let ref;
  try {
    ref = detectSource(input);
  } catch {
    throw new ClubError(NOT_A_YOUTUBE_LINK);
  }
  if (ref.platform !== 'youtube') throw new ClubError(NOT_A_YOUTUBE_LINK);
  return ref.id;
}

/** Reads one YouTube video's view count. Undefined when it cannot be read. */
export type ViewsReader = (youtubeId: string) => Promise<number | undefined>;

/** yt-dlp, metadata only (`--skip-download`). Uses a yt-dlp that is already there and never downloads one for this. */
export function ytDlpViews(options: ToolOptions = {}): ViewsReader {
  return async (id) => {
    const file = await findYtDlp(options);
    if (!file) return undefined;
    const { code, stdout } = await runTool(file, viewsArgs([id]), { env: toolEnv(options), timeoutMs: 60_000 });
    return code === 0 ? parseViewLines(stdout).get(id) : undefined;
  };
}

/**
 * `Mark as published`: saves the YouTube link and the date, and moves the card to Published.
 * Marking an already published video again only updates the link; the first publish date stays.
 * The view count is then read once in the background (`viewsDone` settles when that is over); a failure leaves `views` unset.
 */
export async function publishVideo(slug: string, id: string, url: string, readViews?: ViewsReader): Promise<{ video: Video; viewsDone: Promise<void> }> {
  const youtube = youtubeId(url);
  const youtubeUrl = `https://www.youtube.com/watch?v=${youtube}`;
  const video = await store.workspaceLock(slug, () => store.videoLock(slug, id, async () => {
    const current = await store.readVideo(slug, id);
    const publishedAt = current.stage === 'published' && current.publishedAt ? current.publishedAt : new Date().toISOString();
    await store.updateVideo(slug, id, { youtubeUrl, ...(current.youtubeUrl !== youtubeUrl ? { views: null, viewsCheckedAt: null } : {}) });
    await store.moveVideo(slug, id, 'published', { expectedStages: [current.stage] });
    return store.updateVideo(slug, id, { publishedAt });
  }));
  const viewsDone = readViews
    ? (async () => {
        try {
          const views = await readViews(youtube);
          if (views === undefined) return;
          const latest = await store.readVideo(slug, id);
          if (latest.youtubeUrl !== youtubeUrl) return;
          await store.updateVideo(slug, id, { views, viewsCheckedAt: new Date().toISOString() });
        } catch {
          // Views are a nice-to-have: they stay unset.
        }
      })()
    : Promise.resolve();
  return { video, viewsDone };
}
