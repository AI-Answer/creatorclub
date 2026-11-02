import type {CSSProperties} from 'react';
import type {Clip,Project,Transform} from '../shared/types';
import {applyCreatorLayout,creatorCameraTransform,creatorScreenTransform} from '../shared/camera-style';
import type {Change} from './Inspector';

type Box=Pick<Transform,'x'|'y'|'width'|'height'>;
type Preset={name:string;camera:Box&{borderRadius?:number};screen:Box};

const FULL:Box={x:0,y:0,width:1,height:1};
/** The arrangements of camera and screen. Creator is the shared preset; the others place the camera over a full or narrowed screen. */
const presets=(p:Project):Preset[]=>[
 {name:'Creator',camera:creatorCameraTransform(p.canvas),screen:creatorScreenTransform(p.canvas)},
 {name:'Full frame',camera:{...FULL,borderRadius:0},screen:FULL},
 {name:'Picture in picture',camera:{x:.72,y:.63,width:.25,height:.32,borderRadius:28},screen:FULL},
 {name:'Side by side',camera:{x:.68,y:.05,width:.3,height:.9,borderRadius:24},screen:{...FULL,width:.66}},
 {name:'Camera spotlight',camera:{x:.18,y:.06,width:.64,height:.88,borderRadius:36},screen:FULL},
];

const near=(a:Box,b:Box)=>Math.abs(a.x-b.x)<.01&&Math.abs(a.y-b.y)<.01&&Math.abs(a.width-b.width)<.01&&Math.abs(a.height-b.height)<.01;
const first=(p:Project,track:Clip['track'])=>p.clips.filter(c=>c.track===track).sort((a,b)=>a.start-b.start)[0];

/** Which preset the video is in now, judged by its first camera clip; none once the camera was moved by hand. */
export function currentLayout(p:Project):string|null{
 const camera=first(p,'camera');
 if(!camera)return null;
 return presets(p).find(preset=>near(camera.transform,preset.camera))?.name??null;
}

/** Corner shapes for the camera, as a share of its shorter side. */
const SHAPES=[{name:'Square',r:0},{name:'Rounded',r:.12},{name:'Circle',r:.5}] as const;
const BACKGROUNDS=['#121212','#f2efe9','#e6f4ef','#c2d7ed','#ece8ff','#4e4367'];

/** A small picture of a preset, drawn with frames of this video so you see your own shot in each arrangement. */
function Preview({preset,cameraSrc,screenSrc,background}:{preset:Preset;cameraSrc?:string;screenSrc?:string;background:string}){
 const box=(b:Box,src:string|undefined,radius=0):CSSProperties=>({left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`,borderRadius:radius?6:0,backgroundImage:src?`url(${src})`:undefined});
 return <span className="lp-preview" style={{background}}>
  {screenSrc&&<i className="lp-screen" style={box(preset.screen,screenSrc)}/>}
  <i className="lp-camera" style={box(preset.camera,cameraSrc,preset.camera.borderRadius)}/>
 </span>;
}

/**
 * Layout in CreatorClub's Edit: the arrangements drawn with your own shot, the one in use marked, then the camera's corners and the
 * background. Exact placement is done on the picture itself (drag to move, a corner to resize), so there are no sliders here.
 */
export function LayoutPanel({project:p,change}:{project:Project;change:Change}){
 const camera=first(p,'camera'),screen=first(p,'screen');
 const thumb=(c?:Clip)=>c?`/api/media/${encodeURIComponent(c.mediaId)}/thumbnail`:undefined;
 const now=currentLayout(p);
 const apply=(preset:Preset)=>change(d=>{
  if(preset.name==='Creator'){applyCreatorLayout(d);return;}
  for(const c of d.clips){if(c.track==='screen')Object.assign(c.transform,preset.screen);if(c.track==='camera')Object.assign(c.transform,preset.camera);}
 });
 const side=camera?Math.min(camera.transform.width*p.canvas.width,camera.transform.height*p.canvas.height):0;
 const shape=camera?SHAPES.reduce((best,s)=>Math.abs(s.r*side-camera.transform.borderRadius)<Math.abs(best.r*side-camera.transform.borderRadius)?s:best,SHAPES[0]).name:null;
 const setShape=(r:number)=>change(d=>{for(const c of d.clips)if(c.track==='camera')c.transform.borderRadius=Math.round(r*Math.min(c.transform.width*d.canvas.width,c.transform.height*d.canvas.height));});
 return <div className="layout-panel">
  <section className="lp-section">
   <div className="lp-grid">{presets(p).map(preset=><button key={preset.name} type="button" className={`lp-card${now===preset.name?' on':''}`} aria-pressed={now===preset.name} onClick={()=>apply(preset)}>
    <Preview preset={preset} cameraSrc={thumb(camera)} screenSrc={thumb(screen)} background={p.canvas.background}/>
    <span className="lp-name">{preset.name}</span>
   </button>)}</div>
   <p className="lp-hint">{now?'':'Your own arrangement. '}Drag the camera on the picture to move it, or a corner to resize it.</p>
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
