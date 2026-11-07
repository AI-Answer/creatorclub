import { promises as fs } from 'node:fs';
import path from 'node:path';
import { thumbnailPrompt } from '../../shared/higgsfield.js';
import { AiError, providerStatus, runAI, type RunAIOptions } from './ai.js';
import { ClubError } from './errors.js';
import type { JobContext } from './jobs.js';
import { readOnePager } from './planning.js';
import { imageKind, setThumbnail } from './publisher-routes.js';
import * as store from './store.js';
import { listReferences, referenceFile, referenceRoles, type ThumbnailReference } from './thumbnail-references.js';

/*
 * The sketch's thumbnail, made with the creator's own ChatGPT account: Codex (signed in with ChatGPT) draws it with its image tool from
 * the sketch's idea (what it shows, the words on it) and the title, in a folder of this video; the picture becomes the video's
 * thumbnail, the one Publish uses. Each picture made stays in that folder.
 */

/** Where the pictures ChatGPT made for a video are kept, one folder per picture. */
export const MADE_THUMBNAILS = 'thumbnails-chatgpt';
const FILE = 'thumbnail.png';

export function chatgptThumbnailPrompt(title: string, headline: string, sketch: { visual?: string; closer?: string }, refs: readonly Pick<ThumbnailReference, 'kind' | 'title'>[] = []): string {
  return [
    thumbnailPrompt(title, headline, sketch),
    'Make it look like a top YouTube thumbnail in this niche: a real photo look, one big clear subject, strong contrast, bold readable text. No plain shapes, no flat clip art, no empty boxes.',
    referenceRoles(refs),
    `Make this picture with your image generation tool, in 16:9 (1920×1080), and save it as ${FILE} in the current folder.`,
    'Do nothing else: no other files, no commands beyond saving and sizing that one picture.',
  ].join('\n');
}

export interface MakeDeps { run: (o: RunAIOptions) => ReturnType<typeof runAI>; signedIn: () => Promise<boolean> }
const DEPS: MakeDeps = { run: runAI, signedIn: () => providerStatus('codex').then((s) => s.signedIn) };

export async function makeThumbnailWithChatGPT(slug: string, id: string, context: JobContext, deps: MakeDeps = DEPS, chosen?: readonly string[]): Promise<{ made: string }> {
  const video = await store.readVideo(slug, id);
  const sketch = await readOnePager(slug, id);
  if (!sketch || !(sketch.thumbnail.visual.trim() || sketch.thumbnail.headline.trim())) throw new ClubError('Write what the thumbnail shows first, or pick a thumbnail idea.');
  if (!(await deps.signedIn())) throw new ClubError('Connect ChatGPT in Settings to make the picture with it.');
  const dir = path.join(store.videoDir(slug, id), MADE_THUMBNAILS, new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(dir, { recursive: true });
  // The references the creator picked (or the default ones), as files: the face first, as the subject.
  const all = await listReferences(slug, id).catch(() => [] as ThumbnailReference[]);
  const picked = all.filter((r) => (chosen ? chosen.includes(r.id) : r.selected)).sort((a, b) => Number(b.kind === 'face') - Number(a.kind === 'face')).slice(0, 6);
  const used: { ref: ThumbnailReference; file: string }[] = [];
  for (const ref of picked) {
    const file = await referenceFile(slug, id, ref.id).catch(() => undefined);
    if (file) used.push({ ref, file });
  }
  context.emit({ label: 'ChatGPT is drawing your thumbnail' });
  await store.writeJSON(path.join(dir, 'status.json'), { status: 'running' });
  try {
  await deps.run({
    provider: 'codex',
    prompt: chatgptThumbnailPrompt(video.title, sketch.thumbnail.headline, { visual: sketch.thumbnail.visual, closer: sketch.thumbnail.closer }, used.map((u) => u.ref)),
    images: used.map((u) => u.file),
    budgetUsd: 1,
    agent: { cwd: dir, dirs: [dir], tools: [] },
    writable: true,
    timeoutMs: 6 * 60_000,
    signal: context.signal,
  });
  const bytes = await fs.readFile(path.join(dir, FILE)).catch(() => undefined);
  if (!bytes || !imageKind(bytes)) throw new AiError('bad-answer', "ChatGPT didn't make a picture this time. Try again.");
  await setThumbnail(slug, id, bytes);
  await store.writeJSON(path.join(dir, 'status.json'), { status: 'done' });
  } catch (error) {
    await store.writeJSON(path.join(dir, 'status.json'), { status: 'failed' });
    throw error;
  }
  return { made: path.relative(store.videoDir(slug, id), path.join(dir, FILE)) };
}
