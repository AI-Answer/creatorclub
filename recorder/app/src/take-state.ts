import type {Clip,Project,RecordedTake} from '../shared/types';
export type TakeState='saved'|'active'|'partial'|'archived';
export const takeClips=(p:Pick<Project,'clips'>,take:RecordedTake)=>p.clips.filter(clip=>clip.recordingTakeId===take.id||take.clipIds?.includes(clip.id));
export function takeState(p:Pick<Project,'clips'|'media'>,take:RecordedTake):TakeState{
 const clips=takeClips(p,take);if(!clips.length)return take.confirmedAt||take.retained?'archived':'saved';
 const role=(clip:Clip)=>clip.track==='audio'?`audio:${clip.audioRole??p.media.find(media=>media.id===clip.mediaId)?.audioRole??'unknown'}`:clip.track;
 const active=new Set(clips.map(role)),expected=new Set(take.timeline?.clips.map(role)??[]);
 return [...expected].some(value=>!active.has(value))?'partial':'active';
}
export const takeOnTimeline=(p:Pick<Project,'clips'|'media'>,take:RecordedTake)=>['active','partial'].includes(takeState(p,take));
