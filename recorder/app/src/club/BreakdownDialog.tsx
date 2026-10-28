import {useCallback,useEffect,useRef,useState,type DragEvent} from 'react';
import type {Breakdown,Video} from '../../shared/club';
import {clubFetch,clubUpload} from './api';
import {NOT_A_FILE,isVideoFile,type BreakdownSource} from './breakdown';
import {BreakdownView,alreadyAdded} from './BreakdownView';
import {ErrorLine} from './ErrorLine';
import {isStartedJob} from './jobs';
import {useJobRun} from './useJobRun';
import {Button,Dialog,Spinner,cn} from './ui';

const hasFiles=(event:DragEvent)=>[...(event.dataTransfer?.types??[])].includes('Files');

/** Runs one breakdown (`POST /breakdowns`, then follows the job) and shows its progress, an error or the result. */
function BreakdownRun({initial,onClose,onAdded}:{initial:BreakdownSource;onClose():void;onAdded(video:Video):void}){
 const {state,run}=useJobRun();
 const [source,setSource]=useState(initial),[attempt,setAttempt]=useState(0),[over,setOver]=useState(false),[dropError,setDropError]=useState('');
 const [added,setAdded]=useState<ReadonlySet<number>>(new Set());
 const jobId=useRef<string>(undefined),finished=useRef(false);
 finished.current=state.phase==='done'||state.phase==='failed';

 // One effect run is one attempt. Leaving (or a new attempt) aborts a request that is still on its way and stops the job
 // that was started, even when its id only arrives after the dialog has gone, so nothing keeps working unseen.
 useEffect(()=>{
  const controller=new AbortController(),mine={gone:false};
  const cancel=(id:string)=>{clubFetch(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'}).catch(()=>{});};
  run(async()=>{
   let job:unknown;
   try{
    if(source.kind==='link')job=await clubFetch('/breakdowns',{body:{url:source.url},signal:controller.signal});
    else{const form=new FormData();form.append('file',source.file,source.file.name);job=await clubUpload('/breakdowns',form,controller.signal);}
   }catch(reason){
    // An aborted attempt has nothing to report.
    if(controller.signal.aborted)return new Promise<never>(()=>{});
    throw reason;
   }
   if(isStartedJob(job)){
    if(mine.gone){cancel(job.id);return new Promise<never>(()=>{});}
    jobId.current=job.id;
   }
   return job;
  });
  return()=>{
   mine.gone=true;controller.abort();
   const id=jobId.current;jobId.current=undefined;
   if(id&&!finished.current)cancel(id);
  };
 },[attempt,source,run]);

 const add=useCallback(async(breakdown:Breakdown,index:number)=>{
  try{
   const video=await clubFetch<Video>(`/breakdowns/${encodeURIComponent(breakdown.id)}/concepts/${index}/add`,{method:'POST'});
   onAdded(video);
  }catch(reason){if(!alreadyAdded(reason))throw reason;}
  setAdded(current=>new Set(current).add(index));
 },[onAdded]);

 // After a failure a video file can be dropped anywhere on the dialog; this is what "Drop the video file here" means.
 const canDrop=state.phase==='failed';
 const drop=(event:DragEvent)=>{
  if(!canDrop||!hasFiles(event))return;
  event.preventDefault();setOver(false);
  const file=event.dataTransfer.files[0];
  if(!file)return;
  if(!isVideoFile(file)){setDropError(NOT_A_FILE);return;}
  setDropError('');setSource({kind:'file',file});setAttempt(n=>n+1);
 };
 const retry=()=>{setDropError('');setAttempt(n=>n+1);};

 return <div className={cn('max-h-[70vh] min-h-24 overflow-y-auto pr-1',over&&'rounded-lg outline-2 outline-dashed outline-accent')}
  onDragOver={event=>{if(canDrop&&hasFiles(event)){event.preventDefault();setOver(true);}}} onDragLeave={()=>setOver(false)} onDrop={drop}>
  {(state.phase==='idle'||state.phase==='running')&&<div className="flex flex-col items-start gap-4 py-2">
   <div className="flex items-center gap-3 text-base text-ink" aria-live="polite"><Spinner label="Working" size={18}/><span>{state.phase==='running'&&state.line?state.line:'Getting ready…'}</span></div>
   <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
  </div>}
  {state.phase==='failed'&&<div className="flex flex-col gap-4 py-2">
   <ErrorLine message={dropError||state.message} onRetry={retry}/>
   <p className={cn('rounded-lg border border-dashed px-4 py-6 text-center text-base',over?'border-accent bg-accent-soft text-accent':'border-line text-muted')}>Drop a video file here</p>
  </div>}
  {state.phase==='done'&&<BreakdownView breakdown={state.result as Breakdown} added={added} onAdd={index=>add(state.result as Breakdown,index)}/>}
 </div>;
}

/** Break down this video, in a dialog that is open while it is rendered. `source` is what was pasted or dropped. */
export function BreakdownDialog({source,onClose,onAdded}:{source:BreakdownSource;onClose():void;onAdded(video:Video):void}){
 return <Dialog open onClose={onClose} title="Break down this video" className="max-w-3xl!">
  <BreakdownRun initial={source} onClose={onClose} onAdded={onAdded}/>
 </Dialog>;
}
