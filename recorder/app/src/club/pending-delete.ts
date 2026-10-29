import {useSyncExternalStore} from 'react';
import {clubFetch,errorMessage} from './api';
import {TOAST_MS} from './ui';

/*
 * Deleting an idea can be undone for as long as its toast shows. The server has no way to bring a video back, so the request is held
 * back instead: the video is hidden at once and deleted when the toast has gone. Undo cancels the request.
 * Closing the app before then keeps the idea, which is the safe side of the two.
 */

const pending=new Map<string,ReturnType<typeof setTimeout>>();
let snapshot:ReadonlySet<string>=new Set();
const listeners=new Set<()=>void>();
const publish=()=>{snapshot=new Set(pending.keys());listeners.forEach(listener=>listener());};
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};

/** How long the delete waits: the time a toast with a button stays up. */
export const DELETE_DELAY_MS=TOAST_MS.withButton;

/** Ids of videos that are deleted soon unless undone. Lists leave these out. */
export const usePendingDeletes=()=>useSyncExternalStore(subscribe,()=>snapshot);

/** Hides a video and deletes it after `delay`. Returns Undo. `onFailed` gets one sentence when the server refuses; the video comes back then. */
export function deleteLater(id:string,onFailed:(message:string)=>void,delay=DELETE_DELAY_MS):()=>void{
 if(pending.has(id))return()=>{};
 let sent=false;
 const timer=setTimeout(()=>{
  sent=true;
  clubFetch(`/videos/${encodeURIComponent(id)}`,{method:'DELETE'}).then(()=>{},reason=>onFailed(errorMessage(reason,"Couldn't delete that idea."))).finally(()=>{pending.delete(id);publish();});
 },delay);
 pending.set(id,timer);publish();
 return()=>{
  if(sent||pending.get(id)!==timer)return;
  clearTimeout(timer);pending.delete(id);publish();
 };
}
