import {narrationClips} from '../shared/caption-timing';
import {clipDuration,type Clip,type Project} from '../shared/types';
import {clipLayerRowId} from '../shared/timeline-layers';
import {linkGroups} from './timeline-edit';
import {hasWaveform} from './timeline-waveform';

export const TAKE_ROW='linked-takes';
export interface TakeClipView {clip:Clip;members:Clip[];row:string;grouped:boolean;sound?:Clip;pictures:Clip[]}
/** Presentation only: preserve source clips and edit IDs. Explicit layers, offset edges and unlinked sources remain exposed. */
export function takeClipViews(p:Project):TakeClipView[]{
 const narration=new Map(narrationClips(p).map((c,i)=>[c.id,i])),media=new Map(p.media.map(m=>[m.id,m])),links=linkGroups(p.clips),groups=new Map<string,Clip[]>();
 for(const c of p.clips){const key=links.get(c.id)!;groups.set(key,[...groups.get(key)??[],c]);}
 const out:TakeClipView[]=[];
 for(const members of groups.values()){
  const first=members[0],grouped=members.length>1&&new Set(members.map(c=>c.track)).size===members.length&&members.every(c=>
   ['screen','camera','audio'].includes(c.track)&&clipLayerRowId(c,p)===`role:${c.track}`&&Math.abs(c.start-first.start)<1e-6&&Math.abs(clipDuration(c)-clipDuration(first))<1e-6);
  for(const parts of grouped?[members]:members.map(c=>[c])){
   const sounds=parts.filter(c=>{const m=media.get(c.mediaId);return (!grouped||narration.has(c.id))&&m&&hasWaveform(m);}).sort((a,b)=>(narration.get(a.id)??Infinity)-(narration.get(b.id)??Infinity));
   const clip=sounds[0]??parts.find(c=>c.track==='screen')??parts[0];
   const pictures=parts.filter(c=>media.get(c.mediaId)?.kind==='video').sort((a,b)=>Number(b.track==='screen')-Number(a.track==='screen')).slice(0,2);
   out.push({clip,members:parts,row:grouped?TAKE_ROW:clipLayerRowId(clip,p),grouped,sound:sounds[0],pictures});
  }
 }
 return out;
}
