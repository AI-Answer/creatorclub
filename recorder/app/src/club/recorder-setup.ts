import type {Video} from '../../shared/club';
import {captureWorkspace,clubFetch,currentClubWorkspace} from './api';
const pending=new Map<string,Promise<Video>>();
/** Plan Continue and direct Record/Edit navigation join the same setup, only until it settles. */
export function prepareRecording(id:string,quick:boolean,flush:()=>Promise<void>):Promise<Video>{
 const key=`${currentClubWorkspace()??''}/${id}`,existing=pending.get(key);if(existing)return existing;
 const workspace=captureWorkspace();
 const request=(async()=>{await flush();return clubFetch<Video>(`/videos/${encodeURIComponent(id)}/recorder`,{...(quick?{body:{quick:true}}:{method:'POST'}),workspace:await workspace});})().finally(()=>{if(pending.get(key)===request)pending.delete(key);});
 pending.set(key,request);return request;
}
