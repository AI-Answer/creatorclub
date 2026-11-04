import type {CSSProperties} from 'react';
import {makeId,type Clip,type LayoutPreset,type Project,type Transform} from '../shared/types';
import {baseLayout,chooseLayout,chosenLayouts,LAYOUT_PRESETS,layoutAt,layoutGeometry,layoutTransform,type LayoutGeometry} from '../shared/layouts';
import {usePlayheadSelector,type Playhead} from './playhead';
import type {Change} from './Inspector';

type Box=Pick<Transform,'x'|'y'|'width'|'height'>;
const first=(p:Project,track:Clip['track'])=>p.clips.filter(c=>c.track===track).sort((a,b)=>a.start-b.start)[0];

/** Corner shapes for the camera, as a share of its shorter side. */
const SHAPES=[{name:'Square',r:0},{name:'Rounded',r:.12},{name:'Circle',r:.5}] as const;
const BACKGROUNDS=['#121212','#f2efe9','#e6f4ef','#c2d7ed','#ece8ff','#4e4367'];

/** A small picture of a preset, drawn with frames of this video so you see your own shot in each arrangement. */
function Preview({preset,cameraSrc,screenSrc,background}:{preset:LayoutGeometry;cameraSrc?:string;screenSrc?:string;background:string}){
 const box=(b:Box,src:string|undefined,radius=0):CSSProperties=>({left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`,borderRadius:radius?6:0,backgroundImage:src?`url(${src})`:undefined});
 return <span className="lp-preview" style={{background}}>
  {screenSrc&&<i className="lp-screen" style={box(preset.screen,screenSrc)}/>}
  <i className="lp-camera" style={box(preset.camera,cameraSrc,preset.camera.borderRadius)}/>
 </span>;
}

/**
 * Layout in CreatorClub's Edit, as Borumi's: choosing an arrangement changes the selected Layout stretch, else the one at the playhead,
 * else starts a stretch at the playhead that runs to the next change (the orange Layout row of the timeline). Then the camera's corners
 * and the background. Outside a stretch, exact placement is done on the picture itself (drag to move, a corner to resize).
 */
export function LayoutPanel({project:p,change,playhead,selected,selectedIds,select}:{project:Project;change:Change;playhead:Playhead;selected:string|null;selectedIds?:ReadonlySet<string>;select:(id:string)=>void}){
 const camera=first(p,'camera'),screen=first(p,'screen');
 const thumb=(c?:Clip)=>c?`/api/media/${encodeURIComponent(c.mediaId)}/thumbnail`:undefined;
 // The stretch at the playhead decides what is marked, so the panel follows the playhead from stretch to stretch.
 usePlayheadSelector(playhead,time=>layoutAt(p,time)?.id??'');
 const picked=selectedIds??new Set(selected?[selected]:[]),stretch=chosenLayouts(p,picked,playhead.get())[0];
 const now=stretch?.preset??baseLayout(p);
 const apply=(preset:LayoutPreset)=>{let made:string[]=[];const time=playhead.get(),id=makeId();change(d=>{made=chooseLayout(d,preset,picked,time,id);});if(made.length===1&&made[0]!==stretch?.id)select(made[0]);};
 const transform=camera?layoutTransform(p,camera,stretch?stretch.start:playhead.get()):undefined;
 const side=transform?Math.min(transform.width*p.canvas.width,transform.height*p.canvas.height):0;
 const shape=transform?SHAPES.reduce((best,s)=>Math.abs(s.r*side-transform.borderRadius)<Math.abs(best.r*side-transform.borderRadius)?s:best,SHAPES[0]).name:null;
 const setShape=(r:number)=>{const time=playhead.get();change(d=>{const stretches=chosenLayouts(d,picked,time);if(stretches.length){for(const l of stretches)l.cameraCorner=r;}else for(const c of d.clips)if(c.track==='camera')c.transform.borderRadius=Math.round(r*Math.min(c.transform.width*d.canvas.width,c.transform.height*d.canvas.height));});};
 return <div className="layout-panel">
  <section className="lp-section">
   <div className="lp-grid">{LAYOUT_PRESETS.map(preset=><button key={preset} type="button" className={`lp-card${now===preset?' on':''}`} aria-pressed={now===preset} onClick={()=>apply(preset)}>
    <Preview preset={layoutGeometry(preset,p.canvas)} cameraSrc={thumb(camera)} screenSrc={thumb(screen)} background={p.canvas.background}/>
    <span className="lp-name">{preset}</span>
   </button>)}</div>
   <p className="lp-hint">{stretch?'Changes the Layout stretch marked on the timeline. Drag its edges there to choose when it starts and ends.':'Starts a Layout stretch at the playhead that runs to the next change. Outside a stretch, drag the camera on the picture to move it, or a corner to resize it.'}</p>
  </section>
  {camera&&<section className="lp-section">
   <h4>Camera corners</h4>
   <div className="lp-seg" role="group" aria-label="Camera corners">{SHAPES.map(s=><button key={s.name} type="button" aria-pressed={shape===s.name} onClick={()=>setShape(s.r)}>{s.name}</button>)}</div>
  </section>}
  <section className="lp-section">
   <h4>Background</h4>
   <div className="lp-swatches" role="group" aria-label="Background">{BACKGROUNDS.map(color=><button key={color} type="button" aria-label={`Background ${color}`} aria-pressed={p.canvas.background.toLowerCase()===color} style={{background:color}} onClick={()=>change(d=>{d.canvas.background=color;})}/>)}</div>
  </section>
 </div>;
}
