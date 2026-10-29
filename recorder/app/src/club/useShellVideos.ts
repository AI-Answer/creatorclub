import {useEffect,useMemo,useState} from 'react';
import type {Video} from '../../shared/club';
import {VIDEOS_CHANGED,clubFetch} from './api';
import {usePendingDeletes} from './pending-delete';

/**
 * Every video of the current channel, for what the shell shows beside any screen: sidebar counts, videos in production and search.
 * Ideas that were just deleted (and can still be undone) are left out. Loads again when `refreshKey` changes and whenever a screen saves a change to a video (`VIDEOS_CHANGED`). A channel with no videos, or a server that can't be reached, is an empty list.
 */
export function useShellVideos(refreshKey:string):Video[]{
 const [videos,setVideos]=useState<Video[]>([]);
 const [reloads,setReloads]=useState(0);
 useEffect(()=>{
  const again=()=>setReloads(count=>count+1);
  window.addEventListener(VIDEOS_CHANGED,again);return()=>window.removeEventListener(VIDEOS_CHANGED,again);
 },[]);
 useEffect(()=>{
  let live=true;
  clubFetch<Video[]>('/videos').then(found=>{if(live)setVideos(found);},()=>{});
  return()=>{live=false;};
 },[refreshKey,reloads]);
 const deleting=usePendingDeletes();
 return useMemo(()=>deleting.size?videos.filter(video=>!deleting.has(video.id)):videos,[videos,deleting]);
}
