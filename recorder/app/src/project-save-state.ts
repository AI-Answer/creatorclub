import type {Project} from '../shared/types';
export type SavePhase='clean'|'dirty'|'saving'|'failed'|'retrying'|'conflicted';
export type SaveEvent='edit'|'save'|'saved'|'fail'|'retry'|'conflict'|'reset';
export function saveTransition(phase:SavePhase,event:SaveEvent):SavePhase{
 if(event==='reset')return 'clean';if(event==='conflict')return 'conflicted';if(phase==='conflicted')return phase;
 return ({edit:'dirty',save:'saving',saved:'clean',fail:'failed',retry:'retrying'} as const)[event];
}
export const saveLabel=(phase:SavePhase)=>({clean:'Saved locally',dirty:'Saving…',saving:'Saving…',failed:'Save failed',retrying:'Retrying save…',conflicted:'Conflict · local edits kept'})[phase];
const PREFIX='creator-compiler.recovery.v2.',MAX_AGE=7*24*60*60*1000,MAX_ENTRIES=4,STALE_MS=120_000;
let fallbackScope='';
/** Stable across reloads; journal ownership expires when this window stops heartbeating. */
export function projectRecoveryScope(){try{let id=sessionStorage.getItem(PREFIX+'window');if(!id){id=crypto.randomUUID();sessionStorage.setItem(PREFIX+'window',id);}return id;}catch{return fallbackScope||=(crypto.randomUUID());}}
const key=(id:string,scope:string)=>`${PREFIX}${scope}.${id}`;
export type ProjectRecovery={project:Project;baseRevision:string;writtenAt:number;instanceId:string;heartbeatAt:number};
const entries=()=>{const found:Array<{key:string;writtenAt:number;instanceId?:string;heartbeatAt?:number}>=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(PREFIX))continue;try{const value=JSON.parse(localStorage.getItem(k)||'null');found.push({key:k,writtenAt:Number(value?.writtenAt)||0,instanceId:value?.instanceId,heartbeatAt:value?.heartbeatAt});}catch{found.push({key:k,writtenAt:0});}}return found;};
/** Write only on failure, conflict or exit. Bound storage and tolerate full or unavailable localStorage. */
export function keepProjectRecovery(project:Project,baseRevision:string,scope=projectRecoveryScope()){
 try{const now=Date.now(),k=key(project.id,scope),all=entries().sort((a,b)=>b.writtenAt-a.writtenAt);let kept=0;for(const entry of all)if(entry.key!==k&&(entry.instanceId===scope||now-(entry.heartbeatAt??entry.writtenAt)>STALE_MS)&&(now-entry.writtenAt>MAX_AGE||++kept>=MAX_ENTRIES))localStorage.removeItem(entry.key);
  localStorage.setItem(k,JSON.stringify({project,baseRevision,writtenAt:now,instanceId:scope,heartbeatAt:now} satisfies ProjectRecovery));return true;
 }catch{return false;}
}
/** Claim a stale owner's journal so subsequent saves and heartbeats belong to this window. */
export function readProjectRecovery(id:string,scope=projectRecoveryScope()):ProjectRecovery|undefined{
 try{const now=Date.now(),keys=new Set([key(id,scope),...entries().map(entry=>entry.key)]),eligible:Array<{key:string;entry:ProjectRecovery}>=[];
  for(const k of keys){const entry=JSON.parse(localStorage.getItem(k)||'null') as ProjectRecovery|null;if(entry?.project?.id!==id||typeof entry.baseRevision!=='string')continue;
   if(now-entry.writtenAt>MAX_AGE){localStorage.removeItem(k);continue;}
   if(k===key(id,scope)||entry.instanceId===scope||now-(entry.heartbeatAt??entry.writtenAt)>STALE_MS)eligible.push({key:k,entry});
  }
  eligible.sort((a,b)=>Number(b.key===key(id,scope))-Number(a.key===key(id,scope))||b.entry.writtenAt-a.entry.writtenAt);const found=eligible[0];if(!found)return;
  const claimed={...found.entry,instanceId:scope,heartbeatAt:now};localStorage.setItem(key(id,scope),JSON.stringify(claimed));if(found.key!==key(id,scope))localStorage.removeItem(found.key);return claimed;
 }catch{}return;
}
export function heartbeatProjectRecovery(scope=projectRecoveryScope(),heartbeatAt=Date.now()){
 try{for(const {key:k} of entries()){const entry=JSON.parse(localStorage.getItem(k)||'null');if(entry?.instanceId===scope)localStorage.setItem(k,JSON.stringify({...entry,heartbeatAt}));}}catch{}
}
export const releaseProjectRecovery=(scope=projectRecoveryScope())=>heartbeatProjectRecovery(scope,0);
export function clearProjectRecovery(id:string,scope=projectRecoveryScope()){try{localStorage.removeItem(key(id,scope));}catch{}}
