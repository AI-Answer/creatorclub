import {useCallback,useEffect,useRef,useState} from 'react';
import type {ConnectProgress,ConnectProvider,ConnectResult,JobSnapshot} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import {failureMessage,watchJob} from './jobs';

export type ConnectState=
 |{phase:'idle'}
 |{phase:'installing';lines:string[]}
 |{phase:'signing-in'}
 |{phase:'connected';account?:string}
 |{phase:'failed';message:string};

export const connectLabel:Record<ConnectProvider,string>={claude:'Claude',codex:'ChatGPT',gemini:'Google'};
const KEEP_LINES=3;

/**
 * Starts `POST /api/club/ai/connect` and follows the job it returns: installing, signing in, connected.
 * `onConnected` runs once the tool reports being signed in. Leaving the screen stops following; the server keeps going.
 */
export function useConnect(onConnected?:(result:ConnectResult)=>void){
 const [state,setState]=useState<ConnectState>({phase:'idle'});
 const [provider,setProvider]=useState<ConnectProvider|null>(null);
 const stop=useRef<()=>void>(()=>{});
 const alive=useRef(true);
 const done=useRef(onConnected);done.current=onConnected;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current();};},[]);
 const start=useCallback(async(next:ConnectProvider,reconnect=false)=>{
  stop.current();
  const set=(value:ConnectState)=>{if(alive.current)setState(value);};
  setProvider(next);set({phase:'signing-in'});
  let job:JobSnapshot;
  try{job=await clubFetch<JobSnapshot>('/ai/connect',{body:{provider:next,...(reconnect?{reconnect:true}:{})}});}
  catch(error){set({phase:'failed',message:errorMessage(error)});return;}
  stop.current=watchJob(job.id,event=>{
   if(event.type==='progress'){
    const progress=event.data as ConnectProgress;
    if(progress.phase==='installing')setState(current=>{
     if(!alive.current)return current;
     const lines=current.phase==='installing'?current.lines:[];
     return {phase:'installing',lines:progress.line?[...lines,progress.line].slice(-KEEP_LINES):lines};
    });
    else if(progress.phase==='signing-in')set({phase:'signing-in'});
   }else if(event.type==='done'){
    const result=event.data as ConnectResult;
    set({phase:'connected',account:result?.account});done.current?.(result);
   }else if(event.type==='failed')set({phase:'failed',message:failureMessage(event.data)});
   else set({phase:'idle'});
  });
 },[]);
 return {state,provider,start};
}
