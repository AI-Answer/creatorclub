import {useEffect,useState} from 'react';
import type {InspectorProps} from '../../Inspector';
import type {Element} from '../../../shared/types';
import {makeId} from '../../../shared/types';
import {newElement,rulerLabel} from '../../timeline-edit';
import {Icon} from '../ui/icons';
import {BrColorField,BrDrawer,BrGroup,BrSection,BrSlider,BrSub,BrToggleRow} from './br';

/*
  The club's Elements panel, built to Borumi's Elements panel (spec-edit-step.md, e5). The picker holds Text, Overlays and
  Annotations; the Properties drawer edits the selected element. Only the controls the element model and the preview and export
  can draw are here. Borumi's fonts, bold and italic, casing, alignment, shadow, stroke, transitions, sounds, aspect lock,
  favourites and behind-subject controls have no field in the model, so they are not shown.
*/

const TYPE_LABEL:Record<Element['type'],string>={text:'Text',rectangle:'Rectangle',ellipse:'Ellipse',arrow:'Arrow',highlight:'Highlight',blur:'Blur'};
/** The annotation tiles, in Borumi's order; Highlight and Blur are CreatorClub's own element types. */
const ANNOTATIONS:ReadonlyArray<{type:Element['type'];label:string}>=[{type:'arrow',label:'Arrow'},{type:'rectangle',label:'Rectangle'},{type:'ellipse',label:'Ellipse'},{type:'highlight',label:'Highlight'},{type:'blur',label:'Blur'}];
/** The four frame fields. Borumi's sliders are in pixels; an element is stored as a share of the frame, so these show percent. */
const GEOMETRY:ReadonlyArray<readonly [keyof Pick<Element,'x'|'y'|'width'|'height'>,string]>=[['x','X position'],['y','Y position'],['width','Width'],['height','Height']];

/** Whether a colour value paints anything: `transparent` and a zero alpha are off, as Borumi's Background switch is. */
export const isVisibleColour=(value:string)=>/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)&&!/^#[0-9a-f]{6}00$/i.test(value);
/** The colour field shows six digits, so a colour picked there keeps the transparency the value already had. */
export function keepAlpha(next:string,current:string){const alpha=/^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(current);return alpha?next.slice(0,7)+current.slice(7):next;}

/** A number control with a visible label, shared with the Captions panel. It keeps what is typed and only commits a value inside its limits. */
export function BrNumberField({label,value,min,max,step=.1,onChange}:{label:string;value:number;min?:number;max?:number;step?:number;onChange(value:number):void}){
 const shown=Number.isFinite(value)?Math.round(value*1000)/1000:0;
 const [text,setText]=useState(String(shown));
 useEffect(()=>setText(String(shown)),[shown]);
 return <label className="el-field"><span>{label}</span><input className="el-number" type="number" aria-label={label} min={min} max={max} step={step} value={text}
  onChange={event=>{const raw=event.target.value,next=Number(raw);setText(raw);if(raw.trim()!==''&&Number.isFinite(next)&&(min===undefined||next>=min)&&(max===undefined||next<=max))onChange(next);}}/></label>;
}

/** The glyphs on the annotation tiles (Borumi's tapered-arrow, rect, circle), drawn in the tile's text colour. */
function Glyph({type}:{type:Element['type']}){
 if(type==='arrow')return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5M9 5h10v10"/></svg>;
 if(type==='rectangle')return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>;
 if(type==='ellipse')return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>;
 if(type==='highlight')return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="16" height="10" rx="2" fill="currentColor" stroke="none" opacity=".3"/><rect x="4" y="7" width="16" height="10" rx="2"/></svg>;
 return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" strokeDasharray="2 2"/></svg>;
}

export function ClubElementsPanel({project:p,selected,playhead,change,select,onImport}:InspectorProps){
 const [query,setQuery]=useState(''),[open,setOpen]=useState(false);
 const element=p.elements.find(e=>e.id===selected);
 const needle=query.trim().toLowerCase(),shows=(label:string)=>!needle||label.toLowerCase().includes(needle);
 const addElement=(type:Element['type'])=>{const id=makeId(),start=playhead.get();change(p=>{p.elements.push(newElement(type,start,id));});select(id);};
 const update=(fn:(e:Element)=>void,key?:string)=>change(p=>{const e=p.elements.find(e=>e.id===selected);if(e)fn(e);},key?{coalesce:`element:${selected}:${key}`}:undefined);
 const remove=()=>change(p=>{p.elements=p.elements.filter(e=>e.id!==selected);});
 const textTile=shows('Text'),overlayTile=shows('New overlay'),annotations=ANNOTATIONS.filter(a=>shows(a.label)),none=!textTile&&!overlayTile&&!annotations.length;
 return <div className="br-panel el-panel">
  <div className="el-scroll">
   <div className="el-sticky"><div className="el-search"><Icon name="search" size={14} className="el-search-icon"/>
    <input aria-label="Search elements" placeholder="Search elements…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setQuery('');}}/>
    {query.length>0&&<button type="button" className="el-search-clear" aria-label="Clear search" onClick={()=>setQuery('')}><Icon name="close" size={12}/></button>}
   </div></div>
   {textTile&&<BrSection title="Text"><div className="el-grid-2"><button type="button" className="el-tile" title="Add text to the canvas" aria-label="Add text" onClick={()=>addElement('text')}><span className="el-tile-aa" aria-hidden="true">Aa</span><span className="el-tile-label">Text</span></button></div></BrSection>}
   {overlayTile&&<BrSection title="Overlays"><div className="el-grid-2"><button type="button" className="el-new-overlay" title="Add image, video, or animated GIFs to your canvas" onClick={()=>onImport('overlay')}><Icon name="image" size={16}/><span>New overlay</span></button></div></BrSection>}
   {annotations.length>0&&<BrSection title="Annotations"><div className="el-grid-4">{annotations.map(a=><button key={a.type} type="button" className="el-annot" aria-label={`Add ${a.label.toLowerCase()}`} title={`Add ${a.label.toLowerCase()} to the canvas`} onClick={()=>addElement(a.type)}><Glyph type={a.type}/></button>)}</div></BrSection>}
   {none&&<p className="el-status" role="status">No matching elements. Try another search.</p>}
   {!needle&&p.elements.length>0&&<BrSection title="In this video"><div className="el-list">{p.elements.map(e=><button key={e.id} type="button" className="el-row" aria-pressed={e.id===selected} onClick={()=>select(e.id)}><b>{rulerLabel(e.start)}</b><span>{e.type==='text'&&e.text?e.text:TYPE_LABEL[e.type]}</span></button>)}</div></BrSection>}
  </div>
  {element&&<BrDrawer open={open} onToggle={()=>setOpen(v=>!v)} openLabel="Element properties"><ElementProperties element={element} update={update} remove={remove}/></BrDrawer>}
 </div>;
}

/** The Properties drawer's groups for one element. A control shows only where the renderer draws it: Background for text and
 * highlights, Typography for text, Rotation and Opacity everywhere but blur (the export ignores both on a blur region). */
function ElementProperties({element,update,remove}:{element:Element;update:(fn:(e:Element)=>void,key?:string)=>void;remove:()=>void}){
 const type=element.type,isText=type==='text',coloured=type!=='blur',moves=type!=='blur',filled=isText||type==='highlight';
 const fillOn=isVisibleColour(element.background),fillDefault=newElement(type,0).background;
 const colourLabel=isText?'Text color':'Color',fillName=isText?'Background':'Fill';
 return <div className="el-props">
  {isText&&<BrGroup title="Content"><textarea aria-label="Element text" className="el-textarea" placeholder="Text" rows={3} value={element.text} onChange={event=>update(e=>{e.text=event.target.value;},'text')}/></BrGroup>}
  <BrGroup title="Size & Position">
   {GEOMETRY.map(([key,label])=><BrSub key={key} title={label} secondary={`${Math.round(element[key]*1000)/10}%`}><BrSlider value={element[key]*100} min={0} max={100} step={.1} label={label} onChange={v=>update(e=>{e[key]=v/100;},key)}/></BrSub>)}
   {moves&&<BrSub title="Rotation" secondary={`${Math.round(element.rotation)}°`}><BrSlider value={element.rotation} min={-180} max={180} step={1} label="Rotation" onChange={v=>update(e=>{e.rotation=v;},'rotation')}/></BrSub>}
   {moves&&<BrSub title="Opacity" secondary={`${Math.round(element.opacity*100)}%`}><BrSlider value={element.opacity*100} min={0} max={100} step={1} label="Opacity" onChange={v=>update(e=>{e.opacity=v/100;},'opacity')}/></BrSub>}
  </BrGroup>
  {isText&&<BrGroup title="Typography"><BrSub title="Text size" secondary={String(element.fontSize)}><BrSlider value={element.fontSize} min={8} max={400} step={1} label="Text size" onChange={v=>update(e=>{e.fontSize=v;},'fontSize')}/></BrSub></BrGroup>}
  {coloured&&<BrGroup title="Colors"><BrSub title={colourLabel}><BrColorField label={colourLabel} value={element.color} onChange={v=>update(e=>{e.color=keepAlpha(v,e.color);},'color')}/></BrSub></BrGroup>}
  {filled&&<BrGroup title={fillName}>
   <BrToggleRow label={fillName} checked={fillOn} onChange={on=>update(e=>{e.background=on?fillDefault:'transparent';})}/>
   {fillOn&&<BrSub title={`${fillName} color`}><BrColorField label={`${fillName} color`} value={element.background} onChange={v=>update(e=>{e.background=keepAlpha(v,e.background);},'background')}/></BrSub>}
  </BrGroup>}
  <BrGroup title="Timing"><div className="el-field-pair">
   <BrNumberField label="Start (seconds)" value={element.start} min={0} onChange={v=>update(e=>{e.start=v;},'start')}/>
   <BrNumberField label="Duration (seconds)" value={element.duration} min={.1} onChange={v=>update(e=>{e.duration=v;},'duration')}/>
  </div></BrGroup>
  <button type="button" className="el-delete" onClick={remove}><Icon name="delete" size={14}/>Delete element</button>
 </div>;
}
