import {useCallback,useEffect,useRef,useState} from 'react';
import {clubFetch,errorMessage} from './api';
import {failureMessage,isStartedJob,progressLine,watchJob} from './jobs';

export type JobRun=
 |{phase:'idle'}
 |{phase:'running';line?:string;/** What a structured answer holds so far, while it is written. */partial?:unknown}
 |{phase:'done';result?:unknown}
 |{phase:'failed';message:string};

/**
 * Runs something that starts a server job (`start` returns the POST response) and follows it to the end.
 * A response that is not a job counts as finished at once, so callers work before and after a route becomes a job.
 * The watcher is closed when the component unmounts; the job itself keeps running.
 */
export function useJobRun(){
 const [state,setState]=useState<JobRun>({phase:'idle'});
 const stop=useRef<()=>void>(()=>{});
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current();};},[]);
 const jobId=useRef<string|undefined>(undefined);
 const run=useCallback(async(start:()=>Promise<unknown>,onDone?:(result:unknown)=>void)=>{
  stop.current();jobId.current=undefined;
  const set=(next:JobRun)=>{if(alive.current)setState(next);};
  set({phase:'running'});
  let started:unknown;
  try{started=await start();}catch(error){set({phase:'failed',message:errorMessage(error)});return;}
  if(!isStartedJob(started)){set({phase:'done',result:started});onDone?.(started);return;}
  jobId.current=started.id;
  stop.current=watchJob(started.id,event=>{
   if(event.type==='progress'){
    const line=progressLine(event.data),partial=(event.data as {partial?:unknown}|null)?.partial;
    if(line||partial)set({phase:'running',line:line||undefined,...(partial?{partial}:{})});
   }
   else if(event.type==='done'){set({phase:'done',result:event.data});onDone?.(event.data);}
   else if(event.type==='failed')set({phase:'failed',message:failureMessage(event.data)});
   else set({phase:'idle'});
  });
 },[]);
 /** Follows a job that is already running on the server (a page opened mid-run). */
 const attach=useCallback((id:string,onDone?:(result:unknown)=>void)=>run(()=>Promise.resolve({id,status:'running'}),onDone),[run]);
 /** Stops the running job on the server; the screen goes back to idle when the server confirms. */
 const cancel=useCallback(async()=>{
  const id=jobId.current;if(!id)return;
  try{await clubFetch(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});}
  catch(error){if(alive.current)setState({phase:'failed',message:errorMessage(error,"Couldn't stop that.")});}
 },[]);
 return {state,run,attach,cancel};
}
