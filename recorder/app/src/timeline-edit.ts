import {clipDuration,clipEffectTiming,makeId,narrationPriority,type Clip,type Media,type Project,type TrackKind} from '../shared/types';
import {cutTimelineRange} from '../shared/timeline-edits';
import {clipLayerRowId} from '../shared/timeline-layers';
import {plainClone,plainView} from './project-draft';

/**
 * Timeline editing rules of CreatorClub's embedded editor, as pure functions over a project (or a draft of one):
 * linked clips per take, no overlaps on a row (slide to a gap, or insert and shift the row), delete that closes the gap on every track,
 * ripple trims, markers, zoom anchored at the playhead, ruler ticks and filmstrip tiles.
 */
const EPS=1e-3;
const end=(c:Clip)=>c.start+clipDuration(c);
/** Rows whose emptiness makes a gap. Music runs under everything, so it never keeps a gap open. */
const gapTracks:ReadonlySet<TrackKind>=new Set(['screen','camera','audio','overlay']);

/* ---------- Linked clips ---------- */

/** Whether the clips form one connected run in time (each one overlaps the run before it). */
function connected(clips:readonly Clip[]){const sorted=[...clips].sort((a,b)=>a.start-b.start);let reach=-Infinity;return sorted.every((c,i)=>{const ok=i===0||c.start<reach-EPS;reach=Math.max(reach,end(c));return ok;});}
/**
 * The link group of every clip. Clips that share an explicit `linkId`, or (when they were never linked explicitly) a recorded take, are linked
 * only while they overlap in time: each connected run is its own group. So the pieces that a cut, a split or a transcript delete leaves
 * (which keep their `linkId`) never stay linked across the gap between them. Unlinked clips are alone.
 */
export function linkGroups(clips:readonly Clip[]):Map<string,string>{
 const groups=new Map<string,string>(),buckets=new Map<string,Clip[]>();
 for(const c of clips){
  const base=c.linkId!==undefined?'link:'+c.linkId:c.recordingTakeId?'take:'+c.recordingTakeId:'';
  if(!base){groups.set(c.id,'clip:'+c.id);continue;}const list=buckets.get(base)??[];list.push(c);buckets.set(base,list);
 }
 for(const [base,list] of buckets){
  const sorted=[...list].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));let key='',reach=-Infinity;
  for(const c of sorted){if(c.start>=reach-EPS){key=`${base}:${c.id}`;reach=end(c);}else reach=Math.max(reach,end(c));groups.set(c.id,key);}
 }
 return groups;
}
/** The ids plus every clip linked to one of them. Ids that are not clips (elements, captions, zooms, markers) pass through. */
export function linkedIds(clips:readonly Clip[],ids:Iterable<string>):Set<string>{
 const groups=linkGroups(clips),wanted=new Set<string>(),out=new Set(ids);
 for(const id of out){const key=groups.get(id);if(key)wanted.add(key);}
 for(const c of clips)if(wanted.has(groups.get(c.id)!))out.add(c.id);
 return out;
}
export function isLinked(clips:readonly Clip[],id:string){const groups=linkGroups(clips),key=groups.get(id);let n=0;for(const value of groups.values())if(value===key&&++n>1)return true;return false;}
/** Writes the implicit take links as explicit ones, so later splits and moves cannot merge or separate groups by accident. */
export function ensureLinks(p:Project,newId:()=>string=makeId){
 const groups=linkGroups(p.clips),sizes=new Map<string,number>(),ids=new Map<string,string>();
 for(const key of groups.values())sizes.set(key,(sizes.get(key)??0)+1);
 for(const c of p.clips){const key=groups.get(c.id)!;if(c.linkId!==undefined||!key.startsWith('take:')||sizes.get(key)!<2)continue;if(!ids.has(key))ids.set(key,newId());c.linkId=ids.get(key);}
}
/** Each clip of the groups becomes its own group. */
export function unlinkClips(p:Project,ids:Iterable<string>,newId:()=>string=makeId){
 const all=linkedIds(p.clips,ids);let n=0;for(const c of p.clips)if(all.has(c.id)){c.linkId=newId();n++;}return n;
}
/** Links the chosen clips (at least two, lined up so they overlap in time) into one group. */
export function linkClips(p:Project,ids:Iterable<string>,newId:()=>string=makeId){
 const chosen=new Set(ids),clips=p.clips.filter(c=>chosen.has(c.id));if(clips.length<2||!connected(clips))return false;const id=newId();for(const c of clips)c.linkId=id;return true;
}

/* ---------- Split ---------- */

/** Splits at `time`: the selected clips and their linked clips, or only `onlyId`'s group, or every clip under the playhead when the selection does not cross it. Right-hand pieces form new link groups. */
export function splitLinked(p:Project,time:number,selection:ReadonlySet<string>,onlyId?:string,newId:()=>string=makeId){
 ensureLinks(p,newId);
 const crosses=(c:Clip)=>c.start+EPS<time&&end(c)-EPS>time;
 const scope=onlyId?linkedIds(p.clips,[onlyId]):linkedIds(p.clips,selection);
 const chosen=p.clips.filter(c=>crosses(c)&&scope.has(c.id)),targets=chosen.length||onlyId?chosen:p.clips.filter(crosses);
 const groups=new Map<string,string>();
 for(const c of targets){
  const cut=c.sourceIn+(time-c.start)*c.speed,origin=clipEffectTiming(c);c.effectTiming={sourceIn:origin.sourceIn,sourceOut:origin.sourceOut};
  const right={...plainClone(plainView(c)),id:newId(),start:time,sourceIn:cut};
  if(c.linkId!==undefined){if(!groups.has(c.linkId))groups.set(c.linkId,newId());right.linkId=groups.get(c.linkId);}
  p.clips.push(right);c.sourceOut=cut;
 }
 return targets.length;
}

/* ---------- Delete ---------- */

/** Merged time ranges covered by `ranges`. */
export function mergeRanges(ranges:ReadonlyArray<readonly [number,number]>):Array<[number,number]>{
 const out:Array<[number,number]>=[];for(const [a,b] of [...ranges].filter(([a,b])=>b-a>EPS).sort((x,y)=>x[0]-y[0])){const last=out.at(-1);if(last&&a<=last[1]+EPS)last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;
}
/** The parts of `range` no clip on a gap row covers. */
export function uncovered(range:readonly [number,number],clips:readonly Clip[]):Array<[number,number]>{
 const busy=mergeRanges(clips.filter(c=>gapTracks.has(c.track)).map(c=>[c.start,end(c)] as [number,number]));let [a]=range;const b=range[1],out:Array<[number,number]>=[];
 for(const [s,e] of busy){if(e<=a+EPS)continue;if(s>=b-EPS)break;if(s>a+EPS)out.push([a,Math.min(s,b)]);a=Math.max(a,e);if(a>=b-EPS)break;}
 if(b-a>EPS)out.push([a,b]);return out;
}
/** Deletes clips (with their linked clips), elements, captions, zooms and markers. With `ripple` the time the deleted clips leave empty on every row is removed from the whole timeline: later clips, captions, graphics, zooms, scenes and markers move up. */
export function deleteItems(p:Project,ids:Iterable<string>,ripple:boolean){
 const all=linkedIds(p.clips,ids),removed=p.clips.filter(c=>all.has(c.id)).map(c=>[c.start,end(c)] as [number,number]);
 p.clips=p.clips.filter(c=>!all.has(c.id));p.elements=p.elements.filter(e=>!all.has(e.id));p.captions=p.captions.filter(c=>!all.has(c.id));p.zooms=p.zooms.filter(z=>!all.has(z.id));
 if(p.markers)p.markers=p.markers.filter(m=>!all.has(m.id));
 if(!ripple)return [] as Array<[number,number]>;
 const gaps=mergeRanges(removed).flatMap(range=>uncovered(range,plainView(p).clips)).sort((x,y)=>y[0]-x[0]);
 for(const [a,b] of gaps)closeRange(p,a,b);
 return gaps;
}
/** Removes [a, b) from every track and moves everything after it up, markers included. */
export function closeRange(p:Project,a:number,b:number){
 cutTimelineRange(p,a,b,true,plainView(p));
 if(p.markers)for(const m of p.markers){if(m.time>=b)m.time-=b-a;else if(m.time>a)m.time=a;}
}
/** Every stretch before the last clip where no screen, camera, audio or overlay clip plays. */
export function timelineGaps(clips:readonly Clip[]):Array<[number,number]>{
 const last=Math.max(0,...clips.filter(c=>gapTracks.has(c.track)).map(end));return uncovered([0,last],clips);
}

/** Opens `length` seconds at `at` on every track: everything that starts there or later moves later. */
export function openRange(p:Project,at:number,length:number){
 if(!(length>0))return;const later=(t:number)=>t>=at-EPS;
 for(const c of p.clips)if(later(c.start))c.start+=length;
 for(const e of p.elements)if(later(e.start))e.start+=length;
 for(const z of p.zooms)if(later(z.start))z.start+=length;
 for(const c of p.captions)if(later(c.start)){c.start+=length;c.end+=length;if(c.words)c.words=c.words.map(w=>({...w,start:w.start+length,end:w.end+length}));}
 for(const s of p.scenes)if(later(s.start)&&s.start>0)s.start+=length;
 for(const m of p.markers??[])if(later(m.time))m.time+=length;
}
/** Opens `length` seconds at `at` for an insert: clips on `rows` (all rows when omitted) that run across `at` are cut there first, so what is inserted overlaps nothing. */
export function insertGap(p:Project,at:number,length:number,rows?:ReadonlySet<string>,newId:()=>string=makeId){
 for(const c of [...p.clips]){
  if(!(c.start+EPS<at&&end(c)-EPS>at)||rows&&!rows.has(clipLayerRowId(c,p)))continue;
  const cut=c.sourceIn+(at-c.start)*c.speed,origin=clipEffectTiming(c);c.effectTiming={sourceIn:origin.sourceIn,sourceOut:origin.sourceOut};
  p.clips.push({...plainClone(plainView(c)),id:newId(),start:at,sourceIn:cut});c.sourceOut=cut;
 }
 openRange(p,at,length);
}
/** Each recorded scene spans its takes' clips on the timeline (screen, camera, audio, overlay), so scene tags, chips and later ripples follow moves and trims. */
export function syncScenesToTakes(p:Project){
 const sceneOf=new Map((p.recordedTakes??[]).map(t=>[t.id,t.sceneId])),extent=new Map<string,[number,number]>();
 for(const c of p.clips){const scene=c.recordingTakeId?sceneOf.get(c.recordingTakeId):undefined;if(!scene||!gapTracks.has(c.track))continue;const e=extent.get(scene);extent.set(scene,e?[Math.min(e[0],c.start),Math.max(e[1],end(c))]:[c.start,end(c)]);}
 for(const s of p.scenes){const e=extent.get(s.id);if(e&&(Math.abs(s.start-e[0])>1e-9||Math.abs(s.duration-(e[1]-e[0]))>1e-9)){s.start=e[0];s.duration=e[1]-e[0];}}
}
/** True when two items on one row overlap. */
export function rowsOverlap(items:readonly RowItem[]){
 const rows=new Map<string,RowItem[]>();for(const i of items){const list=rows.get(i.row)??[];list.push(i);rows.set(i.row,list);}
 for(const list of rows.values()){const sorted=[...list].sort((a,b)=>a.start-b.start);for(let i=1;i<sorted.length;i++)if(sorted[i].start<sorted[i-1].start+sorted[i-1].duration-EPS)return true;}
 return false;
}
/** Pasted or duplicated clips get link groups of their own, keeping which of them belong together. */
export function remapLinks(p:Project,ids:ReadonlySet<string>,newId:()=>string=makeId){
 const map=new Map<string,string>();for(const c of p.clips)if(ids.has(c.id)&&c.linkId!==undefined){if(!map.has(c.linkId))map.set(c.linkId,newId());c.linkId=map.get(c.linkId);}
}

/* ---------- Moves without overlaps ---------- */

/** One timeline item for row checks: a clip on its layer row, or an element, caption or zoom on its own row. */
export interface RowItem {id:string;row:string;start:number;duration:number}
export function rowItems(p:Project):RowItem[]{
 return [...p.clips.map(c=>({id:c.id,row:clipLayerRowId(c,p),start:c.start,duration:clipDuration(c)})),...p.elements.map(e=>({id:e.id,row:'elements',start:e.start,duration:e.duration})),
  ...p.captions.map(c=>({id:c.id,row:'captions',start:c.start,duration:c.end-c.start})),...p.zooms.map(z=>({id:z.id,row:'zooms',start:z.start,duration:z.duration}))];
}
/** True when the moving items, shifted by `delta`, start before zero or overlap a still item on their row. */
export function collides(moving:readonly RowItem[],delta:number,others:readonly RowItem[]){
 const ids=new Set(moving.map(m=>m.id)),still=others.filter(o=>!ids.has(o.id));
 return moving.some(m=>m.start+delta<-1e-6||still.some(o=>o.row===m.row&&m.start+delta<o.start+o.duration-EPS&&m.start+delta+m.duration>o.start+EPS));
}
/** The allowed delta nearest to `want`: `want` itself when it fits, otherwise the nearest position that lines up against a neighbour. */
export function freeDelta(moving:readonly RowItem[],want:number,others:readonly RowItem[]){
 if(!collides(moving,want,others))return want;
 const ids=new Set(moving.map(m=>m.id)),rows=new Set(moving.map(m=>m.row)),candidates=[-Math.min(...moving.map(m=>m.start))];
 for(const m of moving)for(const o of others)if(!ids.has(o.id)&&rows.has(o.row)&&o.row===m.row)candidates.push(o.start+o.duration-m.start,o.start-m.start-m.duration);
 candidates.sort((a,b)=>Math.abs(a-want)-Math.abs(b-want));
 for(const d of candidates)if(!collides(moving,d,others))return d||0;
 return 0;
}
/** Dropping clips onto others on their rows inserts them there: the rows close the hole they left and open room at the insertion point. Returns the new start of every clip that moves on those rows. */
export interface InsertPlan {at:number;from:number;length:number;starts:Map<string,number>}
export function insertPlan(moving:readonly RowItem[],pointer:number,others:readonly RowItem[]):InsertPlan|null{
 if(!moving.length)return null;
 const ids=new Set(moving.map(m=>m.id)),rows=new Set(moving.map(m=>m.row)),from=Math.min(...moving.map(m=>m.start)),length=Math.max(...moving.map(m=>m.start+m.duration))-from;
 const rest=others.filter(o=>!ids.has(o.id)&&rows.has(o.row)).map(o=>({o,s:o.start>=from+length-EPS?o.start-length:o.start})).sort((a,b)=>a.s-b.s);
 let t=pointer;if(t>=from&&t<=from+length)t=from;else if(t>from+length)t-=length;
 const hit=rest.find(r=>t>=r.s&&t<r.s+r.o.duration),last=rest.length?Math.max(...rest.map(r=>r.s+r.o.duration)):0;
 const at=hit?(t>hit.s+hit.o.duration/2?hit.s+hit.o.duration:hit.s):Math.min(Math.max(0,t),last);
 const starts=new Map<string,number>();
 for(const r of rest){const next=r.s>=at-EPS?r.s+length:r.s;if(Math.abs(next-r.o.start)>1e-9)starts.set(r.o.id,next);}
 for(const m of moving)starts.set(m.id,at+(m.start-from));
 return {at,from,length,starts};
}
/** Where a move of clips by `want` ends up: in place, slid to the nearest gap, or inserted. */
export function planClipMove(p:Project,ids:ReadonlySet<string>,want:number,pointer:number):{kind:'move'|'slide'|'insert'|'none';starts:Map<string,number>;delta:number;at?:number}{
 const items=rowItems(p),moving=items.filter(i=>ids.has(i.id));if(!moving.length)return {kind:'none',starts:new Map(),delta:0};
 const clipsOnly=moving.every(m=>p.clips.some(c=>c.id===m.id));
 if(!collides(moving,want,items))return {kind:Math.abs(want)<1e-9?'none':'move',starts:new Map(moving.map(m=>[m.id,m.start+want])),delta:want};
 if(clipsOnly){const plan=insertPlan(moving,pointer,items);
  // Rows of a linked group can have different boundaries: an insert that would still overlap somewhere falls back to sliding into a gap.
  if(plan&&!rowsOverlap(items.map(i=>plan.starts.has(i.id)?{...i,start:plan.starts.get(i.id)!}:i))){if(Math.abs(plan.at-plan.from)<EPS)return {kind:'none',starts:new Map(),delta:0,at:plan.at};return {kind:'insert',starts:plan.starts,delta:plan.at-plan.from,at:plan.at};}}
 const delta=freeDelta(moving,want,items);
 return {kind:Math.abs(delta)<1e-9?'none':'slide',starts:new Map(moving.map(m=>[m.id,m.start+delta])),delta};
}
/** Applies new clip starts; a caption that sits inside the clip carrying the narration moves with that clip, so the transcript follows the speech. */
export function applyClipStarts(p:Project,starts:ReadonlyMap<string,number>,media:ReadonlyMap<string,Media>=new Map(p.media.map(m=>[m.id,m]))){
 const before=plainView(p).clips,voice=(t:number)=>before.filter(c=>c.start<=t&&end(c)>t&&c.track!=='music'&&!c.muted).sort((a,b)=>narrationPriority(a,media.get(a.mediaId))-narrationPriority(b,media.get(b.mediaId)))[0];
 const shifts=new Map<string,number>();
 for(const cap of plainView(p).captions){const owner=voice((cap.start+cap.end)/2);if(!owner||!starts.has(owner.id)||cap.start<owner.start-EPS||cap.end>end(owner)+EPS)continue;const d=starts.get(owner.id)!-owner.start;if(Math.abs(d)>1e-9)shifts.set(cap.id,d);}
 for(const c of p.clips){const next=starts.get(c.id);if(next!==undefined)c.start=Math.max(0,next);}
 for(const cap of p.captions){const d=shifts.get(cap.id);if(d===undefined)continue;cap.start+=d;cap.end+=d;if(cap.words)cap.words=cap.words.map(w=>({...w,start:w.start+d,end:w.end+d}));}
}
/** Moves elements, captions or zooms by one delta (start only; length unchanged). */
export function moveEffects(p:Project,ids:ReadonlySet<string>,delta:number){
 for(const e of p.elements)if(ids.has(e.id))e.start=Math.max(0,e.start+delta);
 for(const z of p.zooms)if(ids.has(z.id))z.start=Math.max(0,z.start+delta);
 for(const c of p.captions)if(ids.has(c.id)){const d=Math.max(-c.start,delta);c.start+=d;c.end+=d;if(c.words)c.words=c.words.map(w=>({...w,start:w.start+d,end:w.end+d}));}
}

/* ---------- Trims ---------- */

/** The delta range a trim of these clips' `side` edge allows: source limits, a tenth of a second minimum, and, without ripple, the neighbours on each clip's row. */
export function trimBounds(p:Project,ids:ReadonlySet<string>,side:'left'|'right',ripple:boolean,media:ReadonlyMap<string,Media>=new Map(p.media.map(m=>[m.id,m]))){
 const clips=p.clips.filter(c=>ids.has(c.id));let min=-Infinity,max=Infinity;
 for(const c of clips){
  const length=clipDuration(c),row=clipLayerRowId(c,p),neighbours=p.clips.filter(o=>!ids.has(o.id)&&clipLayerRowId(o,p)===row);
  if(side==='left'){min=Math.max(min,-c.sourceIn/c.speed);max=Math.min(max,length-.1);if(!ripple)min=Math.max(min,-c.start,...neighbours.filter(o=>end(o)<=c.start+EPS).map(o=>end(o)-c.start));}
  else{min=Math.max(min,.1-length);const source=media.get(c.mediaId)?.duration;max=Math.min(max,source&&source>0?(source-c.sourceOut)/c.speed:3600);if(!ripple)max=Math.min(max,...neighbours.filter(o=>o.start>=end(c)-EPS).map(o=>o.start-end(c)));}
 }
 return {min:Math.min(0,min),max:Math.max(0,max)};
}
/**
 * Trims one edge of linked clips by `delta` (timeline seconds; positive moves the edge later). Without `ripple` the edge moves in place.
 * With `ripple` the time the trim removes is closed on every track, or the time it adds is opened on every track, through the same
 * closeRange/openRange as deletes and inserts: later clips, captions, graphics, zooms, scenes and markers follow, and nothing overlaps.
 * A left ripple trim therefore keeps the clips' start.
 */
export function trimClips(p:Project,ids:ReadonlySet<string>,side:'left'|'right',delta:number,ripple:boolean){
 const clips=p.clips.filter(c=>ids.has(c.id));if(!clips.length||!delta)return;
 if(!ripple){for(const c of clips){if(side==='left'){c.sourceIn+=delta*c.speed;c.start+=delta;}else c.sourceOut+=delta*c.speed;}return;}
 if(side==='right'){
  const edge=Math.max(...clips.map(end));
  if(delta<0){for(const c of clips)c.sourceOut+=delta*c.speed;closeRange(p,edge+delta,edge);}
  else{openRange(p,edge,delta);for(const c of p.clips)if(ids.has(c.id))c.sourceOut+=delta*c.speed;}
  return;
 }
 const edge=Math.min(...clips.map(c=>c.start));
 if(delta>0){for(const c of clips){c.sourceIn+=delta*c.speed;c.start+=delta;}closeRange(p,edge,edge+delta);}
 else{const length=-delta;openRange(p,edge,length);for(const c of p.clips)if(ids.has(c.id)){c.start-=length;c.sourceIn-=length*c.speed;}}
}
/** Resizes an element, caption or zoom edge within [0, neighbours] and keeps at least a tenth of a second. */
export function resizeEffect(p:Project,id:string,side:'left'|'right',delta:number){
 const items=rowItems(p),item=items.find(i=>i.id===id);if(!item)return;
 const others=items.filter(i=>i.row===item.row&&i.id!==id),stop=item.start+item.duration;
 const lo=side==='left'?Math.max(-item.start,...others.filter(o=>o.start+o.duration<=item.start+EPS).map(o=>o.start+o.duration-item.start)):.1-item.duration;
 const hi=side==='left'?item.duration-.1:Math.min(3600,...others.filter(o=>o.start>=stop-EPS).map(o=>o.start-stop));
 const d=Math.max(lo,Math.min(hi,delta)),start=side==='left'?item.start+d:item.start,length=side==='left'?item.duration-d:item.duration+d;
 const e=p.elements.find(x=>x.id===id),z=p.zooms.find(x=>x.id===id),c=p.captions.find(x=>x.id===id);
 if(e){e.start=start;e.duration=length;}if(z){z.start=start;z.duration=length;}if(c){c.start=start;c.end=start+length;}
}

/* ---------- Markers ---------- */

export function addMarker(p:Project,time:number,newId:()=>string=makeId){const id=newId();(p.markers??=[]).push({id,time:Math.max(0,time)});p.markers.sort((a,b)=>a.time-b.time);return id;}
export function moveMarker(p:Project,id:string,time:number){const m=p.markers?.find(x=>x.id===id);if(m)m.time=Math.max(0,time);p.markers?.sort((a,b)=>a.time-b.time);}
export function removeMarker(p:Project,id:string){if(!p.markers)return;p.markers=p.markers.filter(m=>m.id!==id);if(!p.markers.length)delete p.markers;}

/* ---------- Zoom, ruler, filmstrip ---------- */

export const MIN_SCALE=.5,MAX_SCALE=2400;
export const clampScale=(scale:number)=>Math.max(MIN_SCALE,Math.min(MAX_SCALE,Number.isFinite(scale)?scale:55));
/** Pixels per second that show the whole video in the timeline's own width. */
export function fitScale(duration:number,viewport:number){return clampScale((Math.max(0,viewport)-40)/Math.max(5,duration));}
/** The scroll that keeps `anchor` (the playhead) at the same place on screen when the scale changes; an anchor outside the view keeps the view's centre instead. */
export function anchoredScroll({anchor,from,to,scrollLeft,viewport}:{anchor:number;from:number;to:number;scrollLeft:number;viewport:number}){
 const x=anchor*from-scrollLeft,visible=x>=0&&x<=viewport,screen=visible?x:viewport/2,time=visible?anchor:(scrollLeft+viewport/2)/from;
 return Math.max(0,time*to-screen);
}
/** "1:05", or "1:05:12" (frame 12) when the ruler shows frames. */
export function rulerLabel(time:number,fps:number,frames:boolean){
 const t=Math.max(0,time+1e-9),m=Math.floor(t/60),s=Math.floor(t%60),base=`${m}:${String(s).padStart(2,'0')}`;
 return frames?`${base}:${String(Math.floor((t-Math.floor(t))*fps+1e-6)).padStart(2,'0')}`:base;
}
export interface RulerTick {time:number;major:boolean;label?:string}
/** Ticks between `from` and `to`: labelled major ticks at least 70 px apart, minor ticks between; at high zoom the steps are frames. */
export function rulerTicks(from:number,to:number,scale:number,fps=30):RulerTick[]{
 if(!(scale>0)||!(to>from))return [];
 const frame=1/Math.max(1,fps),steps=[...[1,2,5,10,15].filter(n=>n<fps).map(n=>n*frame),1,2,5,10,15,30,60,120,300,600,1800],major=steps.find(s=>s*scale>=70)??3600;
 const frames=major<1,minor=frames?(major<=5*frame+1e-9?frame:major/5):major/(major>=60?6:major===15?3:major===2?4:5);
 const out:RulerTick[]=[],first=Math.floor(from/minor);
 for(let i=first;i*minor<=to+minor&&out.length<2000;i++){const time=i*minor;if(time<0)continue;const ratio=time/major,major_=Math.abs(ratio-Math.round(ratio))<1e-6;out.push({time,major:major_,...(major_?{label:rulerLabel(time,fps,frames)}:{})});}
 return out;
}
/** Thumbnail tiles across a clip: `left` in px from the clip's left edge, `index` into the media's filmstrip sprite of `count` frames. Only tiles in [from, to] (timeline seconds) are returned. */
export function filmstripTiles(c:Pick<Clip,'start'|'sourceIn'|'sourceOut'|'speed'>,mediaDuration:number,count:number,scale:number,tileWidth:number,from:number,to:number){
 const length=Math.max(0,(c.sourceOut-c.sourceIn)/Math.max(.05,c.speed)),out:Array<{left:number;index:number}>=[];
 if(!(mediaDuration>0)||count<1||!(scale>0)||!(tileWidth>0))return out;
 const width=length*scale;for(let left=Math.max(0,Math.floor((from-c.start)*scale/tileWidth)*tileWidth);left<width&&c.start+left/scale<=to&&out.length<400;left+=tileWidth){const time=c.sourceIn+(left+tileWidth/2)/scale*c.speed;out.push({left,index:Math.max(0,Math.min(count-1,Math.floor(time/mediaDuration*count)))});}
 return out;
}
/** How many rows of the timeline are used, so it opens tall enough to show all of them. */
export function timelineHeightFor(rows:readonly number[],chrome=72){return Math.round(chrome+rows.reduce((n,h)=>n+h,0));}
