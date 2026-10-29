import {useCallback,useEffect,useRef,useState} from 'react';
import type {Outline,Package,PlanData,PlanJobKind,PlanJobResult,Video} from '../../shared/club';

/** A status line under a step: "Replaced the outline · Undo" or "New outline ready · Use it". */
export type Notice={type:'replaced'|'held';token:string};
type Notices=Partial<Record<PlanJobKind,Notice>>;
import {clubFetch,errorMessage,notifyVideosChanged} from './api';
import {useJobRun} from './useJobRun';
import {withServerScripts,type PackageGroup} from './plan/plan-logic';

const SAVE_DELAY_MS=600;

/** Saves the latest value a moment after the last change. `flush` saves at once and reports a failure; `cancel` drops what is waiting. */
function useSaver<T>(save:(value:T)=>Promise<unknown>,onSaved?:()=>void){
 const pending=useRef<{value:T}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const saveRef=useRef(save);saveRef.current=save;
 const savedRef=useRef(onSaved);savedRef.current=onSaved;
 const [error,setError]=useState('');
 const flush=useCallback(async()=>{
  clearTimeout(timer.current);
  const waiting=pending.current;if(!waiting)return;
  pending.current=null;
  try{await saveRef.current(waiting.value);setError('');savedRef.current?.();}
  catch(reason){if(!pending.current)pending.current=waiting;setError(errorMessage(reason,"Couldn't save your changes."));throw reason;}
 },[]);
 const queue=useCallback((value:T)=>{
  pending.current={value};clearTimeout(timer.current);
  timer.current=setTimeout(()=>{void flush().catch(()=>{});},SAVE_DELAY_MS);
 },[flush]);
 const cancel=useCallback(()=>{clearTimeout(timer.current);pending.current=null;},[]);
 // Leaving the page saves what is still waiting.
 useEffect(()=>()=>{if(pending.current){clearTimeout(timer.current);void saveRef.current(pending.current.value).catch(()=>{});}},[]);
 return {queue,flush,cancel,error};
}

export type PlanLoad={status:'loading'}|{status:'error';message:string}|{status:'ready'};

/**
 * Everything the Plan tab works with for one video: the saved package and outline (edited in place and saved behind the typing),
 * the three AI jobs (package, outline, script for the whole video or one scene), the lines under them, and Continue to recording.
 */
export function usePlan(video:Video,{onVideo,onRecord}:{onVideo(video:Video):void;onRecord():void}){
 const id=encodeURIComponent(video.id);
 const [load,setLoad]=useState<PlanLoad>({status:'loading'});
 const [pkg,setPkg]=useState<Package|null>(null),[outline,setOutline]=useState<Outline|null>(null),[changedScene,setChangedScene]=useState<number|undefined>();
 const [continuing,setContinuing]=useState(false),[continueError,setContinueError]=useState('');
 const [notices,setNotices]=useState<Notices>({});

 const reload=useCallback(()=>{
  setLoad({status:'loading'});
  clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>{
   setPkg(data.package);setOutline(data.outline);setChangedScene(data.changedScene);setLoad({status:'ready'});
   // Results held while this page was away are offered again; runs still going are followed.
   setNotices(Object.fromEntries(Object.entries(data.ready??{}).map(([kind,token])=>[kind,{type:'held',token}])));
   for(const [kind,jobId] of Object.entries(data.running??{}))if(jobId)attachRef.current(kind as PlanJobKind,jobId);
  },
   reason=>setLoad({status:'error',message:errorMessage(reason,"Couldn't load this video's plan.")}));
 },[id]);
 useEffect(reload,[reload]);

 /** After a save: the scene the outline changed after, and the script words as the server now matches them to the scenes. */
 const refreshChanged=useCallback(()=>{
  clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>{
   setChangedScene(data.changedScene);
   const server=data.outline;
   if(server)setOutline(current=>current&&withServerScripts(current,server));
  },()=>{});
 },[id]);
 const packageSaver=useSaver((value:Package)=>clubFetch(`/videos/${id}/package`,{method:'PUT',body:value}));
 const outlineSaver=useSaver((value:Outline)=>clubFetch(`/videos/${id}/outline`,{method:'PUT',body:{scenes:value.scenes}}),refreshChanged);

 // Typing after a replace keeps the new version: its Undo line goes away. A held result stays on offer.
 const dropReplaced=useCallback((...kinds:PlanJobKind[])=>setNotices(current=>{const next={...current};for(const kind of kinds)if(next[kind]?.type==='replaced')delete next[kind];return next;}),[]);
 const editPackage=useCallback((next:Package)=>{setPkg(next);packageSaver.queue(next);dropReplaced('package');},[packageSaver.queue,dropReplaced]);
 const editOutline=useCallback((next:Outline)=>{setOutline(next);outlineSaver.queue(next);dropReplaced('outline','script');},[outlineSaver.queue,dropReplaced]);

 // One scene's script is saved as soon as the person leaves it. The outline goes first, so a scene added a moment ago is known to the server.
 const [sceneError,setSceneError]=useState('');
 const lastScene=useRef<{sceneId:string;text:string}|null>(null);
 const saveSceneScript=useCallback(async(sceneId:string,text:string)=>{
  lastScene.current={sceneId,text};
  setOutline(current=>current&&{...current,scenes:current.scenes.map(scene=>{if(scene.id!==sceneId)return scene;const {script:_old,...rest}=scene;return text.trim()?{...rest,script:text}:rest;})});
  dropReplaced('outline','script');
  try{
   await outlineSaver.flush();
   const result=await clubFetch<{outline:Outline|null}>(`/videos/${id}/script/scene/${encodeURIComponent(sceneId)}`,{method:'PUT',body:{text}});
   const server=result.outline;
   if(server)setOutline(current=>current&&withServerScripts(current,server));
   setSceneError('');refreshChanged();
  }catch(reason){setSceneError(errorMessage(reason,"Couldn't save the script."));}
 },[id,outlineSaver.flush,refreshChanged,dropReplaced]);
 const retrySceneScript=useCallback(()=>{const last=lastScene.current;if(last)void saveSceneScript(last.sceneId,last.text);},[saveSceneScript]);

 const packageJob=useJobRun(),outlineJob=useJobRun(),scriptJob=useJobRun();
 const jobs={package:packageJob,outline:outlineJob,script:scriptJob};
 /** The scene a script run writes; none while it writes the whole script. */
 const [scriptScene,setScriptScene]=useState<string|undefined>();
 /** A finished run: shown at once, with Undo when it replaced something; held behind "Use it" when the step changed while it ran. */
 const finished=useCallback((kind:PlanJobKind,raw:unknown)=>{
  const result=raw as PlanJobResult<Package|Outline>;
  notifyVideosChanged();
  if(result.held){setNotices(current=>({...current,[kind]:{type:'held',token:result.held!}}));return;}
  // The server already filled only what was empty, so its package is the one to show.
  if(kind==='package')setPkg(result.value as Package);
  else{setOutline(result.value as Outline);refreshChanged();}
  setNotices(current=>{const {[kind]:_old,...rest}=current;return result.replaced?{...rest,[kind]:{type:'replaced',token:result.replaced}}:rest;});
 },[refreshChanged]);
 const attachRef=useRef<(kind:PlanJobKind,jobId:string)=>void>(()=>{});
 attachRef.current=(kind,jobId)=>{void jobs[kind].attach(jobId,result=>finished(kind,result));};
 /** Saves what is waiting first, so the run starts from what is on screen, then runs the step (the server reuses a run already going). */
 const start=useCallback(async(kind:PlanJobKind,flush:()=>Promise<void>,body?:{sceneId:string}|{replace:PackageGroup})=>{
  try{await flush();}catch{return;}
  setNotices(({[kind]:_old,...rest})=>rest);
  void jobs[kind].run(()=>clubFetch(`/videos/${id}/${kind}`,{method:'POST',...(body?{body}:{})}),result=>finished(kind,result));
 },[id,finished,packageJob.run,outlineJob.run,scriptJob.run]);
 /** Write titles and Write hooks run the whole package; the result fills what is empty, and `replace` also takes the group the person asked to write again. */
 const writePackage=useCallback((replace?:PackageGroup)=>{
  void start('package',packageSaver.flush,replace?{replace}:undefined);
 },[start,packageSaver.flush]);
 const createOutline=useCallback(()=>{void start('outline',outlineSaver.flush);},[start,outlineSaver.flush]);
 /** Write full script, or with a scene id that scene's script. */
 const writeScript=useCallback((sceneId?:string)=>{
  setScriptScene(sceneId);
  void start('script',outlineSaver.flush,sceneId?{sceneId}:undefined);
 },[start,outlineSaver.flush]);
 const stop=useCallback((kind:PlanJobKind)=>{void jobs[kind].cancel();},[packageJob.cancel,outlineJob.cancel,scriptJob.cancel]);

 /** Undo after a replace, or Use it for a held result. Both bring back the saved package and outline as the server now has them. */
 const [noticeError,setNoticeError]=useState('');
 const resolveNotice=useCallback(async(kind:PlanJobKind)=>{
  const notice=notices[kind];if(!notice)return;
  setNoticeError('');
  if(kind==='package')packageSaver.cancel();else outlineSaver.cancel();
  try{
   const result=await clubFetch<{package:Package|null;outline:Outline|null}>(`/videos/${id}/${kind}/${notice.type==='replaced'?'undo':'use'}`,{body:{token:notice.token}});
   setPkg(result.package);setOutline(result.outline);refreshChanged();
   setNotices(({[kind]:_done,...rest})=>rest);
  }catch(reason){setNoticeError(errorMessage(reason,notice.type==='replaced'?"Couldn't undo that.":"Couldn't use that version."));}
 },[id,notices,refreshChanged,packageSaver.cancel,outlineSaver.cancel]);

 /** Continue to recording: saves what is waiting, creates or updates the recording project, moves the card and opens Record. */
 const busy=packageJob.state.phase==='running'||outlineJob.state.phase==='running'||scriptJob.state.phase==='running';
 const continueToRecording=useCallback(async()=>{
  setContinuing(true);setContinueError('');
  try{
   await packageSaver.flush();await outlineSaver.flush();
   const moved=await clubFetch<Video>(`/videos/${id}/recorder`,{method:'POST'});
   onVideo(moved);onRecord();
  }catch(reason){setContinueError(errorMessage(reason,"Couldn't set up the recording."));}
  finally{setContinuing(false);}
 },[id,onVideo,onRecord,packageSaver.flush,outlineSaver.flush]);
 const continueAction=load.status==='ready'&&outline?.scenes.length?{run:()=>void continueToRecording(),disabled:continuing||busy}:undefined;

 return {
  load,reload,pkg,outline,changedScene,
  editPackage,editOutline,saveSceneScript,writePackage,createOutline,writeScript,scriptScene,stop,notices,resolveNotice,noticeError,
  packageJob:packageJob.state,outlineJob:outlineJob.state,scriptJob:scriptJob.state,
  saveError:packageSaver.error||outlineSaver.error||sceneError,
  retrySave:()=>{if(sceneError)retrySceneScript();void Promise.all([packageSaver.flush(),outlineSaver.flush()]).catch(()=>{});},
  continueAction,continueError,
 };
}

export type Plan=ReturnType<typeof usePlan>;
