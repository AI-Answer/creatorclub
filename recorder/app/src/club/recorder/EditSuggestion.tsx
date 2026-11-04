import {useEffect,useRef,useState} from 'react';
import type {AutomationJob,AutomationMutation,QuickActionRequest} from '../../../shared/automation';
import type {Project} from '../../../shared/types';
import {api} from '../../api';
import {Button,Icon} from '../ui';
import {cutSuggestion,formatCutDuration} from './edit-steps';
import {planIsStale,UNKNOWN_PLAN} from './edit-auto';
import {usePlanBase} from './EditAutoSheet';

export const REMOVE_FAILED="Couldn't remove the pauses.";
export const UNDO_FAILED="Couldn't put the pauses back.";

/** What `Remove them` took out, kept so it can be undone: the timeline's saved version just before and just after. */
type Removed={job:AutomationJob;seconds:number;before:string;after:string};

/**
 * The Edit step's one suggestion. On the first open of a video's edit, SceneForge's Remove pauses plan runs in the background
 * (local audio and word timings only, no Claude pass). When it is ready the card asks "Remove 3m 12s of pauses and repeats?":
 * `Remove them` applies every proposed cut as one saved change; `Review first` opens SceneForge's review dialog.
 * After `Remove them` a quiet line "Removed 3m 12s · Undo" stays until the next edit or until it is dismissed;
 * Undo puts the timeline back through SceneForge's own undo of that change.
 * `refresh` reloads the saved timeline into the editor after either change.
 */
export function EditSuggestion({project,jobs,merge,reload,flush,refresh,onReview,onChanged}:{project:Project;jobs:AutomationJob[];merge(job:AutomationJob):void;reload():Promise<void>;flush():Promise<Project|undefined>;refresh():Promise<void>;onReview():void;onChanged?():void}){
 const suggestion=cutSuggestion(jobs),base=usePlanBase(suggestion.state==='ready'?suggestion.job:undefined);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState<''|'remove'|'undo'>(''),[removed,setRemoved]=useState<Removed|null>(null);
 const started=useRef('');
 const hasClips=project.clips.length>0;

 const plan=async()=>{
  const fresh=await flush();
  if(!fresh||fresh.id!==project.id)return;
  merge(await api<AutomationJob>(`/projects/${project.id}/quick-action`,{kind:'auto-cut',semantic:false} satisfies QuickActionRequest));
 };

 // First open: ask the server for this project's earlier plans, and start one only when there has never been one.
 // The guard is cleared again when the effect is torn down before it finished (StrictMode runs effects twice in development).
 useEffect(()=>{
  if(!hasClips||started.current===project.id)return;
  started.current=project.id;
  const request=new AbortController();let done=false;
  void api<{jobs:AutomationJob[]}>(`/projects/${project.id}/automation`,undefined,undefined,request.signal)
   .then(({jobs:saved})=>{done=true;for(const job of saved)merge(job);if(!saved.some(j=>j.kind==='auto-cut'&&!j.sceneId))return plan();})
   .catch(()=>{});
  return()=>{request.abort();if(!done)started.current='';};
 },[project.id,hasClips]);

 const removeAll=async()=>{
  if(suggestion.state!=='ready')return;
  setBusy(true);setFailed('');
  try{
   const fresh=await flush();
   if(!fresh||fresh.id!==project.id)throw new Error('project changed');
   const result=await api<AutomationMutation>(`/automation/${suggestion.job.id}/apply`,{changeIds:suggestion.changeIds});
   merge(result.job);
   setRemoved({job:result.job,seconds:suggestion.seconds,before:fresh.updatedAt,after:result.project.updatedAt});
   await Promise.all([reload().catch(()=>{}),refresh().catch(()=>{})]);
   onChanged?.();
  }catch{setFailed('remove');}
  finally{setBusy(false);}
 };
 const undo=async()=>{
  if(!removed)return;
  setBusy(true);setFailed('');
  try{
   await flush();
   const result=await api<AutomationMutation>(`/automation/${removed.job.id}/undo`,{});
   merge(result.job);setRemoved(null);
   await Promise.all([reload().catch(()=>{}),refresh().catch(()=>{})]);
   onChanged?.();
  }catch{setFailed('undo');}
  finally{setBusy(false);}
 };
 // The plan was made for an older version of the timeline, or the apply failed: plan again, then the card asks again.
 const retry=async()=>{setFailed('');setBusy(true);try{await plan();}catch{setFailed('remove');}finally{setBusy(false);}};

 if(failed)return <div className="club-edit-suggestion" role="alert"><span className="text-warn">{failed==='undo'?UNDO_FAILED:REMOVE_FAILED}</span><Button size="sm" onClick={()=>void (failed==='undo'?undo():retry())}>Try again</Button></div>;
 // Shown while the timeline is still the one the removal saved (or the editor has not caught up with it yet): any other edit ends it.
 if(removed&&(project.updatedAt===removed.after||project.updatedAt===removed.before))return <div className="club-edit-suggestion is-quiet" role="status">
  <span>Removed {formatCutDuration(removed.seconds)}</span><span aria-hidden>·</span>
  <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void undo()}>{busy&&<Icon name="loading" className="spin"/>}Undo</Button>
  <button type="button" className="club-edit-dismiss" aria-label="Close" disabled={busy} onClick={()=>setRemoved(null)}><Icon name="close" size={14}/></button>
 </div>;
 if(suggestion.state==='running')return <div className="club-edit-suggestion is-quiet" role="status"><Icon name="loading" className="spin" size={15}/><span>Looking for pauses and repeats…</span></div>;
 // A plan from before the latest edit no longer matches the timeline; the Auto-edit and style sheet offers to look again.
 if(suggestion.state!=='ready'||base!==UNKNOWN_PLAN&&planIsStale(base,project))return null;
 return <div className="club-edit-suggestion" role="group" aria-label="Suggestion">
  <Icon name="cut" size={15}/>
  <span>{suggestion.label}</span>
  <Button size="sm" disabled={busy} onClick={()=>void removeAll()}>{busy&&<Icon name="loading" className="spin"/>}Remove them</Button>
  <Button size="sm" variant="ghost" disabled={busy} onClick={onReview}>Review first</Button>
 </div>;
}
