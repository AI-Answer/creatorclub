import {useEffect,useRef,type ReactNode} from 'react';
import type {Problems,ProblemAction} from './recorder-checks';
import {RecorderWarnings} from './RecorderWarnings';

/** The label of the one Record button: "Record scene 2", or "Record scene 2 again" once it has a take. */
export const recordLabel=(sceneNumber:number,recorded:boolean)=>`Record scene ${sceneNumber}${recorded?' again':''}`;

/** What the framing preview says when it has no picture: one line and at most one action. */
export type FramingNote={text:string;action?:{label:string;run():void}};

/**
 * A small live picture of the camera (or the screen, when only the screen is on) beside the Record button, so you can check your framing.
 * With no picture it says why in one line, with one action when there is one; it never shows an empty box.
 */
export function FramingPreview({label,stream,mirror,viewBox,note}:{label:string;stream:MediaStream|null;mirror:boolean;viewBox?:string;note:FramingNote}){
 const video=useRef<HTMLVideoElement>(null);
 useEffect(()=>{
  const element=video.current;
  if(!element)return;
  element.srcObject=stream;
  if(stream)void element.play?.()?.catch?.(()=>{});
  return()=>{element.srcObject=null;};
 },[stream]);
 return <div className="club-framing" role="group" aria-label={`${label} framing`}>
  {stream?<video ref={video} aria-label={`${label} framing preview`} muted playsInline autoPlay style={{transform:mirror?'scaleX(-1)':undefined,objectViewBox:viewBox}}/>
   :<div className="club-framing-note"><p>{note.text}</p>{note.action&&<button type="button" className="button compact" onClick={note.action.run}>{note.action.label}</button>}</div>}
 </div>;
}

/**
 * The top of Record inside CreatorClub: a framing preview, one line saying whether the sources are ready (or the one thing that is wrong),
 * a Change control, and the one big Record button for the selected scene. The source rows, presets and the countdown option are in the sheet
 * Change opens; the sheet stays mounted while it is closed, so the previews in it keep reporting whether each source is sending.
 * Opening the sheet moves focus into it; closing it with Escape or the Change button puts focus back on Change.
 */
export function RecordBar({line,problems,onProblem,label,onRecord,recordDisabled,hidden,open,onOpenChange,presets,sources,countdown,framing}:{
 line:{text:string;ready:boolean};problems:Problems|null;onProblem(action:ProblemAction):void;
 /** The Record button's words, or nothing while no scene is selected (the button is then off). */
 label:string|null;onRecord():void;recordDisabled:boolean;
 /** Hidden while a take records (the recording status takes the whole screen). */
 hidden:boolean;open:boolean;onOpenChange(open:boolean):void;
 presets:ReactNode;sources:ReactNode;countdown:ReactNode;
 /** The framing preview, when the camera or the screen is on. */
 framing?:ReactNode;
}){
 const root=useRef<HTMLDivElement>(null),change=useRef<HTMLButtonElement>(null),sheet=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  sheet.current?.querySelector<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)')?.focus();
  const away=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onOpenChange(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){onOpenChange(false);change.current?.focus();}};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape);};
 },[open,onOpenChange]);
 return <section className={`club-record-bar${framing?' has-framing':''}`} aria-label="Record" hidden={hidden}>
  {framing}
  <div className="club-record-controls">
   <div className="club-record-status">
    {problems?<RecorderWarnings problems={problems} onAction={onProblem}/>
     :<p className="club-readiness" role="status"><span className={`club-readiness-dot${line.ready?' is-ready':''}`} aria-hidden="true"/>{line.text}</p>}
    <div className="club-change" ref={root}>
     <button type="button" ref={change} className="button compact" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{onOpenChange(!open);if(open)change.current?.focus();}}>Change</button>
     <div className="club-sources" ref={sheet} role="dialog" aria-label="Sources and settings" hidden={!open}>
      {presets}
      {sources}
      {countdown}
     </div>
    </div>
   </div>
   <button type="button" className="club-record-button" disabled={recordDisabled||!label} onClick={onRecord}><span aria-hidden="true"/>{label??'Record'}</button>
  </div>
 </section>;
}
