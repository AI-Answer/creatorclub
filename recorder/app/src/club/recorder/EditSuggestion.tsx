import {useEffect,useRef,useState} from 'react';
import {LoaderCircle,Scissors} from 'lucide-react';
import type {AutomationJob,AutomationMutation,QuickActionRequest} from '../../../shared/automation';
import type {Project} from '../../../shared/types';
import {api} from '../../api';
import {Button} from '../ui';
import {cutSuggestion} from './edit-steps';

export const REMOVE_FAILED="Couldn't remove the pauses.";

/**
 * The Edit step's one suggestion. On the first open of a video's edit, SceneForge's Remove pauses plan runs in the background
 * (local audio and word timings only, no Claude pass). When it is ready the card asks "Remove 3m 12s of pauses and repeats?":
 * `Remove them` applies every proposed cut as one saved change; `Review first` opens SceneForge's review dialog.
 * The card stays quiet while the plan runs, and disappears once the cuts are applied or nothing is worth cutting.
 */
export function EditSuggestion({project,jobs,merge,reload,flush,onReview}:{project:Project;jobs:AutomationJob[];merge(job:AutomationJob):void;reload():Promise<void>;flush():Promise<Project|undefined>;onReview():void}){
 const suggestion=cutSuggestion(jobs);
 const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const started=useRef('');
 const hasClips=project.clips.length>0;

 const plan=async()=>{
  const fresh=await flush();
  if(!fresh||fresh.id!==project.id)return;
  merge(await api<AutomationJob>(`/projects/${project.id}/quick-action`,{kind:'auto-cut',semantic:false} satisfies QuickActionRequest));
 };

 // First open: ask the server for this project's earlier plans, and start one only when there has never been one.
 useEffect(()=>{
  if(!hasClips||started.current===project.id)return;
  started.current=project.id;
  const request=new AbortController();
  void api<{jobs:AutomationJob[]}>(`/projects/${project.id}/automation`,undefined,undefined,request.signal)
   .then(({jobs:saved})=>{for(const job of saved)merge(job);if(!saved.some(j=>j.kind==='auto-cut'&&!j.sceneId))return plan();})
   .catch(()=>{});
  return()=>request.abort();
 },[project.id,hasClips]);

 const removeAll=async()=>{
  if(suggestion.state!=='ready')return;
  setBusy(true);setFailed(false);
  try{
   const fresh=await flush();
   if(!fresh||fresh.id!==project.id)throw new Error('project changed');
   const result=await api<AutomationMutation>(`/automation/${suggestion.job.id}/apply`,{changeIds:suggestion.job.proposal!.changes.map(c=>c.id)});
   merge(result.job);await reload();
  }catch{setFailed(true);}
  finally{setBusy(false);}
 };
 // The plan was made for an older version of the timeline, or the apply failed: plan again, then the card asks again.
 const retry=async()=>{setFailed(false);setBusy(true);try{await plan();}catch{setFailed(true);}finally{setBusy(false);}};

 if(failed)return <div className="club-edit-suggestion" role="alert"><span className="text-danger">{REMOVE_FAILED}</span><Button size="sm" onClick={()=>void retry()}>Try again</Button></div>;
 if(suggestion.state==='running')return <div className="club-edit-suggestion is-quiet" role="status"><LoaderCircle aria-hidden className="spin" size={15}/><span>Looking for pauses and repeats…</span></div>;
 if(suggestion.state!=='ready')return null;
 return <div className="club-edit-suggestion" role="group" aria-label="Suggestion">
  <Scissors aria-hidden size={15}/>
  <span>{suggestion.label}</span>
  <Button size="sm" disabled={busy} onClick={()=>void removeAll()}>{busy&&<LoaderCircle aria-hidden className="spin"/>}Remove them</Button>
  <Button size="sm" variant="ghost" disabled={busy} onClick={onReview}>Review first</Button>
 </div>;
}
