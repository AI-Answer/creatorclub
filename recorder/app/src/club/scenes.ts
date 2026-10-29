import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {ScenesByVideo,Video,VideoScene} from '../../shared/club';
import {VIDEOS_CHANGED,clubFetch} from './api';
import type {SceneProgress} from './scene-status';
import {ACTIVE_STAGES} from './overview';

/*
 * Scene progress for the dots on a video. The server reads every video's outline and recording project in one request
 * (`GET /videos/scenes`), so a screen with many videos still asks once.
 */

/** The dots of a video's scenes from what the server says about them: the takes in the order they were recorded, and the seconds cut once pauses are removed. */
export function toProgress(scenes:readonly VideoScene[]):SceneProgress[]{
 return scenes.map(scene=>({takes:scene.takes.map((take,index)=>({n:index+1,kept:take.kept})),...(scene.cutSeconds?{cut:scene.cutSeconds}:{})}));
}

/**
 * The scenes of each given video that is being made, by video id. A video whose scenes are not known (still loading, or they could not be read) has no entry:
 * that is not the same as an empty list, which means its outline has no scenes.
 *
 * One request per screen, made when the set of videos shown changes (not when a video changes stage) and again whenever a change to a video was saved.
 */
export function useSceneProgress(videos:readonly Video[]):Record<string,SceneProgress[]>{
 const [found,setFound]=useState<ScenesByVideo>({});
 const alive=useRef(true),latest=useRef(0),have=useRef<ScenesByVideo|null>(null);
 const ids=useMemo(()=>videos.map(video=>video.id).sort().join(','),[videos]);
 const shown=useRef(ids);shown.current=ids;
 const wanted=useRef(videos);wanted.current=videos;

 const load=useCallback(()=>{
  const mine=++latest.current;
  clubFetch<ScenesByVideo>('/videos/scenes').then(result=>result,()=>null).then(result=>{
   // A slower, older answer never replaces a newer one. A failed read leaves every video unknown.
   if(!alive.current||mine!==latest.current)return;
   have.current=result;setFound(result??{});
  });
 },[]);

 useEffect(()=>{
  alive.current=true;
  const changed=()=>{if(shown.current)load();};
  window.addEventListener(VIDEOS_CHANGED,changed);
  return()=>{alive.current=false;window.removeEventListener(VIDEOS_CHANGED,changed);};
 },[load]);

 useEffect(()=>{
  // Videos the last answer already covered need no new request. Published ones are never in it.
  const known=have.current;
  if(wanted.current.some(video=>video.stage!=='published'&&!(known&&video.id in known)))load();
 },[ids,load]);

 return useMemo(()=>Object.fromEntries(videos.filter(video=>ACTIVE_STAGES.includes(video.stage)&&found[video.id]).map(video=>[video.id,toProgress(found[video.id])])),[found,videos]);
}
