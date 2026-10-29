import {useCallback,useEffect,useRef,useState} from 'react';
import type {BoardFiles,ResearchTile} from '../../../shared/club';
import {clubFetch,clubUpload,errorMessage} from '../api';

export type ImportResult={tiles:ResearchTile[];skipped:{name:string;reason:string}[]};

/**
 * Tells `onChange` (once, a moment after the last message) when a Markdown or text file in the video's folder or the Notes folder appears, changes or goes.
 * The server sends the news over one event stream per video; the browser reconnects by itself, and a reconnect asks for a look too,
 * since changes may have been missed in between. Where there is no EventSource (a test), nothing is watched.
 */
export function useBoardEvents(videoId:string,onChange:()=>void,wait=150){
 const latest=useRef(onChange);latest.current=onChange;
 useEffect(()=>{
  if(typeof EventSource==='undefined')return;
  const source=new EventSource(`/api/club/videos/${encodeURIComponent(videoId)}/board/events`);
  let timer:ReturnType<typeof setTimeout>|undefined,opened=false;
  const soon=()=>{clearTimeout(timer);timer=setTimeout(()=>latest.current(),wait);};
  source.addEventListener('files',soon);
  source.addEventListener('open',()=>{if(opened)soon();opened=true;});
  return()=>{clearTimeout(timer);source.close();};
 },[videoId,wait]);
}

/** Where the video's folder is and what the Notes folder holds. Loads again when `tick` changes. */
export function useBoardFiles(videoId:string,tick:number){
 const [files,setFiles]=useState<BoardFiles|null>(null);
 useEffect(()=>{
  let live=true;
  clubFetch<BoardFiles>(`/videos/${encodeURIComponent(videoId)}/board/files`).then(found=>{if(live)setFiles(found);},()=>{});
  return()=>{live=false;};
 },[videoId,tick]);
 return files;
}

/** Chooses (or clears) the channel's Notes folder. Resolves to the saved path, or an error sentence. */
export async function chooseNotesFolder(path:string|null):Promise<{path:string|null}|{error:string}>{
 try{return await clubFetch<{path:string|null}>('/board/notes-folder',{method:'PUT',body:{path}});}
 catch(reason){return {error:errorMessage(reason,"Couldn't use that folder.")};}
}

export const pinNote=(videoId:string,path:string)=>clubFetch<ResearchTile>(`/videos/${encodeURIComponent(videoId)}/board/pin`,{body:{path}});

export function importNotes(videoId:string,files:readonly File[]):Promise<ImportResult>{
 const form=new FormData();
 for(const file of files)form.append('files',file);
 return clubUpload<ImportResult>(`/videos/${encodeURIComponent(videoId)}/board/import`,form);
}
