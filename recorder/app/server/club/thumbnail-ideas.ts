import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { emptyOnePager } from '../../src/club/idea/onepager.js';
import { MADE_THUMBNAILS, chatgptThumbnailPrompt, type MakeDeps } from './chatgpt-thumbnail.js';
import { providerStatus, runAI } from './ai.js';
import { ClubError } from './errors.js';
import type { JobContext } from './jobs.js';
import { asker, planLock, readOnePager, saveOnePager, type PlanOptions } from './planning.js';
import { imageKind, setThumbnail } from './publisher-routes.js';
import * as store from './store.js';
import { listReferences, referenceFile, type ThumbnailReference } from './thumbnail-references.js';

/*
 * Thumbnail ideas you can see before you pick: the connected AI writes three concepts (in the creator's words, around their face and the
 * video's real content, in the style of the thumbnails that work in their niche), then the creator's ChatGPT draws a quick preview of
 * each from the same pictures, all three at once. The sketch shows each concept as it arrives and its preview as it is drawn; picking
 * one puts its words on the sketch and its picture as the thumbnail.
 */

export const ideaShape = z.object({
  name: z.string().min(1).max(40),
  headline: z.string().max(40),
  composition: z.string().min(1).max(400),
  emotion: z.string().max(120),
  palette: z.string().max(200),
  stopper: z.enum(['face', 'numbers', 'emotion', 'color']),
}).strict();
export type ThumbnailIdea = z.infer<typeof ideaShape>;
const answerShape = z.object({ ideas: z.array(ideaShape).length(3) }).strict();
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ideas'],
  properties: { ideas: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['name', 'headline', 'composition', 'emotion', 'palette', 'stopper'],
    properties: { name: { type: 'string' }, headline: { type: 'string' }, composition: { type: 'string' }, emotion: { type: 'string' }, palette: { type: 'string' }, stopper: { type: 'string', enum: ['face', 'numbers', 'emotion', 'color'] } } } } },
};
const IDEAS = 'thumbnail-ideas';
const RUN = /^[0-9TZ-]{10,40}$/;
const runDir = (slug: string, id: string, run: string) => path.join(store.videoDir(slug, id), IDEAS, run);
/** What the sketch keeps of an idea: its words on the thumbnail and what it shows. */
export const ideaVisual = (idea: ThumbnailIdea) => [idea.composition, idea.emotion && `Emotion: ${idea.emotion}.`, idea.palette && `Palette: ${idea.palette}.`].filter(Boolean).join(' ');

export function ideasPrompt(o: { title: string; logline: string; points: string[]; refs: readonly Pick<ThumbnailReference, 'kind' | 'title' | 'views'>[] }) {
  const face = o.refs.some((r) => r.kind === 'face'), styles = o.refs.filter((r) => r.kind === 'board' || r.kind === 'trending');
  return {
    system: 'You design YouTube thumbnails that get clicked. Answer only with the JSON asked for.',
    prompt: [
      'Suggest three thumbnail concepts: composition, emotion, three-word text max, color palette.',
      `The title is: "${o.title.trim()}". Make the title and thumbnail tell ONE idea together: the title makes them interested; the thumbnail adds intrigue.`,
      "Don't repeat the title in the thumbnail text. One main subject per thumbnail: it has to stand out in a feed and make sense at phone size in 2 seconds.",
      'For each concept, say which scroll stopper it uses: a face, money or big numbers (numbers), emotion, or bright color (color).',
      o.logline.trim() ? `The video: ${o.logline.trim()}` : '',
      o.points.length ? `What happens in it: ${o.points.join(' ')}` : '',
      face ? 'The picture is made from a real photo of the creator: build at least two concepts around their face (their expression, what they are doing or holding).' : '',
      styles.length ? `Match the style of these thumbnails that do well in this niche: ${styles.map((r) => `"${r.title}"${r.views ? ` (${r.views} views)` : ''}`).join('; ')}.` : '',
      'Use concrete things from this video (the real tools, screens, results). Never abstract shapes, plain cards or empty boxes.',
      'Everything on the thumbnail must be true to this video: only numbers, times, results and claims the title, the line or the points above state. Never invent a number, a before and after, a time saved or a result. When the video gives no number, use no number.',
      "The words say the video's promise or its open question in the creator's terms, so a viewer knows what they get.",
      'name is 2 to 3 words for the concept; headline is the words on the thumbnail (up to three words, or empty); composition says what is where in one or two sentences.',
    ].filter(Boolean).join('\n'),
    schema: SCHEMA,
  };
}

export interface IdeasDeps { plan?: PlanOptions; draw?: MakeDeps['run']; signedIn?: () => Promise<boolean> }

export async function thumbnailIdeas(slug: string, id: string, context: JobContext, chosen?: readonly string[], deps: IdeasDeps = {}): Promise<{ run: string; ideas: ThumbnailIdea[]; previews: (string | null)[] }> {
  const video = await store.readVideo(slug, id);
  const sketch = (await readOnePager(slug, id)) ?? emptyOnePager();
  const all = await listReferences(slug, id).catch(() => [] as ThumbnailReference[]);
  const picked = all.filter((r) => (chosen ? chosen.includes(r.id) : r.selected)).sort((a, b) => Number(b.kind === 'face') - Number(a.kind === 'face')).slice(0, 6);
  const run = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = runDir(slug, id, run);
  await fs.mkdir(dir, { recursive: true });
  context.emit({ run, phase: 'ideas' });
  const ai = await asker(context, deps.plan ?? {});
  const answer = answerShape.safeParse((await ai.ask(ideasPrompt({ title: video.title, logline: sketch.logline, points: sketch.skeleton.map((b) => b.line).filter((l) => l.trim()), refs: picked }), 1)).json);
  if (!answer.success) throw new ClubError(`${ai.who} didn't send three thumbnail ideas. Try again.`);
  const ideas = answer.data.ideas;
  await store.writeJSON(path.join(dir, 'ideas.json'), ideas);
  context.emit({ run, phase: 'ideas', ideas });
  const previews: (string | null)[] = [null, null, null];
  if (!(await (deps.signedIn ?? (() => providerStatus('codex').then((s) => s.signedIn)))())) return { run, ideas, previews };
  // A quick preview of each, all three at once, from the same pictures; each shows as soon as it is drawn.
  const files: { ref: ThumbnailReference; file: string }[] = [];
  for (const ref of picked) {
    const file = await referenceFile(slug, id, ref.id).catch(() => undefined);
    if (file) files.push({ ref, file });
  }
  await Promise.all(ideas.map(async (idea, n) => {
    const cwd = path.join(dir, String(n));
    await fs.mkdir(cwd, { recursive: true });
    const prompt = `${chatgptThumbnailPrompt(video.title, idea.headline, { visual: ideaVisual(idea) }, files.map((f) => f.ref))}\nThis is a quick preview to choose between ideas: favour speed (a low-quality draft is fine).`;
    await (deps.draw ?? runAI)({ provider: 'codex', prompt, images: files.map((f) => f.file), budgetUsd: 1, agent: { cwd, dirs: [cwd], tools: [] }, writable: true, timeoutMs: 6 * 60_000, signal: context.signal }).catch(() => undefined);
    const bytes = await fs.readFile(path.join(cwd, 'thumbnail.png')).catch(() => undefined);
    if (!bytes || !imageKind(bytes)) {
      await store.writeJSON(path.join(cwd, 'status.json'), { status: 'failed' });
      context.emit({ run, phase: 'previews', preview: n, status: 'failed' });
      return;
    }
    await store.writeJSON(path.join(cwd, 'status.json'), { status: 'done' });
    previews[n] = `${n}`;
    context.emit({ run, phase: 'previews', preview: n });
  }));
  return { run, ideas, previews };
}

export async function ideaPreview(slug: string, id: string, run: string, n: number): Promise<string> {
  if (!RUN.test(run) || !(n >= 0 && n < 3)) throw new ClubError('There is no such preview.', 404);
  const file = path.join(runDir(slug, id, run), String(n), 'thumbnail.png');
  if (!(await fs.stat(file).then(() => true, () => false))) {
    const state = await store.readJSON<{ status: string }>(path.join(path.dirname(file), 'status.json'));
    throw new ClubError(state?.status === 'failed' ? 'That preview failed. Try making the ideas again.' : 'That preview is not drawn yet.', state?.status === 'failed' ? 409 : 404);
  }
  return file;
}

/** Picking an idea: its words and what it shows go on the sketch, and its preview, when there is one, becomes the thumbnail. */
export async function useIdea(slug: string, id: string, run: string, n: number): Promise<{ picture: boolean }> {
  if (!RUN.test(run) || !(n >= 0 && n < 3)) throw new ClubError('There is no such idea.', 404);
  const ideas = z.array(ideaShape).safeParse(await store.readJSON<unknown>(path.join(runDir(slug, id, run), 'ideas.json')));
  const idea = ideas.success ? ideas.data[n] : undefined;
  if (!idea) throw new ClubError('There is no such idea.', 404);
  await planLock(slug, id, async () => {
    const sketch = (await readOnePager(slug, id)) ?? emptyOnePager();
    await saveOnePager(slug, id, { ...sketch, thumbnail: { ...sketch.thumbnail, headline: idea.headline, visual: ideaVisual(idea) } });
  });
  const preview = await ideaPreview(slug, id, run, n).catch(() => undefined);
  if (preview) {
    // The chosen picture is kept with the others ChatGPT made for this video, and becomes the thumbnail.
    const keep = path.join(store.videoDir(slug, id), MADE_THUMBNAILS, `${run}-${n}`);
    await fs.mkdir(keep, { recursive: true });
    await fs.copyFile(preview, path.join(keep, 'thumbnail.png'));
    await setThumbnail(slug, id, await fs.readFile(preview));
  }
  return { picture: !!preview };
}
