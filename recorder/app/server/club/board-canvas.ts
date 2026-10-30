import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { defaultTileWidth, type BoardCanvas, type BoardFrame, type BoardLink, type ResearchTile } from '../../shared/club.js';
import { ClubError, notFound } from './errors.js';
import { POSITION_MAX } from './tile-layout.js';
import * as store from './store.js';

/*
 * The connections and frames of a Board, in `board-canvas.json` in the Board's folder (next to its notes). A connection joins two cards that are on
 * the Board; a frame is a named rectangle, and the cards inside it are its group. Read leniently: a line whose card is gone is left out, so a removed
 * card never leaves a line behind.
 */

export const LABEL_MAX = 120;
export const FRAME_TITLE_MAX = 80;
export const FRAME_MIN = 80;
const LINKS_MAX = 500;
const FRAMES_MAX = 100;
/** Room a frame leaves around the cards it is drawn around. */
export const FRAME_PAD = 28;
/** Room above the cards for the frame's name. */
export const FRAME_HEAD = 34;
/** How tall a card is taken to be where the screen has not measured it (the server never knows how tall one is drawn). */
export const TILE_HEIGHT_GUESS = 300;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const canvasFile = (slug: string, board: string) => path.join(store.boardDir(slug, board), 'board-canvas.json');
const canvasLock = (slug: string, board: string) => `canvas:${canvasFile(slug, board)}`;
const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`;

const linkShape = z.object({ id: z.string().regex(ID), from: z.string().regex(ID), to: z.string().regex(ID), label: z.string().max(LABEL_MAX).optional() }).strip();
const frameShape = z
  .object({ id: z.string().regex(ID), title: z.string().max(FRAME_TITLE_MAX), x: z.number().finite().min(0).max(POSITION_MAX), y: z.number().finite().min(0).max(POSITION_MAX), w: z.number().finite().min(FRAME_MIN).max(POSITION_MAX), h: z.number().finite().min(FRAME_MIN).max(POSITION_MAX) })
  .strip();

/** What a request may send for a connection and a frame. */
export const linkBody = z.object({ from: z.string().regex(ID), to: z.string().regex(ID), label: z.string().trim().max(LABEL_MAX).optional() }).strict();
export const linkPatchBody = z.object({ label: z.string().trim().max(LABEL_MAX) }).strict();
const rect = { x: z.number().finite().min(0).max(POSITION_MAX), y: z.number().finite().min(0).max(POSITION_MAX), w: z.number().finite().min(FRAME_MIN).max(POSITION_MAX), h: z.number().finite().min(FRAME_MIN).max(POSITION_MAX) };
export const frameBody = z.object({ title: z.string().trim().max(FRAME_TITLE_MAX), ...rect }).strict();
export const framePatchBody = z
  .object({ title: z.string().trim().max(FRAME_TITLE_MAX), ...rect })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nothing to change' });

async function readRaw(slug: string, board: string): Promise<BoardCanvas> {
  const saved = await store.readJSON<{ links?: unknown; frames?: unknown }>(canvasFile(slug, board)).catch(() => undefined);
  const pick = <T>(list: unknown, shape: z.ZodType<T>) => (Array.isArray(list) ? list : []).flatMap((item) => {
    const parsed = shape.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { links: pick(saved?.links, linkShape) as BoardLink[], frames: pick(saved?.frames, frameShape) as BoardFrame[] };
}

/** The Board's connections and frames. A connection to a card that is no longer on the Board is left out. */
export async function readCanvas(slug: string, board: string, tiles?: readonly Pick<ResearchTile, 'id'>[]): Promise<BoardCanvas> {
  await store.requireBoard(slug, board);
  const canvas = await readRaw(slug, board);
  const ids = new Set((tiles ?? (await store.listTiles(slug, board))).map((tile) => tile.id));
  return { links: canvas.links.filter((link) => ids.has(link.from) && ids.has(link.to)), frames: canvas.frames };
}

/** Reads, changes and writes the canvas, one change at a time per Board. */
export function changeCanvas<T>(slug: string, board: string, change: (canvas: BoardCanvas) => T | Promise<T>): Promise<T> {
  return store.withLock(canvasLock(slug, board), async () => {
    await store.requireBoard(slug, board);
    const canvas = await readRaw(slug, board);
    const result = await change(canvas);
    await store.writeJSON(canvasFile(slug, board), canvas);
    return result;
  });
}

const sameEnds = (a: Pick<BoardLink, 'from' | 'to'>, b: Pick<BoardLink, 'from' | 'to'>) => (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);

/** Connects two cards of the Board. Connecting the same two again gives the line that is there (its label changes when one is sent). */
export async function addLink(slug: string, board: string, input: z.infer<typeof linkBody>): Promise<BoardLink> {
  if (input.from === input.to) throw new ClubError('A card cannot be connected to itself.');
  const ids = new Set((await store.listTiles(slug, board)).map((tile) => tile.id));
  if (!ids.has(input.from) || !ids.has(input.to)) throw notFound('tile');
  return changeCanvas(slug, board, (canvas) => {
    const existing = canvas.links.find((link) => sameEnds(link, input));
    if (existing) {
      if (input.label !== undefined) existing.label = input.label || undefined;
      return existing;
    }
    if (canvas.links.length >= LINKS_MAX) throw new ClubError('This board has as many connections as it can hold.');
    const link: BoardLink = { id: newId('l'), from: input.from, to: input.to, ...(input.label ? { label: input.label } : {}) };
    canvas.links.push(link);
    return link;
  });
}

export function updateLink(slug: string, board: string, id: string, patch: z.infer<typeof linkPatchBody>): Promise<BoardLink> {
  return changeCanvas(slug, board, (canvas) => {
    const link = canvas.links.find((each) => each.id === id);
    if (!link) throw notFound('connection');
    if (patch.label) link.label = patch.label;
    else delete link.label;
    return link;
  });
}

export function removeLink(slug: string, board: string, id: string): Promise<void> {
  return changeCanvas(slug, board, (canvas) => {
    canvas.links = canvas.links.filter((link) => link.id !== id);
  });
}

export function addFrame(slug: string, board: string, input: z.infer<typeof frameBody>): Promise<BoardFrame> {
  return changeCanvas(slug, board, (canvas) => {
    if (canvas.frames.length >= FRAMES_MAX) throw new ClubError('This board has as many frames as it can hold.');
    const frame: BoardFrame = { id: newId('f'), title: input.title || 'Group', x: input.x, y: input.y, w: input.w, h: input.h };
    canvas.frames.push(frame);
    return frame;
  });
}

export function updateFrame(slug: string, board: string, id: string, patch: Partial<Omit<BoardFrame, 'id'>>): Promise<BoardFrame> {
  return changeCanvas(slug, board, (canvas) => {
    const frame = canvas.frames.find((each) => each.id === id);
    if (!frame) throw notFound('frame');
    Object.assign(frame, patch);
    if (!frame.title) frame.title = 'Group';
    return frame;
  });
}

export function removeFrame(slug: string, board: string, id: string): Promise<void> {
  return changeCanvas(slug, board, (canvas) => {
    canvas.frames = canvas.frames.filter((frame) => frame.id !== id);
  });
}

/** Takes the lines of removed cards off the canvas. */
export function pruneLinks(slug: string, board: string, tileIds: readonly string[]): Promise<void> {
  const gone = new Set(tileIds);
  return changeCanvas(slug, board, (canvas) => {
    canvas.links = canvas.links.filter((link) => !gone.has(link.from) && !gone.has(link.to));
  });
}

// ---------------------------------------------------------------- geometry the server needs (the screen measures cards; the server guesses their height)

type Box = { x: number; y: number; w: number; h: number };
const boxOf = (tile: Pick<ResearchTile, 'kind' | 'pos'>, height = TILE_HEIGHT_GUESS): Box => ({ x: tile.pos?.x ?? 0, y: tile.pos?.y ?? 0, w: tile.pos?.w ?? defaultTileWidth(tile.kind), h: height });

/** A frame's rectangle around these cards, with room for its name above them. */
export function frameAround(tiles: readonly Pick<ResearchTile, 'id' | 'kind' | 'pos'>[], heights: Readonly<Record<string, number>> = {}): Omit<BoardFrame, 'id' | 'title'> {
  if (!tiles.length) throw new ClubError('Pick the cards to group first.');
  const boxes = tiles.map((tile) => boxOf(tile, heights[tile.id] ?? TILE_HEIGHT_GUESS));
  const left = Math.min(...boxes.map((box) => box.x)),
    top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w)),
    bottom = Math.max(...boxes.map((box) => box.y + box.h));
  const x = Math.max(0, Math.round(left - FRAME_PAD)),
    y = Math.max(0, Math.round(top - FRAME_PAD - FRAME_HEAD));
  return { x, y, w: Math.max(FRAME_MIN, Math.round(right + FRAME_PAD - x)), h: Math.max(FRAME_MIN, Math.round(bottom + FRAME_PAD - y)) };
}

/** Whether a card belongs to a frame: its top left corner is inside the frame's rectangle. */
export const inFrame = (frame: Box, tile: Pick<ResearchTile, 'kind' | 'pos'>) => {
  const box = boxOf(tile);
  return box.x >= frame.x && box.y >= frame.y && box.x < frame.x + frame.w && box.y < frame.y + frame.h;
};
