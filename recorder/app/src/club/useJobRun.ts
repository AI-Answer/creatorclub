import {useCallback,useEffect,useRef,useState} from 'react';
import {errorMessage} from './api';
import {failureMessage,isStartedJob,progressLine,watchJob} from './jobs';

export type JobRun=
 |{phase:'idle'}
 |{phase:'running';line?:string}
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
 const run=useCallback(async(start:()=>Promise<unknown>,onDone?:(result:unknown)=>void)=>{
  stop.current();
  const set=(next:JobRun)=>{if(alive.current)setState(next);};
  set({phase:'running'});
  let started:unknown;
  try{started=await start();}catch(error){set({phase:'failed',message:errorMessage(error)});return;}
  if(!isStartedJob(started)){set({phase:'done',result:started});onDone?.(started);return;}
  stop.current=watchJob(started.id,event=>{
   if(event.type==='progress'){const line=progressLine(event.data);if(line)set({phase:'running',line});}
   else if(event.type==='done'){set({phase:'done',result:event.data});onDone?.(event.data);}
   else if(event.type==='failed')set({phase:'failed',message:failureMessage(event.data)});
   else set({phase:'idle'});
  });
 },[]);
 return {state,run};
}
