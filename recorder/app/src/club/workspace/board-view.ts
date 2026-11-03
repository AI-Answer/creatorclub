import {ZOOM,clampZoom} from './board-layout';

/*
 * The view of the Board canvas: where the canvas sits in the window (`x`, `y`, in screen pixels) and how large it is drawn (`z`).
 * A canvas point (cx, cy) is drawn at (x + cx*z, y + cy*z). Pure, so the screen only draws it.
 */
export interface View{x:number;y:number;z:number}
export const DEFAULT_VIEW:View={x:40,y:60,z:1};

/** Zooms to `z` (kept within the zoom range) so the canvas point under the screen point (`sx`, `sy`, relative to the Board) stays under it. */
export function zoomAt(view:View,z:number,sx:number,sy:number):View{
 const next=clampZoom(z);
 if(next===view.z)return view;
 const cx=(sx-view.x)/view.z,cy=(sy-view.y)/view.z;
 return {x:sx-cx*next,y:sy-cy*next,z:next};
}

/** The zoom a wheel turn asks for: a pinch sends small deltas, a mouse wheel notch (100 px, or 3 lines) is about 12%. */
export const wheelZoom=(z:number,deltaY:number,deltaMode=0,pinch=false)=>z*Math.exp(-deltaY*(pinch?0.01:deltaMode===1?0.04:0.0012));

export const panBy=(view:View,dx:number,dy:number):View=>({...view,x:view.x+dx,y:view.y+dy});

export interface WheelLike{ctrlKey:boolean;deltaMode:number;deltaX:number;deltaY:number;wheelDeltaY?:number}
/**
 * What a wheel event means. A pinch (Ctrl + wheel) and a mouse wheel zoom; the two-finger scroll of a trackpad pans.
 * A mouse wheel turns in whole steps (lines, or a multiple of 100 or 120 pixels, with no sideways part); a trackpad sends small, uneven deltas.
 */
export function wheelIntent(event:WheelLike):'zoom'|'pan'{
 if(event.ctrlKey||event.deltaMode===1)return 'zoom';
 const step=event.wheelDeltaY!==undefined&&event.wheelDeltaY!==0&&Math.abs(event.wheelDeltaY)%120===0;
 if(event.deltaX===0&&Number.isInteger(event.deltaY)&&Math.abs(event.deltaY)>=50&&(step||event.wheelDeltaY===undefined))return 'zoom';
 return 'pan';
}

/** The view that shows `rect` (canvas pixels) inside a window `width` × `height`, with `pad` around it. Never zoomed in past 100%. */
export function fitView(rect:{x:number;y:number;w:number;h:number},width:number,height:number,pad=80):View{
 const z=clampZoom(Math.min(1,(width-pad*2)/Math.max(rect.w,1),(height-pad*2)/Math.max(rect.h,1)));
 return {z,x:Math.round((width-rect.w*z)/2-rect.x*z),y:Math.round((height-rect.h*z)/2-rect.y*z)};
}

/** The spacing and offset of the dotted background for a view: dots stay between 14 and 28 px apart however far it is zoomed out. */
export function dotGrid(view:View,base=22){
 let size=base*view.z;
 while(size<14)size*=2;
 return {size,x:((view.x%size)+size)%size,y:((view.y%size)+size)%size};
}

const KEY=(board:string)=>`cc.board.view.${board}`;
const valid=(view:unknown):view is View=>{
 const v=view as View;
 return !!v&&[v.x,v.y,v.z].every(n=>typeof n==='number'&&Number.isFinite(n))&&v.z>=ZOOM.min&&v.z<=ZOOM.max;
};
/** The view saved for a Board in this browser, if any. */
export function loadView(board:string,store:Pick<Storage,'getItem'>|undefined=safeStorage()):View|undefined{
 try{const raw=store?.getItem(KEY(board));if(!raw)return undefined;const view=JSON.parse(raw);return valid(view)?{x:view.x,y:view.y,z:view.z}:undefined;}catch{return undefined;}
}
export function saveView(board:string,view:View,store:Pick<Storage,'setItem'>|undefined=safeStorage()){
 try{store?.setItem(KEY(board),JSON.stringify({x:Math.round(view.x),y:Math.round(view.y),z:Math.round(view.z*1000)/1000}));}catch{/* private window or blocked storage: the view is just not remembered */}
}
function safeStorage():Storage|undefined{try{return globalThis.localStorage;}catch{return undefined;}}

/** A note's size on the Board: its width and the height it was resized to, never smaller than the least a note can be. */
export const NOTE_MIN={w:160,h:90};
export const NOTE_MAX={w:1200,h:2400};
export const clampNoteSize=(w:number,h:number)=>({w:Math.min(NOTE_MAX.w,Math.max(NOTE_MIN.w,Math.round(w))),h:Math.min(NOTE_MAX.h,Math.max(NOTE_MIN.h,Math.round(h)))});
/** A note dragged from its bottom right corner by `dx`, `dy` screen pixels at this zoom. */
export const resizeNote=(start:{w:number;h:number},dx:number,dy:number,zoom:number)=>clampNoteSize(start.w+dx/zoom,start.h+dy/zoom);
