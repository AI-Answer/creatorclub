import type {Project,Zoom} from '../shared/types';
import {makeId} from '../shared/types';
import type {Change} from './Inspector';
import type {Playhead} from './playhead';
import {rulerLabel} from './timeline-edit';

const CLOSE=[{name:'A little',scale:1.25},{name:'Medium',scale:1.5},{name:'Close',scale:2}] as const;
const LENGTHS=[2,3,5] as const;

/**
 * Zoom in CreatorClub's Edit: add a zoom where the playhead is, then drag the box on the picture to choose where it looks.
 * A selected zoom offers how close and how long, nothing more.
 */
export function ZoomPanel({project:p,selected,playhead,change,select}:{project:Project;selected:string|null;playhead:Playhead;change:Change;select:(id:string)=>void}){
 const zoom=p.zooms.find(z=>z.id===selected);
 const add=()=>{
  const start=playhead.get(),id=makeId();
  // It zooms whatever is on the picture at that moment: the camera when it is there, else the screen.
  const target:Zoom['target']=p.clips.some(c=>c.track==='camera'&&start>=c.start&&start<c.start+(c.sourceOut-c.sourceIn)/c.speed)?'camera':'screen';
  change(d=>{d.zooms.push({id,start,duration:3,scale:1.5,x:.5,y:.4,target,easing:'smooth'});});
  select(id);
 };
 const update=(fn:(z:Zoom)=>void)=>change(d=>{const z=d.zooms.find(x=>x.id===selected);if(z)fn(z);});
 return <div className="layout-panel">
  <section className="lp-section">
   <button type="button" className="btn primary gfx-ask-btn" onClick={add}>Add a zoom here</button>
   <p className="lp-hint">It starts at the playhead. Then drag the box on the picture to choose where it looks, or a corner to zoom closer.</p>
  </section>
  {zoom&&<section className="lp-section">
   <h4>How close</h4>
   <div className="lp-seg" role="group" aria-label="How close">{CLOSE.map(c=><button key={c.name} type="button" aria-pressed={Math.abs(zoom.scale-c.scale)<.01} onClick={()=>update(z=>{z.scale=c.scale;})}>{c.name}</button>)}</div>
   <h4 style={{marginTop:14}}>How long</h4>
   <div className="lp-seg" role="group" aria-label="How long">{LENGTHS.map(n=><button key={n} type="button" aria-pressed={Math.abs(zoom.duration-n)<.01} onClick={()=>update(z=>{z.duration=n;})}>{n} s</button>)}</div>
   <button type="button" className="btn sm danger" style={{marginTop:14}} onClick={()=>{change(d=>{d.zooms=d.zooms.filter(z=>z.id!==zoom.id);});}}>Delete zoom</button>
  </section>}
  {p.zooms.length>0&&<section className="lp-section">
   <h4>In this video</h4>
   <div className="zp-list">{[...p.zooms].sort((a,b)=>a.start-b.start).map(z=><button key={z.id} type="button" className={z.id===selected?'on':''} onClick={()=>{select(z.id);playhead.set(z.start);}}>
    <span>Zoom on the {z.target}</span><small>{rulerLabel(z.start)}</small></button>)}</div>
  </section>}
 </div>;
}
