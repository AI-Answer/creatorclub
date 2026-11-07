import {useEffect,useMemo,useRef,useState} from 'react';
import type {Video} from '../../shared/club';
import {VIDEOS_CHANGED,clubFetch} from './api';
import {usePendingDeletes} from './pending-delete';

/**
 * Every video of the current channel, for what the shell shows beside any screen: sidebar counts, videos in production and search.
 * Nothing is loaded while `enabled` is false (no channel yet). Ideas that were just deleted (and can still be undone) are left out. Loads again when `refreshKey` changes and whenever a screen saves a change to a video (`VIDEOS_CHANGED`). A channel with no videos, or a server that can't be reached, is an empty list.
 */
export function useShellVideos(refreshKey:string,enabled=true):Video[]{
 const first=useRef(true),editVersion=useRef(0),edits=useRef(new Map<string,{version:number;video:Video}>());
 const [videos,setVideos]=useState<Video[]>([]);
 const [reloads,setReloads]=useState(0);
 useEffect(()=>{
  const again=()=>setReloads(count=>count+1);
  const moved=(event:Event)=>{const saved=(event as CustomEvent<Video>).detail;edits.current.set(saved.id,{version:++editVersion.current,video:saved});setVideos(current=>current.map(video=>video.id===saved.id?saved:video));};
  window.addEventListener('club:video-moved',moved);
  window.addEventListener(VIDEOS_CHANGED,again);return()=>{window.removeEventListener(VIDEOS_CHANGED,again);window.removeEventListener('club:video-moved',moved);};
 },[]);
 useEffect(()=>{
  if(!enabled){setVideos([]);return;}
  let live=true;const at=editVersion.current;
  clubFetch<Video[]>('/videos',{dedupe:first.current}).then(found=>{if(live)setVideos((Array.isArray(found)?found:[]).map(video=>{const edit=edits.current.get(video.id);return edit&&edit.version>at?edit.video:video;}));},()=>{});
  first.current=false;
  return()=>{live=false;};
 },[refreshKey,reloads,enabled]);
 const deleting=usePendingDeletes();
 return useMemo(()=>deleting.size?videos.filter(video=>!deleting.has(video.id)):videos,[videos,deleting]);
}
