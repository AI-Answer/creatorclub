import {useEffect,useState} from 'react';
import type {BreakdownSummary} from '../../shared/club';
import {clubFetch} from './api';
import {youtubeId} from './board';

/** The breakdowns already made in this channel, newest first. Null while loading; empty when they can't be read, so a break down just runs. */
export function useBreakdowns():BreakdownSummary[]|null{
 const [list,setList]=useState<BreakdownSummary[]|null>(null);
 useEffect(()=>{
  let live=true;
  clubFetch<BreakdownSummary[]>('/breakdowns').then(found=>{if(live)setList(found);},()=>{if(live)setList([]);});
  return()=>{live=false;};
 },[]);
 return list;
}

/** The newest breakdown made from this YouTube video, if there is one. */
export const savedBreakdown=(list:readonly BreakdownSummary[],videoId:string)=>list.find(item=>youtubeId(item.url)===videoId);
