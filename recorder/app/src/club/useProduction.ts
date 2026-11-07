import {useCallback,useEffect,useRef,useState} from 'react';
import type {Video,VideoStage} from '../../shared/club';
import {clubFetch,errorMessage,notifyVideoUpdated} from './api';
import {formatDay} from './board';
import {planMove,undoBeforeId} from './production';
import {OptimisticMoves} from './production/optimistic-moves';
import {useToast} from './ui';
import {useVideos,type VideosState} from './useVideos';

/**
 * The videos of Production and the changes it makes to them: moving a card and giving a video a publish day.
 * A change shows at once and is saved behind it; the list from the server replaces it when it has been read again. A failed save puts things back and says why in a toast.
 * Each saved change offers Undo.
 */
export function useProduction():{state:VideosState;videos:Video[]|null;reload():void;move(id:string,stage:VideoStage,beforeId:string|null):Promise<void>;schedule(id:string,day:string):Promise<void>}{
 const {state,reload}=useVideos();
 const toast=useToast();
 const loaded=state.status==='ready'?state.videos:null;
 // What is shown until the videos are read again: the loaded list they were made from, and the list with the changes in it.
 const [shadow,setShadow]=useState<{base:Video[];videos:Video[]}|null>(null);
 const latest=useRef<Video[]|null>(loaded),base=useRef(loaded);
 base.current=loaded;

 const show=useCallback((next:Video[])=>{
  latest.current=next;
  if(base.current)setShadow({base:base.current,videos:next});
 },[]);
 const sayFailed=useCallback((reason:unknown,fallback:string)=>toast(errorMessage(reason,fallback),{refused:true}),[toast]);

 // One queue survives all list refreshes, so save order and rollback remain intact.
 const queue=useRef<OptimisticMoves|null>(null);
 if(!queue.current)queue.current=new OptimisticMoves([],show,async placement=>{
  const saved=await clubFetch<Video>(`/videos/${encodeURIComponent(placement.id)}/move`,{body:{stage:placement.stage,beforeId:placement.beforeId},notify:false});
  notifyVideoUpdated(saved);
  return saved;
 },reload,async(id,day)=>{const saved=await clubFetch<Video>(`/videos/${encodeURIComponent(id)}`,{method:'PUT',body:{publishDate:day},notify:false});notifyVideoUpdated(saved);return saved;});
 const videos=shadow&&shadow.base===loaded?shadow.videos:loaded?queue.current.project(loaded):null;
 latest.current=videos;
 useEffect(()=>{if(loaded)queue.current!.refresh(loaded);},[loaded]);
 const place=useCallback((id:string,stage:VideoStage,beforeId:string|null,stageDates?:Video['stageDates']):Promise<void>=>{
  if(!base.current)return Promise.resolve();
  return queue.current!.place(id,stage,beforeId,stageDates);
 },[]);

 /** Puts a video in a stage, just before another or last. Nothing happens when it would stay where it is. */
 const move=useCallback(async(id:string,stage:VideoStage,beforeId:string|null)=>{
  const current=latest.current,plan=current&&planMove(current,id,stage,beforeId);
  if(!plan)return;
  try{await place(id,stage,beforeId);}catch(reason){sayFailed(reason,"Couldn't save that change.");return;}
  const {previous}=plan;
  const following=current!.filter(video=>video.stage===previous.stage).sort((a,b)=>a.order-b.order).map(video=>video.id);
  const after=following.slice(following.indexOf(id)+1);
  toast(plan.message,{undo:()=>{place(id,previous.stage,undoBeforeId(latest.current??[],previous.stage,after),previous.stageDates).catch(reason=>sayFailed(reason,"Couldn't undo that."));}});
 },[place,toast,sayFailed]);

 const savePublishDate=useCallback(async(id:string,day:string|null):Promise<void>=>{
  if(!latest.current)return;
  await queue.current!.date(id,day);
 },[]);


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
