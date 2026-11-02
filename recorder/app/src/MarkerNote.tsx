import {useEffect,useRef} from 'react';
import {MARKER_TAGS,MARKER_TAG_LABEL,type MarkerTag} from '../shared/types';
import {askClaude} from './club/workspace/ask-claude';

/** The request Claude gets from "Ask Claude to fix it": the moment and the note in the creator's words. */
export const fixRequest=(time:string,note:string)=>`Fix the part I marked at ${time}: "${note.trim()}"`;

/**
 * A note on a moment of the timeline: the creator writes what is wrong or good there and can say what kind of note it is.
 * It saves as you type. One button hands it to Claude to fix now; otherwise Claude reads every note by its time when asked
 * ("Fix the parts I marked"). It opens over the picture and timeline, never over the side panel.
 */
export function MarkerNote({time,name,tag,anchor,onChange,onNudge,onDelete,onClose}:{time:string;onNudge(seconds:number):void;name:string;tag?:MarkerTag;anchor:{left:number;top:number};onChange(patch:{name?:string;tag?:MarkerTag|null}):void;onDelete():void;onClose():void}){
 const box=useRef<HTMLDivElement>(null),area=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{area.current?.focus();},[]);
 useEffect(()=>{
  const away=(event:PointerEvent)=>{if(!box.current?.contains(event.target as Node)&&!(event.target as HTMLElement).closest?.('.club-marker'))onClose();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape,true);};
 },[onClose]);
 const stage=document.querySelector('.club-edit-stage')?.getBoundingClientRect();
 const width=320,floor=(stage?.left??0)+12;
 const left=Math.max(floor,Math.min(anchor.left-width/2,window.innerWidth-width-12)),top=Math.max(12,anchor.top-252);
 const written=name.trim().length>0;
 const fix=()=>{askClaude(fixRequest(time,name));onClose();};
 return <div ref={box} className="marker-note" role="dialog" aria-label={`Note at ${time}`} style={{left,top,width}}
  onKeyDown={event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&written){event.preventDefault();fix();}}}>
  <div className="marker-note-h">
   <b>Note</b>
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
  <textarea ref={area} rows={3} value={name} placeholder="What should change here? For example: this part drags, cut it shorter." aria-label="Your note" onChange={event=>onChange({name:event.target.value})}/>
  <div className="marker-note-tags" role="group" aria-label="What kind of note">
   {MARKER_TAGS.map(each=><button key={each} type="button" className={`marker-tag ${each}${tag===each?' on':''}`} aria-pressed={tag===each} onClick={()=>onChange({tag:tag===each?null:each})}>{MARKER_TAG_LABEL[each]}</button>)}
  </div>
  <div className="marker-note-a">
   <span className="marker-note-saved">{written?'Saved':'Saves as you type'}</span>
   <span className="grow"/>
   <button type="button" className="marker-btn" onClick={onClose}>Done</button>
   <button type="button" className="marker-btn primary" disabled={!written} onClick={fix} title="⌘ Enter">Ask Claude to fix it</button>
  </div>
 </div>;
}
