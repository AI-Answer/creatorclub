import {useState} from 'react';
import type {Clip,Project} from '../shared/types';
import {clipDuration} from '../shared/types';
import {takePackageActions,takeSourceName,takeSourceState,unlinkTakeAction} from './take-package-actions';
import {applyClipStarts,collides,ensureLinks,isLinked,linkedIds,rowItems,takeSyncOffset,trimClips} from './timeline-edit';
import {Camera,ChevronDown,Mic,Monitor} from './Icons';
import {Field,NumberField,Slider,Toggle} from './Inspector';

type Change=(fn:(p:Project)=>void,options?:{coalesce?:string})=>void;

/** Volume as Borumi shows it, in decibels: the clip's gain is a plain multiplier, so 1 is 0 dB. */
export const gainToDb=(gain:number)=>gain<=0?-Infinity:Math.round(20*Math.log10(gain)*10)/10;
export const dbToGain=(db:number)=>Math.round(10**(db/20)*1000)/1000;
const DB={min:-30,max:12};

/** The clips recorded together with `clip` (a take's camera, screen and microphone), itself first. */
export function takeOf(project:Pick<Project,'clips'>,clip:Clip):Clip[]{
 if(!clip.linkId)return [clip];
 return [clip,...project.clips.filter(other=>other.id!==clip.id&&other.linkId===clip.linkId)];
}

function Card({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode}){
 return <section className="inspector-section club-clip-card"><h3>{icon}{title}</h3>{children}</section>;
}
function Fold({title,children}:{title:string;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 return <section className={`inspector-section club-clip-card fold${open?' open':''}`}>
  <h3><button type="button" className="club-fold-h" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{title}<ChevronDown size={14}/></button></h3>
  {open&&children}
 </section>;
}

/**
 * Clip settings laid out like Borumi's: one card per source of the selected take (Microphone, Camera, Screen) with the few things
 * people change there, then timing and colour folded away. Each card edits its own clip, so a take selected as a whole can be set
 * in one place.
 */
export function ClubClipPanel({project:p,clip,change,onNotice}:{project:Project;clip:Clip;change:Change;onNotice?:(message:string)=>void}){
 const take=takeOf(p,clip);
 const mic=take.find(c=>c.track==='audio'||c.track==='music'),camera=take.find(c=>c.track==='camera'),screen=take.find(c=>c.track==='screen'||c.track==='overlay');
 const update=(id:string,fn:(c:Clip)=>void,key?:string)=>change(project=>{const c=project.clips.find(each=>each.id===id);if(c)fn(c);},key?{coalesce:`clip:${id}:${key}`}:undefined);
 const timing=(kind:'start'|'sourceIn'|'sourceOut',value:number)=>{let notice='';change(d=>{const c=d.clips.find(c=>c.id===clip.id);if(!c)return;ensureLinks(d);const ids=linkedIds(d.clips,[c.id]);
  if(kind==='start'){const items=rowItems(d),delta=value-c.start;if(collides(items.filter(i=>ids.has(i.id)),delta,items)){notice='That position is occupied on a source lane.';return;}applyClipStarts(d,new Map([[c.id,value]]));}
  else trimClips(d,ids,kind==='sourceIn'?'left':'right',(value-c[kind])/c.speed,false);
 },{coalesce:`clip:${clip.id}:${kind}`});if(notice)onNotice?.(notice);};
 const db=mic?gainToDb(mic.gain):0;
 const recording=p.recordedTakes?.find(t=>t.id===clip.recordingTakeId),scene=p.scenes.find(s=>s.id===recording?.sceneId),siblings=p.clips.filter(c=>c.recordingTakeId&&c.recordingTakeId===clip.recordingTakeId&&c.id!==clip.id);
 const actions=takePackageActions(p,clip.id);if(isLinked(p.clips,clip.id))actions.push(unlinkTakeAction(clip.id));
 return <>
  {clip.recordingTakeId&&<section className="inspector-section club-clip-card club-take-info">
   <h3>Part of the {scene?.name??'recorded'} take</h3>
   <ul>{[clip,...siblings].map(c=>{const offset=takeSyncOffset(p,c.id);return <li key={c.id}>{takeSourceName(p,c)} · {takeSourceState(p,c)}{offset!==undefined&&Math.abs(offset)>.001?` (${offset>0?'+':''}${offset.toFixed(1)} s)`:''}</li>;})}</ul>
   <div className="club-take-actions">{actions.map(a=><button type="button" key={a.label} onClick={()=>{let message='';change(d=>{message=a.run(d).message;});onNotice?.(message);}}>{a.label}</button>)}</div>
  </section>}
  {mic&&<Card icon={<Mic size={15}/>} title="Microphone">
   <Slider label="Volume" suffix=" dB" value={Number.isFinite(db)?Math.max(DB.min,Math.min(DB.max,db)):DB.min} min={DB.min} max={DB.max} step={1} onChange={v=>update(mic.id,c=>{c.gain=dbToGain(v);},'gain')}/>
   <Toggle label="Remove noise" value={mic.effects.denoise} onChange={v=>update(mic.id,c=>{c.effects.denoise=v;})}/>
   <Toggle label="Level the voice" hint="Evens out loud and quiet parts on export." value={mic.effects.normalize} onChange={v=>update(mic.id,c=>{c.effects.normalize=v;})}/>
   <Toggle label="Mute" value={mic.muted} onChange={v=>update(mic.id,c=>{c.muted=v;})}/>
  </Card>}
  {camera&&<Card icon={<Camera size={15}/>} title="Camera">
   <Toggle label="Mirror" value={camera.effects.flipX} onChange={v=>update(camera.id,c=>{c.effects.flipX=v;})}/>
   <Toggle label="Face centering" hint="Keeps your face in the middle of the frame." value={Boolean(camera.effects.faceCenter)} onChange={v=>update(camera.id,c=>{c.effects.faceCenter=v;})}/>
   <Field label="Background"><select value={camera.effects.background??'none'} onChange={e=>update(camera.id,c=>{c.effects.background=e.target.value as 'none'|'remove'|'blur';})}><option value="none">Original</option><option value="blur">Blur</option><option value="remove">Remove</option></select></Field>
  </Card>}
  {screen&&!camera&&<Card icon={<Monitor size={15}/>} title="Screen">
   <Toggle label="Mirror" value={screen.effects.flipX} onChange={v=>update(screen.id,c=>{c.effects.flipX=v;})}/>
  </Card>}
  <Fold title="Timing">
   <NumberField label="Starts at (seconds)" value={clip.start} min={0} onChange={v=>timing('start',v)}/>
   <div className="field-pair"><NumberField label="Trim start (s)" value={clip.sourceIn} min={0} max={clip.sourceOut-.1} onChange={v=>timing('sourceIn',v)}/><NumberField label="Trim end (s)" value={clip.sourceOut} min={clip.sourceIn+.1} max={p.media.find(m=>m.id===clip.mediaId)?.duration||3600} onChange={v=>timing('sourceOut',v)}/></div>
   <Slider label="Speed" value={clip.speed} min={.25} max={4} step={.25} suffix="×" onChange={v=>update(clip.id,c=>{c.speed=v;},'speed')}/>
   {mic&&<div className="field-pair"><NumberField label="Fade in (s)" value={mic.effects.fadeIn} min={0} max={clipDuration(mic)/2} onChange={v=>update(mic.id,c=>{c.effects.fadeIn=v;},'fadeIn')}/><NumberField label="Fade out (s)" value={mic.effects.fadeOut} min={0} max={clipDuration(mic)/2} onChange={v=>update(mic.id,c=>{c.effects.fadeOut=v;},'fadeOut')}/></div>}
  </Fold>
  {(camera??screen)&&<Fold title="Color">{(()=>{const target=(camera??screen)!;return <>
   <Slider label="Exposure" value={target.effects.brightness} min={-.9} max={1} onChange={v=>update(target.id,c=>{c.effects.brightness=v;},'brightness')}/>
   <Slider label="Contrast" value={target.effects.contrast} min={0} max={3} onChange={v=>update(target.id,c=>{c.effects.contrast=v;},'contrast')}/>
   <Slider label="Saturation" value={target.effects.saturation} min={0} max={3} onChange={v=>update(target.id,c=>{c.effects.saturation=v;},'saturation')}/>
   <Toggle label="Black and white" value={target.effects.grayscale} onChange={v=>update(target.id,c=>{c.effects.grayscale=v;})}/>
  </>;})()}</Fold>}
 </>;
}
