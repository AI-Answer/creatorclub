import type { ResearchTile, TileKind, TilePosition } from '../../shared/club.js';

/*
 * Where new tiles land on a video's Board: a grid of slots, five across, filled left to right and top to bottom, the way the
 * prototype's first board is laid out. A new tile takes the first slot no placed tile covers.
 */

const ORIGIN = 60;
const COLUMN_STEP = 340;
const ROW_STEP = 410;
const COLUMNS = 5;
/** The tallest a tile is assumed to be when looking for free space; the server does not know how tall the screen draws one. */
const TILE_HEIGHT = 380;

/** The most a tile's position can be set to, and the widths it can have. */
export const POSITION_MAX = 20_000;
export const WIDTH_MIN = 120;
export const WIDTH_MAX = 1200;

export const defaultWidth = (kind: TileKind) => (kind === 'breakdown' ? 320 : 280);

const overlaps = (a: { x: number; y: number; w: number }, b: { x: number; y: number; w: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + TILE_HEIGHT && b.y < a.y + TILE_HEIGHT;

/** The first free slot for a tile of this kind. Tiles without a position take no space. */
export function freeSpot(tiles: readonly Pick<ResearchTile, 'kind' | 'pos'>[], kind: TileKind): Required<TilePosition> {
  const w = defaultWidth(kind);
  const placed = tiles.flatMap((tile) => (tile.pos ? [{ x: tile.pos.x, y: tile.pos.y, w: tile.pos.w ?? defaultWidth(tile.kind) }] : []));
  for (let slot = 0; ; slot++) {
    const spot = { x: ORIGIN + (slot % COLUMNS) * COLUMN_STEP, y: ORIGIN + Math.floor(slot / COLUMNS) * ROW_STEP, w };
    if (!placed.some((tile) => overlaps(spot, tile))) return spot;
  }
}
