import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LookStage } from '../../shared/look.js';
import { AiError, findExecutable } from './ai.js';

/*
 * Screenplay on the timeline. The screenplay skill plans a video's graphics (scenes anchored to the spoken words, in its panel look);
 * instead of rendering the finished video, the app renders those graphics once over a see-through background and places them on the
 * creator's own timeline, one block per scene, beside the creator's own cut and camera tile. The creator keeps the timeline: each
 * block can be moved, trimmed or deleted, and all of it undone at once.
 */

const execFileAsync = promisify(execFile);

/** Screenplay's house tile (its theme's TILE, at 1920×1080): 353.9 wide, 620.7 high, 36.6 from the right edge, corners 19.2. */
export const SCREENPLAY_STAGE: LookStage = { background: '#121212', side: 'right', size: 353.9 / 1920, aspect: 620.7 / 353.9, margin: 36.6 / 1920, radius: 19.2 / 1920 };

/** A scene's blur or fade dissolve starts this long before the scene (screenplay's `motion.sceneBlur`). */
const SCENE_BLUR_MS = 330;

/** A stage stretch shorter than this stays on the face: the app does not set one. */
const MIN_STAGE = 0.6;

interface Scene {
  id: string;
  kind: string;
  from: number;
  duration: number;
  transitionIn?: string;
  app?: string;
  elements?: unknown[];
}
export interface ScreenplayTimeline {
  fps: number;
  durationInFrames: number;
  scenes: Scene[];
  webcam?: { frame: number; mode: string }[];
}
export interface Aroll {
  segments?: { srcStart: number; srcEnd?: number; outStart: number }[];
}

/** The screenplay checkout a skill folder belongs to (`<repo>/plugins/screenplay/skills/<skill>`), found by its CLI. */
export async function screenplayRoot(skillDir: string): Promise<string | undefined> {
  let dir = await fs.realpath(skillDir).catch(() => '');
  for (let up = 0; dir && up < 6; up++, dir = path.dirname(dir)) {
    if (await fs.stat(path.join(dir, 'cli', 'screenplay.ts')).then((s) => s.isFile(), () => false)) return dir;
  }
  return undefined;
}

/** A Node that runs TypeScript as is (22.18 and later, or 23.6 and later), as screenplay's CLI needs. Apps opened from the Dock get no nvm. */
async function modernNode(): Promise<string | undefined> {
  const nvm = path.join(os.homedir(), '.nvm', 'versions', 'node');
  const versions = (await fs.readdir(nvm).catch(() => [] as string[])).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const found = await findExecutable('node');
  for (const node of [...versions.map((v) => path.join(nvm, v, 'bin', 'node')), ...(found ? [found] : [])]) {
    const v = await execFileAsync(node, ['-v']).then((r) => r.stdout.trim(), () => '');
    const [major, minor] = v.replace(/^v/, '').split('.').map(Number);
    if (major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18)) return node;
  }
  return undefined;
}

/** Screenplay's output time as time on the recording it was given: through the A-roll's segments (it trims the silence before the first word). */
export function sourceTime(aroll: Aroll, t: number): number {
  const segs = aroll.segments ?? [];
  let seg = segs[0];
  for (const each of segs) if (each.outStart <= t + 1e-6) seg = each;
  return seg ? seg.srcStart + (t - seg.outStart) : t;
}

const TITLE: Record<string, string> = { chapter: 'Chapter card', stage: 'Graphic', talking: 'Over the face', plug: 'Plug', board: 'Board' };
const titleOf = (s: Scene) => (s.kind === 'app' ? `${(s.app ?? 'App').replace(/^./, (c) => c.toUpperCase())} scene` : TITLE[s.kind] ?? 'Scene');

export interface LayerBlock {
  id: string;
  title: string;
  /** Frames of the see-through render, [f0, f1). */
  f0: number;
  f1: number;
  /** Seconds on the creator's timeline. */
  start: number;
  duration: number;
}

/**
 * Where each scene's block starts and ends, and where the speaker is a tile. Blocks sit back to back: each starts where its dissolve
 * starts, so the frames of a dissolve (the outgoing scene under the incoming one) are in the incoming block, as screenplay drew them.
 * A talking scene with nothing over the face has no block.
 */
export function layerPlan(t: ScreenplayTimeline, aroll: Aroll): { blocks: LayerBlock[]; stages: { start: number; end: number }[] } {
  const lead = (s: Scene) => (s.transitionIn === 'blur' || s.transitionIn === 'fade' ? Math.round((SCENE_BLUR_MS / 1000) * t.fps) : 0);
  const scenes = [...t.scenes].sort((a, b) => a.from - b.from);
  const starts = scenes.map((s) => Math.max(0, s.from - lead(s)));
  const blocks: LayerBlock[] = [];
  scenes.forEach((s, i) => {
    const f0 = starts[i], f1 = Math.min(t.durationInFrames, i + 1 < scenes.length ? starts[i + 1] : s.from + s.duration);
    if (f1 <= f0 || (s.kind === 'talking' && !s.elements?.length)) return;
    const start = sourceTime(aroll, f0 / t.fps);
    blocks.push({ id: s.id, title: titleOf(s), f0, f1, start, duration: sourceTime(aroll, f1 / t.fps) - start });
  });
  // The speaker is a tile wherever screenplay's webcam is: from each change of mode to the next.
  const modes = [...(t.webcam ?? [{ frame: 0, mode: 'tile' }])].sort((a, b) => a.frame - b.frame);
  const stages: { start: number; end: number }[] = [];
  modes.forEach((m, i) => {
    if (m.mode !== 'tile') return;
    const start = sourceTime(aroll, m.frame / t.fps), end = sourceTime(aroll, (modes[i + 1]?.frame ?? t.durationInFrames) / t.fps);
    if (end - start >= MIN_STAGE) stages.push({ start, end });
  });
  return { blocks, stages };
}

/**
 * Renders a screenplay work folder's graphics once, see-through, and cuts them into one VP9 WebM per scene in `out`. Returns each block
 * with its file and its place on the creator's timeline.
 */
export async function renderLayers(o: { skillDir: string; work: string; out: string; signal?: AbortSignal; onStep?: (label: string) => void }): Promise<{ blocks: (LayerBlock & { file: string })[]; stages: { start: number; end: number }[] }> {
  const root = await screenplayRoot(o.skillDir);
  if (!root) throw new AiError('bad-answer', 'This skill is not part of a screenplay checkout, so its graphics cannot go on the timeline.');
  const node = await modernNode();
  if (!node) throw new AiError('bad-answer', 'Screenplay needs Node 22.18 or later, and none is installed.');
  const ffmpeg = process.env.SCENEFORGE_FFMPEG || 'ffmpeg';
  o.onStep?.('Rendering the graphics');
  const all = path.join(o.out, 'screenplay-layers.webm');
  await execFileAsync(node, [path.join(root, 'cli', 'screenplay.ts'), 'render', o.work, '--alpha', '-o', all], {
    cwd: o.work,
    signal: o.signal,
    timeout: 90 * 60_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PATH: [path.dirname(node), process.env.PATH ?? ''].join(path.delimiter) },
  }).catch((error: { stderr?: string; message?: string }) => {
    if (o.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
    throw new AiError('bad-answer', "Couldn't render the graphics.", String(error.stderr || error.message).slice(-4000));
  });
  const timeline = (JSON.parse(await fs.readFile(path.join(o.work, '.screenplay', 'timeline.json'), 'utf8')) as { timeline: ScreenplayTimeline }).timeline;
  const aroll = JSON.parse(await fs.readFile(path.join(o.work, 'aroll.json'), 'utf8').catch(() => '{}')) as Aroll;
  const plan = layerPlan(timeline, aroll);
  o.onStep?.('Placing the graphics');
  const blocks: (LayerBlock & { file: string })[] = [];
  for (const b of plan.blocks) {
    if (o.signal?.aborted) throw new AiError('cancelled', 'That was stopped.');
    const file = path.join(o.out, `layer-${b.id.replace(/[^a-z0-9.-]/gi, '_')}.webm`);
    // libvpx decodes the alpha (ffmpeg's own VP9 decoder drops it); frames are counted, so the blocks meet exactly.
    await execFileAsync(ffmpeg, ['-v', 'error', '-nostdin', '-y', '-c:v', 'libvpx-vp9', '-ss', (b.f0 / timeline.fps).toFixed(6), '-i', all, '-frames:v', String(b.f1 - b.f0), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '28', '-row-mt', '1', '-an', file], { signal: o.signal });
    blocks.push({ ...b, file });
  }
  await fs.rm(all, { force: true });
  return { blocks, stages: plan.stages };
}
