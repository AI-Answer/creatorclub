import type {Clip,Project} from '../shared/types';
import {canCombineTake,combineTakeSources,isLinked,linkBackToTake,snapBackToTake,splitTakeSources,takeLinkMembers,takeSyncOffset,unlinkClips,type TakeSnapResult} from './timeline-edit';

export interface TakePackageAction {label:string;run:(p:Project)=>TakeSnapResult}
/** Shared by the inspector, Edit menu and timeline context menu. Each command is one change. */
export function takePackageActions(p:Project,id:string):TakePackageAction[]{
 const c=p.clips.find(c=>c.id===id);if(!c)return [];
 const members=takeLinkMembers(p,id),actions:TakePackageAction[]=[];
 if(canCombineTake(p,id)){
  if(members.some(c=>c.split))actions.push({label:'Combine into one block',run:d=>({ok:combineTakeSources(d,id),message:'Sources combined into one block.'})});
  else actions.push({label:'Split audio and video',run:d=>({ok:splitTakeSources(d,id),message:'Sources split. They still move and trim together.'})});
 }
 if(c.recordingTakeId&&p.clips.some(o=>o.id!==id&&o.recordingTakeId===c.recordingTakeId)){
  if(!isLinked(p.clips,id))actions.push({label:'Link back to its take',run:d=>{const ok=linkBackToTake(d,id);return {ok,message:ok?'Linked back to its take.':'No overlapping take sources are in sync. Snap it back first.'};}});
  if(p.clips.some(o=>o.recordingTakeId===c.recordingTakeId&&!members.some(m=>m.id===o.id)))actions.push({label:'Snap back in sync',run:d=>snapBackToTake(d,id)});
 }
 return actions;
}
export const takeSourceName=(p:Project,c:Clip)=>c.track==='audio'?(c.audioRole??p.media.find(m=>m.id===c.mediaId)?.audioRole)==='system'?'System audio':'Mic':c.track==='camera'?'Camera':c.track==='screen'?'Screen':c.name;
export function takeSourceState(p:Project,c:Clip){const offset=takeSyncOffset(p,c.id);return offset!==undefined&&Math.abs(offset)>.001?'out of sync':!isLinked(p.clips,c.id)?'unlinked':c.split?'split, linked':'linked';}
export function unlinkTakeAction(id:string):TakePackageAction{return {label:'Unlink',run:p=>({ok:unlinkClips(p,[id])>0,message:'Unlinked. Move or trim them separately.'})};}
