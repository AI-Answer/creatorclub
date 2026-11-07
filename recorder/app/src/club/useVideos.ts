import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Video} from '../../shared/club';
import {VIDEOS_CHANGED,clubFetch,errorMessage} from './api';
import {usePendingDeletes} from './pending-delete';

export type VideosState=
 |{status:'loading'}
 |{status:'error';message:string}
 |{status:'ready';videos:Video[];recent:string[]};

/**
 * The current channel's videos and the ids of the ones opened last, for the screens that list them.
 * It loads again after any change the app saves to a video (`VIDEOS_CHANGED`) and on `reload`; the list stays on screen while it does.
 * An idea that was just deleted and can still be undone is left out.
 */
export function useVideos():{state:VideosState;reload():void}{
 const [loaded,setLoaded]=useState<{videos:Video[];recent:string[]}|null>(null);
 const [error,setError]=useState<string|null>(null);
 const latest=useRef(0),edits=useRef(new Map<string,{version:number;video:Video}>()),editVersion=useRef(0);
 const deleting=usePendingDeletes();
 const load=useCallback((dedupe=false)=>{
  const mine=++latest.current,at=editVersion.current;
  Promise.all([clubFetch<Video[]>('/videos',{dedupe}),clubFetch<string[]>('/recent')]).then(([videos,recent])=>{
   if(mine!==latest.current)return;
   setError(null);setLoaded({videos:(Array.isArray(videos)?videos:[]).map(video=>{const edit=edits.current.get(video.id);return edit&&edit.version>at?edit.video:video;}),recent});
  },reason=>{if(mine===latest.current)setError(errorMessage(reason,"Couldn't load your videos."));});
 },[]);
 const reload=useCallback(()=>load(),[load]);
 useEffect(()=>{
  load(true);
  const moved=(event:Event)=>{const saved=(event as CustomEvent<Video>).detail;edits.current.set(saved.id,{version:++editVersion.current,video:saved});setLoaded(current=>current&&{...current,videos:current.videos.map(video=>video.id===saved.id?saved:video)});};
  window.addEventListener('club:video-moved',moved);
  window.addEventListener(VIDEOS_CHANGED,reload);
  return()=>{latest.current++;window.removeEventListener(VIDEOS_CHANGED,reload);window.removeEventListener('club:video-moved',moved);};
 },[load,reload]);
 const state=useMemo<VideosState>(()=>{
  if(loaded)return {status:'ready',recent:loaded.recent,videos:deleting.size?loaded.videos.filter(video=>!deleting.has(video.id)):loaded.videos};
  return error!==null?{status:'error',message:error}:{status:'loading'};
 },[loaded,error,deleting]);
 return {state,reload};
}
