import {prepareRecording} from './recorder-setup';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {OnePager,Outline,Package,PlanData,PlanJobKind,PlanJobResult,Video} from '../../shared/club';

/** A status line under a step: "Replaced the outline · Undo" or "New outline ready · Use it". */
export type Notice={type:'replaced'|'held';token:string};
type Notices=Partial<Record<PlanJobKind,Notice>>;
import {clubFetch,errorMessage,notifyVideosChanged} from './api';
import {useJobRun} from './useJobRun';
import {packageDiff,withServerScripts,type PackageGroup} from './plan/plan-logic';

/** Typing is saved this long after the last keystroke, and at once when a field is left, the step changes or the page closes. */
export const SAVE_DELAY_MS=500;

/** Where the saving behind the typing stands: nothing typed yet, waiting or sending, saved, or failed. */
export type SaveStatus='idle'|'saving'|'saved'|'error';

/** Saves the latest value a moment after the last change. `flush` saves at once and reports a failure; `cancel` drops what is waiting. */
function useSaver<T>(save:(value:T)=>Promise<unknown>,onSaved?:()=>void){
 const pending=useRef<{value:T}|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const saveRef=useRef(save);saveRef.current=save;
 const savedRef=useRef(onSaved);savedRef.current=onSaved;
 const [error,setError]=useState('');
 const [status,setStatus]=useState<SaveStatus>('idle');
 const inflight=useRef<Promise<unknown>|null>(null);
 const generation=useRef(0);
 const flush=useCallback(async()=>{
  clearTimeout(timer.current);
  // A save already on its way finishes first, so what comes after it (a read, the next save) sees its result.
  if(inflight.current)await inflight.current.catch(()=>{});
  const waiting=pending.current;if(!waiting)return;
  pending.current=null;
  setStatus('saving');
  const mine=generation.current;
  const run=saveRef.current(waiting.value);
  inflight.current=run;
  try{await run;if(mine!==generation.current){if(!pending.current){setError('');setStatus('idle');}return;}setError('');if(!pending.current)setStatus('saved');savedRef.current?.();}
  catch(reason){if(mine!==generation.current){if(!pending.current){setError('');setStatus('idle');}return;}if(!pending.current)pending.current=waiting;setError(errorMessage(reason,"Couldn't save your changes."));setStatus('error');throw reason;}
  finally{if(inflight.current===run)inflight.current=null;}
 },[]);
 const queue=useCallback((value:T)=>{
  pending.current={value};clearTimeout(timer.current);setStatus('saving');
  timer.current=setTimeout(()=>{void flush().catch(()=>{});},SAVE_DELAY_MS);
 },[flush]);
 const cancel=useCallback(()=>{generation.current++;clearTimeout(timer.current);pending.current=null;if(!inflight.current)setStatus(now=>now==='saving'?'idle':now);},[]);
 // Leaving the page saves what is still waiting.
 useEffect(()=>()=>{clearTimeout(timer.current);void flush().catch(()=>{});},[flush]);
 const hasPending=useCallback(()=>pending.current!==null||inflight.current!==null,[]);
 return {queue,flush,cancel,error,hasPending,status};
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
 const [onepager,setOnepager]=useState<OnePager|null>(null);
 const onepagerEdited=useRef(false);
 const locks=useRef(new Set<PlanJobKind>());
 const planVersion=useRef(0),continuingRef=useRef(false);
 const outlineNow=useRef(outline);outlineNow.current=outline;
 const scriptsPending=useRef(new Map<string,string>());
 const [continuing,setContinuing]=useState(false),[continueError,setContinueError]=useState('');
 const [notices,setNotices]=useState<Notices>({});

 /** The package as the server last had it: the saves send only what differs from it. */
 const serverPkg=useRef<Package|null>(null);
 const showPkg=useCallback((next:Package|null)=>{serverPkg.current=next;setPkg(next);},[]);

 const reload=useCallback(()=>{
  setLoad({status:'loading'});
  clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>{
   showPkg(data.package);setOutline(data.outline);setOnepager(data.onepager??null);setChangedScene(data.changedScene);setLoad({status:'ready'});
   // Results held while this page was away are offered again; runs still going are followed.
   setNotices(Object.fromEntries(Object.entries(data.ready??{}).map(([kind,token])=>[kind,{type:'held',token}])));
   for(const [kind,jobId] of Object.entries(data.running??{}))if(jobId)attachRef.current(kind as PlanJobKind,jobId);
  },
   reason=>setLoad({status:'error',message:errorMessage(reason,"Couldn't load this video's plan.")}));
 },[id,showPkg]);
 useEffect(reload,[reload]);

 /** After a save: the scene the outline changed after, and the script words as the server now matches them to the scenes. */
 const refreshChanged=useCallback(()=>{
  const version=planVersion.current;
  clubFetch<PlanData>(`/videos/${id}/plan`).then(data=>{
   if(version!==planVersion.current)return;
   setChangedScene(data.changedScene);
   const server=data.outline;
   if(server&&!locks.current.has('script')&&!scriptsPending.current.size)setOutline(current=>current&&withServerScripts(current,server));
  },()=>{});
 },[id]);
 const packageSaver=useSaver(async(value:Package)=>{
  const diff=packageDiff(serverPkg.current,value);
  if(serverPkg.current&&!Object.keys(diff).length)return;
  serverPkg.current=await clubFetch<Package>(`/videos/${id}/package`,{method:'PUT',body:diff});
 });
 const onepagerSaver=useSaver((value:OnePager)=>clubFetch(`/videos/${id}/onepager`,{method:'PUT',body:value}));
 const outlineSaver=useSaver((value:Outline)=>clubFetch(`/videos/${id}/outline`,{method:'PUT',body:{scenes:value.scenes}}),refreshChanged);

 /**
  * Reads the plan again without the loading state, for a page that was away: the Board's Use as hook or the chat may have written the package meanwhile.
  * What is waiting to be saved goes first, and nothing is replaced if the person typed while it was reading.
  */
 const refresh=useCallback(async()=>{
  try{await packageSaver.flush();await outlineSaver.flush();await scriptSaver.flush();await onepagerSaver.flush();}catch{return;}
  const version=planVersion.current;
  try{
   const data=await clubFetch<PlanData>(`/videos/${id}/plan`);
   if(version!==planVersion.current)return;
   if(!locks.current.has('package')&&!packageSaver.hasPending())showPkg(data.package);
   if(!locks.current.has('outline')&&!locks.current.has('script')&&!outlineSaver.hasPending()&&!scriptSaver.hasPending()){setOutline(data.outline);setChangedScene(data.changedScene);}
   if(!locks.current.has('onepager')&&!onepagerSaver.hasPending())setOnepager(data.onepager??null);
  }catch{/* the page keeps what it has */}
 },[id,showPkg,packageSaver.flush,outlineSaver.flush,packageSaver.hasPending,outlineSaver.hasPending,onepagerSaver.flush,onepagerSaver.hasPending]);

 // Typing after a replace keeps the new version: its Undo line goes away. A held result stays on offer.
 const dropReplaced=useCallback((...kinds:PlanJobKind[])=>setNotices(current=>{const next={...current};for(const kind of kinds)if(next[kind]?.type==='replaced')delete next[kind];return next;}),[]);
 const editPackage=useCallback((next:Package)=>{if(locks.current.has('package'))return;planVersion.current++;setPkg(next);packageSaver.queue(next);dropReplaced('package');},[packageSaver.queue,dropReplaced]);
 const editOnepager=useCallback((next:OnePager)=>{planVersion.current++;onepagerEdited.current=true;setOnepager(next);onepagerSaver.queue(next);dropReplaced('onepager');},[onepagerSaver.queue,dropReplaced]);
 const editOutline=useCallback((next:Outline)=>{if(locks.current.has('outline')||locks.current.has('script'))return;planVersion.current++;outlineNow.current=next;setOutline(next);outlineSaver.queue(next);dropReplaced('outline','script');},[outlineSaver.queue,dropReplaced]);

 // All scene editors share one queue: latest text per scene, sent in order after the outline.
 const scriptSaver=useSaver(async(values:Map<string,string>)=>{
  await outlineSaver.flush();
  for(const [sceneId,text] of values){
   await clubFetch(`/videos/${id}/script/scene/${encodeURIComponent(sceneId)}`,{method:'PUT',body:{text}});
   if(scriptsPending.current.get(sceneId)===text)scriptsPending.current.delete(sceneId);
  }
  refreshChanged();
 });
 const saveSceneScript=useCallback((sceneId:string,text:string)=>{
  if(locks.current.has('outline')||locks.current.has('script'))return;
  const current=outlineNow.current;if(!current)return;
  const next={...current,scenes:current.scenes.map(scene=>{if(scene.id!==sceneId)return scene;const {script:_old,...rest}=scene;return text.trim()?{...rest,script:text}:rest;})};
  planVersion.current++;outlineNow.current=next;setOutline(next);dropReplaced('outline','script');
  scriptsPending.current.set(sceneId,text);scriptSaver.queue(new Map(scriptsPending.current));
 },[scriptSaver.queue,dropReplaced]);

 const packageJob=useJobRun(),outlineJob=useJobRun(),scriptJob=useJobRun(),onepagerJob=useJobRun();
 const jobs={package:packageJob,outline:outlineJob,script:scriptJob,onepager:onepagerJob};
 /** The scene a script run writes; none while it writes the whole script. */
 const [scriptScene,setScriptScene]=useState<string|undefined>();
 /** A finished run: shown at once, with Undo when it replaced something; held behind "Use it" when the step changed while it ran. */
 const finished=useCallback((kind:PlanJobKind,raw:unknown)=>{
  planVersion.current++;
  const result=raw as PlanJobResult<Package|Outline|OnePager>;
  notifyVideosChanged();
  if(result.held){setNotices(current=>({...current,[kind]:{type:'held',token:result.held!}}));return;}
  // The server already filled only what was empty, so its package is the one to show.
  // A delayed event must not put back words the person has already edited or is still saving.
  if(kind==='onepager'&&onepagerEdited.current)return;
  if(kind==='package')packageSaver.cancel();
  if(kind==='outline'||kind==='script'){outlineSaver.cancel();scriptSaver.cancel();scriptsPending.current.clear();}
  if(kind==='onepager')setOnepager(result.value as OnePager);
  else if(kind==='package')showPkg(result.value as Package);
  else{setOutline(result.value as Outline);refreshChanged();}
  setNotices(current=>{const {[kind]:_old,...rest}=current;return result.replaced?{...rest,[kind]:{type:'replaced',token:result.replaced}}:rest;});
 },[refreshChanged,showPkg]);
 const attachRef=useRef<(kind:PlanJobKind,jobId:string)=>void>(()=>{});
 attachRef.current=(kind,jobId)=>{locks.current.add(kind);if(kind==='onepager')onepagerEdited.current=false;void jobs[kind].attach(jobId,result=>finished(kind,result),()=>{locks.current.delete(kind);});};
 /** Saves what is waiting first, so the run starts from what is on screen, then runs the step (the server reuses a run already going). */
 const start=useCallback(async(kind:PlanJobKind,flush:()=>Promise<void>,body?:{sceneId:string}|{replace:PackageGroup})=>{
  if(locks.current.has(kind)||((kind==='outline'||kind==='script')&&(locks.current.has('outline')||locks.current.has('script'))))return;
  locks.current.add(kind);planVersion.current++;
  try{await flush();await scriptSaver.flush();}catch{locks.current.delete(kind);return;}
  setNotices(({[kind]:_old,...rest})=>rest);
  if(kind==='onepager')onepagerEdited.current=false;
  void jobs[kind].run(()=>clubFetch(`/videos/${id}/${kind}`,{method:'POST',...(body?{body}:{})}),result=>finished(kind,result),()=>{locks.current.delete(kind);});
 },[id,finished,packageJob.run,outlineJob.run,scriptJob.run,onepagerJob.run]);
 /** Write titles and Write hooks run the whole package; the result fills what is empty, and `replace` also takes the group the person asked to write again. */
 const writePackage=useCallback((replace?:PackageGroup)=>{
  void start('package',packageSaver.flush,replace?{replace}:undefined);
 },[start,packageSaver.flush]);
 const writeOnepager=useCallback(()=>{void start('onepager',async()=>{await packageSaver.flush();await onepagerSaver.flush();});},[start,packageSaver.flush,onepagerSaver.flush]);
 const createOutline=useCallback(()=>{void start('outline',outlineSaver.flush);},[start,outlineSaver.flush]);
 /** Write full script, or with a scene id that scene's script. */
 const writeScript=useCallback((sceneId?:string)=>{
  if(locks.current.has('script')||locks.current.has('outline'))return;
  setScriptScene(sceneId);
  void start('script',outlineSaver.flush,sceneId?{sceneId}:undefined);
 },[start,outlineSaver.flush]);
 const stop=useCallback((kind:PlanJobKind)=>{void jobs[kind].cancel();},[packageJob.cancel,outlineJob.cancel,scriptJob.cancel,onepagerJob.cancel]);

 /** Undo after a replace, or Use it for a held result. Both bring back the saved package and outline as the server now has them. */
 const [noticeError,setNoticeError]=useState('');
 const resolveNotice=useCallback(async(kind:PlanJobKind)=>{
  const notice=notices[kind];if(!notice)return;
  setNoticeError('');
  if(kind==='onepager')onepagerSaver.cancel();else if(kind==='package')packageSaver.cancel();else outlineSaver.cancel();
  try{
   if(kind==='onepager')await onepagerSaver.flush();
   const result=await clubFetch<PlanData>(`/videos/${id}/${kind}/${notice.type==='replaced'?'undo':'use'}`,{body:{token:notice.token}});
   if(kind==='onepager')setOnepager(result.onepager??null);
   else{showPkg(result.package);setOutline(result.outline);refreshChanged();}
   setNotices(({[kind]:_done,...rest})=>rest);
  }catch(reason){setNoticeError(errorMessage(reason,notice.type==='replaced'?"Couldn't undo that.":"Couldn't use that version."));}
 },[id,notices,refreshChanged,showPkg,packageSaver.cancel,outlineSaver.cancel,onepagerSaver.cancel,onepagerSaver.flush]);

 /** Continue to recording: saves what is waiting, creates or updates the recording project, moves the card and opens Record. */
 const busy=(packageJob.state.phase==='starting'||packageJob.state.phase==='running')||(outlineJob.state.phase==='starting'||outlineJob.state.phase==='running')||(scriptJob.state.phase==='starting'||scriptJob.state.phase==='running')||(onepagerJob.state.phase==='starting'||onepagerJob.state.phase==='running');
 const continueToRecording=useCallback(async()=>{
  if(continuingRef.current)return;
  continuingRef.current=true;setContinuing(true);setContinueError('');
  try{
   await packageSaver.flush();await outlineSaver.flush();await scriptSaver.flush();await onepagerSaver.flush();
   const moved=await prepareRecording(video.id,false,async()=>{await packageSaver.flush();await outlineSaver.flush();await scriptSaver.flush();await onepagerSaver.flush();});
   onVideo(moved);onRecord();
  }catch(reason){setContinueError(errorMessage(reason,"Couldn't set up the recording."));}
  finally{continuingRef.current=false;setContinuing(false);}
 },[id,onVideo,onRecord,packageSaver.flush,outlineSaver.flush,scriptSaver.flush,onepagerSaver.flush]);
 const continueAction=load.status==='ready'&&outline?.scenes.length?{run:()=>void continueToRecording(),disabled:continuing||busy}:undefined;

 return {
  load,reload,refresh,pkg,outline,onepager,changedScene,
  /** Saves what is waiting now, so a change made elsewhere (the companion) starts from what is on screen. */
  flush:async()=>{await packageSaver.flush();await outlineSaver.flush();await scriptSaver.flush();await onepagerSaver.flush();},
  editPackage,editOutline,editOnepager,writeOnepager,saveSceneScript,writePackage,createOutline,writeScript,scriptScene,stop,notices,resolveNotice,noticeError,
  packageJob:packageJob.state,outlineJob:outlineJob.state,scriptJob:scriptJob.state,onepagerJob:onepagerJob.state,
  saveError:packageSaver.error||outlineSaver.error||onepagerSaver.error||scriptSaver.error,
  onepagerSave:onepagerSaver.status,
  flushOnepager:()=>onepagerSaver.flush().catch(()=>{}),
  /** The package's saving, shown beside its heading (its failure is said there, not in the lines above the columns). */
  packageSave:packageSaver.status,
  /** The scenes' saving failure, for the lines above the columns. */
  scenesSaveError:outlineSaver.error||scriptSaver.error,
  /** Saves the package now (a field was left). A failure shows in `packageSave`. */
  flushPackage:()=>{void packageSaver.flush().catch(()=>{});},
  retrySave:()=>{void Promise.all([packageSaver.flush(),outlineSaver.flush(),scriptSaver.flush(),onepagerSaver.flush()]).catch(()=>{});},
  continueAction,continueError,
  /** A package, outline or script run is going: Continue waits for it. */
  busy,
 };
}

export type Plan=ReturnType<typeof usePlan>;
