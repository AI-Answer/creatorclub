import {useMemo} from 'react';
import {captureWorkspace,clubFetch} from '../api';
import {DELETE_DELAY_MS,deleteScope,pendingDeleteStore} from '../pending-delete';
import {boardBase} from './board-base';
const tiles=pendingDeleteStore();
export const TILE_DELETE_DELAY_MS=DELETE_DELAY_MS;
export function usePendingTiles(videoId:string):ReadonlySet<string>{
 const all=tiles.useIds(),prefix=`${deleteScope()}/${videoId}/`;
 return useMemo(()=>new Set([...all].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length))),[all,prefix]);
}
export function deleteTileLater(videoId:string,tileId:string,onFailed:(message:string)=>void,delay=TILE_DELETE_DELAY_MS):()=>void{
 const workspace=captureWorkspace();
 return tiles.remove(`${deleteScope()}/${videoId}/${tileId}`,async()=>clubFetch(`${boardBase(videoId)}/research/${encodeURIComponent(tileId)}`,{method:'DELETE',workspace:await workspace}),onFailed,delay,"Couldn't remove that tile.");
}
