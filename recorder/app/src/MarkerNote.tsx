import {useEffect,useRef} from 'react';
import {MARKER_TAGS,MARKER_TAG_LABEL,type MarkerTag} from '../shared/types';

/**
 * A note on a moment of the timeline: the creator writes what is wrong or good there and can tag it ("I don't like this").
 * Claude reads these notes by their time, so "fix the parts I marked" needs nothing more. It saves as you type.
 */
export function MarkerNote({time,name,tag,anchor,onChange,onDelete,onClose}:{time:string;name:string;tag?:MarkerTag;anchor:{left:number;top:number};onChange(patch:{name?:string;tag?:MarkerTag|null}):void;onDelete():void;onClose():void}){
 const box=useRef<HTMLDivElement>(null),area=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{area.current?.focus();},[]);
 useEffect(()=>{
  const away=(event:PointerEvent)=>{if(!box.current?.contains(event.target as Node)&&!(event.target as HTMLElement).closest?.('.club-marker'))onClose();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape,true);};
 },[onClose]);
 const left=Math.max(12,Math.min(anchor.left-140,window.innerWidth-300)),top=Math.max(12,anchor.top-196);
 return <div ref={box} className="marker-note" role="dialog" aria-label={`Note at ${time}`} style={{left,top}}>
  <div className="marker-note-h"><b>Note at {time}</b></div>
  <textarea ref={area} rows={3} value={name} placeholder="What should change here?" aria-label="Your note" onChange={event=>onChange({name:event.target.value})}/>
  <div className="marker-note-tags" role="group" aria-label="How you feel about it">
   {MARKER_TAGS.map(each=><button key={each} type="button" className={`marker-tag ${each}${tag===each?' on':''}`} aria-pressed={tag===each} onClick={()=>onChange({tag:tag===each?null:each})}>{MARKER_TAG_LABEL[each]}</button>)}
  </div>
  <div className="marker-note-a"><button type="button" className="btn ghost sm" onClick={onDelete}>Delete note</button><span className="grow"/><button type="button" className="btn sm" onClick={onClose}>Done</button></div>
 </div>;
}
