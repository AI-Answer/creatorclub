import {creatorCameraTransform,creatorScreenTransform} from './camera-style.js';
import {clipDuration,clipEffectTiming,makeId,projectDuration,type Canvas,type Clip,type LayoutPreset,type LayoutSegment,type Project,type Transform} from './types.js';

/**
 * Borumi's Layout row: a stretch of the video where the camera and screen take a named arrangement. The preview places clips with
 * `layoutTransform`, the export cuts clips at the stretches' edges with `bakeLayouts`, and the Layout panel applies a choice with
 * `chooseLayout` (the selected stretch, else the one at the playhead, else a new one from the playhead).
 */
export const LAYOUT_PRESETS:readonly LayoutPreset[]=['Creator','Full frame','Picture in picture','Side by side','Camera spotlight'];
export const isLayoutPreset=(value:unknown):value is LayoutPreset=>LAYOUT_PRESETS.includes(value as LayoutPreset);
/** The shortest stretch the panel or the timeline makes. */
export const MIN_LAYOUT=.1;
const EPS=1e-6;

type Box=Pick<Transform,'x'|'y'|'width'|'height'>;
export type LayoutGeometry={camera:Box&Partial<Transform>;screen:Box&Partial<Transform>};
const FULL:Box={x:0,y:0,width:1,height:1};
/** Where a preset puts the camera and the screen. Creator is the shared preset; the others place the camera over a full or narrowed screen. Rotation and opacity stay the clip's own. */
export function layoutGeometry(preset:LayoutPreset,canvas:Pick<Canvas,'width'|'height'>):LayoutGeometry{
 switch(preset){
  case 'Creator':{const {rotation:_,opacity:__,...camera}=creatorCameraTransform(canvas),{rotation:___,opacity:____,...screen}=creatorScreenTransform(canvas);return {camera,screen};}
  case 'Full frame':return {camera:{...FULL,borderRadius:0},screen:FULL};
  case 'Picture in picture':return {camera:{x:.72,y:.63,width:.25,height:.32,borderRadius:28},screen:FULL};
  case 'Side by side':return {camera:{x:.68,y:.05,width:.3,height:.9,borderRadius:24},screen:{...FULL,width:.66}};
  case 'Camera spotlight':return {camera:{x:.18,y:.06,width:.64,height:.88,borderRadius:36},screen:FULL};
 }
}

/** The clips a stretch places: camera and screen clips, except the canvas background. */
export const followsLayout=(clip:Pick<Clip,'track'|'zIndex'>)=>(clip.track==='camera'||clip.track==='screen')&&clip.zIndex!==-1000;
export const sortedLayouts=(p:Pick<Project,'layouts'>)=>[...(p.layouts??[])].sort((a,b)=>a.start-b.start);
/** The stretch running at `time` (half-open, as clips are), if any. */
export const layoutAt=(p:Pick<Project,'layouts'>,time:number)=>(p.layouts??[]).find(l=>time>=l.start-EPS&&time<l.start+l.duration-EPS);
/** The transform a clip shows at `time`: its own, or its place in the stretch running then. */
export function layoutTransform(p:Pick<Project,'layouts'|'canvas'>,clip:Clip,time:number):Transform{
 const stretch=followsLayout(clip)?layoutAt(p,time):undefined;
 return stretch?{...clip.transform,...layoutGeometry(stretch.preset,p.canvas)[clip.track as 'camera'|'screen']}:clip.transform;
}

/** The preset the clips are in outside every stretch, judged by the first camera clip; null once the camera was placed by hand. */
export function baseLayout(p:Pick<Project,'clips'|'canvas'>):LayoutPreset|null{
 const camera=p.clips.filter(c=>c.track==='camera').sort((a,b)=>a.start-b.start)[0];if(!camera)return null;
 const t=camera.transform;return LAYOUT_PRESETS.find(preset=>{const g=layoutGeometry(preset,p.canvas).camera;return Math.abs(t.x-g.x)<.01&&Math.abs(t.y-g.y)<.01&&Math.abs(t.width-g.width)<.01&&Math.abs(t.height-g.height)<.01;})??null;
}
/**
 * The stretch Borumi offers when the pointer is over an empty part of the Layout row (or drags there): from `origin` to `current`, at least
 * a tenth of the seconds in view, inside the free room around `origin` and the video's length. Null when `origin` is inside a stretch.
 */
export function layoutRoom(p:Pick<Project,'layouts'>,origin:number,current:number,minimum:number,end:number):{start:number;stop:number}|null{
 const list=sortedLayouts(p);if(layoutAt(p,origin))return null;
 const low=Math.max(0,...list.filter(l=>l.start+l.duration<=origin+EPS).map(l=>l.start+l.duration)),high=Math.min(end,...list.filter(l=>l.start>=origin-EPS).map(l=>l.start));
 let start=Math.min(origin,current),stop=Math.max(origin,current);
 if(stop-start<minimum)stop=start+minimum;
 if(stop>high){stop=high;if(stop-start<minimum)start=stop-minimum;}
 start=Math.max(start,low);
 return stop-start>=MIN_LAYOUT-EPS?{start,stop}:null;
}
/** The stretches a layout choice applies to, as in Borumi: the selected ones, else the one at the playhead (the last one when the playhead rests on the end). */
export function chosenLayouts(p:Project,selected:ReadonlySet<string>,time:number):LayoutSegment[]{
 const picked=(p.layouts??[]).filter(l=>selected.has(l.id));if(picked.length)return picked;
 const end=projectDuration(p),at=layoutAt(p,end>0&&time>=end-EPS?end-1e-3:time);return at?[at]:[];
}
/**
 * Applies a preset as Borumi's Layout panel does: to the chosen stretches, else as a new stretch from the playhead to the next stretch
 * (or the end of the video). With no room after the playhead the new stretch starts at the previous change. Returns the ids changed or
 * made; empty when the video has no time for a stretch. `id` names a new stretch, so an edit replayed onto a newer project makes the same one.
 */
export function chooseLayout(p:Project,preset:LayoutPreset,selected:ReadonlySet<string>,time:number,id:string=makeId()):string[]{
 const chosen=chosenLayouts(p,selected,time);
 if(chosen.length){for(const l of chosen)l.preset=preset;return chosen.map(l=>l.id);}
 const end=projectDuration(p),list=sortedLayouts(p);let start=Math.max(0,Math.min(time,end));
 const next=(from:number)=>list.find(l=>l.start>=from-EPS)?.start??end;
 if(next(start)-start<MIN_LAYOUT){const before=[...list].reverse().find(l=>l.start+l.duration<=start+EPS);start=before?before.start+before.duration:0;}
 return insertLayout(p,{start,stop:next(start),preset,id});
}
/** Adds a stretch over [start, stop) on the Layout row, clipped to the free room around `start`, and returns its id; empty when that room is under MIN_LAYOUT. */
export function insertLayout(p:Project,{start,stop,preset,id=makeId()}:{start:number;stop:number;preset:LayoutPreset;id?:string}):string[]{
 const list=sortedLayouts(p),from=Math.max(0,start,...list.filter(l=>l.start<start+EPS).map(l=>l.start+l.duration)),to=Math.min(stop,...list.filter(l=>l.start>from-EPS).map(l=>l.start));
 if(!(to-from>=MIN_LAYOUT-EPS))return [];
 p.layouts=[...list,{id,start:from,duration:to-from,preset}].sort((a,b)=>a.start-b.start);
 return [id];
}

/** Why a stored stretch list is invalid (the server's check), or null. */
export function layoutsProblem(layouts:unknown):string|null{
 if(layouts===undefined)return null;
 if(!Array.isArray(layouts)||layouts.length>10000)return 'Invalid layouts';
 const ids=new Set<string>();let last=-Infinity;
 for(const l of [...layouts].sort((a,b)=>Number(a?.start)-Number(b?.start))){
  if(!l||typeof l!=='object'||typeof l.id!=='string'||!l.id||ids.has(l.id))return 'Invalid layout stretch';ids.add(l.id);
  if(![l.start,l.duration].every(Number.isFinite)||l.start<0||l.duration<=0||!isLayoutPreset(l.preset))return 'Invalid layout stretch';
  if(l.start<last-1e-4)return 'Layout stretches overlap';last=l.start+l.duration;
 }
 return null;
}

/**
 * The export's view of the stretches: each camera and screen clip a stretch changes is cut where its transform changes, and every piece
 * carries the transform it shows. Pieces keep their origin in `effectTiming`, as a split does, so fades and sound stay continuous.
 * Removes `layouts`, which the renderer does not read.
 */
export function bakeLayouts(p:Project){
 const layouts=sortedLayouts(p);delete p.layouts;if(!layouts.length)return;
 const view={layouts,canvas:p.canvas};
 p.clips=p.clips.flatMap(c=>{
  if(!followsLayout(c))return [c];
  const start=c.start,stop=start+clipDuration(c),cuts=[...new Set(layouts.flatMap(l=>[l.start,l.start+l.duration]))].filter(t=>t>start+EPS&&t<stop-EPS).sort((a,b)=>a-b);
  const pieces:Array<{from:number;to:number;transform:Transform}>=[];
  for(const [i,to] of [...cuts,stop].entries()){
   const from=i?cuts[i-1]:start,transform=layoutTransform(view,c,(from+to)/2),last=pieces.at(-1);
   if(last&&JSON.stringify(last.transform)===JSON.stringify(transform))last.to=to;else pieces.push({from,to,transform});
  }
  if(pieces.length===1)return [{...c,transform:pieces[0].transform}];
  const origin=clipEffectTiming(c);
  return pieces.map(({from,to,transform},i)=>({...c,id:i?makeId():c.id,start:from,sourceIn:c.sourceIn+(from-start)*c.speed,sourceOut:c.sourceIn+(to-start)*c.speed,transform,effectTiming:{sourceIn:origin.sourceIn,sourceOut:origin.sourceOut}}));
 });
}
