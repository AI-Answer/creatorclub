import {useEffect,useState} from 'react';
import type {Outline,Video} from '../../shared/club';
import type {ProjectSummary} from '../../shared/types';
import {clubFetch} from './api';
import type {ProjectProgress} from './board';
import type {SceneProgress} from './scene-status';
import {ACTIVE_STAGES} from './overview';

/*
 * Scene progress for the dots on a video, from what is known without the scenes of the recorder: the outline gives how many scenes there are,
 * SceneForge's project list gives how many were recorded. Until the video page reads takes itself, the dots show counts, not which take was kept.
 */

/** `scenes` scenes of which `recorded` are done, as dots: the first ones filled. */
export function sceneProgress(scenes:number,recorded:number):SceneProgress[]{
 return Array.from({length:scenes},(_,index)=>({takes:index<recorded?[{n:1,kept:true}]:[]}));
}

/** SceneForge's own list of recording projects, for scene counts and thumbnails. Empty when it can't be read. */
export async function loadProgress():Promise<Record<string,ProjectProgress>>{
 try{
 const response=await fetch('/api/projects');
 if(!response.ok)return {};
 const projects=await response.json() as ProjectSummary[];
 return Object.fromEntries(projects.map(project=>[project.id,{scenes:project.sceneCount,recorded:project.recordedSceneCount??0,thumbnailMediaId:project.thumbnailMediaId}]));
 }catch{return {};}
}

/**
 * The scenes of each given video that is being made, by video id. A video whose scenes are not known (still loading, or they could not be read) has no entry:
 * that is not the same as an empty list, which means its outline has no scenes.
 */
export function useSceneProgress(videos:readonly Video[]):Record<string,SceneProgress[]>{
 const [progress,setProgress]=useState<Record<string,SceneProgress[]>>({});
 const key=videos.filter(video=>ACTIVE_STAGES.includes(video.stage)).map(video=>`${video.id}:${video.stage}:${video.recorderProjectId??''}`).join(',');
 useEffect(()=>{
  if(!key)return;
  let live=true;
  const active=videos.filter(video=>ACTIVE_STAGES.includes(video.stage));
  const outlineScenes=(video:Video)=>clubFetch<{outline:Outline|null}>(`/videos/${encodeURIComponent(video.id)}/plan`).then(plan=>plan.outline?.scenes.length??0,()=>null);
 void Promise.all([loadProgress(),Promise.all(active.map(outlineScenes))]).then(([projects,outlines])=>{
   if(!live)return;
   setProgress(Object.fromEntries(active.flatMap((video,index)=>{
    const project=video.recorderProjectId?projects[video.recorderProjectId]:undefined;
    const count=project?.scenes??outlines[index];
    return count===null?[]:[[video.id,sceneProgress(count,project?.recorded??0)]];
   })));
  });
  return()=>{live=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 return progress;
}
