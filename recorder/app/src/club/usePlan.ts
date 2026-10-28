import {useCallback,useEffect,useRef,useState} from 'react';
import type {ClubSettings,Outline,Package,PlanData,PlanJobKind,PlanJobResult,PlanStep,Video} from '../../shared/club';

/** A status line under a step: "Replaced the outline · Undo" or "New outline ready · Use it". */
export type Notice={type:'replaced'|'held';token:string};
type Notices=Partial<Record<PlanJobKind,Notice>>;
import {clubFetch,errorMessage} from './api';
import {useJobRun} from './useJobRun';
import {movesForward,nextPlanStep,openPlanStep} from './video-plan';

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
 * Everything the Plan step works with for one video: the saved package and outline (edited in place and saved behind the
 * typing), the three AI jobs, the help lines, which step is open, and the three Continue buttons, which also move the card.
 */
export function usePlan(video:Video,{onVideo,onRecord}:{onVideo(video:Video):void;onRecord():void}){
 const id=encodeURIComponent(video.id);
 const [load,setLoad]=useState<PlanLoad>({status:'loading'});
 const [pkg,setPkg]=useState<Package|null>(null),[outline,setOutline]=useState<Outline|null>(null),[changedScene,setChangedScene]=useState<number|undefined>();
 const [helpSeen,setHelpSeen]=useState<PlanStep[]|null>(null);
 const [open,setOpen]=useState<PlanStep>(()=>openPlanStep(video.planning));
 const [continuing,setContinuing]=useState(false),[continueError,setContinueError]=useState('');
 const [notices,setNotices]=useState<Notices>({});
 const videoRef=useRef(video);videoRef.current=video;

 const reload=useCallback(()=>{
  setLoad({status:'loading'});
  clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>{
   setPkg(data.package);setOutline(data.outline);setChangedScene(data.changedScene);setLoad({status:'ready'});
   // Results held while this page was away are offered again; runs still going are followed.
   setNotices(Object.fromEntries(Object.entries(data.ready??{}).map(([kind,token])=>[kind,{type:'held',token}])));
   for(const [kind,jobId] of Object.entries(data.running??{}))if(jobId)attachRef.current(kind as PlanJobKind,jobId);
  },
   reason=>setLoad({status:'error',message:errorMessage(reason,"Couldn't load this video's plan.")}));
  clubFetch<ClubSettings>('/settings').then(settings=>setHelpSeen(settings.helpSeen??[]),()=>setHelpSeen([]));
 },[id]);
 useEffect(reload,[reload]);
 useEffect(()=>setOpen(openPlanStep(videoRef.current.planning)),[video.id]);

 const refreshChanged=useCallback(()=>{clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>setChangedScene(data.changedScene),()=>{});},[id]);
 const packageSaver=useSaver((value:Package)=>clubFetch(`/videos/${id}/package`,{method:'PUT',body:value}));
 const outlineSaver=useSaver((value:Outline)=>clubFetch(`/videos/${id}/outline`,{method:'PUT',body:{scenes:value.scenes}}),refreshChanged);
 const scriptSaver=useSaver((script:string)=>clubFetch(`/videos/${id}/script`,{method:'PUT',body:{script}}),refreshChanged);

 // Typing after a replace keeps the new version: its Undo line goes away. A held result stays on offer.
 const dropReplaced=useCallback((...kinds:PlanJobKind[])=>setNotices(current=>{const next={...current};for(const kind of kinds)if(next[kind]?.type==='replaced')delete next[kind];return next;}),[]);
 const editPackage=useCallback((next:Package)=>{setPkg(next);packageSaver.queue(next);dropReplaced('package');},[packageSaver.queue,dropReplaced]);
 const editOutline=useCallback((next:Outline)=>{setOutline(next);outlineSaver.queue(next);dropReplaced('outline','script');},[outlineSaver.queue,dropReplaced]);
 const editScript=useCallback((script:string)=>{setOutline(current=>current&&{...current,fullScript:script});scriptSaver.queue(script);dropReplaced('outline','script');},[scriptSaver.queue,dropReplaced]);

 const packageJob=useJobRun(),outlineJob=useJobRun(),scriptJob=useJobRun();
 const jobs={package:packageJob,outline:outlineJob,script:scriptJob};
 /** A finished run: shown at once, with Undo when it replaced something; held behind "Use it" when the step changed while it ran. */
 const finished=useCallback((kind:PlanJobKind,raw:unknown)=>{
  const result=raw as PlanJobResult<Package|Outline>;
  if(result.held){setNotices(current=>({...current,[kind]:{type:'held',token:result.held!}}));return;}
  if(kind==='package')setPkg(result.value as Package);else{setOutline(result.value as Outline);refreshChanged();}
  setNotices(current=>{const {[kind]:_old,...rest}=current;return result.replaced?{...rest,[kind]:{type:'replaced',token:result.replaced}}:rest;});
 },[refreshChanged]);
 const attachRef=useRef<(kind:PlanJobKind,jobId:string)=>void>(()=>{});
 attachRef.current=(kind,jobId)=>{void jobs[kind].attach(jobId,result=>finished(kind,result));};
 /** Saves what is waiting first, so the run starts from what is on screen, then runs the step (the server reuses a run already going). */
 const start=useCallback(async(kind:PlanJobKind,flush:()=>Promise<void>)=>{
  try{await flush();}catch{return;}
  setNotices(({[kind]:_old,...rest})=>rest);
  void jobs[kind].run(()=>clubFetch(`/videos/${id}/${kind}`,{method:'POST'}),result=>finished(kind,result));
 },[id,finished,packageJob.run,outlineJob.run,scriptJob.run]);
 const packageIt=useCallback(()=>{void start('package',packageSaver.flush);},[start,packageSaver.flush]);
 const createOutline=useCallback(()=>{void start('outline',async()=>{await outlineSaver.flush();await scriptSaver.flush();});},[start,outlineSaver.flush,scriptSaver.flush]);
 const writeScript=useCallback(()=>{void start('script',async()=>{await outlineSaver.flush();await scriptSaver.flush();});},[start,outlineSaver.flush,scriptSaver.flush]);
 const stop=useCallback((kind:PlanJobKind)=>{void jobs[kind].cancel();},[packageJob.cancel,outlineJob.cancel,scriptJob.cancel]);

 /** Undo after a replace, or Use it for a held result. Both bring back the saved package and outline as the server now has them. */
 const [noticeError,setNoticeError]=useState('');
 const resolveNotice=useCallback(async(kind:PlanJobKind)=>{
  const notice=notices[kind];if(!notice)return;
  setNoticeError('');
  if(kind==='package')packageSaver.cancel();else{outlineSaver.cancel();scriptSaver.cancel();}
  try{
   const result=await clubFetch<{package:Package|null;outline:Outline|null}>(`/videos/${id}/${kind}/${notice.type==='replaced'?'undo':'use'}`,{body:{token:notice.token}});
   setPkg(result.package);setOutline(result.outline);refreshChanged();
   setNotices(({[kind]:_done,...rest})=>rest);
  }catch(reason){setNoticeError(errorMessage(reason,notice.type==='replaced'?"Couldn't undo that.":"Couldn't use that version."));}
 },[id,notices,refreshChanged,packageSaver.cancel,outlineSaver.cancel,scriptSaver.cancel]);
 const [scriptError,setScriptError]=useState('');
 const backToTalkingPoints=useCallback(()=>{
  scriptSaver.cancel();setScriptError('');
  clubFetch<{outline:Outline|null}>(`/videos/${id}/script`,{method:'PUT',body:{script:null}}).then(result=>{setOutline(result.outline);refreshChanged();},reason=>setScriptError(errorMessage(reason,"Couldn't go back to talking points.")));
 },[id,scriptSaver.cancel,refreshChanged]);

 /** Marks a Plan step done, retires its help line in this channel, and moves an idea to Planning. */
 const complete=useCallback(async(step:PlanStep)=>{
  let next=videoRef.current;
  if(!next.planning[step])next=await clubFetch<Video>(`/videos/${id}`,{method:'PUT',body:{planning:{...next.planning,[step]:true}}});
  if(movesForward(next.stage,'planning'))next=await clubFetch<Video>(`/videos/${id}/move`,{body:{stage:'planning'}});
  onVideo(next);
 },[id,onVideo]);
 const retireHelp=useCallback((step:PlanStep)=>{
  if(helpSeen?.includes(step))return;
  setHelpSeen(seen=>seen&&!seen.includes(step)?[...seen,step]:seen);
  clubFetch(`/settings/help/${step}`,{method:'POST'}).catch(()=>{});
 },[helpSeen]);

 const continueFrom=useCallback(async(step:PlanStep)=>{
  setContinuing(true);setContinueError('');
  try{
   if(step==='package')await packageSaver.flush();
   if(step==='outline'){
    await outlineSaver.flush();await scriptSaver.flush();
    const moved=await clubFetch<Video>(`/videos/${id}/recorder`,{method:'POST'});
    retireHelp('outline');onVideo(moved);onRecord();
    return;
   }
   await complete(step);retireHelp(step);
   const next=nextPlanStep(step);if(next)setOpen(next);
  }catch(reason){setContinueError(errorMessage(reason,step==='outline'?"Couldn't set up the recording.":"Couldn't save that step."));}
  finally{setContinuing(false);}
 },[id,complete,retireHelp,onVideo,onRecord,packageSaver.flush,outlineSaver.flush,scriptSaver.flush]);

 /** The bottom bar's one primary button for the open step. Package and outline offer it only once there is something to continue with. */
 const ready=open==='research'||(open==='package'?!!pkg:!!outline?.scenes.length);
 const busy=packageJob.state.phase==='running'||outlineJob.state.phase==='running'||scriptJob.state.phase==='running';
 const continueAction=load.status==='ready'&&ready?{step:open,run:()=>void continueFrom(open),disabled:continuing||busy}:undefined;

 return {
  load,reload,pkg,outline,changedScene,helpSeen,open,setOpen,
  editPackage,editOutline,editScript,packageIt,createOutline,writeScript,backToTalkingPoints,scriptError,stop,notices,resolveNotice,noticeError,
  packageJob:packageJob.state,outlineJob:outlineJob.state,scriptJob:scriptJob.state,
  saveError:packageSaver.error||outlineSaver.error||scriptSaver.error,
  retrySave:()=>{void Promise.all([packageSaver.flush(),outlineSaver.flush(),scriptSaver.flush()]).catch(()=>{});},
  continueAction,continueError,
 };
}

export type Plan=ReturnType<typeof usePlan>;
