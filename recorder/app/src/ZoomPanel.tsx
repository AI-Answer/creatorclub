import type {ReactNode} from 'react';
import type {Project,Zoom} from '../shared/types';
import {clipDuration,makeId} from '../shared/types';
import type {Change} from './Inspector';
import {usePlayheadSelector,type Playhead} from './playhead';
import {rulerLabel} from './timeline-edit';
import {Camera,Plus} from './Icons';
import {BrEmpty,BrGroup,BrSub,BrTabs} from './club/edit-panels/br';

const CLOSE=[{name:'A little',scale:1.25},{name:'Medium',scale:1.5},{name:'Close',scale:2}] as const;
const LENGTHS=[2,3,5] as const;
const SCREEN_ICON=<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M8 21h8"/></svg>;

/**
 * Zoom in Borumi's groups: a Screen Zoom and a Camera Zoom card. Each adds a zoom of its own kind where the playhead is, shows how
 * close and how long the selected zoom of that kind is, and lists every zoom in the video. The export zooms only a clip of the same
 * kind under the zoom, so an add is offered only while such a clip is under the playhead.
 */
export function ZoomPanel({project:p,selected,playhead,change,select}:{project:Project;selected:string|null;playhead:Playhead;change:Change;select:(id:string)=>void}){
 const zoom=p.zooms.find(z=>z.id===selected);
 const update=(fn:(z:Zoom)=>void)=>change(d=>{const z=d.zooms.find(x=>x.id===selected);if(z)fn(z);});
 const add=(target:Zoom['target'])=>{
  const start=playhead.get(),id=makeId();
  change(d=>{d.zooms.push({id,start,duration:3,scale:1.5,x:.5,y:.4,target,easing:'smooth'});});
  select(id);
 };
 // Whether a clip of this kind is under the playhead: the export zooms only those, so the add stays offered only then.
 const sourceAt=(kind:Zoom['target'],at:number)=>p.clips.some(c=>c.track===kind&&at>=c.start&&at<c.start+clipDuration(c));
 const cameraHere=usePlayheadSelector(playhead,at=>sourceAt('camera',at)),screenHere=usePlayheadSelector(playhead,at=>sourceAt('screen',at));
 const card=(target:Zoom['target'],title:string,icon:ReactNode,here:boolean)=>{
  const current=zoom?.target===target?zoom:undefined;
  return <BrGroup title={title} icon={icon} id={`zoom-${target}`}>
   {current&&<BrSub title="How close">
    <BrTabs full label="How close" value={CLOSE.find(c=>Math.abs(current.scale-c.scale)<.01)?.name??''} items={CLOSE.map(c=>({value:c.name,label:c.name}))} onChange={name=>update(z=>{z.scale=CLOSE.find(c=>c.name===name)!.scale;})}/>
   </BrSub>}
   {current&&<BrSub title="How long">
    <BrTabs full label="How long" value={String(current.duration)} items={LENGTHS.map(n=>({value:String(n),label:`${n} s`}))} onChange={v=>update(z=>{z.duration=Number(v);})}/>
   </BrSub>}
   {current&&<BrEmpty text="Drag the box on the picture to choose where it looks, or a corner to zoom closer."/>}
   {current&&<button type="button" className="br-btn is-outline is-sm club-zoom-delete" onClick={()=>change(d=>{d.zooms=d.zooms.filter(z=>z.id!==current.id);})}>Delete zoom</button>}
   {!current&&<BrEmpty text={`No ${target} zoom is currently selected.`}/>}
   {!current&&<button type="button" className="br-btn is-sm" disabled={!here} onClick={()=>add(target)}><Plus size={14}/>{`Add ${target} zoom`}</button>}
   {!current&&!here&&<BrEmpty text={`Move the playhead over a ${target} clip to add one.`}/>}
  </BrGroup>;
 };
 return <div className="br-panel is-card club-zoom-panel"><div className="br-groups">
  {card('screen','Screen Zoom',SCREEN_ICON,screenHere)}
  {card('camera','Camera Zoom',<Camera size={12}/>,cameraHere)}
  {p.zooms.length>0&&<BrGroup title="In this video" id="zoom-list"><div className="club-zoom-list">{[...p.zooms].sort((a,b)=>a.start-b.start).map(z=><button key={z.id} type="button" aria-current={z.id===selected} onClick={()=>{select(z.id);playhead.set(z.start);}}>
   <span>{`Zoom on the ${z.target}`}</span><small>{rulerLabel(z.start)}</small></button>)}</div></BrGroup>}
 </div></div>;
}
