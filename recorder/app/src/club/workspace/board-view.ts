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

/**
 * The zoom a wheel turn asks for: a pinch sends small deltas, a mouse wheel notch (100 px, or 3 lines) is about 12%, and a trackpad
 * flick is capped per event so its momentum glides instead of jumping.
 */
export const wheelZoom=(z:number,deltaY:number,deltaMode=0,pinch=false)=>{
 const d=deltaMode===1?deltaY*33:Math.max(-120,Math.min(120,deltaY));
 return z*Math.exp(-d*(pinch?0.01:0.0012));
};

export const panBy=(view:View,dx:number,dy:number):View=>({...view,x:view.x+dx,y:view.y+dy});

export interface WheelLike{ctrlKey:boolean;metaKey?:boolean;shiftKey?:boolean;deltaMode:number;deltaX:number;deltaY:number}
/** Trackpad scrolling pans; pinch (Ctrl-wheel) and Command-wheel zoom around the pointer. */
export const wheelIntent=(event:WheelLike):'zoom'|'pan'=>event.ctrlKey||event.metaKey?'zoom':'pan';

/** Wheel deltas in screen pixels, including mice reporting lines or pages. */
export const wheelPan=(event:WheelLike,page=800)=>{
 const scale=event.deltaMode===1?40:event.deltaMode===2?page:1;
 return event.shiftKey&&!event.deltaX?{dx:-event.deltaY*scale,dy:0}:{dx:-event.deltaX*scale||0,dy:-event.deltaY*scale||0};
};

/** The visible rectangle in board coordinates. */
export const viewportBox=(view:View,width:number,height:number)=>({x:-view.x/view.z,y:-view.y/view.z,w:width/view.z,h:height/view.z});
/** Centres the viewport at a board point without changing zoom. */
export const centreView=(view:View,point:{x:number;y:number},width:number,height:number):View=>({...view,x:width/2-point.x*view.z,y:height/2-point.y*view.z});

/** One shared coordinate system for cards and the visible area, including empty space left of the board. */
export function minimapLayout(boxes:readonly {x:number;y:number;w:number;h:number}[],view:View,width:number,height:number,mapW=180,mapH=112){
 const viewport=viewportBox(view,width,height),all=[viewport,...boxes];
 const x=Math.min(0,...all.map(box=>box.x))-80,y=Math.min(0,...all.map(box=>box.y))-80;
 const w=Math.max(400,...all.map(box=>box.x+box.w))-x+80,h=Math.max(250,...all.map(box=>box.y+box.h))-y+80;
 const scale=Math.min(mapW/w,mapH/h),ox=(mapW-w*scale)/2,oy=(mapH-h*scale)/2;
 return {x,y,scale,ox,oy,viewport};
}
export const minimapPoint=(map:ReturnType<typeof minimapLayout>,x:number,y:number)=>({x:(x-map.ox)/map.scale+map.x,y:(y-map.oy)/map.scale+map.y});

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
