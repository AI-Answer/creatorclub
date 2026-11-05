import {useMemo,useSyncExternalStore} from 'react';
import type {InspectorProps} from '../../Inspector';
import type {Project} from '../../../shared/types';
import {derivedSnapshot,firstAtOrAfter,keyframeWindowStart,KEYFRAME_WINDOW} from '../../editor-view';
import {usePlayheadSelector,type Playhead} from '../../playhead';
import {rulerLabel} from '../../timeline-edit';
import {Icon} from '../ui';
import {BrColorField,BrEmpty,BrSection,BrSeparator,BrSlider,BrSub,BrToggleRow} from './br';

/*
  The club's Cursor panel, built to Borumi's Cursor panel (spec-edit-step.md, section e8). Our cursor is one arrow drawn in the cursor
  colour, so the style grid offers None and Pointer. Borumi's Mac, Windows and image sets are not in our model. The size is in canvas
  pixels and is shown as Borumi's factor against the 24 px a new project starts with (shared/types.ts createProject); the export clamps
  the rendered size to 8 to 256 px, so the factor starts at 8 / 24. The pointer path is a CreatorClub feature and stays.
  Borumi's cursor tracking, hide camera on overlap, hide when still, click sound and click effect have no counterpart in our model.
*/

const BASE_SIZE=24,MIN_SIZE=8,MAX_SIZE=96;
/** The arrow the stage and the export draw (src/Stage.tsx). */
const ARROW='M2 1v27l7-7 6 10 5-3-6-10 10-1z';

export function ClubCursorPanel({project:p,playhead,change}:InspectorProps){
 const c=p.cursor,factor=c.size/BASE_SIZE;
 const set=(fn:(cursor:Project['cursor'])=>void,key?:string)=>change(d=>fn(d.cursor),key?{coalesce:key}:undefined);
 const addPoint=()=>{const time=playhead.get();change(d=>{d.cursor.enabled=true;d.cursor.points.push({time,x:.5,y:.5});d.cursor.points.sort((a,b)=>a.time-b.time);});};
 return <div className="br-panel club-cursor-panel">
  <BrSection title="Cursor style">
   <div className="club-cursor-tiles" role="group" aria-label="Cursor style">
    <button type="button" className="br-tile club-cursor-tile" aria-pressed={!c.enabled} onClick={()=>set(x=>{x.enabled=false;})}>
     <span className="club-cursor-art"><Icon name="hide" size={18}/></span><span className="club-cursor-label">None</span>
    </button>
    <button type="button" className="br-tile club-cursor-tile" aria-pressed={c.enabled} onClick={()=>set(x=>{x.enabled=true;})}>
     <span className="club-cursor-art" style={{color:c.color}}><svg viewBox="0 0 24 32" aria-hidden="true"><path d={ARROW} fill="currentColor"/></svg></span><span className="club-cursor-label">Pointer</span>
    </button>
   </div>
  </BrSection>
  <BrSeparator/>
  {!c.enabled?<BrEmpty className="club-cursor-empty" text="Select a cursor style to show the cursor and change visual options."/>:<>
   <BrSub title="Cursor Size" secondary={`(x${factor.toFixed(2)})`} description="Controls how large the cursor renders in your video."
    action={c.size!==BASE_SIZE&&<button type="button" className="br-link" onClick={()=>set(x=>{x.size=BASE_SIZE;})}>Reset</button>}>
    <BrSlider value={factor} min={MIN_SIZE/BASE_SIZE} max={MAX_SIZE/BASE_SIZE} step={1/BASE_SIZE} label="Cursor size" onChange={v=>set(x=>{x.size=Math.round(v*BASE_SIZE);},'cursor.size')}/>
   </BrSub>
   <BrSeparator/>
   <BrSub title="Center color"><BrColorField label="Center color" value={c.color} onChange={v=>set(x=>{x.color=v;},'cursor.color')}/></BrSub>
   <BrSeparator/>
   <div className="club-cursor-highlight">
    <BrToggleRow label="Cursor Highlight" checked={c.highlight} onChange={v=>set(x=>{x.highlight=v;})}/>
    <BrEmpty text="Adds a translucent yellow halo behind the pointer."/>
   </div>
   <BrSeparator/>
   <BrSection title="Where the pointer goes">
    <BrEmpty text="This recording did not save where your pointer moved. Add points and the pointer glides between them."/>
    <button type="button" className="br-btn club-cursor-add" onClick={addPoint}><Icon name="add" size={14}/>Add a point at <PlayheadTime playhead={playhead}/></button>
    <CursorPathRows points={c.points} playhead={playhead} change={change}/>
   </BrSection>
  </>}
 </div>;
}

function PlayheadTime({playhead}:{playhead:Playhead}){const label=usePlayheadSelector(playhead,rulerLabel);return <>{label}</>;}

/** Imported paths hold thousands of samples, so only a window around the playhead renders; rows keep their real index. */
function CursorPathRows({points,playhead,change}:{points:Project['cursor']['points'];playhead:Playhead;change:InspectorProps['change']}){
 const snapshot=useMemo(()=>derivedSnapshot(playhead.get,time=>keyframeWindowStart(points.length,firstAtOrAfter(points,time))),[playhead,points]),start=useSyncExternalStore(playhead.subscribe,snapshot,snapshot),end=Math.min(points.length,start+KEYFRAME_WINDOW);
 return <div className="club-cursor-points">
  {end-start<points.length&&<BrEmpty text={`Showing points ${start+1}–${end} of ${points.length} near the playhead.`}/>}
  {points.slice(start,end).map((point,offset)=>{const i=start+offset;return <div className="club-cursor-point" key={i}>
   <b>{rulerLabel(point.time)}</b>
   <PointField label="Across" value={point.x} onChange={v=>change(d=>{d.cursor.points[i].x=v;},{coalesce:`cursor:${i}:x`})}/>
   <PointField label="Down" value={point.y} onChange={v=>change(d=>{d.cursor.points[i].y=v;},{coalesce:`cursor:${i}:y`})}/>
   <button type="button" className="club-cursor-delete" aria-label="Delete cursor point" onClick={()=>change(d=>{d.cursor.points.splice(i,1);})}><Icon name="delete" size={13}/></button>
  </div>;})}
 </div>;
}

function PointField({label,value,onChange}:{label:string;value:number;onChange(value:number):void}){
 return <label className="club-cursor-field"><span>{label}</span><input type="number" aria-label={label} min={0} max={1} step={.1} value={Number.isFinite(value)?Math.round(value*1000)/1000:0}
  onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onChange(Math.max(0,Math.min(1,n)));}}/></label>;
}
