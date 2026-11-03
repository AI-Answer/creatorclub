import {clipDuration,clipEffectTiming,makeId,projectDuration,type Clip,type CursorPoint,type Project} from './types';
import {clipLayerRowId} from './timeline-layers';
const EPS=1e-7;
/** The timed items a cut can remove or shorten beyond the time itself: zooms, text (the Elements row), motion graphics and captions. */
export type LossKind='zooms'|'texts'|'graphics'|'captions';
export type CutLoss=Record<'removed'|'shortened',Record<LossKind,number>>;
const LOSS_KINDS:LossKind[]=['zooms','texts','graphics','captions'];
const LOSS_NAMES:Record<LossKind,[string,string]>={zooms:['zoom','zooms'],texts:['text','texts'],graphics:['graphic','graphics'],captions:['caption','captions']};
const counts=():Record<LossKind,number>=>({zooms:0,texts:0,graphics:0,captions:0});
export const noCutLoss=():CutLoss=>({removed:counts(),shortened:counts()});
/** Adds the counts of `b` into `a` and returns `a`. */
export function addCutLoss(a:CutLoss,b:CutLoss):CutLoss{for(const side of ['removed','shortened'] as const)for(const k of LOSS_KINDS)a[side][k]+=b[side][k];return a;}
/** What a cut takes beyond its time, in one clause for a card, e.g. "also removes 1 zoom, and shortens 1 graphic"; empty when nothing else goes. */
export function cutLossText(loss:CutLoss):string{
 const names=(n:Record<LossKind,number>,kinds:LossKind[])=>kinds.filter(k=>n[k]>0).map(k=>`${n[k]} ${LOSS_NAMES[k][n[k]===1?0:1]}`);
 const list=(items:string[])=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;
 // A caption a cut only trims follows the speech the cut already names, so it is not named; a caption it removes is.
 const removed=names(loss.removed,LOSS_KINDS),shortened=names(loss.shortened,LOSS_KINDS.filter(k=>k!=='captions'));
 const clauses=[removed.length?`removes ${list(removed)}`:'',shortened.length?`shortens ${list(shortened)}`:''].filter(Boolean);
 return clauses.length?`also ${clauses.join(', and ')}`:'';
}
/** Remove one time interval on every track while retaining source/effect origins. `source` is a plain view of `p` to read from (drafts are slow to scan).
 * With a plain `source`, the rebuilt clips, captions and timed items share nested objects (transform, effects, …) with the previous state:
 * later in the same edit, replace those nested objects rather than mutating them. */
export function cutTimelineRange(p:Project,from:number,to:number,ripple=true,source:Project=p):CutLoss{
 const loss=noCutLoss();
 const start=Math.max(0,from),end=Math.min(projectDuration(source),to),length=end-start;
 if(!Number.isFinite(start)||!Number.isFinite(end)||length<=EPS)return loss;
 const map=(time:number)=>!ripple?time:time<=start?time:time>=end?time-length:start;
 const parts=(s:number,e:number):Array<[number,number]>=>e<=start+EPS||s>=end-EPS?[[s,e]]:[...(s<start-EPS?[[s,start] as [number,number]]:[]),...(e>end+EPS?[[end,e] as [number,number]]:[])];
 // A cut that lands within a frame of a clip's edge (or would leave a piece under 0.05 s) cuts at the edge: no sliver is left.
 const sliver=minimumPiece(source);
 // A linked take that the cut runs through becomes two slices: what lies after the cut gets a fresh linkId (one per take), what lies before keeps its own.
 const before=new Set<string>(),after=new Set<string>();for(const c of source.clips)if(c.linkId!==undefined){if(c.start<start-EPS)before.add(c.linkId);if(c.start+clipDuration(c)>end+EPS)after.add(c.linkId);}
 const fresh=new Map<string,string>(),later=(id:string|undefined)=>{if(id===undefined||!before.has(id)||!after.has(id))return id;if(!fresh.has(id))fresh.set(id,makeId());return fresh.get(id);};
 p.clips=source.clips.flatMap(c=>{const stop=c.start+clipDuration(c),affected=c.start<end-EPS&&stop>start+EPS,ranges=affected?parts(c.start,stop).filter(([s,e])=>e-s>=sliver-EPS):parts(c.start,stop),origin=clipEffectTiming(c);
  return ranges.map(([s,e],i)=>({...c,...(s>=end-EPS&&c.linkId!==undefined?{linkId:later(c.linkId)}:{}),id:i===0?c.id:makeId(),start:map(s),sourceIn:c.sourceIn+(s-c.start)*c.speed,sourceOut:c.sourceIn+(e-c.start)*c.speed,...(affected?{effectTiming:{sourceIn:origin.sourceIn,sourceOut:origin.sourceOut}}:{})}));
 });
 p.captions=source.captions.flatMap(c=>{
  if(c.words?.length){const words=c.words.filter(w=>w.end<=start+EPS||w.start>=end-EPS).map(w=>({...w,start:map(w.start),end:map(w.end)}));if(!words.length){loss.removed.captions++;return[];}
   if(words.length<c.words.length)loss.shortened.captions++;
   return[{...c,text:words.map(w=>w.text).join(' '),start:Math.min(map(c.start),words[0].start),end:Math.max(map(c.end),words.at(-1)!.end),words}];
  }
  // A caption without word timings keeps its text once. A ripple joins it across the cut; a leave-gap cut keeps its longest surviving piece.
  if(ripple){const s=map(c.start),e=map(c.end);if(e-s<=EPS){loss.removed.captions++;return[];}if(e-s<c.end-c.start-EPS)loss.shortened.captions++;return[{...c,start:s,end:e}];}
  const pieces=parts(c.start,c.end);if(!pieces.length){loss.removed.captions++;return[];}
  const [s,e]=pieces.reduce((a,b)=>b[1]-b[0]>a[1]-a[0]?b:a);if(e-s<c.end-c.start-EPS)loss.shortened.captions++;
  return[{...c,start:map(s),end:map(e)}];
 });
 // A spanning title/scene/effect stays continuous across a ripple join. With
 // leave-gap deletion, split timed graphics into their surviving pieces.
 const timed=<T extends {id:string;start:number;duration:number}>(items:T[],kind?:LossKind,keepEmpty=false):T[]=>items.flatMap(item=>{
  const finish=item.start+item.duration,lost=(kept:number)=>{if(!kind)return;if(kept<=EPS)loss.removed[kind]++;else if(kept<item.duration-EPS)loss.shortened[kind]++;};
  if(ripple){const duration=Math.max(0,map(finish)-map(item.start));lost(duration);return duration>EPS||keepEmpty?[{...item,start:map(item.start),duration}]:[];}
  const pieces=parts(item.start,finish).map(([s,e],i)=>({...item,id:i===0?item.id:makeId(),start:s,duration:e-s}));lost(pieces.reduce((sum,piece)=>sum+piece.duration,0));return pieces;
 });
 p.scenes=timed(source.scenes,undefined,true);p.elements=timed(source.elements,'texts');p.zooms=timed(source.zooms,'zooms');if(source.motion)p.motion=timed(source.motion,'graphics');
 const points=[...source.cursor.points].sort((a,b)=>a.time-b.time);
 const pointAt=(time:number):CursorPoint|undefined=>{let index=-1;for(let i=0;i<points.length&&points[i].time<=time;i++)index=i;if(index<0)return undefined;const a=points[index],b=points[index+1];if(!b||a.visible===false||b.visible===false)return {...a,time};const t=(time-a.time)/(b.time-a.time);return {...a,time,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};};
 const left=pointAt(start),right=pointAt(end);p.cursor.points=points.filter(pt=>pt.time<start-EPS||pt.time>=end-EPS).map(pt=>({...pt,time:map(pt.time)}));
 if(ripple&&projectDuration(p)>0){if(left&&start>EPS)p.cursor.points.push({...left,time:Math.max(0,start-1e-6)});if(right)p.cursor.points.push({...right,time:start});p.cursor.points.sort((a,b)=>a.time-b.time);}
 return loss;
}
/** The shortest piece a cut or split leaves: one frame, and never under 0.05 s. */
export const minimumPiece=(p:Pick<Project,'canvas'>)=>Math.max(.05,1/Math.max(1,p.canvas?.fps||30));
/**
 * A link group (clips sharing a `linkId`) holds at most one clip per row: one slice of a take, its screen, camera and audio.
 * A cut copies the `linkId` onto both pieces of a clip; this gives every later slice its own id. In time order, a clip whose row
 * is already in the current slice starts the next slice. Groups that already hold one clip per row are left alone.
 */
export function relinkSlices(p:Project,newId:()=>string=makeId){
 const groups=new Map<string,Clip[]>();for(const c of p.clips)if(c.linkId!==undefined){const list=groups.get(c.linkId)??[];list.push(c);groups.set(c.linkId,list);}
 for(const list of groups.values()){
  const rows=list.map(c=>clipLayerRowId(c,p));if(new Set(rows).size===rows.length)continue;
  const sorted=list.map((c,i)=>({c,row:rows[i]})).sort((a,b)=>a.c.start-b.c.start||a.row.localeCompare(b.row));let slice=new Set<string>(),id=list[0].linkId;
  for(const {c,row} of sorted){if(slice.has(row)){slice=new Set();id=newId();}slice.add(row);c.linkId=id;}
 }
}
