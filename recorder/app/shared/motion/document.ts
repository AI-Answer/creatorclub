import type {MotionBlock} from '../types';
import {MOTION_CSS,motionBox,motionMarkup,seekAnimations} from './templates';

/*
 * The export's side of a motion block: a standalone page with the same markup and stylesheet the preview uses, on a stage the size of the
 * exported frame, plus the box to capture and the seek expression for each frame. The capture itself (`desktop/motion-capture.cjs`) runs
 * in the desktop app's offscreen window or, in development and tests, in Chrome.
 */

/** Pixels of the export frame the block draws in: the template's box, on even pixels, inside the frame. */
export function motionClip(block:MotionBlock,width:number,height:number){
 const box=motionBox(block),even=(n:number)=>Math.max(2,Math.round(n/2)*2);
 const x=Math.min(width-2,Math.max(0,Math.floor(box.x*width/2)*2)),y=Math.min(height-2,Math.max(0,Math.floor(box.y*height/2)*2));
 return {x,y,width:Math.min(even(box.width*width),width-x),height:Math.min(even(box.height*height),height-y)};
}

/** The page the export captures: the block on a transparent stage of the frame's size. `fontUrl` is Inter as a URL the page may load (a data: URL). */
export function motionDocument(block:MotionBlock,width:number,height:number,fontUrl?:string){
 const font=fontUrl?`@font-face{font-family:"Inter Variable";font-style:normal;font-weight:100 900;font-display:block;src:url("${fontUrl}") format("woff2")}`:'';
 return `<!doctype html><html><head><meta charset="utf-8"><style>${font}html,body{margin:0;padding:0;width:${width}px;height:${height}px;background:transparent;overflow:hidden}.mb-stage{position:absolute;left:0;top:0;width:${width}px;height:${height}px;container-type:size;overflow:hidden}${MOTION_CSS}</style></head><body><div class="mb-stage">${motionMarkup(block)}</div></body></html>`;
}

/** The expression that puts the page at a time into the block: `seekAnimations` itself, sent into the page, with the frame's milliseconds in place of `__MS__`. */
export const MOTION_SEEK=`(${seekAnimations.toString()})(document.getAnimations(),__MS__)`;
