import {useState} from 'react';
import type {InspectorProps} from '../../Inspector';
import type {Caption,CaptionStyle} from '../../../shared/types';
import {makeId} from '../../../shared/types';
import {rulerLabel} from '../../timeline-edit';
import {CAPTION_CARD_SCALE,CAPTION_PRESETS,captionSample,currentPreset} from '../../CaptionPresets';
import {Icon} from '../ui/icons';
import {BrColorField,BrDrawer,BrEmpty,BrGroup,BrSection,BrSlider,BrSub,BrTabs,BrToggleRow} from './br';
import {BrNumberField,isVisibleColour,keepAlpha} from './ElementsPanel';

/*
  The club's Captions panel, built to Borumi's Captions panel (spec-edit-step.md, e7). The look cards are the saved caption looks;
  the groups below them are Borumi's Properties drawer, kept in view because the look is one for the whole video. The drawer
  edits the selected caption. Borumi's All, Favorites and Built-in tabs, bold, italic, casing, highlight, outline, accent and
  paragraph-mode controls are left out: the caption model has no favourites and no such fields, and the renderer does not draw them.
*/

const POSITIONS:ReadonlyArray<{value:CaptionStyle['position'];label:string}>=[{value:'top',label:'Top'},{value:'center',label:'Middle'},{value:'bottom',label:'Bottom'}];

export function ClubCaptionsPanel({project:p,selected,playhead,change,select,onAI}:InspectorProps){
 const [lines,setLines]=useState(''),[open,setOpen]=useState(false);
 const caption=p.captions.find(c=>c.id===selected),style=p.captionStyle,chosen=currentPreset(style),visible=isVisibleColour(style.background);
 const setStyle=(fn:(s:CaptionStyle)=>void,key?:string)=>change(p=>{fn(p.captionStyle);},key?{coalesce:`captionStyle.${key}`}:undefined);
 const pick=(next:CaptionStyle)=>change(p=>{p.captionStyle={...p.captionStyle,...next};});
 const updateCaption=(fn:(c:Caption)=>void,key?:string)=>change(p=>{const c=p.captions.find(c=>c.id===selected);if(c)fn(c);},key?{coalesce:`caption:${selected}:${key}`}:undefined);
 const addLines=()=>{const list=lines.split('\n').filter(s=>s.trim()),time=playhead.get();change(p=>{for(let i=0;i<list.length;i++)p.captions.push({id:makeId(),start:time+i*3,end:time+(i+1)*3,text:list[i]});});setLines('');};
 return <div className="br-panel el-panel">
  <div className="el-scroll">
   <BrSection title="Captions">
    <div className="cap-stack">
     <BrGroup title="Words">
      <BrEmpty text="Listens to the video and writes a caption for each line you say. You review them before they are added."/>
      <button type="button" className="br-btn el-full" onClick={()=>onAI('transcribe')}><Icon name="captions" size={15}/>{p.captions.length?'Generate captions again':'Generate captions'}</button>
      <BrToggleRow label="Show captions in video" checked={style.enabled} onChange={enabled=>setStyle(s=>{s.enabled=enabled;})}/>
     </BrGroup>
     <BrSub title="Style">
      <div className="cap-grid" role="radiogroup" aria-label="Caption style">
       <button type="button" role="radio" aria-checked={chosen==='none'} className={`cap-card is-none${chosen==='none'?' on':''}`} onClick={()=>pick({...style,enabled:false})}><span>No captions</span></button>
       {CAPTION_PRESETS.map(preset=>{const s=preset.style;return <button key={preset.id} type="button" role="radio" aria-checked={chosen===preset.id} aria-label={preset.name} title={preset.name} className={`cap-card is-${s.position}${chosen===preset.id?' on':''}`} onClick={()=>pick({...s,enabled:true})}>
        <span className="cap-sample" style={{color:s.color,background:s.background,fontSize:Math.max(11,Math.round(s.fontSize*CAPTION_CARD_SCALE))}}>{captionSample(s.maxWords)}</span>
       </button>;})}
      </div>
     </BrSub>
     <BrGroup title="Typography">
      <BrSub title="Text size" secondary={String(style.fontSize)}><BrSlider value={style.fontSize} min={10} max={300} step={1} label="Text size" onChange={v=>setStyle(s=>{s.fontSize=v;},'fontSize')}/></BrSub>
      <BrSub title="Text color"><BrColorField label="Text color" value={style.color} onChange={v=>setStyle(s=>{s.color=v;},'color')}/></BrSub>
     </BrGroup>
     <BrGroup title="Background">
      <BrToggleRow label="Background" checked={visible} onChange={on=>setStyle(s=>{s.background=on?CAPTION_PRESETS[0].style.background:'transparent';})}/>
      {visible&&<BrSub title="Background color"><BrColorField label="Background color" value={style.background} onChange={v=>setStyle(s=>{s.background=keepAlpha(v,s.background);},'background')}/></BrSub>}
     </BrGroup>
     <BrGroup title="Position">
      <BrTabs full value={style.position} items={POSITIONS} label="Caption position" onChange={position=>setStyle(s=>{s.position=position;})}/>
     </BrGroup>
     <BrGroup title="Add captions manually">
      <BrEmpty text="One line per caption. Each line begins where the last one ends."/>
      <textarea aria-label="Caption lines" className="el-textarea" placeholder="Paste your words here…" rows={3} value={lines} onChange={event=>setLines(event.target.value)}/>
      <button type="button" className="br-btn el-full" disabled={!lines.trim()} onClick={addLines}><Icon name="add" size={14}/>Add at playhead</button>
     </BrGroup>
     <BrGroup title={`${p.captions.length} captions`}>
      {!p.captions.length&&<BrEmpty text="No captions yet. Generate captions from speech or add one at the playhead."/>}
      {p.captions.slice(0,100).map(c=><button key={c.id} type="button" className="el-row" aria-pressed={c.id===selected} onClick={()=>select(c.id)}><b>{rulerLabel(c.start)}</b><span>{c.text}</span></button>)}
     </BrGroup>
    </div>
   </BrSection>
  </div>
  {caption&&<BrDrawer open={open} onToggle={()=>setOpen(v=>!v)} openLabel="Caption properties"><div className="el-props">
   <BrGroup title="Text"><textarea aria-label="Caption text" className="el-textarea" rows={3} value={caption.text} onChange={event=>updateCaption(c=>{c.text=event.target.value;},'text')}/></BrGroup>
   <BrGroup title="Timing"><div className="el-field-pair">
    <BrNumberField label="Starts at (seconds)" value={caption.start} min={0} onChange={v=>updateCaption(c=>{c.start=v;},'start')}/>
    <BrNumberField label="Ends at (seconds)" value={caption.end} min={0} onChange={v=>updateCaption(c=>{c.end=v;},'end')}/>
   </div></BrGroup>
   <button type="button" className="el-delete" onClick={()=>change(p=>{p.captions=p.captions.filter(c=>c.id!==selected);})}><Icon name="delete" size={14}/>Delete caption</button>
  </div></BrDrawer>}
 </div>;
}
