import {useCallback,useEffect,useRef,useState} from 'react';
import type {Video,Workspace} from '../../shared/club';
import type {ProjectSummary} from '../../shared/types';
import {clubFetch,errorMessage} from './api';
import {STAGE_LABEL,applyMove,formatDay,isSamePlace,nextInStage,type ProjectProgress} from './board';
import type {VideoStage} from '../../shared/club';

/** A change that can be taken back: the toast line to show and what Undo does. */
export type Undoable={message:string;undo():Promise<void>};

type Loaded={workspace:Workspace|null;videos:Video[];progress:Record<string,ProjectProgress>;recent:string[]};
export type BoardState={status:'loading'}|{status:'error';message:string}|({status:'ready'}&Loaded);

/** SceneForge's own list of recording projects, for scene counts and thumbnails. The board works without it. */
async function loadProgress():Promise<Record<string,ProjectProgress>>{
 try{
  const response=await fetch('/api/projects');
  if(!response.ok)return {};
  const projects=await response.json() as ProjectSummary[];
  return Object.fromEntries(projects.map(project=>[project.id,{scenes:project.sceneCount,recorded:project.recordedSceneCount??0,thumbnailMediaId:project.thumbnailMediaId}]));
 }catch{return {};}
}

async function load():Promise<Loaded>{
 const [list,videos,recent,progress]=await Promise.all([
  clubFetch<{current:string|null;workspaces:Workspace[]}>('/workspaces'),
  clubFetch<Video[]>('/videos'),
  clubFetch<string[]>('/recent'),
  loadProgress(),
 ]);
 return {workspace:list.workspaces.find(workspace=>workspace.slug===list.current)??null,videos,recent,progress};
}

/** The current channel's videos, with changes shown at once and saved behind them. A failed save puts the board back. */
export function useBoard(){
 const [state,setState]=useState<BoardState>({status:'loading'});
 const videosRef=useRef<Video[]>([]);
 const setVideos=useCallback((next:Video[]|((videos:Video[])=>Video[]))=>{
  const videos=typeof next==='function'?next(videosRef.current):next;
  videosRef.current=videos;
  setState(current=>current.status==='ready'?{...current,videos}:current);
 },[]);

 const reload=useCallback(()=>{
  setState({status:'loading'});
  load().then(loaded=>{videosRef.current=loaded.videos;setState({status:'ready',...loaded});},reason=>setState({status:'error',message:errorMessage(reason,"Couldn't load your board.")}));
 },[]);
 useEffect(reload,[reload]);

 const place=useCallback(async(id:string,stage:VideoStage,beforeId:string|null,stageDates?:Video['stageDates'])=>{
  const before=videosRef.current;
  setVideos(applyMove(before,id,stage,beforeId,new Date().toISOString(),stageDates));
  try{
   const saved=await clubFetch<Video>(`/videos/${encodeURIComponent(id)}/move`,{body:{stage,beforeId,...(stageDates&&{stageDates})}});
   setVideos(videos=>videos.map(video=>video.id===saved.id?saved:video));
  }catch(reason){setVideos(before);throw reason;}
 },[setVideos]);

 /** Puts a video in a stage, just before another or last. Nothing happens when it is already there. */
 const move=useCallback(async(id:string,stage:VideoStage,beforeId:string|null):Promise<Undoable|undefined>=>{
  const videos=videosRef.current,video=videos.find(v=>v.id===id);
  if(!video||isSamePlace(videos,id,stage,beforeId))return undefined;
  const previous={stage:video.stage,beforeId:nextInStage(videos,id),stageDates:video.stageDates};
  await place(id,stage,beforeId);
  return {message:previous.stage===stage?`Moved in ${STAGE_LABEL[stage]}`:`Moved to ${STAGE_LABEL[stage]}`,undo:()=>place(id,previous.stage,previous.beforeId,previous.stageDates)};
 },[place]);

 const savePublishDate=useCallback(async(id:string,publishDate:string|null)=>{
  const before=videosRef.current;
  setVideos(before.map(video=>{if(video.id!==id)return video;const {publishDate:_old,...rest}=video;return publishDate?{...rest,publishDate}:rest;}));
  try{
   const saved=await clubFetch<Video>(`/videos/${encodeURIComponent(id)}`,{method:'PUT',body:{publishDate}});
   setVideos(videos=>videos.map(video=>video.id===saved.id?saved:video));
  }catch(reason){setVideos(before);throw reason;}
 },[setVideos]);

 /** Gives a video a publish day, or takes the day away with `null`. */
 const schedule=useCallback(async(id:string,day:string|null):Promise<Undoable|undefined>=>{
  const video=videosRef.current.find(v=>v.id===id);
  if(!video||(video.publishDate??null)===day)return undefined;
  const previous=video.publishDate??null;
  await savePublishDate(id,day);
  return {message:day?`Set to ${formatDay(day)}`:'Taken off the calendar',undo:()=>savePublishDate(id,previous)};
 },[savePublishDate]);

 const add=useCallback(async(title:string)=>{
  const created=await clubFetch<Video>('/videos',{body:{title}});
  setVideos(videos=>[...videos,created]);
  return created;
 },[setVideos]);

 /** Shows a video that was created elsewhere (a concept added from Break down). */
 const receive=useCallback((video:Video)=>setVideos(videos=>videos.some(v=>v.id===video.id)?videos:[...videos,video]),[setVideos]);

 return {state,reload,move,schedule,add,receive};
}
