import {useAiAvailable} from './ai-status';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Breakdown} from '../../shared/club';
import {ClubApiError,clubFetch,clubUpload} from './api';
import {breakdownStep,commentsRead,type BreakdownSource} from './breakdown';
import {isStartedJob} from './jobs';
import {notifyBreakdownsChanged} from './useBreakdowns';
import {useJobRun,type JobRun} from './useJobRun';

/** What to show a breakdown of: a link or a dropped video file (both run a job), or a breakdown that was already made. */
export type BreakdownTarget=BreakdownSource|{kind:'saved';id:string};

export type BreakdownRun={
 state:JobRun;
 /** Which of the four steps is going now. */
 step:number;
 /** How many comments were read, once the server says so. */
 comments?:number;
 retry():void;
 /** Starts again from a dropped video file, for when a link could not be read. */
 tryFile(file:File):void;
};

/**
 * Runs one breakdown (`POST /breakdowns`, then follows the job) or loads a saved one, and says which step it is on.
 * One effect run is one attempt. Leaving (or a new attempt) aborts a request that is still on its way and stops the job
 * that was started, even when its id only arrives after the screen has gone, so nothing keeps working unseen.
 */
export function useBreakdownRun(initial:BreakdownTarget):BreakdownRun{
 const aiAvailable=useAiAvailable();
 const {state,run}=useJobRun();
 const available=useRef(aiAvailable);available.current=aiAvailable;
 const [source,setSource]=useState(initial),[attempt,setAttempt]=useState(0);
 const [progress,setProgress]=useState<{step:number;comments?:number}>({step:0});
 const jobId=useRef<string>(undefined),finished=useRef(false);
 finished.current=state.phase==='done'||state.phase==='failed'||state.phase==='cancelled';

 const line=state.phase==='running'?state.line:undefined;
 useEffect(()=>{
  if(!line)return;
  setProgress(current=>({step:Math.max(current.step,breakdownStep(line)),comments:commentsRead(line)??current.comments}));
 },[line]);

 useEffect(()=>{
  setProgress({step:0});
  if(source.kind==='saved'){void run(()=>clubFetch<Breakdown>(`/breakdowns/${encodeURIComponent(source.id)}`));return;}
  if(!available.current){void run(()=>Promise.reject(new ClubApiError('Connect an AI in Settings.')));return;}
  const controller=new AbortController(),mine={gone:false};
  const cancel=(id:string)=>{clubFetch(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'}).catch(()=>{});};
  void run(async()=>{
   let job:unknown;
   try{
    if(source.kind==='link')job=await clubFetch('/breakdowns',{body:{url:source.url},signal:controller.signal});
    else{const form=new FormData();form.append('file',source.file,source.file.name);job=await clubUpload('/breakdowns',form,controller.signal);}
   }catch(reason){
    // An aborted attempt has nothing to report.
    if(controller.signal.aborted)throw new ClubApiError('That was stopped.');
    throw reason;
   }
   if(isStartedJob(job)){
    if(mine.gone){cancel(job.id);throw new ClubApiError('That was stopped.');}
    jobId.current=job.id;
   }
   return job;
  },()=>notifyBreakdownsChanged());
  return()=>{
   mine.gone=true;controller.abort();
   const id=jobId.current;jobId.current=undefined;
   if(id&&!finished.current)cancel(id);
  };
 },[attempt,source,run]);

 const retry=useCallback(()=>setAttempt(n=>n+1),[]);
 const tryFile=useCallback((file:File)=>{setSource({kind:'file',file});setAttempt(n=>n+1);},[]);
 return {state,step:progress.step,comments:progress.comments,retry,tryFile};
}
