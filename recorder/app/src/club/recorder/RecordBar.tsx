import {useEffect,useRef,type ReactNode} from 'react';
import type {Problems,ProblemAction} from './recorder-checks';
import {RecorderWarnings} from './RecorderWarnings';

/** The label of the one Record button: "Record scene 2", or "Record scene 2 again" once it has a take. */
export const recordLabel=(sceneNumber:number,recorded:boolean)=>`Record scene ${sceneNumber}${recorded?' again':''}`;

/**
 * The top of Record inside CreatorClub: one line saying whether the sources are ready (or the one thing that is wrong), a Change control,
 * and the one big Record button for the selected scene. The source rows, presets and the countdown option are in the sheet Change opens;
 * the sheet stays mounted while it is closed, so the previews keep reporting whether each source is sending.
 */
export function RecordBar({line,problems,onProblem,label,onRecord,recordDisabled,hidden,open,onOpenChange,presets,sources,countdown}:{
 line:{text:string;ready:boolean};problems:Problems|null;onProblem(action:ProblemAction):void;
 /** The Record button's words, or nothing while no scene is selected (the button is then off). */
 label:string|null;onRecord():void;recordDisabled:boolean;
 /** Hidden while a take records (the recording status takes the whole screen). */
 hidden:boolean;open:boolean;onOpenChange(open:boolean):void;
 presets:ReactNode;sources:ReactNode;countdown:ReactNode;
}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!open)return;
  const away=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onOpenChange(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onOpenChange(false);};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',escape);};
 },[open,onOpenChange]);
 return <section className="club-record-bar" aria-label="Record" hidden={hidden}>
  <div className="club-record-status">
   {problems?<RecorderWarnings problems={problems} onAction={onProblem}/>
    :<p className="club-readiness" role="status"><span className={`club-readiness-dot${line.ready?' is-ready':''}`} aria-hidden="true"/>{line.text}</p>}
   <div className="club-change" ref={root}>
    <button type="button" className="button compact" aria-haspopup="dialog" aria-expanded={open} onClick={()=>onOpenChange(!open)}>Change</button>
    <div className="club-sources" role="dialog" aria-label="Sources and settings" hidden={!open}>
     {presets}
     {sources}
     {countdown}
    </div>
   </div>
  </div>
  <button type="button" className="club-record-button" disabled={recordDisabled||!label} onClick={onRecord}><span aria-hidden="true"/>{label??'Record'}</button>
 </section>;
}
