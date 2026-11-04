import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {AiStatus,ConnectProvider} from '../../shared/club';
import {clubFetch,errorMessage} from './api';

/** The last answer for "which AI accounts are signed in". Reading it takes the AI tools about 15 seconds, so the next screen starts from this one. */
let last:AiStatus|null=null;
const listeners=new Set<()=>void>();
let availabilityRequest:Promise<void>|null=null;
// Starting a newer read invalidates older in-flight answers, even before it resolves.
let newestRequest=0;
export const beginAiStatusRequest=()=>++newestRequest;
export const rememberAiStatus=(status:AiStatus,token=beginAiStatusRequest())=>{
 if(token<newestRequest)return;
 newestRequest=token;last=status;listeners.forEach(listener=>listener());
};
export const lastAiStatus=()=>last;
/** For tests. */
export const forgetAiStatus=()=>{last=null;newestRequest++;listeners.forEach(listener=>listener());};

export const anyConnected=(status:AiStatus|null)=>!!status&&(!!status.claude?.signedIn||!!status.codex?.signedIn);

/** What Welcome knows about the AI: still asking, signed in, not signed in, or the ask itself failed (then nothing is claimed either way). */
export type AiState='checking'|'connected'|'missing'|'unknown';
export function aiState(check:AiCheck):AiState{
 if(anyConnected(check.status))return 'connected';
 if(check.phase==='checking')return 'checking';
 return check.phase==='failed'?'unknown':'missing';
}

export type AiCheck=
 |{phase:'checking';status:AiStatus|null}
 |{phase:'ready';status:AiStatus}
 |{phase:'failed';status:AiStatus|null;message:string};

/**
 * Asks which AI accounts are signed in, once when it is first used and again on `reload`. While it asks, `status` is the last known answer (or null the first time),
 * so a screen can show what was true a moment ago instead of nothing. A failed ask keeps that answer too.
 */
export function useAiCheck(){
 const [check,setCheck]=useState<AiCheck>({phase:'checking',status:last});
 const latest=useRef(0);
 const load=useCallback(()=>{
  const mine=++latest.current,token=beginAiStatusRequest();
  setCheck(current=>({phase:'checking',status:current.status}));
  clubFetch<AiStatus>('/ai/status').then(status=>{rememberAiStatus(status,token);if(latest.current===mine)setCheck({phase:'ready',status});},reason=>{if(latest.current===mine)setCheck(current=>({phase:'failed',status:current.status,message:errorMessage(reason)}));});
 },[]);
 useEffect(()=>{load();return()=>{latest.current++;};},[load]);
 /** An account just finished signing in: show it as connected now, and read the real status again in the background. */
 const connected=useCallback((provider:ConnectProvider,account?:string)=>{
  setCheck(current=>{
   const base=current.status??{claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
   const status={...base,[provider]:{...base[provider],installed:true,signedIn:true,...(account?{account}:{})}};
   return {phase:'ready',status};
  });
  load();
 },[load]);
 return {check,reload:load,connected};
}

/**
 * Shared live availability, asked once per app session (the check takes the AI tools about 15 seconds).
 * Until the first answer the controls stay usable, so a signed-in creator never sees them greyed out while it runs; once an answer says nothing is connected, they are disabled.
 */
export function useAiAvailability(){
 const status=useSyncExternalStore(subscribe,lastAiStatus,()=>null);
 useEffect(()=>{
  if(!last&&!availabilityRequest){
   const token=beginAiStatusRequest();
   availabilityRequest=clubFetch<AiStatus>('/ai/status').then(status=>rememberAiStatus(status,token),()=>{}).finally(()=>{availabilityRequest=null;});
  }
 },[]);
 return {known:status!==null,available:status===null||anyConnected(status)};
}
export function useAiAvailable(){return useAiAvailability().available;}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const AI_CONNECT_HINT='Connect an AI in Settings';
