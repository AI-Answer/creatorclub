import {useMemo,useSyncExternalStore} from 'react';
import {captureWorkspace,clubFetch,currentClubWorkspace} from './api';
import {deferDelete} from './deferred-delete';
import {TOAST_MS} from './ui';
export const DELETE_DELAY_MS=TOAST_MS.withButton;
/** A separate instance per kind, with channel-scoped identities and one deletion lifecycle. */
export function pendingDeleteStore(){
 const pending=new Map<string,()=>void>(),deleted=new Set<string>();
 let snapshot:ReadonlySet<string>=new Set();
 const listeners=new Set<()=>void>();
 const publish=()=>{snapshot=new Set([...pending.keys(),...deleted]);listeners.forEach(listener=>listener());};
 const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
 return {
  useIds(){return useSyncExternalStore(subscribe,()=>snapshot);},
  remove(key:string,send:()=>Promise<unknown>,onFailed:(message:string)=>void,delay:number,fallback?:string){
   const existing=pending.get(key);if(existing)return existing;
   const undo=deferDelete({send,onFailed,delay,fallback,onUndo:()=>{pending.delete(key);publish();},onSettled:gone=>{if(gone)deleted.add(key);pending.delete(key);publish();}});
   pending.set(key,undo);publish();return undo;
  },
 };
}
const videos=pendingDeleteStore();
export const deleteScope=()=>currentClubWorkspace()??'';
export const usePendingDeletes=()=>{
 const all=videos.useIds(),prefix=`${deleteScope()}/`;
 return useMemo(()=>new Set([...all].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length))),[all,prefix]);
};
export function deleteLater(id:string,onFailed:(message:string)=>void,delay=DELETE_DELAY_MS):()=>void{
 const scope=deleteScope(),workspace=captureWorkspace();
 return videos.remove(`${scope}/${id}`,async()=>clubFetch(`/videos/${encodeURIComponent(id)}`,{method:'DELETE',workspace:await workspace}),onFailed,delay,"Couldn't delete that idea.");
}
