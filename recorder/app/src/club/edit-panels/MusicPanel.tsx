import {CLIP_GAIN_MAX_DB} from '../../../shared/types';
import {useState} from 'react';
import type {InspectorProps} from '../../Inspector';
import {clipDuration,type Clip,type Media} from '../../../shared/types';
import {insertMedia} from '../../api';
import {rulerLabel} from '../../timeline-edit';
import {Icon} from '../ui';
import {BrSection,BrSlider,BrSub,BrTabs,BrToggleRow} from './br';

/*
  The club's Music panel, built to Borumi's Music panel (spec-edit-step.md, section e6). Borumi lists a built-in library and favourites;
  CreatorClub has neither, so the tracks are the audio files in this project and the Favorites tab is left out. Volume is shown in
  decibels as Borumi shows it, -30 to +30 dB (the export's clip gain ceiling, CLIP_GAIN_MAX_DB).
  Loop is left out: a clip has no loop setting in our model.
*/

type Tab='all'|'project';
const TABS:ReadonlyArray<{value:Tab;label:string;tip:string}>=[{value:'all',label:'All',tip:'Show all music tracks'},{value:'project',label:'Project',tip:'Only show tracks used in this project'}];
const MIN_DB=-CLIP_GAIN_MAX_DB,MAX_DB=CLIP_GAIN_MAX_DB;
/** The fade length a Fade switch sets when it turns on; the number field beside it changes it. */
const FADE_START=1;
const round=(n:number)=>Number.isFinite(n)?Math.round(n*1000)/1000:0;

export function ClubMusicPanel({project:p,selected,playhead,change,select,onImport}:InspectorProps){
 const [tab,setTab]=useState<Tab>('all');
 const audio=p.media.filter(m=>m.kind==='audio'),used=new Set(p.clips.filter(c=>c.track==='music').map(c=>c.mediaId));
 const shown=tab==='project'?audio.filter(m=>used.has(m.id)):audio;
 const music=p.clips.find(c=>c.id===selected&&c.track==='music');
 const edit=(fn:(clip:Clip)=>void,key?:string)=>{if(!music)return;const id=music.id;change(d=>{const clip=d.clips.find(c=>c.id===id);if(clip)fn(clip);},key?{coalesce:`clip:${id}:${key}`}:undefined);};
 // A selected music clip takes the chosen track in place; with none selected the track is added at the playhead.
 const useTrack=(media:Media)=>{
  if(music){const id=music.id;change(d=>{const clip=d.clips.find(c=>c.id===id);if(!clip)return;clip.mediaId=media.id;clip.name=media.name;clip.sourceIn=0;clip.sourceOut=media.duration||5;});return;}
  const at=playhead.get();change(d=>insertMedia(d,[media],at,'music'));
 };
 const removeMusic=()=>{if(!music)return;const id=music.id;change(d=>{d.clips=d.clips.filter(c=>c.id!==id);});};
 const db=music&&music.gain>0?Math.min(MAX_DB,Math.max(MIN_DB,Math.round(20*Math.log10(music.gain)))):MIN_DB;
 const fades=[['fadeIn','Fade in'],['fadeOut','Fade out']] as const;
 return <div className="br-panel club-music-panel">
  <div className="club-music-head"><BrSection title="Music"/></div>
  <div className="club-music-tabs"><BrTabs<Tab> value={tab} items={TABS} onChange={setTab} label="Music tracks"/></div>
  <div className="club-music-list">
   <button type="button" className={`club-music-row${music?'':' is-selected'}`} aria-pressed={!music} onClick={removeMusic}><span className="club-music-name"><span>No music</span></span></button>
   {shown.map(media=>{const active=!!music&&music.mediaId===media.id;return <button key={media.id} type="button" className={`club-music-row${active?' is-selected':''}`} aria-pressed={active} title={media.name} onClick={()=>useTrack(media)}><span className="club-music-name"><Icon name="music" size={16}/><span>{media.name}</span></span></button>;})}
   <button type="button" className="club-music-import" onClick={()=>onImport('music')}><Icon name="add" size={14}/><span>Click to select a song.</span></button>
  </div>
  {music&&<div className="club-music-footer">
   <BrSub compact title="Volume" secondary={`(${db} dB)`} description="Control how loud the selected music clip will be">
    <BrSlider value={db} min={MIN_DB} max={MAX_DB} step={1} label="Music volume" onChange={v=>edit(c=>{c.gain=10**(v/20);},'gain')}/>
   </BrSub>
   <div className="club-music-switches">
    <BrToggleRow compact label="Fade In" checked={music.effects.fadeIn>0} onChange={on=>edit(c=>{c.effects.fadeIn=on?Math.min(FADE_START,clipDuration(c)/2):0;},'fadeIn')}/>
    <BrToggleRow compact label="Fade Out" checked={music.effects.fadeOut>0} onChange={on=>edit(c=>{c.effects.fadeOut=on?Math.min(FADE_START,clipDuration(c)/2):0;},'fadeOut')}/>
   </div>
   {fades.filter(([key])=>music.effects[key]>0).map(([key,label])=><label key={key} className="club-music-field">
    <span>{label} (seconds)</span>
    <input type="number" aria-label={`${label} length`} min={0} step={.1} value={round(music.effects[key])} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))edit(c=>{c.effects[key]=Math.max(0,Math.min(n,clipDuration(c)/2));},key);}}/>
   </label>)}
   <div className="club-music-actions">
    <label className="club-music-field"><span>Start (seconds)</span><input type="number" aria-label="Start" min={0} step={.1} value={round(music.start)} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))edit(c=>{c.start=Math.max(0,n);},'start');}}/></label>
    <button type="button" className="br-link" onClick={()=>select(music.id)}>Edit clip properties</button>
    <button type="button" className="club-music-delete" aria-label={`Delete ${music.name}`} onClick={removeMusic}><Icon name="delete" size={15}/></button>
   </div>
  </div>}
 </div>;
}
