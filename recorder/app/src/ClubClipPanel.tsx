import {useState} from 'react';
import type {Clip,Project} from '../shared/types';
import {CLIP_GAIN_MAX_DB,NOISE_ON,clipDuration,noiseStrength,setNoiseStrength,setVoiceLevel,voiceLevel,type VoiceLevel} from '../shared/types';
import {takePackageActions,takeSourceName,takeSourceState,unlinkTakeAction} from './take-package-actions';
import {applyClipStarts,collides,ensureLinks,isLinked,linkedIds,rowItems,takeSyncOffset,trimClips} from './timeline-edit';
import {Camera,ChevronDown,Mic} from './Icons';
import {NumberField} from './Inspector';
import {BrEmpty,BrGroup,BrSelect,BrSeparator,BrSlider,BrSub,BrSwitch,BrToggleRow} from './club/edit-panels/br';

type Change=(fn:(p:Project)=>void,options?:{coalesce?:string})=>void;
type Update=(id:string,fn:(c:Clip)=>void,key?:string)=>void;

/** Volume as Borumi shows it, in decibels: the clip's gain is a plain multiplier, so 1 is 0 dB. */
export const gainToDb=(gain:number)=>gain<=0?-Infinity:Math.round(20*Math.log10(gain)*10)/10;
export const dbToGain=(db:number)=>Math.round(10**(db/20)*1000)/1000;
const DB={min:-CLIP_GAIN_MAX_DB,max:CLIP_GAIN_MAX_DB};

/**
 * Borumi's breakpoint speed slider: the slider has one equal-width band per pair of breakpoints, and each band snaps to its own step.
 * Our breakpoints run from the slowest speed we keep (a quarter) to the export's 16x limit; Borumi's top of 100x has no export here.
 */
const SPEED_BREAKS=[.25,1,2,16],SPEED_STEPS=[.01,.01,.1];
export const SPEED_SLIDER_MAX=SPEED_BREAKS.length-1;
export function speedToPosition(speed:number):number{
 const value=Math.min(SPEED_BREAKS[SPEED_BREAKS.length-1],Math.max(SPEED_BREAKS[0],speed));
 for(let i=0;i<SPEED_BREAKS.length-1;i++){const from=SPEED_BREAKS[i],to=SPEED_BREAKS[i+1];if(value<=to)return i+(value-from)/(to-from);}
 return SPEED_SLIDER_MAX;
}
export function positionToSpeed(position:number):number{
 const at=Math.min(SPEED_SLIDER_MAX,Math.max(0,position)),band=Math.min(Math.floor(at),SPEED_SLIDER_MAX-1),from=SPEED_BREAKS[band],to=SPEED_BREAKS[band+1],step=SPEED_STEPS[band];
 const raw=from+(at-band)*(to-from),snapped=Math.round((raw-from)/step)*step+from;
 return Math.round(Math.min(to,Math.max(from,snapped))*100)/100;
}
const formatSpeed=(speed:number)=>`${Math.round(speed*100)/100}x`;

/** Enhance Voice: Borumi's three levels, with its descriptions (the select shows the one in use). */
const VOICE:Record<VoiceLevel,{label:string;text:string}>={
 disabled:{label:'Disabled',text:'Keep the original voice audio unchanged.'},
 minimal:{label:'Minimal',text:'Apply automatic level balancing and normalization.'},
 extended:{label:'Extended',text:'Add level balancing, normalization, EQ, and noise reduction.'},
};
const VOICE_OPTIONS=(Object.keys(VOICE) as VoiceLevel[]).map(value=>({value,label:VOICE[value].label}));
const BACKGROUND=[{value:'none',label:'None'},{value:'blur',label:'Blur'},{value:'remove',label:'Remove'}] as const;

const SpeakerIcon=<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>;
const ScreenIcon=<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M8 21h8"/></svg>;

/** The clips recorded together with `clip` (a take's camera, screen and microphone), itself first. */
export function takeOf(project:Pick<Project,'clips'>,clip:Clip):Clip[]{
 if(!clip.linkId)return [clip];
 return [clip,...project.clips.filter(other=>other.id!==clip.id&&other.linkId===clip.linkId)];
}
/** Which Borumi source group an audio clip belongs to. */
const audioRole=(clip:Clip)=>clip.track==='music'?'music':clip.audioRole==='system'?'system':'microphone';

/** Color adjustments of the camera, or of the screen when the take has no camera: Borumi's sub-sliders, each with Reset. */
function ColorControls({target,update}:{target:Clip;update:Update}){
 const fx=target.effects;
 const slider=(title:string,value:number,neutral:number,min:number,max:number,set:(c:Clip,value:number)=>void)=><BrSub title={title} action={<button type="button" className="br-link" disabled={value===neutral} onClick={()=>update(target.id,c=>set(c,neutral))}>Reset</button>}>
  <BrSlider label={title} value={value} min={min} max={max} step={.01} onChange={v=>update(target.id,c=>set(c,v),title.toLowerCase())}/>
 </BrSub>;
 return <div className="club-clip-stack">
  <BrSub title="Color adjustments" description="Adjust the color of the picture."/>
  {slider('Exposure',fx.brightness,0,-.9,1,(c,v)=>{c.effects.brightness=v;})}
  {slider('Contrast',fx.contrast,1,0,3,(c,v)=>{c.effects.contrast=v;})}
  {slider('Saturation',fx.saturation,1,0,3,(c,v)=>{c.effects.saturation=v;})}
  <BrToggleRow label="Black and white" checked={fx.grayscale} onChange={v=>update(target.id,c=>{c.effects.grayscale=v;})}/>
 </div>;
}

/** One audio source of the take: Enhance Voice, Volume and Remove Noise for a microphone; Volume for system audio and music. */
function AudioGroup({source,update}:{source:Clip;update:Update}){
 const role=audioRole(source),level=voiceLevel(source.effects),strength=noiseStrength(source.effects);
 const gain=gainToDb(source.gain),db=Number.isFinite(gain)?Math.max(DB.min,Math.min(DB.max,gain)):DB.min;
 const title=role==='microphone'?'Microphone':role==='system'?'System audio':'Music';
 return <BrGroup title={title} icon={role==='microphone'?<Mic size={12}/>:SpeakerIcon} id={role}>
  {role==='microphone'&&<BrSub title="Enhance Voice" description="Improve the quality of voice recordings automatically." action={<BrSelect compact className="club-clip-enhance" label="Enhance Voice" value={level} options={VOICE_OPTIONS} onChange={v=>update(source.id,c=>setVoiceLevel(c.effects,v))}/>}>
   <BrEmpty text={VOICE[level].text}/>
  </BrSub>}
  <BrSub title="Volume" secondary={`(${Math.round(db)} dB)`}>
   <BrSlider label="Volume" value={db} min={DB.min} max={DB.max} step={1} onChange={v=>update(source.id,c=>{c.gain=dbToGain(v);},'gain')}/>
  </BrSub>
  {role==='microphone'&&<BrSub title="Remove Noise" secondary={strength>0?`(${Math.round(strength*100)}%)`:undefined} description="Reduce the amount of noise in the selected clip." action={<BrSwitch label="Remove Noise" checked={strength>0} onChange={on=>update(source.id,c=>setNoiseStrength(c.effects,on?NOISE_ON:0))}/>}>
   {strength>0&&<>
    <BrSlider label="Remove Noise strength" value={strength} min={0} max={1} step={.01} onChange={v=>update(source.id,c=>setNoiseStrength(c.effects,v),'noise')}/>
    <div className="br-slider-labels"><span>Off</span><span>Max</span></div>
   </>}
  </BrSub>}
  <BrToggleRow label="Mute" checked={source.muted} onChange={v=>update(source.id,c=>{c.muted=v;})}/>
  {role==='microphone'&&<BrEmpty text="Noise removal and voice enhancement apply when you export."/>}
 </BrGroup>;
}

/** Start, trims and (for a microphone) fades, folded like Borumi's groups. */
function TimingGroup({clip,fade,duration,timing,update}:{clip:Clip;fade?:Clip;duration:number;timing:(kind:'start'|'sourceIn'|'sourceOut',value:number)=>void;update:Update}){
 const [open,setOpen]=useState(true);
 return <div className="br-group club-clip-timing" data-clip-control-group="timing">
  <div className="br-group-head"><button type="button" className="club-clip-fold" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><span>Timing</span><ChevronDown size={12}/></button></div>
  {open&&<div className="br-group-rows">
   <div className="br-group-row is-first"><NumberField label="Start" value={clip.start} min={0} onChange={v=>timing('start',v)}/></div>
   <div className="br-group-row"><div className="field-pair">
    <NumberField label="Trim in" value={clip.sourceIn} min={0} max={clip.sourceOut-.1} onChange={v=>timing('sourceIn',v)}/>
    <NumberField label="Trim out" value={clip.sourceOut} min={clip.sourceIn+.1} max={duration} onChange={v=>timing('sourceOut',v)}/>
   </div></div>
   {fade&&<div className="br-group-row"><div className="field-pair">
    <NumberField label="Fade in (s)" value={fade.effects.fadeIn} min={0} max={clipDuration(fade)/2} onChange={v=>update(fade.id,c=>{c.effects.fadeIn=v;},'fadeIn')}/>
    <NumberField label="Fade out (s)" value={fade.effects.fadeOut} min={0} max={clipDuration(fade)/2} onChange={v=>update(fade.id,c=>{c.effects.fadeOut=v;},'fadeOut')}/>
   </div></div>}
  </div>}
 </div>;
}

/**
 * Clip settings in Borumi's groups: one per source of the selected take (Microphone or System audio and Music, Camera, Screen), then
 * Timing and Speed. Each group edits its own clip, so a take selected as a whole can be set in one place.
 */
export function ClubClipPanel({project:p,clip,change,onNotice}:{project:Project;clip:Clip;change:Change;onNotice?:(message:string)=>void}){
 const take=takeOf(p,clip);
 const audio=take.filter(c=>c.track==='audio'||c.track==='music');
 const camera=take.find(c=>c.track==='camera'),screen=take.find(c=>c.track==='screen'||c.track==='overlay');
 const update:Update=(id,fn,key)=>change(project=>{const c=project.clips.find(each=>each.id===id);if(c)fn(c);},key?{coalesce:`clip:${id}:${key}`}:undefined);
 const timing=(kind:'start'|'sourceIn'|'sourceOut',value:number)=>{let notice='';change(d=>{const c=d.clips.find(c=>c.id===clip.id);if(!c)return;ensureLinks(d);const ids=linkedIds(d.clips,[c.id]);
  if(kind==='start'){const items=rowItems(d),delta=value-c.start;if(collides(items.filter(i=>ids.has(i.id)),delta,items)){notice='That position is occupied on a source lane.';return;}applyClipStarts(d,new Map([[c.id,value]]));}
  else trimClips(d,ids,kind==='sourceIn'?'left':'right',(value-c[kind])/c.speed,false);
 },{coalesce:`clip:${clip.id}:${kind}`});if(notice)onNotice?.(notice);};
 const recording=p.recordedTakes?.find(t=>t.id===clip.recordingTakeId),scene=p.scenes.find(s=>s.id===recording?.sceneId),siblings=p.clips.filter(c=>c.recordingTakeId&&c.recordingTakeId===clip.recordingTakeId&&c.id!==clip.id);
 const actions=takePackageActions(p,clip.id);if(isLinked(p.clips,clip.id))actions.push(unlinkTakeAction(clip.id));
 const fade=audio.find(c=>audioRole(c)==='microphone');
 return <div className="br-panel is-card club-clip-panel"><div className="br-groups">
  {clip.recordingTakeId&&<div className="club-take-info"><BrGroup title={`Part of the ${scene?.name??'recorded'} take`}>
   {/* One line per source: a cut leaves a take in many pieces, and identical lines ("Camera · linked") are said once. */}
   <ul className="club-take-list">{[...new Set([clip,...siblings].map(c=>{const offset=takeSyncOffset(p,c.id),state=takeSourceState(p,c);return `${takeSourceName(p,c)}${state==='not linked to the camera'?', ':' · '}${state}${offset!==undefined&&Math.abs(offset)>.001?` (${offset>0?'+':''}${offset.toFixed(1)} s)`:''}`;}))].map(line=><li key={line}>{line}</li>)}</ul>
   <div className="club-take-actions">{actions.map(a=><button type="button" className="br-btn is-outline is-sm" key={a.label} onClick={()=>{let ok=true,message='';change(d=>{({ok,message}=a.run(d));});if(!ok)onNotice?.(message);}}>{a.label}</button>)}</div>
  </BrGroup></div>}
  {audio.map(source=><AudioGroup key={source.id} source={source} update={update}/>)}
  {camera&&<BrGroup title="Camera" icon={<Camera size={12}/>} id="camera">
   <BrSub title="Mirror" action={<BrSwitch label="Mirror" checked={camera.effects.flipX} onChange={v=>update(camera.id,c=>{c.effects.flipX=v;})}/>}/>
   <BrSub title="Face Centering" description="Automatically keeps the face centered in the canvas." action={<BrSwitch label="Face Centering" checked={Boolean(camera.effects.faceCenter)} onChange={v=>update(camera.id,c=>{c.effects.faceCenter=v;})}/>}/>
   <BrSub title="Background mode"><BrSelect label="Background mode" value={camera.effects.background??'none'} options={BACKGROUND} onChange={v=>update(camera.id,c=>{c.effects.background=v;})}/></BrSub>
   <BrSeparator/>
   <ColorControls target={camera} update={update}/>
  </BrGroup>}
  {screen&&!camera&&<BrGroup title="Screen" icon={ScreenIcon} id="screen">
   <BrSub title="Mirror" action={<BrSwitch label="Mirror" checked={screen.effects.flipX} onChange={v=>update(screen.id,c=>{c.effects.flipX=v;})}/>}/>
   <BrSeparator/>
   <ColorControls target={screen} update={update}/>
  </BrGroup>}
  <TimingGroup clip={clip} fade={fade} duration={p.media.find(m=>m.id===clip.mediaId)?.duration||3600} timing={timing} update={update}/>
  <BrGroup id="speed"><BrSub title="Speed" secondary={`(${formatSpeed(clip.speed)})`} description="Adjust how fast the selected clip plays back" action={<button type="button" className="br-link" disabled={clip.speed===1} onClick={()=>update(clip.id,c=>{c.speed=1;})}>Reset</button>}>
   <BrSlider label="Speed" value={speedToPosition(clip.speed)} min={0} max={SPEED_SLIDER_MAX} step={.001} onChange={v=>update(clip.id,c=>{c.speed=positionToSpeed(v);},'speed')}/>
  </BrSub></BrGroup>
 </div></div>;
}
