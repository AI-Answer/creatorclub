import {useCallback,useEffect,useSyncExternalStore} from 'react';
import type {AiStatus,ConnectProvider} from '../../shared/club';
import {clubFetch,errorMessage} from './api';

export type AiState='checking'|'connected'|'missing'|'unknown';
export type AiCheck=
 |{phase:'checking';status:AiStatus|null}
 |{phase:'ready';status:AiStatus}
 |{phase:'failed';status:AiStatus|null;message:string};
type AiStore={check:AiCheck;chosen:'claude'|'codex';choiceKnown:boolean};
let store:AiStore={check:{phase:'checking',status:null},chosen:'claude',choiceKnown:false};
const listeners=new Set<()=>void>();
const publish=(next:AiStore)=>{store=next;listeners.forEach(listener=>listener());};
let statusRequest:Promise<void>|null=null,choiceRequest:Promise<void>|null=null;
let newestRequest=0,choiceVersion=0,lastStatusProbe=0;
export const AI_FOCUS_REFRESH_MS=60000;
export const beginAiStatusRequest=()=>++newestRequest;
export const rememberAiStatus=(status:AiStatus,token=beginAiStatusRequest())=>{
 if(token<newestRequest)return;
 newestRequest=token;publish({...store,check:{phase:'ready',status}});
};
export const lastAiStatus=()=>store.check.status;
export const forgetAiStatus=()=>{newestRequest++;statusRequest=null;lastStatusProbe=0;publish({...store,check:{phase:'checking',status:null}});};
export const anyConnected=(status:AiStatus|null)=>!!status&&(!!status.claude?.signedIn||!!status.codex?.signedIn);
export function aiState(check:AiCheck):AiState{
 if(anyConnected(check.status))return 'connected';
 if(check.phase==='checking')return 'checking';
 return check.phase==='failed'?'unknown':'missing';
}
/** One shared read, including while Settings, Welcome and sketch thumbnails mount together. */
export function refreshAiStatus(force=false):Promise<void>{
 if(statusRequest)return statusRequest;
 if(!force&&store.check.phase!=='checking')return Promise.resolve();
 const token=beginAiStatusRequest();lastStatusProbe=Date.now();
 if(!lastAiStatus()&&store.check.phase==='checking')publish({...store,check:{phase:'checking',status:null}});
 const request=clubFetch<AiStatus>('/ai/status').then(status=>rememberAiStatus(status,token),reason=>{
  if(token===newestRequest)publish({...store,check:{phase:'failed',status:lastAiStatus(),message:errorMessage(reason)}});
 }).finally(()=>{if(statusRequest===request)statusRequest=null;});
 statusRequest=request;return request;
}
export function rememberChosenAi(provider:string|null|undefined){
 choiceVersion++;publish({...store,chosen:provider==='codex'?'codex':'claude',choiceKnown:true});
}
export function refreshChosenAi(force=false):Promise<void>{
 if(choiceRequest)return choiceRequest;
 if(store.choiceKnown&&!force)return Promise.resolve();
 const version=choiceVersion;
 const request=clubFetch<{defaultAi?:string}>('/settings').then(settings=>{if(version===choiceVersion)rememberChosenAi(settings.defaultAi);},()=>{}).finally(()=>{if(choiceRequest===request)choiceRequest=null;});
 choiceRequest=request;return request;
}
const focus=()=>{if(Date.now()-lastStatusProbe<AI_FOCUS_REFRESH_MS)return;void refreshAiStatus(true);void refreshChosenAi(true);};
const subscribe=(listener:()=>void)=>{
 if(!listeners.size)window.addEventListener('focus',focus);
 listeners.add(listener);
 return()=>{listeners.delete(listener);if(!listeners.size)window.removeEventListener('focus',focus);};
};
export function useAiStore(){
 const snapshot=useSyncExternalStore(subscribe,()=>store,()=>store);
 return snapshot;
}
export function useAiCheck(refreshOnMount=false){
 const {check}=useAiStore();
 useEffect(()=>{void refreshAiStatus(refreshOnMount);},[refreshOnMount]);
 const reload=useCallback(()=>{void refreshAiStatus(true);},[]);
 const connected=useCallback((provider:ConnectProvider,account?:string)=>{
  const base=lastAiStatus()??{claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
  rememberAiStatus({...base,[provider]:{...base[provider],installed:true,signedIn:true,...(account?{account}:{})}});
  // Invalidate the old probe before starting the post-connect probe.
  statusRequest=null;void refreshAiStatus(true);void refreshChosenAi(true);
 },[]);
 return {check,reload,connected};
}
export function useAiAvailability(){
 const {check}=useAiCheck(),status=check.status;
 return {known:status!==null,available:status===null||anyConnected(status)};
}
export function useAiAvailable(){return useAiAvailability().available;}
export const AI_CONNECT_HINT='Connect an AI in Settings';
