import { clipDuration, type MotionBlock, type Project } from './types';
import { PLACEABLE } from './motion/templates';

/*
 * A video's look: the few values every graphic reads (its type, four colours, how much moves) and the stage, the layout where the speaker
 * becomes a tile beside the content. Graphics take it through `motionMarkup`, so the editor's preview and the export draw it the same way.
 * A look is data, not a theme in code: Claude can write one from a reference or a description, and the creator can change any value.
 */

export type LookMotion = 'still' | 'subtle' | 'lively';
export interface LookStage {
  /** The colour behind the content while the speaker is a tile. */
  background: string;
  /** Where the speaker's tile sits. */
  side: 'right' | 'left';
  /** The tile's width as a share of the frame's width. */
  size: number;
  /** The tile's height over its width (about 1.35, a 3:4 portrait, when unset). Screenplay's house tile is 1.75. */
  aspect?: number;
  /** The gap from the frame's edge to the tile, as a share of the frame's width (0.035 when unset). */
  margin?: number;
  /** The tile's corner radius, as a share of the frame's width (9% of the tile's width when unset). */
  radius?: number;
}
export interface Look {
  name: string;
  /** Headlines, lists and big numbers in a sans (Inter) or an editorial serif (Instrument Serif); small labels stay sans. */
  display: 'sans' | 'serif';
  /** Text colour. */
  paper: string;
  /** Panels and plates behind text. */
  ink: string;
  /** The one highlight colour: rules, the current step, a marked word. */
  accent: string;
  /** Secondary text: labels, the words not said yet. */
  muted: string;
  /** Still: graphics appear and go with a cut; subtle: they fade; lively: they rise, pop and build. */
  motion: LookMotion;
  /** Present when information moments put the speaker in a tile on this stage. */
  stage?: LookStage;
}

export const CLEAN_LOOK: Look = { name: 'Clean', display: 'sans', paper: '#ffffff', ink: '#151413', accent: '#2563eb', muted: '#b8b3ab', motion: 'lively' };
/** Dark stage, the speaker as a tile on the right, serif headlines in white and grey: the long-form "explainer" look. */
export const EDITORIAL_LOOK: Look = { name: 'Editorial', display: 'serif', paper: '#f4f2ee', ink: '#1b1b1b', accent: '#f4f2ee', muted: '#8a8781', motion: 'subtle', stage: { background: '#1c1c1c', side: 'right', size: 0.14 } };
export const LOOKS: readonly Look[] = [CLEAN_LOOK, EDITORIAL_LOOK];

const HEX = /^#[0-9a-f]{6}$/i;
/** A look from stored or written data, every value checked and anything missing taken from Clean. */
export function normalizeLook(value: unknown): Look {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Look>;
  const colour = (c: unknown, fallback: string) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : fallback);
  const stage = v.stage && typeof v.stage === 'object' ? v.stage : undefined;
  return {
    name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 40) : CLEAN_LOOK.name,
    display: v.display === 'serif' ? 'serif' : 'sans',
    paper: colour(v.paper, CLEAN_LOOK.paper),
    ink: colour(v.ink, CLEAN_LOOK.ink),
    accent: colour(v.accent, CLEAN_LOOK.accent),
    muted: colour(v.muted, CLEAN_LOOK.muted),
    motion: v.motion === 'still' || v.motion === 'subtle' ? v.motion : 'lively',
    ...(stage ? { stage: { background: colour(stage.background, '#1c1c1c'), side: stage.side === 'left' ? 'left' : 'right', size: Math.min(0.3, Math.max(0.12, Number(stage.size) || 0.2)), ...tileShape(stage) } } : {}),
  };
}

const MARGIN = 0.035, GAP = 0.025, ASPECT = 1.35;
/** A stage's own tile shape, each value kept in a sane range; unset values fall back to the defaults. */
function tileShape(stage: Partial<LookStage>): Pick<LookStage, 'aspect' | 'margin' | 'radius'> {
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
  const aspect = num(stage.aspect, 1, 2.2), margin = num(stage.margin, 0, 0.1), radius = num(stage.radius, 0, 0.05);
  return { ...(aspect !== undefined ? { aspect } : {}), ...(margin !== undefined ? { margin } : {}), ...(radius !== undefined ? { radius } : {}) };
}
/** The tile the speaker becomes on the stage, as a clip transform: a portrait (about 3:4 on screen, as in the reference, unless the stage says), centred down the chosen edge. */
export function stageTile(stage: LookStage, canvas: { width: number; height: number }) {
  const margin = stage.margin ?? MARGIN, width = stage.size, height = Math.min(0.9, (stage.size * canvas.width * (stage.aspect ?? ASPECT)) / canvas.height);
  return { x: stage.side === 'right' ? 1 - width - margin : margin, y: (1 - height) / 2, width, height };
}
/** The tile's corner radius in pixels of the frame. */
export const stageTileRadius = (stage: LookStage, canvas: { width: number }) => Math.round((stage.radius ?? stage.size * 0.09) * canvas.width);
/** The panel beside the tile, where the stage's content goes (the same box `motionMarkup` draws graphics in): proof shots land here. */
export function stagePanel(stage: LookStage) {
  const margin = stage.margin ?? MARGIN;
  return { x: stage.side === 'right' ? margin : margin + stage.size + GAP, y: 0.05, width: 1 - stage.size - margin * 2 - GAP, height: 0.9 };
}

/** Whether the speaker is a tile on the stage at `time`. */
export const onStage = (p: Pick<Project, 'clips'>, time: number) =>
  p.clips.some((c) => c.stage && c.track === 'camera' && time >= c.start - 1e-3 && time < c.start + clipDuration(c) - 1e-3);

/** The Motion row as it is drawn: each graphic with the video's look, and in the middle of the frame where it starts on a stage stretch. */
export function drawnBlocks(p: Pick<Project, 'clips' | 'motion' | 'look'>): MotionBlock[] {
  return (p.motion ?? []).map((block) => ({
    ...block,
    ...(p.look ? { look: p.look } : {}),
    ...(PLACEABLE[block.template]?.includes('stage') && onStage(p, block.start) ? { place: 'stage' as const } : {}),
  }));
}

/** A look from a `set_look` card: its preset (or the current look), with the values the card sets on top. */
export function lookFrom(current: Look | undefined, change: { preset?: 'clean' | 'editorial'; stage?: Partial<LookStage> | null } & Partial<Omit<Look, 'stage'>>): Look {
  const base = change.preset === 'editorial' ? EDITORIAL_LOOK : change.preset === 'clean' ? CLEAN_LOOK : (current ?? CLEAN_LOOK);
  const { preset: _preset, stage, ...values } = change as typeof change & { type?: string };
  delete (values as { type?: string }).type;
  const defined = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  const nextStage = stage === null ? undefined : stage ? { ...(base.stage ?? EDITORIAL_LOOK.stage!), ...Object.fromEntries(Object.entries(stage).filter(([, v]) => v !== undefined)) } : base.stage;
  const name = defined.name ?? (Object.keys(defined).length || stage !== undefined ? `${base.name} (yours)` : base.name);
  return normalizeLook({ ...base, ...defined, name, stage: nextStage });
}
