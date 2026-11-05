import {useState} from 'react';
import type {InspectorProps} from '../../Inspector';
import {BACKGROUND_SWATCHES} from '../../canvas-swatches';
import {BrColorField,BrEmpty,BrSection,BrSelect,BrShowMore,BrSlider,BrSub,BrTabs} from './br';

/** Borumi's Video Format tiles (`dT`, M:55943-56000), in its order. Fit screen is not offered: a video has one size here. */
const FORMATS=[
 {id:'landscape',label:'Landscape',ratio:'16:9',width:1920,height:1080},
 {id:'vertical',label:'Vertical',ratio:'9:16',width:1080,height:1920},
 {id:'square',label:'Square',ratio:'1:1',width:1080,height:1080},
 {id:'portrait',label:'Portrait',ratio:'4:5',width:1080,height:1350},
 {id:'photo',label:'Photo',ratio:'2:3',width:1200,height:1800},
] as const;
type FormatId=typeof FORMATS[number]['id'];
type Tile='custom'|FormatId;
/** Collapsed, Borumi shows these three; a preset outside them is shown first. */
const COLLAPSED:readonly FormatId[]=['landscape','vertical','square'];
const FRAME_RATES=[24,25,30,60];
/** Borumi's person glyph (`Fq`, M:56050): the video's own shape drawn at its aspect. */
const PERSON_BODY='M20 154V145.875C20 114.464 45.7437 89 77.5 89C109.256 89 135 114.464 135 145.875V154';
const PERSON_HEAD='M77.5 89C95.4489 89 110 74.2251 110 56C110 37.7746 95.4489 23 77.5 23C59.5507 23 45 37.7746 45 56C45 74.2251 59.5507 89 77.5 89Z';
const clampSize=(value:number)=>Math.round(Math.min(7680,Math.max(64,value))/2)*2;

/** The Canvas panel of the club's Edit, in Borumi's form (spec-edit-step.md, e1). */
export function ClubCanvasPanel({project:p,change}:InspectorProps){
 const [expanded,setExpanded]=useState(false),[customOpen,setCustomOpen]=useState(false);
 const {width,height,fps,background,padding,radius}=p.canvas,dots=p.canvas.backgroundPattern==='moving-dots';
 const current:Tile=FORMATS.find(f=>f.width===width&&f.height===height)?.id??'custom';
 const collapsed:readonly Tile[]=current==='custom'?['custom','landscape','vertical']:COLLAPSED.includes(current as FormatId)?COLLAPSED:[current,'landscape','vertical'];
 const shown:readonly Tile[]=expanded?[...FORMATS.map(f=>f.id),'custom']:collapsed;
 const setSize=(w:number,h:number)=>{setCustomOpen(false);change(d=>{d.canvas.width=w;d.canvas.height=h;});};
 const tile=(id:Tile)=>{
  if(id==='custom')return <button key={id} type="button" className="br-tile canvas-tile" aria-pressed={current==='custom'} aria-label="Custom" onClick={()=>setCustomOpen(true)}>
   <span className="canvas-tile-art"><span className="canvas-aspect canvas-aspect-custom" style={{width:20,height:20}}/></span>
   <span className="canvas-tile-label">Custom</span>
   {current==='custom'&&<span className="canvas-tile-sub is-long">{`${width} x ${height}`}</span>}
  </button>;
  const f=FORMATS.find(x=>x.id===id)!,scale=Math.min(25/f.width,25/f.height);
  return <button key={id} type="button" className="br-tile canvas-tile" aria-pressed={current===id} aria-label={f.label} onClick={()=>setSize(f.width,f.height)}>
   <span className="canvas-tile-art"><span className="canvas-aspect" style={{width:f.width*scale,height:f.height*scale}}><svg className="canvas-person" width="15" height="15" viewBox="0 0 154 154" fill="none" aria-hidden="true"><path d={PERSON_BODY} fill="currentColor"/><path d={PERSON_HEAD} fill="currentColor"/></svg></span></span>
   <span className="canvas-tile-label">{f.label}</span>
   <span className={`canvas-tile-sub${f.ratio.length>6?' is-long':''}`}>{f.ratio}</span>
  </button>;
 };
 const showCustom=current==='custom'||customOpen;
 return <div className="br-panel canvas-panel">
  <BrSection title="Video Format">
   <div className="canvas-format">
    <div className="canvas-tiles">{shown.map(tile)}</div>
    <BrShowMore open={expanded} onToggle={()=>setExpanded(v=>!v)}/>
    {showCustom&&<div className="canvas-size">
     <label className="canvas-field"><span>Width</span><input className="canvas-number" type="number" aria-label="Width" min={64} max={7680} step={2} value={width} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))change(d=>{d.canvas.width=clampSize(n);},{coalesce:'canvas.width'});}}/></label>
     <label className="canvas-field"><span>Height</span><input className="canvas-number" type="number" aria-label="Height" min={64} max={7680} step={2} value={height} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))change(d=>{d.canvas.height=clampSize(n);},{coalesce:'canvas.height'});}}/></label>
    </div>}
    <BrSub title="Frame rate"><BrSelect label="Frame rate" value={String(fps)} options={(FRAME_RATES.includes(fps)?FRAME_RATES:[...FRAME_RATES,fps]).map(v=>({value:String(v),label:`${v} fps`}))} onChange={v=>change(d=>{d.canvas.fps=Number(v);})}/></BrSub>
   </div>
  </BrSection>
  <BrSection title="Background">
   <div className="canvas-background">
    <BrTabs label="Background kind" full value={dots?'dots':'color'} items={[{value:'color',label:'Color'},{value:'dots',label:'Moving dots'}]} onChange={v=>change(d=>{if(v==='dots')d.canvas.backgroundPattern='moving-dots';else delete d.canvas.backgroundPattern;})}/>
    {dots&&<BrEmpty text="Slow diagonal motion behind your clips. Color changes the base."/>}
    <div className="canvas-color">
     <BrColorField label="Background color" value={background} onChange={v=>change(d=>{d.canvas.background=v;},{coalesce:'canvas.background'})}/>
     <div className="canvas-swatches" role="group" aria-label="Background swatches">{BACKGROUND_SWATCHES.map(color=><button key={color} type="button" className="canvas-swatch" aria-label={`Background ${color}`} title={color} style={{background:color}} onClick={()=>change(d=>{d.canvas.background=color;})}/>)}</div>
    </div>
    <div className="canvas-frame">
     <BrSub title="Padding" secondary={`${padding} px`}><BrSlider label="Padding" value={padding} min={0} max={240} step={1} onChange={v=>change(d=>{d.canvas.padding=v;},{coalesce:'canvas.padding'})}/></BrSub>
     <BrSub title="Corner radius" secondary={`${radius} px`}><BrSlider label="Corner radius" value={radius} min={0} max={160} step={1} onChange={v=>change(d=>{d.canvas.radius=v;},{coalesce:'canvas.radius'})}/></BrSub>
    </div>
   </div>
  </BrSection>
 </div>;
}
