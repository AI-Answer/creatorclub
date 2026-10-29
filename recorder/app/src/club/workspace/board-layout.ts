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

/** How tall a tile is assumed to be when looking for room (the screen draws them from about 150 to 500). */
const TILE_HEIGHT=380;
const GAP=24;
const SEARCH_STEP=60;
const SEARCH_RINGS=60;

const crowds=(a:{x:number;y:number;w:number},b:{x:number;y:number;w:number})=>a.x<b.x+b.w+GAP&&b.x<a.x+a.w+GAP&&a.y<b.y+TILE_HEIGHT+GAP&&b.y<a.y+TILE_HEIGHT+GAP;

/**
 * The free place nearest to `centre` (a point on the canvas, in canvas pixels) for a tile `width` wide: its middle as close to the centre as
 * the tiles already there allow, never above or left of the canvas. Looks outward from the centre in steps; the centre's own place when it is free.
 */
export function nearestFree(placed:readonly {x:number;y:number;w:number}[],width:number,centre:{x:number;y:number}):{x:number;y:number}{
 const at=(dx:number,dy:number)=>({x:Math.max(0,Math.round(centre.x-width/2+dx)),y:Math.max(0,Math.round(centre.y-TILE_HEIGHT/2+dy)),w:width});
 let best:{x:number;y:number;w:number}|undefined,bestDistance=Infinity;
 for(let ring=0;ring<=SEARCH_RINGS&&!best;ring++){
  for(let gx=-ring;gx<=ring;gx++)for(let gy=-ring;gy<=ring;gy++){
   if(Math.max(Math.abs(gx),Math.abs(gy))!==ring)continue;
   const spot=at(gx*SEARCH_STEP,gy*SEARCH_STEP);
   if(placed.some(tile=>crowds(spot,tile)))continue;
   const distance=Math.hypot(gx,gy);
   if(distance<bestDistance){best=spot;bestDistance=distance;}
  }
 }
 const found=best??at(0,SEARCH_RINGS*SEARCH_STEP);
 return {x:found.x,y:found.y};
}
