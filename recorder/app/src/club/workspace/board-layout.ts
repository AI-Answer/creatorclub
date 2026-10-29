import {defaultTileWidth,type ResearchTile,type TilePosition} from '../../../shared/club';

/*
 * Geometry of the Board canvas: where a tile is drawn, how far a key press or a drag moves it, and how large the canvas has to be
 * so every tile can be reached. Pure, so the screen only draws it.
 */

export const CANVAS_MIN={width:2600,height:1700};
/** Room left past the right and bottom edge of the farthest tile. */
const CANVAS_MARGIN=240;

export const ZOOM={min:0.5,max:1.5,step:0.1,fit:0.7};
export const KEY_STEP=10;
export const KEY_STEP_FAR=40;
/** How long after the last key press a tile's new place is saved. */
export const KEY_SAVE_MS=400;

/** The tile's place and width, with the width the Board gives it when it has none. */
export const tileBox=(tile:Pick<ResearchTile,'kind'|'pos'>):Required<TilePosition>=>({x:tile.pos?.x??0,y:tile.pos?.y??0,w:tile.pos?.w??defaultTileWidth(tile.kind)});

/** The size the canvas needs for these tiles: at least the base size, and past the farthest tile (`heights` are the tiles' drawn heights, where known). */
export function canvasSize(tiles:readonly Pick<ResearchTile,'id'|'kind'|'pos'>[],heights:Readonly<Record<string,number>>={}):{width:number;height:number}{
 let width=CANVAS_MIN.width,height=CANVAS_MIN.height;
 for(const tile of tiles){
  const box=tileBox(tile);
  width=Math.max(width,box.x+box.w+CANVAS_MARGIN);height=Math.max(height,box.y+(heights[tile.id]??400)+CANVAS_MARGIN);
 }
 return {width,height};
}

/** Where a tile dragged from `start` lands when the pointer moved `dx`, `dy` on screen at this zoom. Never above or left of the canvas. */
export const dragTo=(start:{x:number;y:number},dx:number,dy:number,zoom:number)=>({x:Math.max(0,Math.round(start.x+dx/zoom)),y:Math.max(0,Math.round(start.y+dy/zoom))});

/** How far an arrow key moves a tile; Shift moves it further. Other keys move nothing. */
export function keyMove(key:string,far:boolean):{dx:number;dy:number}|undefined{
 const step=far?KEY_STEP_FAR:KEY_STEP;
 switch(key){
  case 'ArrowLeft':return {dx:-step,dy:0};
  case 'ArrowRight':return {dx:step,dy:0};
  case 'ArrowUp':return {dx:0,dy:-step};
  case 'ArrowDown':return {dx:0,dy:step};
 }
 return undefined;
}

export const moveBy=(from:{x:number;y:number},move:{dx:number;dy:number})=>({x:Math.max(0,from.x+move.dx),y:Math.max(0,from.y+move.dy)});

export const clampZoom=(zoom:number)=>Math.min(ZOOM.max,Math.max(ZOOM.min,Math.round(zoom*100)/100));
