import {useCallback,useEffect,useRef,useState} from 'react';
import type {Capabilities, Project, ProjectSummary} from '../shared/types';
import {adoptSavedProject,api,apiResult,APIError,JSONBody,projectRevision} from './api';
import {EditHistory} from './edit-history';
import {subscribeEvents} from './events';
import {applyProjectChange} from './project-draft';
import {runGuardedProjectOperation,projectRefreshDisposition} from './recovery-session';
import {isCaptionOnlyUpdate,mergeCaptionUpdate} from './project-automation-merge';
/** A save that lost three races to automatic captions: autosave retries it, and callers that need the save finished stop here. */
export class CaptionSaveRetry extends Error{}
const EXTERNAL_CHANGE='This project has updates from another window. Your local edits are kept. Reload the saved version when you are ready.';

/** Edits that share a coalesce key, with no other edit or history step between them and less than a second apart, form one undo step. */
export type ProjectChange=(fn:(p:Project)=>void,opts?:{coalesce?:string})=>void;
const pendingEdits=new Set<()=>void>();
/** Fields that commit text after a pause register here, so saves, history steps and refreshes always include the latest text. */
export function registerPendingEdit(commit:()=>void){pendingEdits.add(commit);return()=>{pendingEdits.delete(commit);};}
const commitPendingEdits=()=>{for(const commit of [...pendingEdits])commit();};
export function useStudio(){
 const [project,setProject]=useState<Project|null>(null),[projects,setProjects]=useState<ProjectSummary[]>([]),[capabilities,setCapabilities]=useState<Capabilities|null>(null),[saveState,setSaveState]=useState('Saved locally'),[error,setError]=useState(''),[loading,setLoading]=useState(true),[conflicted,setConflicted]=useState(false);
 // `saved` is the object that matches the server file; `sent` is the local object it replaced. Both are compared by identity.
 const [history]=useState(()=>new EditHistory<Project>()),current=useRef<Project|null>(null),saved=useRef<Project|null>(null),sent=useRef<Project|null>(null),size=useRef(0),saveQueue=useRef(Promise.resolve()),revision=useRef(Promise.resolve('')),conflict=useRef(false),[historyTick,setHistoryTick]=useState(0),[resave,setResave]=useState(0);
 current.current=project;
 // While a server change (a companion card) is being applied: the person's edits made meanwhile, to replay onto the server's result,
 // and where the undo history stood. Projects those edits produced are superseded once replayed, so they are never saved.
 const inFlight=useRef<{snapshot:Project|undefined;edits:Array<(p:Project)=>void>;made:Project[];past:number}|null>(null),superseded=useRef(new WeakSet<Project>());
 const refresh=useCallback(async()=>{setProjects(await api<ProjectSummary[]>('/projects'));},[]);
 useEffect(()=>{Promise.all([refresh(),api<Capabilities>('/health').then(setCapabilities)]).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[refresh]);
 const select=useCallback((p:Project,etag?:string|null)=>{commitPendingEdits();saved.current=p;sent.current=null;size.current=0;revision.current=etag?Promise.resolve(etag):projectRevision(p);conflict.current=false;setConflicted(false);current.current=p;setProject(p);history.reset();setHistoryTick(x=>x+1);setSaveState('Saved locally');},[history]);
 // The byte size from the last save bounds undo memory; it is measured once when no save has happened yet.
 const historyLimit=(p:Project)=>()=>{if(!size.current)size.current=JSON.stringify(p).length;return Math.max(2,Math.min(80,Math.floor(24_000_000/Math.max(1,size.current))));};
 const change=useCallback<ProjectChange>((fn,opts)=>{const p=current.current;if(!p)return;const next=applyProjectChange(p,fn);history.record(p,historyLimit(p),opts?.coalesce);if(inFlight.current){inFlight.current.edits.push(fn);inFlight.current.made.push(next);}current.current=next;setProject(next);setHistoryTick(x=>x+1);setSaveState('Saving…');},[history]);
 const undo=useCallback(()=>{commitPendingEdits();if(!current.current||inFlight.current)return;const prev=history.undo(current.current);if(!prev)return;current.current=prev;setProject(prev);setHistoryTick(x=>x+1);},[history]);
 const redo=useCallback(()=>{commitPendingEdits();if(!current.current||inFlight.current)return;const next=history.redo(current.current);if(!next)return;current.current=next;setProject(next);setHistoryTick(x=>x+1);},[history]);
 /** Rebase captions into the whole editing session, including history, without recording an edit. */
 const mergeCaptions=useCallback((incoming:Project,etag:string|null)=>{
  const baseline=saved.current,shown=current.current;
  if(!baseline||!shown||shown.id!==incoming.id||!isCaptionOnlyUpdate(baseline,incoming))return null;
  const rebased=new Map<Project,Project>(),rebase=(snapshot:Project)=>{
   let next=rebased.get(snapshot);if(next)return next;
   next=snapshot===baseline?incoming:mergeCaptionUpdate(baseline,incoming,snapshot);rebased.set(snapshot,next);superseded.current.add(snapshot);return next;
  };
  history.past=history.past.map(rebase);history.future=history.future.map(rebase);
  // A caption event may already be queued when a companion's initial flush completes. Enrich the
  // snapshot it compares against too, so this background update never appears as an untracked edit.
  const flight=inFlight.current;if(flight){if(flight.snapshot)flight.snapshot=rebase(flight.snapshot);flight.made=flight.made.map(rebase);}
  const next=rebase(shown);saved.current=incoming;sent.current=null;revision.current=etag?Promise.resolve(etag):projectRevision(incoming);
  current.current=next;setProject(next);setHistoryTick(x=>x+1);setSaveState(next===incoming?'Saved locally':'Saving…');
  return rebase;
 },[history]);
 const flush=useCallback(async()=>{
  commitPendingEdits();const p=current.current;if(!p)return;
  if(conflict.current)throw new Error(EXTERNAL_CHANGE);
  const task=saveQueue.current.catch(()=>{}).then(async()=>{
   if(conflict.current)throw new Error(EXTERNAL_CHANGE);
   let candidate=p;
   // An earlier queued caption event may have superseded the snapshot this flush captured.
   if(superseded.current.has(candidate)){if(current.current?.id!==p.id)return;candidate=current.current;}
   if(saved.current===candidate||sent.current===candidate)return;
   for(let attempt=0;attempt<3;attempt++){
    try{
     const expected=await revision.current,json=JSON.stringify(candidate);size.current=json.length;
     const result=await apiResult<unknown>(`/projects/${candidate.id}`,new JSONBody(json),'PUT',{'If-Match':expected,Prefer:'return=minimal'});
     if(result.etag)revision.current=Promise.resolve(result.etag);
     const adopted=adoptSavedProject(candidate,result.data);if(!result.etag)revision.current=projectRevision(adopted);saved.current=adopted;
     if(current.current===candidate){sent.current=candidate;current.current=adopted;setProject(adopted);setSaveState('Saved locally');}
     else{sent.current=null;setResave(x=>x+1);}
     return;
    }catch(error){
     if(!(error instanceof APIError)||error.status!==409)throw error;
     // Automatic transcription can win the write race before its SSE event arrives. Fetch and validate
     // the actual delta rather than treating that harmless captions-only save as an external conflict.
     const fresh=await apiResult<Project>(`/projects/${candidate.id}`);commitPendingEdits();
     const rebase=!conflict.current&&mergeCaptions(fresh.data,fresh.etag);
     if(!rebase){conflict.current=true;setConflicted(true);setSaveState('Autosave paused');throw new Error(EXTERNAL_CHANGE);}
     candidate=rebase(candidate);
    }
   }
   // Continuous transcription updates are retried by autosave, never by dropping the person's edits.
   setResave(x=>x+1);
   throw new CaptionSaveRetry('New captions arrived while saving. Your edits are kept and will save again.');
  });
  saveQueue.current=task;await task;return current.current??p;
 },[mergeCaptions]);
 useEffect(()=>{if(!project||conflicted)return;if(project===saved.current){setSaveState('Saved locally');return;}setSaveState('Saving…');const timer=setTimeout(()=>{void flush().catch(e=>{if(e instanceof CaptionSaveRetry)return;if(!conflict.current)setSaveState('Save failed');setError(e.message);});},650);return()=>clearTimeout(timer);},[project,flush,conflicted,resave]);
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
     if(update.action!=='trashed'&&!conflict.current){
      const fresh=await apiResult<Project>(`/projects/${update.id}`);if(disposed)return;commitPendingEdits();
      if(current.current?.id!==update.id)return;
      if(mergeCaptions(fresh.data,fresh.etag))return;
      const disposition=projectRefreshDisposition(before,current.current,fresh.data,saved.current);
      if(disposition==='ignore')return;
      if(disposition==='adopt'){select(fresh.data,fresh.etag);return;}
     }
     if(before!==saved.current||conflict.current||update.action!=='trashed'){
      conflict.current=true;setConflicted(true);setSaveState('Autosave paused');setError(update.action==='trashed'?'This project was moved to trash in another window. Your local edits are kept.':EXTERNAL_CHANGE);return;
     }
     current.current=null;setProject(null);saved.current=null;sent.current=null;history.reset();setHistoryTick(x=>x+1);refreshList();
    });
    saveQueue.current=task;await task;
   }).catch(e=>{if(!disposed)setError(e.message);});
  };
  const ready=()=>{const id=current.current?.id;if(!id)return;void apiResult<Project>(`/projects/${id}`).then(fresh=>{if(disposed||current.current?.id!==id)return;return (fresh.etag?Promise.resolve(fresh.etag):projectRevision(fresh.data)).then(revision=>receive(new MessageEvent('project',{data:JSON.stringify({id,revision,action:'saved'})})));}).catch(()=>{});};
  const stopReady=subscribeEvents('ready',ready),stopProject=subscribeEvents('project',receive);return()=>{disposed=true;stopReady();stopProject();if(listTimer)clearTimeout(listTimer);};
 },[refresh,select,history,mergeCaptions]);
 /**
  * A change the server makes to the open project (the companion's Edit cards): pending edits are saved first, then `run` gets the saved revision,
  * and the project it returns becomes the current one as one undo step, so the editor's Undo and Redo work on it. It runs in the save queue,
  * so the server's own save is never taken for someone else's change. Edits the person makes while it runs are replayed onto the server's
  * project (the card first, then those edits, each its own undo step) and saved; Undo and Redo wait until it is done.
  */
 const commitServer=useCallback(async<T extends {project?:Project;revision?:string}>(run:(revision:string)=>Promise<T>):Promise<T>=>{
  const snapshot=await flush();
  const flight={snapshot,edits:[] as Array<(p:Project)=>void>,made:[] as Project[],past:history.past.length};
  inFlight.current=flight;
  const task=saveQueue.current.catch(()=>{}).then(async()=>{
   try{
    const result=await run((await revision.current).replace(/^W\//,'').replaceAll('"',''));
    const next=result.project,snapshot=flight.snapshot;if(!next||!result.revision||!snapshot||next.id!==snapshot.id||current.current?.id!==snapshot.id)return result;
    commitPendingEdits();inFlight.current=null;
    let shown=next,lost=0;
    if(current.current!==snapshot){
     // Not one of this tab's own edits (it changed some other way): keep it and pause saving, as before.
     if(!flight.edits.length){conflict.current=true;setConflicted(true);setSaveState('Autosave paused');return result;}
     for(const edit of flight.edits){try{shown=applyProjectChange(shown,edit);}catch{lost++;}}
     for(const made of flight.made)superseded.current.add(made);
     history.past.splice(flight.past);
    }
    history.record(snapshot,historyLimit(snapshot));if(shown!==next)history.record(next,historyLimit(next));
    saved.current=next;sent.current=null;revision.current=Promise.resolve(`"${result.revision.replace(/^W\//,'').replaceAll('"','')}"`);current.current=shown;setProject(shown);setHistoryTick(x=>x+1);setSaveState(shown===next?'Saved locally':'Saving…');
    if(lost)setError(lost===1?'One edit you made while the change was applied could not be kept.':`${lost} edits you made while the change was applied could not be kept.`);
    return result;
   }finally{if(inFlight.current===flight)inFlight.current=null;}
  });
  saveQueue.current=task.then(()=>{});await task;return task;
 },[flush,history]);
 const runProjectOperation=useCallback(<T extends {project:Project;revision:string}>(projectId:string,operation:(snapshot:Project,revision:string)=>Promise<T>,signal?:AbortSignal)=>runGuardedProjectOperation({projectId,signal,current:()=>{commitPendingEdits();return current.current;},flush,revision:()=>revision.current,operation,adopt:result=>{select(result.project,result.revision);void refresh().catch(e=>setError(e.message));},conflict:()=>{conflict.current=true;setConflicted(true);setSaveState('Autosave paused');setError('Recovery finished on the saved project. Your newer local edits are preserved. Reload the saved version before continuing.');}}),[flush,select,refresh]);
 const open=async(id:string)=>{try{await flush();const fresh=await apiResult<Project>(`/projects/${id}`);select(fresh.data,fresh.etag);}catch(e){setError((e as Error).message);}};
 const create=async(name:string)=>{try{await flush();const created=await apiResult<Project>('/projects',{name});select(created.data,created.etag);await refresh();}catch(e){setError((e as Error).message);}};
 const close=async()=>{try{await flush();setProject(null);current.current=null;await refresh();}catch(e){setError((e as Error).message);}};
 void historyTick;
 const reload=async()=>{if(!current.current)return;const fresh=await apiResult<Project>(`/projects/${current.current.id}`);select(fresh.data,fresh.etag);setError('');};
 return {project,projects,capabilities,saveState,error,setError,loading,refresh,select,change,commitServer,undo,redo,canUndo:history.past.length>0,canRedo:history.future.length>0,open,create,close,flush,conflicted,reload,runProjectOperation};
}
