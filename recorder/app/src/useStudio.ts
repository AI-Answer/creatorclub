import {useCallback,useEffect,useRef,useState} from 'react';
import type {Capabilities, Project, ProjectSummary} from '../shared/types';
import {adoptSavedProject,api,apiResult,APIError,JSONBody,projectRevision} from './api';
import {EditHistory} from './edit-history';
import {subscribeEvents} from './events';
import {applyProjectChange} from './project-draft';
import {runGuardedProjectOperation,projectRefreshDisposition} from './recovery-session';
import {ensureLinks} from './timeline-edit';
import {heartbeatProjectRecovery,releaseProjectRecovery,keepProjectRecovery,readProjectRecovery,clearProjectRecovery,projectRecoveryScope,saveTransition,saveLabel,type SavePhase,type SaveEvent} from './project-save-state';
import {saveProjectTake} from './recorded-takes';
import {registerRecordingProject} from './recording-save';
import {isCaptionOnlyUpdate,mergeCaptionUpdate} from './project-automation-merge';
/** A save that lost three races to automatic captions: autosave retries it, and callers that need the save finished stop here. */
export class CaptionSaveRetry extends Error{}
const CHAT_EDITING='Claude is editing this project — wait or stop it';
export const retryableSaveError=(error:unknown)=>error instanceof APIError?error.status===408||error.status===429||error.status>=500&&error.status<600:error instanceof TypeError||error instanceof DOMException&&['NetworkError','TimeoutError'].includes(error.name);
const EXTERNAL_CHANGE='This project has updates from another window. Your local edits are kept. Choose Keep my edits as a copy, or reload the server version to discard local edits.';

/** Edits that share a coalesce key, with no other edit or history step between them and less than a second apart, form one undo step. */
export type ProjectChange=(fn:(p:Project)=>void,opts?:{coalesce?:string})=>void;
const pendingEdits=new Set<()=>void>();
/** Fields that commit text after a pause register here, so saves, history steps and refreshes always include the latest text. */
export function registerPendingEdit(commit:()=>void){pendingEdits.add(commit);return()=>{pendingEdits.delete(commit);};}
const commitPendingEdits=()=>{for(const commit of [...pendingEdits])commit();};
export function useStudio(){
 const [project,setProject]=useState<Project|null>(null),[projects,setProjects]=useState<ProjectSummary[]>([]),[capabilities,setCapabilities]=useState<Capabilities|null>(null),[phase,setPhase]=useState<SavePhase>('clean'),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 // `saved` is the normalized clean baseline of the server file; `sent` is the local object it replaced. Both are compared by identity.
 const [history]=useState(()=>new EditHistory<Project>()),current=useRef<Project|null>(null),saved=useRef<Project|null>(null),sent=useRef<Project|null>(null),size=useRef(0),saveQueue=useRef(Promise.resolve()),revision=useRef(Promise.resolve('')),phaseRef=useRef<SavePhase>('clean'),retry=useRef(0),retryBlocked=useRef(false),chatEditing=useRef(new Set<string>()),[historyTick,setHistoryTick]=useState(0),[resave,setResave]=useState(0);
 const [recoveryScope]=useState(projectRecoveryScope),baseRevision=useRef(''),active=useRef(true),conflictCopy=useRef<{id:string;data:Project;etag:string|null}|null>(null);
 const setRevision=useCallback((pending:Promise<string>,known='')=>{revision.current=pending;baseRevision.current=known;void pending.then(value=>{if(revision.current===pending)baseRevision.current=value;});},[]);
 const keepRecovery=useCallback(()=>{commitPendingEdits();const p=current.current;if(!p)return true;if(p===saved.current){clearProjectRecovery(p.id,recoveryScope);return true;}return keepProjectRecovery(p,baseRevision.current,recoveryScope);},[recoveryScope]);
 current.current=project;
 // While a server change (a companion card) is being applied: the person's edits made meanwhile, to replay onto the server's result,
 // and where the undo history stood. Projects those edits produced are superseded once replayed, so they are never saved.
 const inFlight=useRef<{snapshot:Project|undefined;edits:Array<(p:Project)=>void>;made:Project[];past:number}|null>(null),superseded=useRef(new WeakSet<Project>());
 const refresh=useCallback(async()=>{setProjects(await api<ProjectSummary[]>('/projects'));},[]);
 useEffect(()=>{Promise.all([refresh(),api<Capabilities>('/health').then(setCapabilities)]).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[refresh]);
 const transition=useCallback((event:SaveEvent)=>{phaseRef.current=saveTransition(phaseRef.current,event);setPhase(phaseRef.current);},[]);
 const enterConflict=useCallback((message=EXTERNAL_CHANGE)=>{transition('conflict');keepRecovery();setError(message);},[transition,keepRecovery]);
 type HistoryPolicy='record'|'rebase'|'reset';
 const adoptServer=useCallback((p:Project,etag:string|null|undefined,policy:HistoryPolicy,shown:Project=p)=>{
  commitPendingEdits();const before=current.current;const normalized=applyProjectChange(p,ensureLinks);saved.current=normalized;sent.current=null;size.current=0;const tag=etag?'"'+etag.replace(/^W\//,'').replaceAll('"','')+'"':'';setRevision(tag?Promise.resolve(tag):projectRevision(p),tag);conflictCopy.current=null;
  if(policy==='reset'){history.reset();if(before)superseded.current.add(before);}else if(policy==='record'&&before&&before!==p)history.record(before,()=>80);
  const next=shown===p?normalized:applyProjectChange(shown,ensureLinks);current.current=next;setProject(next);setHistoryTick(x=>x+1);transition('reset');retry.current=0;retryBlocked.current=false;if(shown!==p){transition('edit');}else clearProjectRecovery(p.id,recoveryScope);
 },[history,transition,setRevision,recoveryScope]);
 const select=useCallback((p:Project,etag?:string|null)=>adoptServer(p,etag,'reset'),[adoptServer]);
 // The byte size from the last save bounds undo memory; it is measured once when no save has happened yet.
 const historyLimit=(p:Project)=>()=>{if(!size.current)size.current=JSON.stringify(p).length;return Math.max(2,Math.min(80,Math.floor(24_000_000/Math.max(1,size.current))));};
 const setChatEditing=useCallback((id:string,editing:boolean)=>{if(editing){if(!chatEditing.current.has(id))commitPendingEdits();chatEditing.current.add(id);}else chatEditing.current.delete(id);},[]);
 const editingBlocked=()=>{if(current.current&&chatEditing.current.has(current.current.id)){setError(CHAT_EDITING);return true;}return false;};
 const change=useCallback<ProjectChange>((fn,opts)=>{const p=current.current;if(!p||editingBlocked())return;retryBlocked.current=false;const next=applyProjectChange(p,fn);if(next===p)return;history.record(p,historyLimit(p),opts?.coalesce);if(inFlight.current){inFlight.current.edits.push(fn);inFlight.current.made.push(next);}current.current=next;setProject(next);setHistoryTick(x=>x+1);transition('edit');},[history,transition]);
 const undo=useCallback(()=>{commitPendingEdits();if(!current.current||inFlight.current||editingBlocked())return;retryBlocked.current=false;const prev=history.undo(current.current);if(!prev)return;current.current=prev;setProject(prev);transition('edit');setHistoryTick(x=>x+1);},[history,transition]);
 const redo=useCallback(()=>{commitPendingEdits();if(!current.current||inFlight.current||editingBlocked())return;retryBlocked.current=false;const next=history.redo(current.current);if(!next)return;current.current=next;setProject(next);transition('edit');setHistoryTick(x=>x+1);},[history,transition]);
 /** Rebase captions into the whole editing session, including history, without recording an edit. */
 const mergeCaptions=useCallback((incoming:Project,etag:string|null)=>{
  const rawIncoming=incoming,baseline=saved.current,shown=current.current;incoming=applyProjectChange(incoming,ensureLinks);
  if(!baseline||!shown||shown.id!==incoming.id||!isCaptionOnlyUpdate(baseline,incoming))return null;
  const rebased=new Map<Project,Project>(),rebase=(snapshot:Project)=>{
   let next=rebased.get(snapshot);if(next)return next;
   next=snapshot===baseline?incoming:mergeCaptionUpdate(baseline,incoming,snapshot);rebased.set(snapshot,next);superseded.current.add(snapshot);return next;
  };
  history.past=history.past.map(rebase);history.future=history.future.map(rebase);
  // A caption event may already be queued when a companion's initial flush completes. Enrich the
  // snapshot it compares against too, so this background update never appears as an untracked edit.
  const flight=inFlight.current;if(flight){if(flight.snapshot)flight.snapshot=rebase(flight.snapshot);flight.made=flight.made.map(rebase);}
  const next=rebase(shown);adoptServer(rawIncoming,etag,'rebase',shown===baseline?rawIncoming:next);
  return rebase;
 },[history,adoptServer]);
 const flush=useCallback(async()=>{
  commitPendingEdits();const p=current.current;if(!p)return;
  const task=saveQueue.current.catch(()=>{}).then(async()=>{
   if(current.current?.id!==p.id)return;
   if(phaseRef.current==='conflicted')throw new Error(EXTERNAL_CHANGE);
   let candidate=p;transition('save');
   // An earlier queued caption event may have superseded the snapshot this flush captured.
   if(superseded.current.has(candidate)){if(current.current?.id!==p.id)return;candidate=current.current;}
   if(saved.current===candidate||sent.current===candidate){if(current.current===saved.current)clearProjectRecovery(p.id,recoveryScope);transition(current.current===saved.current?'saved':'edit');return;}
   for(let attempt=0;attempt<3;attempt++){
    try{
     const expected=await revision.current,json=JSON.stringify(candidate);size.current=json.length;
     const result=await apiResult<unknown>(`/projects/${candidate.id}`,new JSONBody(json),'PUT',{'If-Match':expected,Prefer:'return=minimal'});
     if(result.etag)setRevision(Promise.resolve(result.etag),result.etag);
     const adopted=adoptSavedProject(candidate,result.data);if(!result.etag)setRevision(projectRevision(adopted));saved.current=adopted;retry.current=0;clearProjectRecovery(candidate.id,recoveryScope);
     if(current.current===candidate){sent.current=candidate;current.current=adopted;setProject(adopted);transition('saved');}
     else{sent.current=null;if(active.current)setResave(x=>x+1);else{await revision.current;keepRecovery();}}
     return;
    }catch(error){
     if(!(error instanceof APIError)||error.status!==409)throw error;
     // Automatic transcription can win the write race before its SSE event arrives. Fetch and validate
     // the actual delta rather than treating that harmless captions-only save as an external conflict.
     const fresh=await apiResult<Project>(`/projects/${candidate.id}`);commitPendingEdits();
     const rebase=mergeCaptions(fresh.data,fresh.etag);
     if(!rebase){enterConflict();throw new Error(EXTERNAL_CHANGE);}
     candidate=rebase(candidate);
    }
   }
   // Continuous transcription updates are retried by autosave, never by dropping the person's edits.
   setResave(x=>x+1);
   throw new CaptionSaveRetry('New captions arrived while saving. Your edits are kept and will save again.');
  });
  saveQueue.current=task;try{await task;}catch(e){if(!(e instanceof CaptionSaveRetry)){keepRecovery();if(phaseRef.current!=='conflicted'){transition('fail');retryBlocked.current=!retryableSaveError(e);if(!retryBlocked.current){retry.current++;setResave(x=>x+1);}}setError((e as Error).message);}throw e;}return current.current??p;
 },[mergeCaptions,transition,enterConflict,keepRecovery,setRevision,recoveryScope]);
 useEffect(()=>{if(!project||phaseRef.current==='conflicted'||retryBlocked.current)return;if(project===saved.current){clearProjectRecovery(project.id,recoveryScope);retry.current=0;transition('saved');return;}
  const delay=retry.current?Math.min(30000,1000*2**Math.min(retry.current-1,5)):650;
  const timer=setTimeout(()=>{if(retryBlocked.current)return;if(retry.current)transition('retry');void flush().catch(()=>{});},delay);return()=>clearTimeout(timer);
 },[project,flush,phase==='conflicted',resave,transition,recoveryScope]);
 useEffect(()=>registerRecordingProject(async(id,take)=>{if(current.current?.id!==id)return false;let applied=false;change(draft=>{if(draft.id!==id)return;saveProjectTake(draft,take);applied=true;});if(!applied)throw new Error(CHAT_EDITING);await flush();return true;}),[change,flush]);
 useEffect(()=>{active.current=true;const heartbeat=setInterval(()=>{heartbeatProjectRecovery(recoveryScope);},30_000);const journal=()=>{keepRecovery();releaseProjectRecovery(recoveryScope);};window.addEventListener?.('beforeunload',journal);return()=>{active.current=false;clearInterval(heartbeat);window.removeEventListener?.('beforeunload',journal);journal();releaseProjectRecovery(recoveryScope);};},[keepRecovery]);
 useEffect(()=>{
  let disposed=false,queue=Promise.resolve(),listTimer:ReturnType<typeof setTimeout>|undefined;
  const cleanRevision=(value:string)=>value.replace(/^W\//,'').replaceAll('"','');
  const refreshList=()=>{if(listTimer)clearTimeout(listTimer);listTimer=setTimeout(()=>{void refresh().catch(e=>setError(e.message));},200);};
  const receive=(event:MessageEvent)=>{let update:{id:string;revision?:string;action?:string;source?:string};try{update=JSON.parse(event.data);}catch{return;}
   queue=queue.catch(()=>{}).then(async()=>{
    // Hold the same queue as autosave while fetching/adopting an event; a save cannot race the rebase.
    const task=saveQueue.current.catch(()=>{}).then(async()=>{
     if(disposed)return;
     if(current.current?.id!==update.id){refreshList();return;}
     const acknowledged=await revision.current;if(disposed)return;
     if(update.action!=='trashed'&&update.revision&&cleanRevision(update.revision)===cleanRevision(acknowledged))return;
     commitPendingEdits();const before=current.current;if(!before||before.id!==update.id){refreshList();return;}
     // Caption automation is a background enrichment of this session, not another editing window.
     if(update.action!=='trashed'&&phaseRef.current!=='conflicted'){
      const fresh=await apiResult<Project>(`/projects/${update.id}`);if(disposed)return;commitPendingEdits();
      if(current.current?.id!==update.id)return;
      if(mergeCaptions(fresh.data,fresh.etag))return;
      const disposition=projectRefreshDisposition(before,current.current,fresh.data,saved.current);
      if(disposition==='ignore')return;
      if(disposition==='adopt'){adoptServer(fresh.data,fresh.etag,'record');return;}
     }
     if(before!==saved.current||phaseRef.current==='conflicted'||update.action!=='trashed'){
      enterConflict(update.action==='trashed'?'This project was moved to trash in another window. Your local edits are kept.':EXTERNAL_CHANGE);return;
     }
     current.current=null;setProject(null);saved.current=null;sent.current=null;history.reset();setHistoryTick(x=>x+1);refreshList();
    });
    saveQueue.current=task;await task;
   }).catch(e=>{if(!disposed)setError(e.message);});
  };
  const ready=()=>{const id=current.current?.id;if(!id)return;void apiResult<Project>(`/projects/${id}`).then(fresh=>{if(disposed||current.current?.id!==id)return;return (fresh.etag?Promise.resolve(fresh.etag):projectRevision(fresh.data)).then(revision=>receive(new MessageEvent('project',{data:JSON.stringify({id,revision,action:'saved'})})));}).catch(()=>{});};
  const serviceReady=()=>{retryBlocked.current=false;commitPendingEdits();if(current.current&&current.current!==saved.current&&phaseRef.current!=='conflicted'){void flush().catch(()=>{});}else ready();void refresh().catch(()=>{});};
  window.addEventListener?.('sceneforge-media-service-ready',serviceReady);
  const stopReady=subscribeEvents('ready',ready),stopProject=subscribeEvents('project',receive);return()=>{disposed=true;window.removeEventListener?.('sceneforge-media-service-ready',serviceReady);stopReady();stopProject();if(listTimer)clearTimeout(listTimer);};
 },[refresh,adoptServer,history,mergeCaptions,enterConflict,flush]);
 /**
  * A change the server makes to the open project (the companion's Edit cards): pending edits are saved first, then `run` gets the saved revision,
  * and the project it returns becomes the current one as one undo step, so the editor's Undo and Redo work on it. It runs in the save queue,
  * so the server's own save is never taken for someone else's change. Edits the person makes while it runs are replayed onto the server's
  * project (the card first, then those edits, each its own undo step) and saved; Undo and Redo wait until it is done.
  */
 const commitServer=useCallback(async<T extends {project?:Project;revision?:string}>(run:(revision:string)=>Promise<T>):Promise<T>=>{
  const snapshot=await flush();
  const flight={snapshot,edits:[] as Array<(p:Project)=>void>,made:[] as Project[],past:history.past.length};
  inFlight.current=flight;setHistoryTick(x=>x+1);
  const task=saveQueue.current.catch(()=>{}).then(async()=>{
   try{
    const result=await run((await revision.current).replace(/^W\//,'').replaceAll('"',''));
    const next=result.project,snapshot=flight.snapshot;if(!next||!result.revision||!snapshot||next.id!==snapshot.id||current.current?.id!==snapshot.id)return result;
    commitPendingEdits();inFlight.current=null;
    let shown=next,lost=0;
    if(current.current!==snapshot&&!flight.edits.length){enterConflict();return result;}
    for(const made of flight.made)superseded.current.add(made);
    history.past.splice(flight.past);history.record(snapshot,historyLimit(snapshot));
    for(const edit of flight.edits){try{const replayed=applyProjectChange(shown,edit);if(replayed!==shown){history.record(shown,historyLimit(shown));shown=replayed;}}catch{lost++;}}
    adoptServer(next,result.revision,'rebase',shown);
    if(lost)setError(lost===1?'One edit you made while the change was applied could not be kept.':`${lost} edits you made while the change was applied could not be kept.`);
    return result;
   }finally{if(inFlight.current===flight)inFlight.current=null;setHistoryTick(x=>x+1);}
  });
  saveQueue.current=task.then(()=>{});await task;return task;
 },[flush,history,enterConflict,adoptServer,transition]);
 const runProjectOperation=useCallback(<T extends {project:Project;revision:string}>(projectId:string,operation:(snapshot:Project,revision:string)=>Promise<T>,signal?:AbortSignal)=>runGuardedProjectOperation({projectId,signal,current:()=>{commitPendingEdits();return current.current;},flush,revision:()=>revision.current,operation,adopt:result=>{select(result.project,result.revision);void refresh().catch(e=>setError(e.message));},conflict:()=>enterConflict('Recovery finished on the saved project. Your newer local edits are preserved. Reload the saved version before continuing.')}),[flush,select,refresh,enterConflict]);
 const open=async(id:string)=>{try{await flush();const fresh=await apiResult<Project>(`/projects/${id}`),recovered=readProjectRecovery(id,recoveryScope),tag=fresh.etag??await projectRevision(fresh.data);adoptServer(fresh.data,tag,'reset',recovered?.project??fresh.data);await revision.current;if(recovered){if(recovered.baseRevision.replace(/^W\//,'').replaceAll('"','')===tag.replace(/^W\//,'').replaceAll('"','')){transition('edit');setError('');}else{baseRevision.current=recovered.baseRevision;enterConflict('Recovered unsaved local edits. The server version has changed. Keep my edits as a copy, or discard them and reload the server version.');}}}catch(e){setError((e as Error).message);}};
 const create=async(name:string)=>{try{await flush();const created=await apiResult<Project>('/projects',{name});select(created.data,created.etag);await refresh();}catch(e){setError((e as Error).message);}};
 /** Leaving a conflict preserves its journal; only the banner may create a copy or discard it. */
 const leave=useCallback(async()=>{commitPendingEdits();if(phaseRef.current==='conflicted'){if(!keepRecovery())throw new Error('Could not keep local edits for recovery. Resolve the conflict before leaving.');return;}await flush();},[flush,keepRecovery]);
 const close=async()=>{try{await leave();setProject(null);current.current=null;await refresh();}catch(e){setError((e as Error).message);}};
 const keepAsCopy=async()=>{
  const id=current.current?.id;if(!id)return;
  const task=saveQueue.current.catch(()=>{}).then(async()=>{const p=current.current;if(!p||p.id!==id||phaseRef.current!=='conflicted')return;
   // Retain the created id even if its PUT fails or newer edits arrive; retry never creates a duplicate.
   if(conflictCopy.current?.id!==id){const copy=await apiResult<Project>('/projects',{name:p.name+' (recovered local edits)'});conflictCopy.current={id,data:copy.data,etag:copy.etag};}
   const copy=conflictCopy.current!,recovered={...p,id:copy.data.id,name:copy.data.name};
   const result=await apiResult<Project>(`/projects/${recovered.id}`,recovered,'PUT',{'If-Match':copy.etag??await projectRevision(copy.data)});copy.data=result.data;copy.etag=result.etag;
   if(current.current!==p)throw new Error('Newer edits are kept locally. Keep my edits as a copy again before leaving.');
   const fresh=await apiResult<Project>(`/projects/${id}`);if(current.current!==p)throw new Error('Newer edits are kept locally. Keep my edits as a copy again before leaving.');
   clearProjectRecovery(id,recoveryScope);select(fresh.data,fresh.etag);void refresh().catch(()=>{});setError('Local edits were saved as a recovered project copy. The server version is now open.');return result.data;
  });saveQueue.current=task.then(()=>{},()=>{});return task;
 };
 const undoLatest=(before?:Project|null)=>{const snapshot=current.current,step=history.past.at(-1);return()=>{if(step&&(!before||step===before)&&history.past.at(-1)===step&&(current.current===snapshot||current.current===saved.current&&sent.current===snapshot)&&!inFlight.current)undo();};};
 void historyTick;
 const reload=async()=>{commitPendingEdits();const p=current.current;if(!p)return;if(p!==saved.current&&!window.confirm('Reload the server version? Your local edits will be discarded.'))return;
  const task=saveQueue.current.catch(()=>{}).then(async()=>{const fresh=await apiResult<Project>(`/projects/${p.id}`);commitPendingEdits();if(current.current!==p)throw new Error('The project changed while reloading. Review the local edits and reload again.');clearProjectRecovery(p.id,recoveryScope);select(fresh.data,fresh.etag);setError('');});saveQueue.current=task;await task;
 };
 return {setChatEditing,project,projects,capabilities,saveState:saveLabel(phase),error,setError,loading,refresh,select,change,commitServer,undo,undoLatest,keepRecovery,keepAsCopy,leave,redo,canUndo:!inFlight.current&&history.past.length>0,canRedo:!inFlight.current&&history.future.length>0,open,create,close,flush,conflicted:phase==='conflicted',reload,runProjectOperation};
}
