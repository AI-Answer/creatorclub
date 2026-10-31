import {useCallback,useState} from 'react';
import type {Outline,PlanJobResult,VideoScene,Video} from '../../../shared/club';
import {clubFetch,errorMessage,notifyVideosChanged} from '../api';
import {progressLine} from '../jobs';
import {useJobRun} from '../useJobRun';
import {useToast} from '../ui';

/** Undo and Use it for the outline job's results: the token names the set-aside version. */
const outlineVersion=(id:string,action:'undo'|'use',token:string)=>clubFetch(`/videos/${encodeURIComponent(id)}/outline/${action}`,{body:{token}});

/**
 * "Draft scenes from board": runs the real outline job from the Board's tiles and streams its progress. Drafting over scenes that exist asks first.
 * A finished draft that replaced scenes offers Undo; a held result (the outline changed while it ran) is offered as "Use it" and not written.
 */
export function useDraft({video,tiles,scenes,onDrafted}:{video:Video;tiles:number;scenes:readonly VideoScene[]|undefined;onDrafted():void}){
 const toast=useToast();
 const job=useJobRun();
 const [confirm,setConfirm]=useState(false);
 const id=video.id;
 const finish=useCallback((raw:unknown)=>{
  const result=raw as PlanJobResult<Outline>;
  notifyVideosChanged();
  const count=result.value?.scenes.length??0;
  if(result.held){
   toast('New scenes ready',{action:{label:'Use it',fn:()=>void outlineVersion(id,'use',result.held!).catch(reason=>toast(errorMessage(reason,"Couldn't use that version.")))}});
   return;
  }
  const replaced=result.replaced;
  toast(`Drafted ${count} ${count===1?'scene':'scenes'} from ${tiles} ${tiles===1?'tile':'tiles'}`,replaced?{undo:()=>void outlineVersion(id,'undo',replaced).catch(reason=>toast(errorMessage(reason,"Couldn't undo that.")))}:{});
  onDrafted();
 },[id,tiles,toast,onDrafted]);
 const start=useCallback(()=>{
  setConfirm(false);
  void job.run(()=>clubFetch(`/videos/${encodeURIComponent(id)}/outline`,{method:'POST'}),finish);
 },[id,job.run,finish]);
 const request=useCallback(()=>{if(scenes?.length)setConfirm(true);else start();},[scenes,start]);
 const line=job.state.phase==='running'?job.state.line??`Reading ${tiles} ${tiles===1?'tile':'tiles'}…`:undefined;
 return {running:job.state.phase==='running',line,failed:job.state.phase==='failed'?job.state.message:undefined,confirm,setConfirm,start,request,progressLine};
}
