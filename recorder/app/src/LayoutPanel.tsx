import {useState,type CSSProperties} from 'react';
import {makeId,type Clip,type LayoutPreset,type Project,type Transform} from '../shared/types';
import {baseLayout,chooseLayout,chosenLayouts,followsLayout,LAYOUT_PRESETS,layoutAt,layoutGeometry,layoutTransform,type LayoutGeometry} from '../shared/layouts';
import {creatorShadow} from '../shared/camera-style';
import {usePlayheadSelector,type Playhead} from './playhead';
import type {Change} from './Inspector';
import {BrColorField,BrDrawer,BrEmpty,BrGroup,BrSection,BrSlider,BrSub,BrTabs,BrToggleRow,BrWarning} from './club/edit-panels/br';

type Box=Pick<Transform,'x'|'y'|'width'|'height'>;
const first=(p:Project,track:Clip['track'])=>p.clips.filter(c=>c.track===track).sort((a,b)=>a.start-b.start)[0];

/** A small picture of a preset, drawn with frames of this video so you see your own shot in each arrangement. */
function Picture({preset,canvas,cameraSrc,screenSrc}:{preset:LayoutPreset;canvas:Project['canvas'];cameraSrc?:string;screenSrc?:string}){
 const g:LayoutGeometry=layoutGeometry(preset,canvas);
 const box=(b:Box&Partial<Transform>,src?:string):CSSProperties=>{
  const r=b.borderRadius??0;
  return {left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`,borderRadius:r?`${r/(b.width*canvas.width)*100}% / ${r/(b.height*canvas.height)*100}%`:undefined,backgroundImage:src?`url(${src})`:undefined};
 };
 return <span className="layout-picture" style={{background:canvas.background}}>
  <i className="layout-screen" style={box(g.screen,screenSrc)}/>
  <i className="layout-camera" style={box(g.camera,cameraSrc)}/>
 </span>;
}

/**
 * Layout in CreatorClub's Edit, in Borumi's form (spec-edit-step.md, e2): choosing an arrangement changes the selected Layout stretch,
 * else the one at the playhead, else starts a stretch at the playhead that runs to the next change. The Properties drawer edits the
 * selected camera and screen clips: their place outside a stretch, the camera's corners, shadow, background removal and face centering.
 */
export function LayoutPanel({project:p,change,playhead,selected,selectedIds,select}:{project:Project;change:Change;playhead:Playhead;selected:string|null;selectedIds?:ReadonlySet<string>;select:(id:string)=>void}){
 const [category,setCategory]=useState<'all'|'project'>('all'),[open,setOpen]=useState(false);
 const camera=first(p,'camera'),screen=first(p,'screen');
 const thumb=(c?:Clip)=>c?`/api/media/${encodeURIComponent(c.mediaId)}/thumbnail`:undefined;
 // The stretch at the playhead decides what is marked, so the panel follows the playhead from stretch to stretch.
 usePlayheadSelector(playhead,time=>layoutAt(p,time)?.id??'');
 const picked=selectedIds??new Set(selected?[selected]:[]),stretches=chosenLayouts(p,picked,playhead.get()),stretch=stretches[0];
 const now=stretch?.preset??baseLayout(p);
 const used=new Set((p.layouts??[]).map(l=>l.preset));
 const presets=category==='project'?LAYOUT_PRESETS.filter(preset=>used.has(preset)):LAYOUT_PRESETS;
 const apply=(preset:LayoutPreset)=>{let made:string[]=[];const time=playhead.get(),id=makeId();change(d=>{made=chooseLayout(d,preset,picked,time,id);});if(made.length===1&&made[0]!==stretch?.id)select(made[0]);};
 return <div className="br-panel layout-panel">
  <div className="layout-scroll">
   <BrSection title="Layout">
    <div className="layout-tabs"><BrTabs label="Layout category" full value={category} items={[{value:'all',label:'All',tip:'Show all layouts'},{value:'project',label:'Project',tip:'Only show layouts used in the current project'}]} onChange={v=>setCategory(v)}/></div>
    <div className={`layout-grid${p.canvas.width<p.canvas.height?' is-portrait':''}`} role="group" aria-label="Layouts">{presets.map(preset=><button key={preset} type="button" className={`layout-tile${now===preset?' is-selected':''}`} aria-label={preset} aria-pressed={now===preset} title={preset} style={{aspectRatio:`${p.canvas.width} / ${p.canvas.height}`}} onClick={()=>apply(preset)}>
     <Picture preset={preset} canvas={p.canvas} cameraSrc={thumb(camera)} screenSrc={thumb(screen)}/>
    </button>)}</div>
    {!presets.length&&<BrEmpty text="No layout is used in this video yet."/>}
    <BrEmpty className="layout-hint" text={stretch?'Changes the Layout stretch marked on the timeline. Drag its edges there to choose when it starts and ends.':'Starts a Layout stretch at the playhead that runs to the next change. Outside a stretch, drag the camera on the picture to move it, or a corner to resize it.'}/>
   </BrSection>
  </div>
  <BrDrawer open={open} onToggle={()=>setOpen(v=>!v)} openLabel="Layout properties">
   <Properties p={p} change={change} playhead={playhead} picked={picked} stretches={stretches} camera={camera}/>
  </BrDrawer>
 </div>;
}

/** The drawer's body: one card per selected camera or screen clip, or for the camera alone when a stretch is chosen with no clip. */
function Properties({p,change,playhead,picked,stretches,camera}:{p:Project;change:Change;playhead:Playhead;picked:ReadonlySet<string>;stretches:ReturnType<typeof chosenLayouts>;camera?:Clip}){
 const layers=p.clips.filter(c=>(c.track==='camera'||c.track==='screen')&&picked.has(c.id));
 const targets=layers.length?layers:stretches.length&&camera?[camera]:[];
 if(!targets.length)return <BrEmpty className="layout-empty" text="Select a clip to edit its properties."/>;
 const time=stretches[0]?stretches[0].start:playhead.get();
 return <div className="layout-cards">{targets.map(clip=><LayerCard key={clip.id} p={p} clip={clip} change={change} time={time} picked={picked} inStretch={stretches.length>0&&followsLayout(clip)}/>)}</div>;
}

function LayerCard({p,clip,change,time,picked,inStretch}:{p:Project;clip:Clip;change:Change;time:number;picked:ReadonlySet<string>;inStretch:boolean}){
 const W=p.canvas.width,H=p.canvas.height,t=layoutTransform(p,clip,time),isCamera=clip.track==='camera';
 const edit=(fn:(c:Clip)=>void,key?:string)=>change(d=>{const c=d.clips.find(x=>x.id===clip.id);if(c)fn(c);},key?{coalesce:`layout:${clip.id}:${key}`}:undefined);
 const axes=[['X','x',W],['Y','y',H],['Width','width',W],['Height','height',H]] as const;
 // Inside a stretch the preset sets the place, so only the camera's corners can be changed there (a stretch stores no screen corners).
 const side=Math.min(t.width*W,t.height*H),radiusMax=inStretch?Math.floor(side/2):Math.min(W,H);
 const setRadius=(px:number)=>{
  if(!inStretch)return edit(c=>{c.transform.borderRadius=px;},'borderRadius');
  if(!isCamera)return;
  change(d=>{for(const s of chosenLayouts(d,picked,time)){const g=layoutGeometry(s.preset,d.canvas).camera,span=Math.min(g.width*d.canvas.width,g.height*d.canvas.height);s.cameraCorner=span>0?Math.min(.5,Math.max(0,px/span)):0;}},{coalesce:`layout:stretch:${clip.id}:radius`});
 };
 const shadow=clip.transform.shadow,limit=Math.max(1,Math.min(W,H));
 const opacity=shadow&&shadow.color.length>=9?parseInt(shadow.color.slice(7,9),16)/255*100:100;
 return <BrSection title={clip.name}>
  <div className="br-groups">
   {inStretch&&<BrWarning>A Layout stretch sets this clip's place. Move the playhead outside it to edit the position here.</BrWarning>}
   <BrGroup title="Size & position">
    {axes.map(([label,key,max])=><BrSub key={key} title={label} secondary={`${Math.round(t[key]*max)} px`}><BrSlider label={label} value={Math.round(t[key]*max)} min={key==='width'||key==='height'?1:0} max={max} step={1} disabled={inStretch} onChange={v=>edit(c=>{c.transform[key]=v/max;},`transform.${key}`)}/></BrSub>)}
    <BrSub title="Border radius" secondary={`${Math.round(t.borderRadius)} px`}><BrSlider label="Border radius" value={Math.min(Math.round(t.borderRadius),radiusMax)} min={0} max={radiusMax} step={1} disabled={inStretch&&!isCamera} onChange={setRadius}/></BrSub>
   </BrGroup>
   <BrGroup title="Shadow">
    <BrToggleRow label="Shadow" checked={!!shadow} onChange={v=>change(d=>{const c=d.clips.find(x=>x.id===clip.id);if(!c)return;if(v)c.transform.shadow=creatorShadow(d.canvas);else delete c.transform.shadow;})}/>
    {shadow&&[
     <BrSub key="color" title="Shadow color"><BrColorField label="Shadow color" value={shadow.color.slice(0,7)} onChange={v=>edit(c=>{if(c.transform.shadow)c.transform.shadow.color=v+c.transform.shadow.color.slice(7,9);},'shadow.color')}/></BrSub>,
     <BrSub key="opacity" title="Shadow opacity" secondary={`${Math.round(opacity)}%`}><BrSlider label="Shadow opacity" value={Math.round(opacity)} min={0} max={100} step={1} onChange={v=>edit(c=>{if(c.transform.shadow)c.transform.shadow.color=c.transform.shadow.color.slice(0,7)+Math.round(v*255/100).toString(16).padStart(2,'0');},'shadow.opacity')}/></BrSub>,
     <BrSub key="blur" title="Blur" secondary={`${shadow.blur} px`}><BrSlider label="Shadow blur" value={shadow.blur} min={0} max={Math.min(1000,limit)} step={1} onChange={v=>edit(c=>{if(c.transform.shadow)c.transform.shadow.blur=v;},'shadow.blur')}/></BrSub>,
     ...(['x','y'] as const).map(key=><BrSub key={key} title={`${key.toUpperCase()} offset`} secondary={`${shadow[key]} px`}><BrSlider label={`Shadow ${key.toUpperCase()}`} value={shadow[key]} min={-limit} max={limit} step={1} onChange={v=>edit(c=>{if(c.transform.shadow)c.transform.shadow[key]=v;},`shadow.${key}`)}/></BrSub>),
    ]}
   </BrGroup>
   {isCamera&&<BrGroup title="Remove background">
    <BrToggleRow label="Remove background" checked={clip.effects.background==='remove'} onChange={v=>edit(c=>{c.effects.background=v?'remove':'none';})}/>
   </BrGroup>}
   {isCamera&&<BrGroup title="Face centering">
    <BrToggleRow label="Face centering" checked={Boolean(clip.effects.faceCenter)} onChange={v=>edit(c=>{c.effects.faceCenter=v;})}/>
   </BrGroup>}
  </div>
 </BrSection>;
}
