import {useCallback,useEffect,useReducer,useRef} from 'react';
import {clubFetch,errorMessage} from './api';
import {failureMessage,isStartedJob,progressLine,watchJob} from './jobs';

export type JobRun=
 |{phase:'idle'|'cancelled'}
 |{phase:'starting'|'running';line?:string;partial?:unknown;stopping?:boolean}
 |{phase:'done';result?:unknown}
 |{phase:'failed';message:string};
export const isJobBusy=(state:JobRun)=>state.phase==='starting'||state.phase==='running';
export type JobRunState={generation:number;run:JobRun};
export function jobRunReducer(state:JobRunState,event:JobRunState):JobRunState{
 return event.generation<state.generation?state:event;
}
type Attempt={generation:number;id?:string;cancelled:boolean;state:JobRun;close():void;settle():void};

/** One generation owns the POST, watcher, cancellation and completion callback. */
export function useJobRun(){
 const [current,dispatch]=useReducer(jobRunReducer,{generation:0,run:{phase:'idle'}});
 const attempt=useRef<Attempt>({generation:0,cancelled:false,state:{phase:'idle'},close:()=>{},settle:()=>{}});
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;attempt.current.close();};},[]);
 const run=useCallback(async(start:()=>Promise<unknown>,onDone?:(result:unknown)=>void,onSettled?:()=>void)=>{
  attempt.current.close();
  let settled=false;
  const mine:Attempt={generation:attempt.current.generation+1,cancelled:false,state:{phase:'starting'},close:()=>{},settle:()=>{if(!settled){settled=true;onSettled?.();}}};
  attempt.current=mine;
  const active=()=>alive.current&&attempt.current===mine;
  const set=(next:JobRun)=>{if(active()){mine.state=next;dispatch({generation:mine.generation,run:next});if(!isJobBusy(next))mine.settle();}};
  const cancelJob=async(id:string)=>{
   try{await clubFetch(`/jobs/${encodeURIComponent(id)}`,{method:'DELETE'});}
   catch(error){set({phase:'failed',message:errorMessage(error,"Couldn't stop that.")});}
  };
  set({phase:'starting'});
  let started:unknown;
  try{started=await start();}catch(error){set(mine.cancelled?{phase:'cancelled'}:{phase:'failed',message:errorMessage(error)});return;}
  if(!isStartedJob(started)){
   set(mine.cancelled?{phase:'cancelled'}:{phase:'done',result:started});
   if(active()&&!mine.cancelled)onDone?.(started);
   return;
  }
  mine.id=started.id;
  if(mine.cancelled)void cancelJob(started.id);
  if(!active())return;
  set({phase:'running',...(mine.cancelled?{stopping:true,line:'Stopping…'}:{})});
  mine.close=watchJob(started.id,event=>{
   if(!active())return;
   if(event.type==='progress'){
    if(event.reset){set({phase:'running',...(mine.cancelled?{stopping:true,line:'Stopping…'}:{})});return;}
    const line=progressLine(event.data),partial=(event.data as {partial?:unknown}|null)?.partial;
    if(line||partial)set({phase:'running',line:mine.cancelled?'Stopping…':line||undefined,...(mine.cancelled?{stopping:true}:{}),...(partial?{partial}:{})});
   }else if(event.type==='done'){
    set({phase:'done',result:event.data});onDone?.(event.data);
   }else if(event.type==='failed')set({phase:'failed',message:failureMessage(event.data)});
   else set({phase:'cancelled'});
  });
 },[]);
 const attach=useCallback((id:string,onDone?:(result:unknown)=>void,onSettled?:()=>void)=>run(()=>Promise.resolve({id,status:'running'}),onDone,onSettled),[run]);
 const cancel=useCallback(async()=>{
  const mine=attempt.current;if(!isJobBusy(mine.state)||mine.cancelled)return;mine.cancelled=true;
  if(alive.current)dispatch({generation:mine.generation,run:{phase:mine.id?'running':'starting',stopping:true,line:'Stopping…'}});
  if(!mine.id)return;
  try{await clubFetch(`/jobs/${encodeURIComponent(mine.id)}`,{method:'DELETE'});}
  catch(error){if(alive.current&&attempt.current===mine&&isJobBusy(mine.state)){mine.state={phase:'failed',message:errorMessage(error,"Couldn't stop that.")};dispatch({generation:mine.generation,run:mine.state});mine.settle();}}
 },[]);
 return {state:current.run,run,attach,cancel};
}
