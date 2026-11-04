import {clipDuration,clipEffectTiming,makeId,narrationPriority,projectDuration,type Clip,type Element,type MarkerTag,type Media,type MotionBlock,type Project,type TrackKind} from '../shared/types';
import {cutTimelineRange,minimumPiece,relinkSlices} from '../shared/timeline-edits';
import {clipLayerRowId} from '../shared/timeline-layers';
import {plainClone,plainView} from './project-draft';
import {MOTION_TEMPLATES} from '../shared/motion/templates';
import {remapClipCaptions,snapshotCaptionTiming} from '../shared/caption-timing';

/** The timeline row of motion blocks: they may overlap clips of other rows, never each other. */
export const MOTION_ROW='motion';

/**
 * Timeline editing rules of Creator Compiler's embedded editor, as pure functions over a project (or a draft of one):
 * linked clips per take, no overlaps on a row (slide to a gap, or insert and shift the row), delete that closes the gap on every track,
 * ripple trims, markers, zoom anchored at the playhead, ruler ticks and filmstrip tiles.
 */
const EPS=1e-3;
const end=(c:Clip)=>c.start+clipDuration(c);
const updateCaptions=(p:Project,captions:Project['captions'])=>{if(JSON.stringify(p.captions)!==JSON.stringify(captions))p.captions=captions;};
/** Rows whose emptiness makes a gap. Music runs under everything, so it never keeps a gap open. */
const gapTracks:ReadonlySet<TrackKind>=new Set(['screen','camera','audio','overlay']);

/* ---------- Linked clips ---------- */

/** Whether the clips form one connected run in time (each one overlaps the run before it). */
function connected(clips:readonly Clip[]){const sorted=[...clips].sort((a,b)=>a.start-b.start);let reach=-Infinity;return sorted.every((c,i)=>{const ok=i===0||c.start<reach-EPS;reach=Math.max(reach,end(c));return ok;});}
/**
 * The link group of every clip. A link group is exactly the set of clips that share one `linkId`; time never regroups them.
 * Every edit that cuts a linked take into pieces gives each slice its own `linkId` (`relinkSlices`, `splitLinked`, `insertGap`, `remapLinks`).
 * Only legacy clips of a recorded take that never got a `linkId` are grouped by time (connected runs that overlap); `ensureLinks` writes ids for them.
 */
export function linkGroups(clips:readonly Clip[]):Map<string,string>{
 const groups=new Map<string,string>(),legacy=new Map<string,Clip[]>();
 for(const c of clips){
  if(c.linkId!==undefined)groups.set(c.id,'link:'+c.linkId);
  else if(c.recordingTakeId){const list=legacy.get(c.recordingTakeId)??[];list.push(c);legacy.set(c.recordingTakeId,list);}
  else groups.set(c.id,'clip:'+c.id);
 }
 for(const [take,list] of legacy){
  const sorted=[...list].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));let key='',reach=-Infinity;
  for(const c of sorted){if(c.start>=reach-EPS){key=`take:${take}:${c.id}`;reach=end(c);}else reach=Math.max(reach,end(c));groups.set(c.id,key);}
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
/** How many things are selected, as a person counts them: a take's linked screen, camera and audio are one clip. */
export function selectionCount(clips:readonly Clip[],ids:Iterable<string>){const groups=linkGroups(clips),seen=new Set<string>();for(const id of ids)seen.add(groups.get(id)??'item:'+id);return seen.size;}
export function isLinked(clips:readonly Clip[],id:string){const groups=linkGroups(clips),key=groups.get(id);let n=0;for(const value of groups.values())if(value===key&&++n>1)return true;return false;}
/** Writes the implicit take links as explicit ones, so later splits and moves cannot merge or separate groups by accident. */
export function ensureLinks(p:Project,newId:()=>string=makeId){
 const groups=linkGroups(p.clips),sizes=new Map<string,number>(),ids=new Map<string,string>();
 for(const key of groups.values())sizes.set(key,(sizes.get(key)??0)+1);
 for(const c of p.clips){const key=groups.get(c.id)!;if(c.linkId!==undefined||!key.startsWith('take:')||sizes.get(key)!<2)continue;if(!ids.has(key))ids.set(key,newId());c.linkId=ids.get(key);}
 relinkSlices(p,newId);
}
/** After a cut at `time` split some link groups (`fresh` maps each split group's id to the id of its later slice), the members of those groups that start at or after `time` join the later slice. */
function laterSlice(p:Project,time:number,fresh:ReadonlyMap<string,string>){for(const c of p.clips)if(c.linkId!==undefined&&fresh.has(c.linkId)&&c.start>=time-EPS)c.linkId=fresh.get(c.linkId);}
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
 const before=snapshotCaptionTiming(plainView(p));
 ensureLinks(p,newId);
 const piece=minimumPiece(p)-1e-9,crosses=(c:Clip)=>time-c.start>=piece&&end(c)-time>=piece;
 const scope=onlyId?linkedIds(p.clips,[onlyId]):linkedIds(p.clips,selection);
 const chosen=p.clips.filter(c=>crosses(c)&&scope.has(c.id)),targets=chosen.length||onlyId?chosen:p.clips.filter(crosses);
 const groups=new Map<string,string>();
 for(const c of targets){
  const cut=c.sourceIn+(time-c.start)*c.speed,origin=clipEffectTiming(c);c.effectTiming={sourceIn:origin.sourceIn,sourceOut:origin.sourceOut};
  const right={...plainClone(plainView(c)),id:newId(),start:time,sourceIn:cut};
  if(c.linkId!==undefined){if(!groups.has(c.linkId))groups.set(c.linkId,newId());right.linkId=groups.get(c.linkId);}
  p.clips.push(right);c.sourceOut=cut;
 }
 laterSlice(p,time,groups);
 if(targets.length)updateCaptions(p,remapClipCaptions(before,plainView(p)));
 return targets.length;
}

/* ---------- Delete ---------- */

/** Merged time ranges covered by `ranges`. */
export function mergeRanges(ranges:ReadonlyArray<readonly [number,number]>):Array<[number,number]>{
 const out:Array<[number,number]>=[];for(const [a,b] of [...ranges].filter(([a,b])=>b-a>EPS).sort((x,y)=>x[0]-y[0])){const last=out.at(-1);if(last&&a<=last[1]+EPS)last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;
}
/** The parts of `range` that no clip on a screen, camera, audio or overlay row covers. */
export function uncovered(range:readonly [number,number],clips:readonly Clip[]):Array<[number,number]>{
 const busy=mergeRanges(clips.filter(c=>gapTracks.has(c.track)).map(c=>[c.start,end(c)] as [number,number]));let [a]=range;const b=range[1],out:Array<[number,number]>=[];
 for(const [s,e] of busy){if(e<=a+EPS)continue;if(s>=b-EPS)break;if(s>a+EPS)out.push([a,Math.min(s,b)]);a=Math.max(a,e);if(a>=b-EPS)break;}
 if(b-a>EPS)out.push([a,b]);return out;
}
/** Deletes clips (with their linked clips), elements, captions, zooms and markers. With `ripple` the time the deleted clips leave empty on every row is removed from the whole timeline: later clips, captions, graphics, zooms, scenes and markers move up. */
/**
 * What a delete did: `closed` are the time ranges removed from every row (in timeline seconds before the delete), `swept` the ids of other clips
 * that lay wholly inside them and went with that time (music under a deleted piece). Clips that ran across a closed range are shortened.
 */
export interface Deleted {closed:Array<[number,number]>;swept:string[]}
export function deleteItems(p:Project,ids:Iterable<string>,ripple:boolean):Deleted{
 const before=snapshotCaptionTiming(plainView(p));
 const all=linkedIds(p.clips,ids),removed=p.clips.filter(c=>all.has(c.id)).map(c=>[c.start,end(c)] as [number,number]);
 p.clips=p.clips.filter(c=>!all.has(c.id));p.elements=p.elements.filter(e=>!all.has(e.id));p.captions=p.captions.filter(c=>!all.has(c.id));p.zooms=p.zooms.filter(z=>!all.has(z.id));
 if(p.motion)p.motion=p.motion.filter(m=>!all.has(m.id));
 if(p.markers)p.markers=p.markers.filter(m=>!all.has(m.id));
 updateCaptions(p,remapClipCaptions(before,plainView(p),before.captions.filter(c=>!all.has(c.id))));
 if(!ripple)return {closed:[],swept:[]};
 // Ripple removes the time the deleted clips leave empty from every row, like Remove pauses: nothing is left behind as a black hole.
 const closed=mergeRanges(removed).flatMap(range=>uncovered(range,plainView(p).clips)).sort((x,y)=>y[0]-x[0]),remaining=new Set(plainView(p).clips.map(c=>c.id));
 for(const [a,b] of closed)closeRange(p,a,b);
 const after=new Set(plainView(p).clips.map(c=>c.id));
 return {closed:closed.reverse(),swept:[...remaining].filter(id=>!after.has(id))};
}
/** Removes [a, b) from every track and moves everything after it up, markers included. */
export function closeRange(p:Project,a:number,b:number){
 const loss=cutTimelineRange(p,a,b,true,plainView(p));
 if(p.markers)for(const m of p.markers){if(m.time>=b)m.time-=b-a;else if(m.time>a)m.time=a;}
 return loss;
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
 for(const m of p.motion??[])if(later(m.start))m.start+=length;
 for(const c of p.captions)if(later(c.start)){c.start+=length;c.end+=length;if(c.words)c.words=c.words.map(w=>({...w,start:w.start+length,end:w.end+length}));}
 for(const s of p.scenes)if(later(s.start)&&s.start>0)s.start+=length;
 for(const m of p.markers??[])if(later(m.time))m.time+=length;
}
/** Opens `length` seconds at `at` for an insert: clips on `rows` (all rows when omitted) that run across `at` are cut there first, so what is inserted overlaps nothing. */
export function insertGap(p:Project,at:number,length:number,rows?:ReadonlySet<string>,newId:()=>string=makeId){
 const before=snapshotCaptionTiming(plainView(p));
 const fresh=new Map<string,string>(),piece=minimumPiece(p);
 // A linked take that starts on one row before the insert point and on another at or after it (an offset camera) would be torn apart by the shift:
 // its clips that run across the point are cut there too, whatever their row, so the later slice moves as one.
 const early=new Set<string>(),late=new Set<string>();for(const c of p.clips)if(c.linkId!==undefined)(c.start<at-EPS?early:late).add(c.linkId);
 for(const c of [...p.clips]){
  if(!(c.start+EPS<at&&end(c)-EPS>at)||rows&&!rows.has(clipLayerRowId(c,p))&&!(c.linkId!==undefined&&early.has(c.linkId)&&late.has(c.linkId)))continue;
  // Within a frame of an edge, cut at the edge: the sliver goes and no piece is left.
  if(at-c.start<piece){c.sourceIn+=(at-c.start)*c.speed;c.start=at;continue;}
  if(end(c)-at<piece){c.sourceOut-=(end(c)-at)*c.speed;continue;}
  const cut=c.sourceIn+(at-c.start)*c.speed,origin=clipEffectTiming(c);c.effectTiming={sourceIn:origin.sourceIn,sourceOut:origin.sourceOut};
  const right={...plainClone(plainView(c)),id:newId(),start:at,sourceIn:cut};if(c.linkId!==undefined){if(!fresh.has(c.linkId))fresh.set(c.linkId,newId());right.linkId=fresh.get(c.linkId);}
  p.clips.push(right);c.sourceOut=cut;
 }
 laterSlice(p,at,fresh);
 openRange(p,at,length);
 updateCaptions(p,remapClipCaptions(before,plainView(p)));
}
/**
 * Each recorded scene follows its take on the timeline: its range becomes the contiguous run of its take's clips (screen, camera, audio, overlay)
 * that best covers where the scene was, so a move or trim of the take moves the scene. A piece moved far away (another run) does not stretch it,
 * and a range that would overlap another scene is not taken: the scene keeps its previous range. Scenes therefore never overlap.
 */
export function syncScenesToTakes(p:Project){
 const sceneOf=new Map((p.recordedTakes??[]).map(t=>[t.id,t.sceneId])),spans=new Map<string,Array<[number,number]>>();
 for(const c of p.clips){const scene=c.recordingTakeId?sceneOf.get(c.recordingTakeId):undefined;if(!scene||!gapTracks.has(c.track))continue;const list=spans.get(scene)??[];list.push([c.start,end(c)]);spans.set(scene,list);}
 const ranges=new Map(p.scenes.map(s=>[s.id,[s.start,s.start+s.duration] as [number,number]]));
 const proposed=new Map<string,[number,number]>();
 for(const s of p.scenes){const runs=mergeRanges(spans.get(s.id)??[]);if(!runs.length)continue;const [a,b]=ranges.get(s.id)!;
  // The runs still inside the scene's slice (a hole left by a moved piece stays inside); when the whole take moved, its longest run.
  const inside=runs.filter(([x,y])=>Math.min(b,y)-Math.max(a,x)>EPS),pick=inside.length?inside:[[...runs].sort((x,y)=>(y[1]-y[0])-(x[1]-x[0]))[0]];
  proposed.set(s.id,[Math.min(...pick.map(r=>r[0])),Math.max(...pick.map(r=>r[1]))]);}
 // Take every proposal together (two takes can swap places), then give back the previous range to scenes that would overlap another, until none do.
 const previous=new Map(ranges),clash=(id:string)=>{const [a,b]=ranges.get(id)!;return b-a>EPS&&p.scenes.some(o=>{if(o.id===id)return false;const [c,d]=ranges.get(o.id)!;return d-c>EPS&&a<d-EPS&&c<b-EPS;});};
 for(const [id,range] of proposed)ranges.set(id,range);
 for(let pass=0;pass<=p.scenes.length;pass++){const back=p.scenes.find(s=>proposed.has(s.id)&&ranges.get(s.id)!==previous.get(s.id)&&clash(s.id));if(!back)break;ranges.set(back.id,previous.get(back.id)!);}
 for(const s of p.scenes){const [a,b]=ranges.get(s.id)!;if(Math.abs(s.start-a)>1e-9||Math.abs(s.duration-(b-a))>1e-9){s.start=a;s.duration=b-a;}}
}
/** True when two items on one row overlap. */
export function rowsOverlap(items:readonly RowItem[]){
 const rows=new Map<string,RowItem[]>();for(const i of items){const list=rows.get(i.row)??[];list.push(i);rows.set(i.row,list);}
 for(const list of rows.values()){const sorted=[...list].sort((a,b)=>a.start-b.start);for(let i=1;i<sorted.length;i++)if(sorted[i].start<sorted[i-1].start+sorted[i-1].duration-EPS)return true;}
 return false;
}
/** Pasted or duplicated clips get link groups of their own (keeping which of them belong together) and are no longer part of a recorded take, so the take's scene does not stretch over copies. */
export function remapLinks(p:Project,ids:ReadonlySet<string>,newId:()=>string=makeId){
 const pasted=p.clips.filter(c=>ids.has(c.id)),groups=linkGroups(plainView(p).clips.filter(c=>ids.has(c.id))),map=new Map<string,string>();
 for(const c of pasted){const key=groups.get(c.id)!;if(!key.startsWith('clip:')){if(!map.has(key))map.set(key,newId());c.linkId=map.get(key);}delete c.recordingTakeId;}
}

/* ---------- Moves without overlaps ---------- */

/** One timeline item for row checks: a clip on its layer row, or an element, caption, zoom or motion block on its own row. */
export interface RowItem {id:string;row:string;start:number;duration:number}
export function rowItems(p:Project):RowItem[]{
 return [...p.clips.map(c=>({id:c.id,row:clipLayerRowId(c,p),start:c.start,duration:clipDuration(c)})),...p.elements.map(e=>({id:e.id,row:'elements',start:e.start,duration:e.duration})),
  ...p.captions.map(c=>({id:c.id,row:'captions',start:c.start,duration:c.end-c.start})),...p.zooms.map(z=>({id:z.id,row:'zooms',start:z.start,duration:z.duration})),
  ...(p.motion??[]).map(m=>({id:m.id,row:MOTION_ROW,start:m.start,duration:m.duration}))];
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
/** A press on a clip body becomes a move only after the pointer travels this far, so a click or a small slip never slides a clip. */
export const DRAG_DEAD_ZONE_PX=6;
type MovePlan={kind:'move'|'slide'|'insert'|'none';starts:Map<string,number>;delta:number;at?:number};
/** Where the first screen, camera, audio or overlay clip starts once `starts` are applied. */
function firstStart(p:Project,starts:ReadonlyMap<string,number>){const list=p.clips.filter(c=>gapTracks.has(c.track)).map(c=>starts.get(c.id)??c.start);return list.length?Math.min(...list):0;}
/**
 * Where a move of clips by `want` ends up: in place, slid to the nearest gap, or inserted.
 * A move never opens or lengthens a gap before the first clip: a video that starts at 0 keeps starting at 0 (a sole clip cannot be dragged away from 0);
 * a move that would is pulled back so the first clip starts where it did, or not done when that does not fit.
 */
export function planClipMove(p:Project,chosen:ReadonlySet<string>,want:number,pointer:number,options:{leaveGap?:boolean}={}):MovePlan{
 const ids=linkedIds(p.clips,chosen),plan=planClipMoveFree(p,ids,want,pointer,options.leaveGap===true),lead=firstStart(p,plan.starts),was=firstStart(p,new Map());
 // Only a move that makes the gap before the first clip longer is held back (a sliver left by an earlier cut does not free the take to drift).
 if(plan.kind==='none'||lead<=Math.max(EPS,was+EPS))return plan;
 if(plan.kind==='insert')return {kind:'none',starts:new Map(),delta:0};
 const delta=plan.delta-(lead-was),items=rowItems(p),moving=items.filter(i=>ids.has(i.id));
 if(Math.abs(delta)<1e-9||collides(moving,delta,items))return {kind:'none',starts:new Map(),delta:0};
 return {kind:'slide',starts:new Map(moving.map(m=>[m.id,m.start+delta])),delta};
}
function planClipMoveFree(p:Project,ids:ReadonlySet<string>,want:number,pointer:number,leaveGap:boolean):MovePlan{
 const items=rowItems(p),moving=items.filter(i=>ids.has(i.id));if(!moving.length)return {kind:'none',starts:new Map(),delta:0};
 const clipsOnly=moving.every(m=>p.clips.some(c=>c.id===m.id));
 if((!clipsOnly||leaveGap)&&!collides(moving,want,items))return {kind:Math.abs(want)<1e-9?'none':'move',starts:new Map(moving.map(m=>[m.id,m.start+want])),delta:want};
 if(clipsOnly){const plan=insertPlan(moving,pointer,items);
  // Rows of a linked group can have different boundaries: an insert that would still overlap somewhere falls back to sliding into a gap.
  // Clips linked to a clip the insert shifts move with it, so a take never comes apart.
  // When the rows of one take would need different shifts (an offset camera on the edge of the hole), or a clip would start before zero, the insert is not done: it slides instead.
  let whole=Boolean(plan);
  if(plan){const groups=linkGroups(p.clips),shift=new Map<string,number>();for(const c of p.clips){const to=plan.starts.get(c.id);if(to===undefined||ids.has(c.id))continue;const key=groups.get(c.id)!,d=to-c.start,had=shift.get(key);if(had!==undefined&&Math.abs(had-d)>1e-9)whole=false;shift.set(key,d);}
   for(const c of p.clips){const d=shift.get(groups.get(c.id)!);if(d!==undefined&&!plan.starts.has(c.id))plan.starts.set(c.id,c.start+d);}
   if([...plan.starts.values()].some(t=>t<-1e-9))whole=false;}
  if(plan&&whole&&!rowsOverlap(items.filter(i=>p.clips.some(c=>c.id===i.id)).map(i=>plan.starts.has(i.id)?{...i,start:plan.starts.get(i.id)!}:i))){if(Math.abs(plan.at-plan.from)<EPS)return {kind:'none',starts:new Map(),delta:0,at:plan.at};return {kind:'insert',starts:plan.starts,delta:plan.at-plan.from,at:plan.at};}
  // An insert with incompatible source offsets cannot safely reorder this selection. Keep it where it was.
  if(!leaveGap)return {kind:'none',starts:new Map(),delta:0};}
 const delta=freeDelta(moving,want,items);
 return {kind:Math.abs(delta)<1e-9?'none':'slide',starts:new Map(moving.map(m=>[m.id,m.start+delta])),delta};
}
/** Applies new clip starts; a caption that sits inside the clip carrying the narration moves with that clip, so the transcript follows the speech. */
export function applyClipStarts(p:Project,starts:ReadonlyMap<string,number>,media:ReadonlyMap<string,Media>=new Map(p.media.map(m=>[m.id,m]))){
 void media;const before=snapshotCaptionTiming(plainView(p)),all=new Map(starts),groups=linkGroups(before.clips),deltas=new Map<string,number>();
 for(const c of before.clips){const next=all.get(c.id);if(next!==undefined)deltas.set(groups.get(c.id)!,next-c.start);}
 for(const c of p.clips){const d=deltas.get(groups.get(c.id)!);if(d!==undefined)c.start=Math.max(0,c.start+d);}
 updateCaptions(p,remapClipCaptions(before,plainView(p)));
}
/** Moves elements, captions, zooms or motion blocks by one delta (start only; length unchanged). */
export function moveEffects(p:Project,ids:ReadonlySet<string>,delta:number){
 for(const e of p.elements)if(ids.has(e.id))e.start=Math.max(0,e.start+delta);
 for(const m of p.motion??[])if(ids.has(m.id))m.start=Math.max(0,m.start+delta);
 for(const z of p.zooms)if(ids.has(z.id))z.start=Math.max(0,z.start+delta);
 for(const c of p.captions)if(ids.has(c.id)){const d=Math.max(-c.start,delta);c.start+=d;c.end+=d;if(c.words)c.words=c.words.map(w=>({...w,start:w.start+d,end:w.end+d}));}
}

/* ---------- Trims ---------- */

/** The clips a trim of `id` moves: its whole link group, whatever their edges (an offset camera, an audio that runs longer). */
export function trimGroup(clips:readonly Clip[],id:string):Set<string>{return linkedIds(clips,[id]);}
/** Every clip of a link group trims by the same amount, ripple or not, so camera and audio never come apart. */
const trimmed=(p:Project,ids:ReadonlySet<string>,_side:'left'|'right',_ripple:boolean):ReadonlySet<string>=>linkedIds(p.clips,ids);
/** The delta range a trim of these clips' `side` edge allows: source limits, a tenth of a second minimum, and, without ripple, the neighbours on each clip's row. */
export function trimBounds(p:Project,chosen:ReadonlySet<string>,side:'left'|'right',ripple:boolean,media:ReadonlyMap<string,Media>=new Map(p.media.map(m=>[m.id,m]))){
 const ids=trimmed(p,chosen,side,ripple),clips=p.clips.filter(c=>ids.has(c.id));let min=-Infinity,max=Infinity;
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
export function trimClips(p:Project,chosen:ReadonlySet<string>,side:'left'|'right',delta:number,ripple:boolean){
 const before=snapshotCaptionTiming(plainView(p));
 const bounds=trimBounds(p,chosen,side,ripple);delta=Math.max(bounds.min,Math.min(bounds.max,delta));
 const ids=trimmed(p,chosen,side,ripple),clips=p.clips.filter(c=>ids.has(c.id));if(!clips.length||!delta)return;
 if(!ripple){for(const c of clips){if(side==='left'){c.sourceIn+=delta*c.speed;c.start+=delta;}else c.sourceOut+=delta*c.speed;}updateCaptions(p,remapClipCaptions(before,plainView(p)));return;}
 // Clips of one take can be offset (a camera starting 0.4 s after the screen): time opens at the earliest edge, so the take's later clips and the
 // next take move together, and a shrink closes only the time no clip on a screen, camera, audio or overlay row still uses, as a delete does.
 const shrink=side==='right'?delta<0:delta>0;
 if(shrink){
  const removed=clips.map(c=>side==='right'?[end(c)+delta,end(c)] as [number,number]:[c.start,c.start+delta] as [number,number]);
  for(const c of clips){if(side==='right')c.sourceOut+=delta*c.speed;else{c.sourceIn+=delta*c.speed;c.start+=delta;}}
  updateCaptions(p,remapClipCaptions(before,plainView(p)));
  for(const [a,b] of mergeRanges(removed).flatMap(range=>uncovered(range,plainView(p).clips)).sort((x,y)=>y[0]-x[0]))closeRange(p,a,b);
  return;
 }
 if(side==='right'){openRange(p,Math.min(...clips.map(end)),delta);for(const c of p.clips)if(ids.has(c.id))c.sourceOut+=delta*c.speed;updateCaptions(p,remapClipCaptions(before,plainView(p)));return;}
 const length=-delta;openRange(p,Math.min(...clips.map(c=>c.start)),length);for(const c of p.clips)if(ids.has(c.id)){c.start-=length;c.sourceIn-=length*c.speed;}updateCaptions(p,remapClipCaptions(before,plainView(p)));
}
/** Resizes an element, caption, zoom or motion block edge within [0, neighbours] and keeps at least a tenth of a second (a motion block, its template's shortest length). */
export function resizeEffect(p:Project,id:string,side:'left'|'right',delta:number){
 const items=rowItems(p),item=items.find(i=>i.id===id);if(!item)return;
 const others=items.filter(i=>i.row===item.row&&i.id!==id),stop=item.start+item.duration;
 const block=p.motion?.find(x=>x.id===id),shortest=block?Math.min(item.duration,MOTION_TEMPLATES[block.template]?.minDuration??.1):.1;
 const lo=side==='left'?Math.max(-item.start,...others.filter(o=>o.start+o.duration<=item.start+EPS).map(o=>o.start+o.duration-item.start)):shortest-item.duration;
 const hi=side==='left'?item.duration-shortest:Math.min(3600,...others.filter(o=>o.start>=stop-EPS).map(o=>o.start-stop));
 const d=Math.max(lo,Math.min(hi,delta)),start=side==='left'?item.start+d:item.start,length=side==='left'?item.duration-d:item.duration+d;
 const e=p.elements.find(x=>x.id===id),z=p.zooms.find(x=>x.id===id),c=p.captions.find(x=>x.id===id);
 if(e){e.start=start;e.duration=length;}if(z){z.start=start;z.duration=length;}if(c){c.start=start;c.end=start+length;}if(block){const m=p.motion!.find(x=>x.id===id)!;m.start=start;m.duration=length;}
}

/* ---------- Markers ---------- */

/** A new text or graphic element with the editor's defaults (the Elements panel and the companion's text both use it). */
export function newElement(type:Element['type'],start:number,id:string=makeId(),overrides:Partial<Element>={}):Element{
 return {id,type,start,duration:5,text:type==='text'?'Your story, beautifully told.':'',x:.15,y:.65,width:.7,height:type==='text'?.16:.22,color:'#ffffff',background:type==='highlight'?'#bba6ff66':type==='text'?'#171b27bb':'transparent',fontSize:64,opacity:1,rotation:0,...overrides};
}
/* ---------- Motion blocks ---------- */

/** The block that runs across `time` on the Motion row (other than `except`), if any. */
export const motionAt=(p:Pick<Project,'motion'>,time:number,except?:string)=>(p.motion??[]).find(m=>m.id!==except&&time>=m.start-EPS&&time<m.start+m.duration-EPS);
/** Where the next block after `time` starts on the Motion row (Infinity when none does). */
export const nextMotionStart=(p:Pick<Project,'motion'>,time:number,except?:string)=>(p.motion??[]).filter(m=>m.id!==except&&m.start>=time+EPS).reduce((at,m)=>Math.min(at,m.start),Infinity);
/**
 * Adds a block to the Motion row without overlapping another: it starts at its time, or after the block already there when `slide`,
 * and stops where the next block starts (and, with `keepLength`, where the video ends). Returns the block as added, or the sentence that
 * says why it does not fit.
 */
export function addMotionBlock(p:Project,block:MotionBlock,slide=false,keepLength=false):{block:MotionBlock}|{problem:string}{
 const videoEnd=keepLength?projectDuration(plainView(p)):Infinity;
 let start=Math.max(0,block.start);
 for(let on=motionAt(p,start);on;on=motionAt(p,start)){if(!slide)return {problem:'Another motion block is already there at that time.'};start=on.start+on.duration;}
 const shortest=MOTION_TEMPLATES[block.template].minDuration,label=MOTION_TEMPLATES[block.template].label.toLowerCase(),next=nextMotionStart(p,start);
 if(next-start<shortest-1e-9)return {problem:`There is no room for a ${label} there: the next motion block starts too soon.`};
 if(videoEnd-start<shortest-.01)return {problem:`There is no room for a ${label} before the end of the video.`};
 const duration=Math.max(Math.min(shortest,next-start),Math.min(block.duration,next-start,videoEnd-start));
 const placed={...block,start,duration};(p.motion??=[]).push(placed);p.motion.sort((a,b)=>a.start-b.start);
 return {block:placed};
}

export function addMarker(p:Project,time:number,newId:()=>string=makeId){const id=newId();(p.markers??=[]).push({id,time:Math.max(0,time)});p.markers.sort((a,b)=>a.time-b.time);return id;}
export function moveMarker(p:Project,id:string,time:number){const m=p.markers?.find(x=>x.id===id);if(m)m.time=Math.max(0,time);p.markers?.sort((a,b)=>a.time-b.time);}
/** A time in whole seconds, as "0:12": how a note on the timeline is named. */
export const secondsLabel=(time:number)=>{const total=Math.max(0,Math.round(time));return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;};
/** Writes the creator's note and mood on a marker. Empty words or a null mood take them off; the words are kept as typed. */
export function noteMarker(p:Project,id:string,patch:{name?:string;tag?:MarkerTag|null}){
 const m=p.markers?.find(x=>x.id===id);if(!m)return;
 if(patch.name!==undefined){if(patch.name.trim())m.name=patch.name;else delete m.name;}
 if(patch.tag!==undefined){if(patch.tag)m.tag=patch.tag;else delete m.tag;}
}
export function removeMarker(p:Project,id:string){if(!p.markers)return;p.markers=p.markers.filter(m=>m.id!==id);if(!p.markers.length)delete p.markers;}

/* ---------- Zoom, ruler, filmstrip ---------- */

/** The closest zoom shows a frame at 30 fps about 17 px wide and two seconds across a 1000 px timeline; further in shows nothing new. */
export const MIN_SCALE=.5,MAX_SCALE=500;
export const clampScale=(scale:number)=>Math.max(MIN_SCALE,Math.min(MAX_SCALE,Number.isFinite(scale)?scale:55));
/** Pixels per second that show the whole video in the timeline's own width. */
export function fitScale(duration:number,viewport:number){return clampScale((Math.max(0,viewport)-40)/Math.max(5,duration));}
/** The scroll that keeps `anchor` (the playhead) at the same place on screen when the scale changes; an anchor outside the view keeps the view's centre instead. */
export function anchoredScroll({anchor,from,to,scrollLeft,viewport}:{anchor:number;from:number;to:number;scrollLeft:number;viewport:number}){
 const x=anchor*from-scrollLeft,visible=x>=0&&x<=viewport,screen=visible?x:viewport/2,time=visible?anchor:(scrollLeft+viewport/2)/from;
 return Math.max(0,time*to-screen);
}
/** The scroll that keeps `time` (under the pointer, `screen` px into the view) at the same place on screen after zooming to `to` px/s. */
export function pointerScroll({time,screen,to}:{time:number;screen:number;to:number}){return Math.max(0,time*to-screen);}
/**
 * The zoom slider, linear in the seconds in view: its value is minus the visible seconds, so right zooms in and equal steps add or remove
 * equal time. Left end: the whole video and a little room (or more when the video is short); right end: MAX_SCALE.
 */
export function zoomSlider(viewport:number,duration:number){
 const width=Math.max(1,viewport),most=Math.max(width/MAX_SCALE*2,Math.min(width/MIN_SCALE,Math.max(10,duration*1.2))),least=width/MAX_SCALE;
 return {min:-most,max:-least,step:(most-least)/400,toScale:(value:number)=>clampScale(width/Math.max(least,Math.min(most,-value))),fromScale:(scale:number)=>-Math.max(least,Math.min(most,width/clampScale(scale)))};
}
/** Below this many seconds in view, times carry tenths. */
export const TENTHS_BELOW=10;
export const showTenths=(visibleSeconds:number)=>visibleSeconds<TENTHS_BELOW;
/** The one time format of Edit (ruler, playhead readout, drag and marker labels), Borumi's: "01:05", or "01:05.3" when zoomed in to less than 10 s. Never frames. */
export function rulerLabel(time:number,tenths=false){
 const t=Math.max(0,time+1e-9),whole=Math.floor(t),m=Math.floor(whole/60),s=whole%60,base=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
 return tenths?`${base}.${Math.floor((t-whole)*10+1e-6)%10}`:base;
}
/** A length or a move, not a time: "0.4 s", "4.2 s", "12 s", "1 min 4 s". */
export const lengthLabel=(n:number)=>n>=60?`${Math.floor(n/60)} min ${Math.round(n%60)} s`:`${n<10?Math.round(n*10)/10:Math.round(n)} s`;
export interface RulerTick {time:number;major:boolean;label?:string}
/** Ticks between `from` and `to`: labelled major ticks at least 140 px apart (Borumi's open ruler), minor ticks between; at high zoom the steps are tenths of a second. */
export function rulerTicks(from:number,to:number,scale:number):RulerTick[]{
 if(!(scale>0)||!(to>from))return [];
 const steps=[.1,.2,.5,1,2,5,10,15,30,60,120,300,600,1800],major=steps.find(s=>s*scale>=140)??3600;
 const tenths=major<1,minor=major/(major>=60?6:major===15?3:major===2||major===.2?4:5);
 const out:RulerTick[]=[],first=Math.floor(from/minor);
 for(let i=first;i*minor<=to+minor&&out.length<2000;i++){const time=i*minor;if(time<0)continue;const ratio=time/major,major_=Math.abs(ratio-Math.round(ratio))<1e-6;out.push({time,major:major_,...(major_?{label:rulerLabel(time,tenths)}:{})});}
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
