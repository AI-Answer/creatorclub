import {defaultTileWidth,type ResearchTile} from '../../../shared/club';

/*
 * Geometry of the Board canvas: where a tile is drawn, how far a key press or a drag moves it, and how large the canvas has to be
 * so every tile can be reached. Pure, so the screen only draws it.
 */

export const CANVAS_MIN={width:2600,height:1700};
/** Room left past the right and bottom edge of the farthest tile. */
const CANVAS_MARGIN=240;

export const ZOOM={min:0.25,max:2,step:0.1,fit:0.7};
export const KEY_STEP=10;
export const KEY_STEP_FAR=40;
/** How long after the last key press a tile's new place is saved. */
export const KEY_SAVE_MS=400;

/** The tile's place and width, with the width the Board gives it when it has none. */
export const tileBox=(tile:Pick<ResearchTile,'kind'|'pos'>):{x:number;y:number;w:number}=>({x:tile.pos?.x??0,y:tile.pos?.y??0,w:tile.pos?.w??defaultTileWidth(tile.kind)});

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

// ---------------------------------------------------------------- selections, connections and frames

export type Box={x:number;y:number;w:number;h:number};
/** How tall a card is taken to be before the screen has measured it. */
export const TILE_HEIGHT_GUESS=300;
/** Room a frame leaves around its cards, and above them for its name. */
export const FRAME_PAD=28;
export const FRAME_HEAD=34;
export const FRAME_MIN=80;

/** A card's box on the canvas, with its drawn height where it is known. */
export const boxOf=(tile:Pick<ResearchTile,'id'|'kind'|'pos'>,heights:Readonly<Record<string,number>>={}):Box=>{const box=tileBox(tile);return {...box,h:heights[tile.id]??TILE_HEIGHT_GUESS};};

/** The rectangle between two corners, whichever way it was dragged. */
export const rectBetween=(a:{x:number;y:number},b:{x:number;y:number}):Box=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)});

const touches=(a:Box,b:Box)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;

/** The cards a dragged rectangle touches. */
export function inRect(rect:Box,tiles:readonly Pick<ResearchTile,'id'|'kind'|'pos'>[],heights:Readonly<Record<string,number>>={}):string[]{
 return tiles.filter(tile=>touches(rect,boxOf(tile,heights))).map(tile=>tile.id);
}

/**
 * The cards a frame groups: those whose top edge lies inside it from side to side (the same rule the server uses; it does not know how tall a card is
 * drawn, so the bottom does not count). A card only touching the frame is not in it.
 */
export function inFrame(frame:Box,tiles:readonly Pick<ResearchTile,'id'|'kind'|'pos'>[]):string[]{
 return tiles.filter(tile=>{const box=tileBox(tile);return box.x>=frame.x&&box.x+box.w<=frame.x+frame.w&&box.y>=frame.y&&box.y<frame.y+frame.h;}).map(tile=>tile.id);
}

/** A frame's rectangle drawn around these cards, with room for its name above them. */
export function frameAround(boxes:readonly Box[]):Box{
 const left=Math.min(...boxes.map(box=>box.x)),top=Math.min(...boxes.map(box=>box.y));
 const right=Math.max(...boxes.map(box=>box.x+box.w)),bottom=Math.max(...boxes.map(box=>box.y+box.h));
 const x=Math.max(0,Math.round(left-FRAME_PAD)),y=Math.max(0,Math.round(top-FRAME_PAD-FRAME_HEAD));
 return {x,y,w:Math.max(FRAME_MIN,Math.round(right+FRAME_PAD-x)),h:Math.max(FRAME_MIN,Math.round(bottom+FRAME_PAD-y))};
}

/** Where the line from the middle of `box` towards `to` leaves the box: connections are drawn edge to edge. */
export function edgePoint(box:Box,to:{x:number;y:number}):{x:number;y:number}{
 const cx=box.x+box.w/2,cy=box.y+box.h/2,dx=to.x-cx,dy=to.y-cy;
 if(!dx&&!dy)return {x:cx,y:cy};
 const scale=Math.min(dx?(box.w/2)/Math.abs(dx):Infinity,dy?(box.h/2)/Math.abs(dy):Infinity);
 return {x:cx+dx*scale,y:cy+dy*scale};
}

/** The two ends of a connection between two cards, and its middle (where its label sits). */
export function linkLine(a:Box,b:Box){
 const from=edgePoint(a,{x:b.x+b.w/2,y:b.y+b.h/2}),to=edgePoint(b,{x:a.x+a.w/2,y:a.y+a.h/2});
 return {from,to,mid:{x:(from.x+to.x)/2,y:(from.y+to.y)/2}};
}

/** The box a point is in, topmost (last drawn) first: where a connection being drawn lands. */
export function boxAt(point:{x:number;y:number},boxes:readonly (Box&{id:string})[]):string|undefined{
 for(let index=boxes.length-1;index>=0;index--){const box=boxes[index];if(point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h)return box.id;}
 return undefined;
}
