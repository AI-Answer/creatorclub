import type {Project} from '../shared/types';
import {api,apiResult,APIError} from './api';
import {saveProjectTake,type SavedTake} from './recorded-takes';
/** Bound every storage request so stalled services leave local recovery and the quit escape usable. */
export const RECORDING_SAVE_TIMEOUT=60_000;
export const recordingApi=<T>(path:string,body?:unknown,method?:string)=>api<T>(path,body,method,AbortSignal.timeout(RECORDING_SAVE_TIMEOUT));
export const recordingFetch=(path:string,options:RequestInit)=>fetch(path,{...options,signal:AbortSignal.timeout(RECORDING_SAVE_TIMEOUT)});
const openProjects=new Set<(id:string,take:SavedTake)=>Promise<boolean>>();
export function registerRecordingProject(apply:(id:string,take:SavedTake)=>Promise<boolean>){openProjects.add(apply);return()=>{openProjects.delete(apply);};}
/** A detached recorder owns its original project, even after the studio opens another one. */
export async function saveRecordingTake(projectId:string,take:SavedTake,apply?:((fn:(project:Project)=>void)=>Promise<void>)){
 for(const applyOpen of openProjects)if(await applyOpen(projectId,take))return;
 if(apply){let matched=false;try{await apply(draft=>{if(draft.id===projectId){matched=true;saveProjectTake(draft,take);}});if(matched)return;}catch(error){if(matched)throw error;}}
 const path=`/projects/${encodeURIComponent(projectId)}`;
 for(let attempt=0;;attempt++){
  const fresh=await apiResult<Project>(path,undefined,'GET',{},AbortSignal.timeout(RECORDING_SAVE_TIMEOUT));
  if(!fresh.etag)throw Error('The recorded project did not return a save revision.');
  saveProjectTake(fresh.data,take);
  try{await apiResult(path,fresh.data,'PUT',{'If-Match':fresh.etag},AbortSignal.timeout(RECORDING_SAVE_TIMEOUT));return;}
  catch(error){if(!(error instanceof APIError)||error.status!==409||attempt===3)throw error;}
 }
}
