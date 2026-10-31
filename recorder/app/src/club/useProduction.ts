import {useCallback,useEffect,useRef,useState} from 'react';
import type {Video,VideoStage} from '../../shared/club';
import {moveProblem,type MoveFacts} from '../../shared/club-move';
import {VIDEOS_CHANGED,clubFetch,errorMessage} from './api';
import {formatDay} from './board';
import {applyMove,planMove} from './production';
import {useToast} from './ui';
import {useVideos,type VideosState} from './useVideos';

/**
 * What each video has for the move rule (`moveProblem`), by id: read with the videos and again after any change to one.
 * A video missing from it (not read yet, or unreadable) is moved and left to the server, which refuses with the same sentence.
 */
export function useMoveFacts():Record<string,MoveFacts>{
 const [facts,setFacts]=useState<Record<string,MoveFacts>>({});
 useEffect(()=>{
  let latest=0,alive=true;
  const load=()=>{const mine=++latest;clubFetch<Record<string,MoveFacts>>('/videos/move-facts').then(found=>{if(alive&&mine===latest)setFacts(found);},()=>{});};
  load();window.addEventListener(VIDEOS_CHANGED,load);
  return()=>{alive=false;window.removeEventListener(VIDEOS_CHANGED,load);};
 },[]);
 return facts;
}

/** Why the move cannot be made, from what is known of the video, or null when it can (or nothing is known: then the server decides). */
export const knownMoveProblem=(video:Pick<Video,'id'|'stage'>|undefined,stage:VideoStage,facts:Record<string,MoveFacts>)=>{
 const known=video&&facts[video.id];
 return known?moveProblem(video.stage,stage,known):null;
};

/**
 * The videos of Production and the changes it makes to them: moving a card and giving a video a publish day.
 * A change shows at once and is saved behind it; the list from the server replaces it when it has been read again. A failed save puts things back and says why in a toast.
 * Each saved change offers Undo.
 */
export function useProduction():{state:VideosState;videos:Video[]|null;reload():void;move(id:string,stage:VideoStage,beforeId:string|null):Promise<void>;schedule(id:string,day:string):Promise<void>}{
 const {state,reload}=useVideos();
 const facts=useMoveFacts();
 const factsRef=useRef(facts);factsRef.current=facts;
 const toast=useToast();
 const loaded=state.status==='ready'?state.videos:null;
 // What is shown until the videos are read again: the loaded list they were made from, and the list with the changes in it.
 const [shadow,setShadow]=useState<{base:Video[];videos:Video[]}|null>(null);
 const videos=shadow&&shadow.base===loaded?shadow.videos:loaded;
 const latest=useRef(videos),base=useRef(loaded);
 latest.current=videos;base.current=loaded;

 const show=useCallback((next:Video[])=>{
  latest.current=next;
  if(base.current)setShadow({base:base.current,videos:next});
 },[]);
 const sayFailed=useCallback((reason:unknown,fallback:string)=>toast(errorMessage(reason,fallback),{refused:true}),[toast]);

 const place=useCallback(async(id:string,stage:VideoStage,beforeId:string|null,stageDates?:Video['stageDates']):Promise<void>=>{
  const before=latest.current;
  if(!before)return;
  show(applyMove(before,id,stage,beforeId,new Date().toISOString(),stageDates));
  try{await clubFetch<Video>(`/videos/${encodeURIComponent(id)}/move`,{body:{stage,beforeId,...(stageDates&&{stageDates})}});}
  catch(reason){show(before);throw reason;}
 },[show]);

 /** Puts a video in a stage, just before another or last. Nothing happens when it would stay where it is. */
 const move=useCallback(async(id:string,stage:VideoStage,beforeId:string|null)=>{
  const current=latest.current,plan=current&&planMove(current,id,stage,beforeId);
  if(!plan)return;
  // The same rule the server holds to: a move it would refuse is not shown, and the sentence says what is missing.
  const problem=knownMoveProblem(current.find(video=>video.id===id),stage,factsRef.current);
  if(problem){toast(problem,{refused:true});return;}
  try{await place(id,stage,beforeId);}catch(reason){sayFailed(reason,"Couldn't save that change.");return;}
  const {previous}=plan;
  toast(plan.message,{undo:()=>{place(id,previous.stage,previous.beforeId,previous.stageDates).catch(reason=>sayFailed(reason,"Couldn't undo that."));}});
 },[place,toast,sayFailed]);

 const savePublishDate=useCallback(async(id:string,day:string|null):Promise<void>=>{
  const before=latest.current;
  if(!before)return;
  show(before.map(video=>{if(video.id!==id)return video;const {publishDate:_old,...rest}=video;return day?{...rest,publishDate:day}:rest;}));
  try{await clubFetch<Video>(`/videos/${encodeURIComponent(id)}`,{method:'PUT',body:{publishDate:day}});}
  catch(reason){show(before);throw reason;}
 },[show]);

 /** Gives a video a publish day. */
 const schedule=useCallback(async(id:string,day:string)=>{
  const video=latest.current?.find(v=>v.id===id);
  if(!video||video.publishDate===day)return;
  const previous=video.publishDate??null;
  try{await savePublishDate(id,day);}catch(reason){sayFailed(reason,"Couldn't save that change.");return;}
  toast(`Planned for ${formatDay(day)}`,{undo:()=>{savePublishDate(id,previous).catch(reason=>sayFailed(reason,"Couldn't undo that."));}});
 },[savePublishDate,toast,sayFailed]);

 return {state,videos,reload,move,schedule};
}
