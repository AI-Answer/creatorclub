import { runTool, toolEnv, type ToolOptions } from './tools.js';
import { listingArgs, parseViewLines, usualViews, viewsArgs } from './source.js';

/*
 * The view counts of a channel's last 30 uploads, for the outlier chip. yt-dlp's flat playlist lists them for free,
 * but current versions leave the view counts out, so the missing ones are read a few videos at a time.
 */

export const UPLOADS = 30;
const BATCH = 8;
const PARALLEL = 4;

export interface UploadsContext extends ToolOptions {
  ytdlp: string;
  signal?: AbortSignal;
}

interface Entry {
  id: string;
  views?: number;
}

async function listUploads(channelUrl: string, short: boolean, context: UploadsContext): Promise<Entry[]> {
  const result = await runTool(context.ytdlp, listingArgs(channelUrl, short, UPLOADS), { env: toolEnv(context), signal: context.signal });
  try {
    const data = JSON.parse(result.stdout) as { entries?: { id?: unknown; view_count?: unknown }[] };
    return (data.entries ?? [])
      .filter((entry): entry is { id: string; view_count?: unknown } => typeof entry.id === 'string' && /^[\w-]{6,20}$/.test(entry.id))
      .map((entry) => ({ id: entry.id, ...(typeof entry.view_count === 'number' ? { views: entry.view_count } : {}) }));
  } catch {
    return [];
  }
}

/** The channel's usual views (the median of its last 30 uploads), or undefined when they cannot be read. Never throws. */
export async function channelUsualViews(channelUrl: string, short: boolean, context: UploadsContext): Promise<number | undefined> {
  try {
    const entries = await listUploads(channelUrl, short, context);
    const missing = entries.filter((entry) => entry.views === undefined).map((entry) => entry.id);
    const found = new Map<string, number>();
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
        while (next < batches.length && !context.signal?.aborted) {
          const result = await runTool(context.ytdlp, viewsArgs(batches[next++]), { env: toolEnv(context), signal: context.signal, timeoutMs: 180_000 });
          for (const [id, views] of parseViewLines(result.stdout)) found.set(id, views);
        }
      }),
    );
    return usualViews(entries.map((entry) => entry.views ?? found.get(entry.id)));
  } catch (error) {
    console.error('[club] channel views failed:', error instanceof Error ? error.message : error);
    return undefined;
  }
}
