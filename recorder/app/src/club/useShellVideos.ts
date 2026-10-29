import {useEffect,useState} from 'react';
import type {Video} from '../../shared/club';
import {clubFetch} from './api';

/**
 * Every video of the current channel, for what the shell shows beside any screen: sidebar counts, videos in production and search.
 * Loads again when `refreshKey` changes. A channel with no videos, or a server that can't be reached, is an empty list.
 */
export function useShellVideos(refreshKey:string):Video[]{
 const [videos,setVideos]=useState<Video[]>([]);
 useEffect(()=>{
  let live=true;
  clubFetch<Video[]>('/videos').then(found=>{if(live)setVideos(found);},()=>{});
  return()=>{live=false;};
 },[refreshKey]);
 return videos;
}
