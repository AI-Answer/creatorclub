import type {MotionBlock,MotionTemplateId,Project} from '../shared/types';
import {makeId} from '../shared/types';
import {MOTION_TEMPLATES,MOTION_TEMPLATE_IDS,motionText,newMotionBlock,normalizeMotionProps} from '../shared/motion/templates';
import {addMotionBlock,nextMotionStart} from './timeline-edit';
import {timecode} from './api';
import {Trash2} from './Icons';
import type {Playhead} from './playhead';

/*
 * The Motion panel: add a title card, lower third, callout or chapter label at the playhead, and edit the selected block's style, text,
 * position and timing. Blocks never overlap on the Motion row: a new one starts after a block already at the playhead and stops where the
 * next begins, and the start and length fields stop at the neighbours.
 */
type Change=(fn:(p:Project)=>void,opts?:{coalesce?:string})=>void;

export function MotionPanel({project:p,selected,playhead,change,select,notify,club}:{project:Project;selected:string|null;playhead:Playhead;change:Change;select:(id:string)=>void;notify?:(message:string)=>void;club?:boolean}){
 const block=p.motion?.find(m=>m.id===selected);
 const add=(template:MotionTemplateId)=>{
  const id=makeId(),start=playhead.get();let problem='';
  // A new block keeps the video's length: it stops where the video ends.
  change(d=>{const r=addMotionBlock(d,newMotionBlock(template,start,id),true,true);if('problem' in r)problem=r.problem;});
  if(problem)notify?.(problem);else select(id);
 };
 return <>
  <section className="inspector-section"><h3>Add at the playhead</h3><p className="hint">Animated graphics on their own Motion row. The preview plays them as the export renders them.</p>
   <div className="element-grid motion-gallery">{MOTION_TEMPLATE_IDS.map(id=><button key={id} type="button" onClick={()=>add(id)}><span className={`motion-mini mm-${id}`} aria-hidden="true"><i/><i/></span><b>{MOTION_TEMPLATES[id].label}</b></button>)}</div>
  </section>
  {block?<BlockFields key={block.id} project={p} block={block} change={change}/>:
   <section className="inspector-section"><h3>{club?'In this video':'In this project'}</h3>{(p.motion??[]).map(m=><button key={m.id} type="button" className="list-item" onClick={()=>select(m.id)}><span>{MOTION_TEMPLATES[m.template]?.label}: {motionText(m)}</span><small>{timecode(m.start)}</small></button>)}{!p.motion?.length&&<p className="hint">Nothing yet. Add one above, or ask the companion: “add a lower third at 0:12”.</p>}</section>}
 </>;
}

function BlockFields({project:p,block,change}:{project:Project;block:MotionBlock;change:Change}){
 const template=MOTION_TEMPLATES[block.template],props=normalizeMotionProps(block.template,block.props);
 const update=(fn:(m:MotionBlock)=>void,key?:string)=>change(d=>{const m=d.motion?.find(x=>x.id===block.id);if(m)fn(m);},key?{coalesce:`motion:${block.id}:${key}`}:undefined);
 // The start stays between the block before and the block after; the length stops at the next block.
 const before=(p.motion??[]).filter(m=>m.id!==block.id&&m.start+m.duration<=block.start+1e-6).reduce((at,m)=>Math.max(at,m.start+m.duration),0);
 const after=nextMotionStart(p,block.start,block.id),longest=Math.min(template.maxDuration,after-block.start);
 return <section className="inspector-section"><h3>{template.label}</h3>
  <div className="field"><span>Style</span><div className="button-pair" role="radiogroup" aria-label="Style">{template.styles.map(s=><button key={s.id} type="button" role="radio" aria-checked={block.style===s.id} className={`button ${block.style===s.id?'is-active':''}`} onClick={()=>update(m=>{m.style=s.id;})}>{s.label}</button>)}</div></div>
  {template.props.map(spec=>spec.kind==='text'
   ?<label key={spec.key} className="field"><span>{spec.label}{spec.optional?' (optional)':''}</span><input aria-label={spec.label} value={String(block.props[spec.key]??props[spec.key])} maxLength={spec.max} onChange={e=>{const value=e.target.value;update(m=>{m.props={...m.props,[spec.key]:value};},spec.key);}}/></label>
   :<label key={spec.key} className="slider-field"><span>{spec.label}<b>{Math.round(Number(props[spec.key])*100)}%</b></span><input aria-label={spec.label} type="range" min={0} max={1} step={.01} value={Number(props[spec.key])} onChange={e=>{const value=Number(e.target.value);update(m=>{m.props={...m.props,[spec.key]:value};},spec.key);}}/></label>)}
  <div className="field-pair">
   <label className="field"><span>Start</span><input aria-label="Start" type="number" min={before} step={.1} value={Math.round(block.start*100)/100} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))update(m=>{m.start=Math.max(before,Math.min(n,after-m.duration));},'start');}}/></label>
   <label className="field"><span>Length</span><input aria-label="Length" type="number" min={template.minDuration} max={longest} step={.1} value={Math.round(block.duration*100)/100} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))update(m=>{m.duration=Math.max(Math.min(template.minDuration,longest),Math.min(longest,n));},'duration');}}/></label>
  </div>
  <button type="button" className="button danger" onClick={()=>change(d=>{d.motion=(d.motion??[]).filter(m=>m.id!==block.id);})}><Trash2 size={14}/>Remove {template.label.toLowerCase()}</button>
 </section>;
}
