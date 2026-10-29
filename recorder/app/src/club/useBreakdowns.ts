import {useEffect,useState} from 'react';
import type {BreakdownSummary} from '../../shared/club';
import {clubFetch} from './api';
import {youtubeId} from './board';

/** Fired when a breakdown finishes, so lists of saved breakdowns load again and the next open of that video shows it instead of running it again. */
export const BREAKDOWNS_CHANGED='club:breakdowns-changed';
export const notifyBreakdownsChanged=()=>window.dispatchEvent(new Event(BREAKDOWNS_CHANGED));

/** The breakdowns already made in this channel, newest first. Null while loading; empty when they can't be read, so a break down just runs. */
export function useBreakdowns():BreakdownSummary[]|null{
 const [list,setList]=useState<BreakdownSummary[]|null>(null);
 useEffect(()=>{
  let live=true;
  const load=()=>clubFetch<BreakdownSummary[]>('/breakdowns').then(found=>{if(live)setList(found);},()=>{if(live)setList(current=>current??[]);});
  void load();
  window.addEventListener(BREAKDOWNS_CHANGED,load);
  return()=>{live=false;window.removeEventListener(BREAKDOWNS_CHANGED,load);};
 },[]);
 return list;
}

/** The newest breakdown made from this YouTube video, if there is one. */
export const savedBreakdown=(list:readonly BreakdownSummary[],videoId:string)=>list.find(item=>youtubeId(item.url)===videoId);
