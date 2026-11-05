import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Icon,Tooltip} from '../ui';
import './take-preview.css';

// Borumi's take preview (main bundle index-2TDxNpOf.js, M:73052-73790), value for value: the PREVIEW header with the take's name, the
// Confirmed badge, the gear (Adjust Sync...) and close; the source tiles (a main one and a 20% side column, any tile clicked becomes
// main); the slim scrubber with MM:SS.d times, 5 s steps and Borumi's speeds; and the footer with Delete take, Record another take and
// Confirm take with its menu. CreatorClub keeps its own Continue: it also moves on to the next scene to record.

/** Borumi's Qo: MM:SS.d, tenths truncated. */
export const previewTime=(n:number)=>{const total=Math.floor(Math.max(0,n)*10+1e-6),minutes=Math.floor(total/600),seconds=Math.floor(total/10)%60,tenths=total%10;return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${tenths}`;};
/** Borumi's Tv: 0.5X, 1.25X, 1.5X, otherwise a whole number. */
export const speedLabel=(value:number)=>value===.5?'0.5X':value===1.25?'1.25X':value===1.5?'1.5X':`${value.toFixed(0)}X`;
/** Borumi's Une on Apple silicon (this app ships for arm64). */
export const PREVIEW_SPEEDS=[.5,1,1.25,1.5,2,3,4];

const Svg=({children}:{children:ReactNode})=><svg className="btp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const Back5=()=><Svg><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" fontSize="8" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">5</text></Svg>;
const Forward5=()=><Svg><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" fontSize="8" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">5</text></Svg>;
const Chevron=()=><Svg><path d="m6 9 6 6 6-6"/></Svg>;
const DoubleCheck=()=><Svg><path d="m2 12 5 5L18 6"/><path d="m11 16 1.5 1.5L22 8"/></Svg>;
const Tip=({text}:{text:string})=>`Tip: ${text}`;

/** A menu that closes on choice, outside click and Escape. */
function useMenu(){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};window.addEventListener("pointerdown",close);window.addEventListener("keydown",key);return()=>{window.removeEventListener("pointerdown",close);window.removeEventListener("keydown",key);};},[open]);
 return {open,setOpen,root};
}

/** Borumi's speed control (main bundle XU, M:52013-52040): a 40x32 label button over one row of speeds, the chosen one tinted.
 * The take preview and the Edit play bar both use it. */
export function SpeedMenu({label,rate,onRate}:{label:string;rate:number;onRate(rate:number):void}){
 const speed=useMenu();
 return <div className="btp-menu-host" ref={speed.root}>
  <button type="button" className="btp-speed" aria-label={label} aria-haspopup="menu" aria-expanded={speed.open} onClick={()=>speed.setOpen(!speed.open)}>{speedLabel(rate)}</button>
  {speed.open&&<div className="btp-popover btp-speeds" role="menu">{PREVIEW_SPEEDS.map(value=><button key={value} type="button" role="menuitemradio" aria-checked={Math.abs(value-rate)<.01} className={`btp-speed-item${Math.abs(value-rate)<.01?' is-selected':''}`} onClick={()=>{speed.setOpen(false);onRate(value);}}>{speedLabel(value)}</button>)}</div>}
 </div>;
}

export type PreviewTile={key:string;node:ReactNode};

export function ClubTakePreview({title,confirmed,recordOver,matches,busy,main,side,time,duration,playing,rate,onSeek,onToggle,onRate,onClose,onAdjustSync,onDelete,onRetake,onConfirm,onArchive,onContinue}:{
 title:string;confirmed:boolean;recordOver:boolean;matches:boolean;busy:boolean;main:PreviewTile;side:PreviewTile[];
 time:number;duration:number;playing:boolean;rate:number;onSeek(value:number):void;onToggle():void;onRate(value:number):void;
 onClose():void;onAdjustSync?():void;onDelete?():void;onRetake():void;onConfirm(replaceMatching:boolean):void;onArchive():void;onContinue():void;
}){
 const gear=useMenu(),confirm=useMenu();
 const shown=Math.min(time,duration);
 return <div className="btp-root">
  <div className="btp-header">
   <div className="btp-heading">
    <p className="btp-kicker">Preview</p>
    <div className="btp-title-row">
     <p className="btp-title">{title}</p>
     {confirmed&&<Tooltip text={Tip({text:'Confirmed takes will automatically appear in the timeline when editing.'})}><p className="btp-confirmed">Confirmed</p></Tooltip>}
     <div className="btp-menu-host" ref={gear.root}>
      <button type="button" className="btp-gear" aria-label="Open take settings" aria-haspopup="menu" aria-expanded={gear.open} disabled={busy||!onAdjustSync} onClick={()=>gear.setOpen(!gear.open)}><Icon name="settings" size={16}/></button>
      {gear.open&&<div className="btp-popover btp-list" role="menu"><button type="button" role="menuitem" className="btp-list-item" onClick={()=>{gear.setOpen(false);onAdjustSync?.();}}>Adjust Sync...</button></div>}
     </div>
    </div>
   </div>
   {confirmed?<button type="button" className="btp-close" aria-label="Close take preview" disabled={busy} onClick={onClose}><Icon name="close" size={20}/></button>
    :<Tooltip text={Tip({text:'The take won\'t be deleted, you can always find it in the archive.'})}><button type="button" className="btp-close" aria-label="Close take preview" disabled={busy} onClick={onClose}><Icon name="close" size={20}/></button></Tooltip>}
  </div>

  <div className="btp-tiles">
   <div className="btp-main">{main.node}</div>
   {side.length>0&&<div className="btp-side">{side.map(tile=><div key={tile.key} className="btp-side-slot">{tile.node}</div>)}</div>}
  </div>

  <div className="btp-controls">
   <div className="btp-slider" style={{'--br-progress':`${duration>0?shown/duration*100:0}%`} as React.CSSProperties}>
    <input type="range" aria-label="Take playback position" min={0} max={duration||1} step={.01} value={shown} disabled={duration<=0} onChange={event=>onSeek(Number(event.target.value))}/>
   </div>
   <div className="btp-times"><span className="btp-now">{previewTime(shown)}</span><span className="btp-total">{previewTime(duration)}</span></div>
   <div className="btp-transport">
    <Tooltip text="Seek backward 5 seconds"><button type="button" className="btp-ghost-icon" aria-label="Seek backward 5 seconds" onClick={()=>onSeek(Math.max(0,shown-5))}><Back5/></button></Tooltip>
    <Tooltip text={playing?'Pause':'Play'}><button type="button" className="btp-ghost-icon" aria-label={playing?'Pause':'Play'} onClick={onToggle}><Icon name={playing?'pause':'play'} size={16}/></button></Tooltip>
    <Tooltip text="Seek forward 5 seconds"><button type="button" className="btp-ghost-icon" aria-label="Seek forward 5 seconds" onClick={()=>onSeek(Math.min(duration,shown+5))}><Forward5/></button></Tooltip>
    <SpeedMenu label="Take playback speed" rate={rate} onRate={onRate}/>
   </div>
  </div>

  <div className="btp-footer">
   <div className="btp-footer-left">{onDelete&&<button type="button" className="btp-btn btp-delete" disabled={busy} onClick={onDelete}><Icon name="delete" size={16}/>Delete take</button>}</div>
   <div className="btp-footer-right">
    <Tooltip side="top" text={Tip({text:'This take will be moved into the archive, you can always find it there.'})}><button type="button" className="btp-btn btp-ghost" disabled={busy} onClick={onRetake}><Icon name="undo" size={16}/>Record another take</button></Tooltip>
    {confirmed?<button type="button" className="btp-btn btp-primary" disabled={busy} onClick={onContinue}>Continue</button>
     :<div className="btp-split" ref={confirm.root}>
      <button type="button" className="btp-btn btp-primary btp-split-main" disabled={busy} onClick={()=>onConfirm(!recordOver)}><Icon name="check" size={16}/>Confirm take</button>
      <button type="button" className="btp-btn btp-primary btp-split-more" aria-label="More ways to confirm" aria-haspopup="menu" aria-expanded={confirm.open} disabled={busy} onClick={()=>confirm.setOpen(!confirm.open)}><Chevron/></button>
      {confirm.open&&<div className="btp-popover btp-confirm-menu" role="menu">
       <button type="button" role="menuitem" className="btp-option" onClick={()=>{confirm.setOpen(false);onArchive();}}><span className="btp-option-icon"><Icon name="folder" size={16}/></span><span className="btp-option-text"><span className="btp-option-title">Archive take</span><span className="btp-option-hint">Don't confirm the take, but keep it in the archive for later.</span></span></button>
       {matches&&recordOver&&<button type="button" role="menuitem" className="btp-option" onClick={()=>{confirm.setOpen(false);onConfirm(true);}}><span className="btp-option-icon"><Icon name="check" size={16}/></span><span className="btp-option-text"><span className="btp-option-title">Confirm and replace</span><span className="btp-option-hint">Replace matching clips in the timeline with this take.</span></span></button>}
       {matches&&!recordOver&&<button type="button" role="menuitem" className="btp-option" onClick={()=>{confirm.setOpen(false);onConfirm(false);}}><span className="btp-option-icon"><DoubleCheck/></span><span className="btp-option-text"><span className="btp-option-title">Confirm without replacing</span><span className="btp-option-hint">Confirm the take without replacing existing ones. Both takes will appear in the timeline.</span></span></button>}
      </div>}
     </div>}
   </div>
  </div>
 </div>;
}

/** Borumi's take waveform ($ne + zne): 5 s around the playhead on a neutral tile; the played part a #81ecec to #0984e3 gradient, the rest #cceefc. */
export function PreviewWave({peaks,mediaDuration,position,loading}:{peaks:readonly number[];mediaDuration:number;position:number;loading:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const c=canvas.current;if(!c||!peaks.length||!(mediaDuration>0))return;
  const w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;c.width=Math.round(w*2);c.height=Math.round(h*1.5);
  const g=c.getContext('2d');if(!g)return;const W=c.width,H=c.height,mid=H/2,amp=H*.3,WINDOW=5,css=getComputedStyle(c),colour=(name:string)=>css.getPropertyValue(name).trim();
  let from=position-WINDOW/2,to=position+WINDOW/2;if(from<0){to=Math.min(mediaDuration,to-from);from=0;}if(to>mediaDuration){from=Math.max(0,from-(to-mediaDuration));to=mediaDuration;}
  const perSecond=peaks.length/mediaDuration,first=Math.max(0,Math.floor(from*perSecond)),last=Math.min(peaks.length-1,Math.ceil(to*perSecond));
  const x=(i:number)=>((i/perSecond-from)/(to-from))*W,playX=((position-from)/(to-from))*W;
  const shape=(start:number,end:number)=>{g.beginPath();g.moveTo(x(start),mid);for(let i=start;i<=end;i++)g.lineTo(x(i),mid-Math.max(0,Math.min(1,peaks[i]))*amp);for(let i=end;i>=start;i--)g.lineTo(x(i),mid+Math.max(0,Math.min(1,peaks[i]))*amp);g.closePath();};
  g.clearRect(0,0,W,H);
  g.save();g.beginPath();g.rect(0,0,playX,H);g.clip();shape(first,last);const fill=g.createLinearGradient(0,0,0,H);fill.addColorStop(0,colour('--br-wave-top'));fill.addColorStop(1,colour('--br-wave-bottom'));g.fillStyle=fill;g.fill();g.restore();
  g.save();g.beginPath();g.rect(playX,0,W-playX,H);g.clip();shape(first,last);g.fillStyle=colour('--br-wave-ahead');g.strokeStyle=colour('--br-wave-ahead');g.lineWidth=1;g.fill();g.stroke();g.restore();
 },[peaks,mediaDuration,position]);
 return <div className="btp-wave">{loading?<div className="btp-spin" aria-label="Loading waveform"/>:<div className="btp-wave-box"><canvas ref={canvas} className="btp-wave-canvas"/></div>}</div>;
}
