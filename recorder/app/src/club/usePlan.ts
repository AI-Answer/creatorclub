import {useCallback,useEffect,useRef,useState} from 'react';
import type {ClubSettings,Outline,Package,PlanData,PlanStep,Video} from '../../shared/club';
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
 const videoRef=useRef(video);videoRef.current=video;

 const reload=useCallback(()=>{
  setLoad({status:'loading'});
  clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>{setPkg(data.package);setOutline(data.outline);setChangedScene(data.changedScene);setLoad({status:'ready'});},
   reason=>setLoad({status:'error',message:errorMessage(reason,"Couldn't load this video's plan.")}));
  clubFetch<ClubSettings>('/settings').then(settings=>setHelpSeen(settings.helpSeen??[]),()=>setHelpSeen([]));
 },[id]);
 useEffect(reload,[reload]);
 useEffect(()=>setOpen(openPlanStep(videoRef.current.planning)),[video.id]);

 const refreshChanged=useCallback(()=>{clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>setChangedScene(data.changedScene),()=>{});},[id]);
 const packageSaver=useSaver((value:Package)=>clubFetch(`/videos/${id}/package`,{method:'PUT',body:value}));
 const outlineSaver=useSaver((value:Outline)=>clubFetch(`/videos/${id}/outline`,{method:'PUT',body:{scenes:value.scenes}}),refreshChanged);
 const scriptSaver=useSaver((script:string)=>clubFetch(`/videos/${id}/script`,{method:'PUT',body:{script}}),refreshChanged);

 const editPackage=useCallback((next:Package)=>{setPkg(next);packageSaver.queue(next);},[packageSaver.queue]);
 const editOutline=useCallback((next:Outline)=>{setOutline(next);outlineSaver.queue(next);},[outlineSaver.queue]);
 const editScript=useCallback((script:string)=>{setOutline(current=>current&&{...current,fullScript:script});scriptSaver.queue(script);},[scriptSaver.queue]);

 const packageJob=useJobRun(),outlineJob=useJobRun(),scriptJob=useJobRun();
 const packageIt=useCallback(()=>{packageSaver.cancel();void packageJob.run(()=>clubFetch(`/videos/${id}/package`,{method:'POST'}),result=>setPkg(result as Package));},[id,packageJob.run,packageSaver.cancel]);
 const createOutline=useCallback(()=>{outlineSaver.cancel();scriptSaver.cancel();void outlineJob.run(()=>clubFetch(`/videos/${id}/outline`,{method:'POST'}),result=>{setOutline(result as Outline);refreshChanged();});},[id,outlineJob.run,outlineSaver.cancel,scriptSaver.cancel,refreshChanged]);
 const writeScript=useCallback(()=>{void (async()=>{try{await outlineSaver.flush();}catch{return;}void scriptJob.run(()=>clubFetch(`/videos/${id}/script`,{method:'POST'}),result=>{setOutline(result as Outline);refreshChanged();});})();},[id,scriptJob.run,outlineSaver.flush,refreshChanged]);
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
  editPackage,editOutline,editScript,packageIt,createOutline,writeScript,backToTalkingPoints,scriptError,
  packageJob:packageJob.state,outlineJob:outlineJob.state,scriptJob:scriptJob.state,
  saveError:packageSaver.error||outlineSaver.error||scriptSaver.error,
  retrySave:()=>{void Promise.all([packageSaver.flush(),outlineSaver.flush(),scriptSaver.flush()]).catch(()=>{});},
  continueAction,continueError,
 };
}

export type Plan=ReturnType<typeof usePlan>;
