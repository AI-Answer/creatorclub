import {useMemo,useSyncExternalStore} from 'react';
import {clubFetch,errorMessage} from '../api';
import {TOAST_MS} from '../ui';

/*
 * Removing a tile can be undone for as long as its toast shows. The server deletes a tile for good, so the request is held back instead:
 * the tile is hidden at once and deleted when the toast has gone. Undo cancels the request, also after the Board was left.
 * Closing the app before then keeps the tile, which is the safe side of the two.
 */

const pending=new Map<string,ReturnType<typeof setTimeout>>();
// Tiles the server has deleted stay hidden for the rest of the session, so a list read just before the delete finished cannot bring one back.
const deleted=new Set<string>();
let snapshot:ReadonlySet<string>=new Set();
const listeners=new Set<()=>void>();
const keyOf=(videoId:string,tileId:string)=>`${videoId}/${tileId}`;
const publish=()=>{snapshot=new Set([...pending.keys(),...deleted]);listeners.forEach(listener=>listener());};
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};

export const TILE_DELETE_DELAY_MS=TOAST_MS.withButton;

/** Ids of this video's tiles that are deleted soon unless undone, or already deleted. The Board leaves these out. */
export function usePendingTiles(videoId:string):ReadonlySet<string>{
 const all=useSyncExternalStore(subscribe,()=>snapshot);
 return useMemo(()=>{
  const prefix=`${videoId}/`;
  return new Set([...all].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length)));
 },[all,videoId]);
}

/** Hides a tile and deletes it after `delay`. Returns Undo. `onFailed` gets one sentence when the server refuses; the tile comes back then. */
export function deleteTileLater(videoId:string,tileId:string,onFailed:(message:string)=>void,delay=TILE_DELETE_DELAY_MS):()=>void{
 const key=keyOf(videoId,tileId);
 if(pending.has(key))return()=>{};
 let sent=false;
 const timer=setTimeout(()=>{
  sent=true;
  clubFetch(`/videos/${encodeURIComponent(videoId)}/research/${encodeURIComponent(tileId)}`,{method:'DELETE'}).then(()=>{deleted.add(key);},reason=>onFailed(errorMessage(reason,"Couldn't remove that tile."))).finally(()=>{pending.delete(key);publish();});
 },delay);
 pending.set(key,timer);publish();
 return()=>{
  if(sent||pending.get(key)!==timer)return;
  clearTimeout(timer);pending.delete(key);publish();
 };
}
