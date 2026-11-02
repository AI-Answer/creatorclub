import {useEffect,useRef} from 'react';
import type {MarkerTag} from '../shared/types';
import {askClaude} from './club/workspace/ask-claude';

/** The request Claude gets from "Ask Claude": the moment and the note in the creator's words. */
export const fixRequest=(time:string,note:string)=>`Fix the part I marked at ${time}: "${note.trim()}"`;

/**
 * A note on a moment of the timeline. It saves as you type; Ask Claude (⌘ Enter) hands it to Claude now, and Claude also reads every
 * note by its time when asked to "fix the parts I marked". It sits over the picture, above the play bar, never over the transcript.
 */
export function MarkerNote({time,name,anchor,onChange,onNudge,onDelete,onClose}:{time:string;onNudge(seconds:number):void;name:string;tag?:MarkerTag;anchor:{left:number;top:number};onChange(patch:{name?:string;tag?:MarkerTag|null}):void;onDelete():void;onClose():void}){
 const box=useRef<HTMLDivElement>(null),area=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{area.current?.focus();},[]);
 useEffect(()=>{
  const away=(event:PointerEvent)=>{if(!box.current?.contains(event.target as Node)&&!(event.target as HTMLElement).closest?.('.club-marker'))onClose();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape,true);};
 },[onClose]);
 const stage=document.querySelector('.club-edit-stage')?.getBoundingClientRect();
 const bar=document.querySelector('.club-timeline-bar')?.getBoundingClientRect();
 const width=300,left=Math.max((stage?.left??0)+12,Math.min(anchor.left-width/2,window.innerWidth-width-12));
 // Its bottom stays above the play bar, so Play, Split and Note stay in reach.
 const bottom=bar?window.innerHeight-bar.top+8:window.innerHeight-anchor.top+8;
 const written=name.trim().length>0;
 const ask=()=>{askClaude(fixRequest(time,name));onClose();};
 return <div ref={box} className="marker-note" role="dialog" aria-label={`Note at ${time}`} style={{left,bottom,width}}
  onKeyDown={event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&written){event.preventDefault();ask();}}}>
  <div className="marker-note-h">
   <span className="marker-note-time" role="group" aria-label="When">
    <button type="button" className="marker-nudge" aria-label="One second earlier" onClick={()=>onNudge(-1)}>‹</button>
    <span className="tnum">{time}</span>
    <button type="button" className="marker-nudge" aria-label="One second later" onClick={()=>onNudge(1)}>›</button>
   </span>
   <span className="grow"/>
   <button type="button" className="marker-note-x" aria-label="Delete note" title="Delete note" onClick={onDelete}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
   </button>
  </div>
  <textarea ref={area} rows={2} value={name} placeholder="Write a note" aria-label="Your note" onChange={event=>onChange({name:event.target.value})}/>
  <div className="marker-note-a">
   <button type="button" className="btn sm" onClick={onClose}>Done</button>
   <button type="button" className="btn sm primary" disabled={!written} onClick={ask}>Ask Claude</button>
  </div>
 </div>;
}
