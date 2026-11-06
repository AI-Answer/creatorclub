import {clipDuration,type Clip,type Project,type Transform} from './types';

/*
 * The camera's change between the speaker's tile and the full frame, as screenplay draws it (its webcam layer): over 0.45 s the picture
 * blurs up to 18 px, its box moves to the new place while it is blurred, then it sharpens. A camera clip with `morphIn` opens with this
 * change from the camera clip that ends where it starts; the preview and the export draw the same frames from here.
 */

/** screenplay's `motion.webcamMorph`. */
export const MORPH_SECONDS=.45;

/** Where a clip is drawn on the canvas, as shares of it, with its corner radius in canvas pixels. */
export interface MorphBox{x:number;y:number;width:number;height:number;radius:number}

const isFull=(t:Transform,c:Clip)=>t.x===0&&t.y===0&&t.width===1&&t.height===1&&(c.zIndex??0)>=0;
/** The box a clip is drawn in: a full-frame clip is inset by the canvas padding and rounded like the canvas. */
export function drawnBox(c:Clip,p:Project,t:Transform=c.transform):MorphBox{
 if(!isFull(t,c))return {x:t.x,y:t.y,width:t.width,height:t.height,radius:t.borderRadius||0};
 const pad=Math.min(p.canvas.padding,Math.min(p.canvas.width,p.canvas.height)/3),x=pad/p.canvas.width,y=pad/p.canvas.height;
 return {x,y,width:1-2*x,height:1-2*y,radius:t.borderRadius||p.canvas.radius};
}

/** The camera clip a clip's change starts from: the one on its track that ends where it starts. */
export function morphSource(c:Clip,p:Project):Clip|undefined{
 if(!(c.morphIn&&c.morphIn>0))return undefined;
 return p.clips.find(o=>o!==c&&o.track===c.track&&o.layerId===c.layerId&&Math.abs(o.start+clipDuration(o)-c.start)<1e-6);
}

const clamp01=(v:number)=>Math.min(1,Math.max(0,v));
const easeInOut=(v:number)=>v<.5?4*v*v*v:1-Math.pow(-2*v+2,3)/2;
/** Piecewise linear through the points, clamped at both ends. */
function through(u:number,at:number[],values:number[]):number{
 if(u<=at[0])return values[0];
 for(let i=1;i<at.length;i++)if(u<=at[i])return values[i-1]+(values[i]-values[i-1])*(u-at[i-1])/(at[i]-at[i-1]);
 return values[values.length-1];
}

/** The box and the blur `u` of the way through a change (0 to 1). `blur` is a share of the canvas width (18 px at 1920). */
export function morphAt(u:number,from:MorphBox,to:MorphBox):{box:MorphBox;blur:number}{
 const k=easeInOut(clamp01((u-.2)/.4)),mix=(a:number,b:number)=>a+(b-a)*k;
 return {box:{x:mix(from.x,to.x),y:mix(from.y,to.y),width:mix(from.width,to.width),height:mix(from.height,to.height),radius:mix(from.radius,to.radius)},blur:through(clamp01(u),[0,.25,.6,1],[0,18,14,0])/1920};
}

const before=(c:Clip,p:Project)=>p.clips.find(o=>o!==c&&o.track===c.track&&o.layerId===c.layerId&&Math.abs(o.start+clipDuration(o)-c.start)<1e-6);
const sameBox=(a:MorphBox,b:MorphBox)=>(['x','y','width','height','radius'] as const).every(k=>Math.abs(a[k]-b[k])<1e-6);

/** The clip whose change is running in `c` at a time: `c` itself, or the clip a run of cuts in the same place began with. */
export function morphOwner(c:Clip,p:Project,time:number):Clip|undefined{
 if(time-c.start>=MORPH_SECONDS*4)return undefined;
 let owner=c;const box=drawnBox(c,p);
 for(let i=0;i<64&&!(owner.morphIn&&owner.morphIn>0);i++){const prev=before(owner,p);if(!prev||!sameBox(drawnBox(prev,p),box))return undefined;owner=prev;}
 return owner.morphIn&&time>=owner.start&&time<owner.start+owner.morphIn?owner:undefined;
}

/** The change a clip is in at a time on the timeline, if it is in one. It runs on through cuts that keep the camera in its new place. */
export function morphNow(c:Clip,p:Project,time:number):{box:MorphBox;blur:number}|undefined{
 const owner=morphOwner(c,p,time),from=owner&&morphSource(owner,p);
 if(!owner||!from||time<c.start)return undefined;
 return morphAt((time-owner.start)/owner.morphIn!,drawnBox(from,p),drawnBox(c,p));
}
