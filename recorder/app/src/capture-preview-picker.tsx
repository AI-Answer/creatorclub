import {useEffect,useRef,useState} from 'react';
import {Monitor,LoaderCircle,Check} from './Icons';
import type {DesktopCaptureSource} from './desktop';
import {captureSourceDetail} from './capture-preview-sources';
import './capture-preview-picker.css';

export const PICKER_REFRESH_MS=2000;
type Props={selectedId?:string;region?:boolean;busy?:boolean;error?:string;onSelect:(source:DesktopCaptureSource)=>void;onClose:()=>void;load?:()=>Promise<{sources:DesktopCaptureSource[]}>};
const loadSources=async()=>window.sceneForge?.listCaptureSources?.({thumbnails:true})??{sources:[]};
/** Mounted only while open. No cache, storage, recording, or background thumbnail polling. */
export function CaptureSourcePicker({selectedId,region=false,busy=false,error,onSelect,onClose,load=loadSources}:Props){
 const [sources,setSources]=useState<DesktopCaptureSource[]>([]),[loading,setLoading]=useState(true),[failure,setFailure]=useState('');
 const dialog=useRef<HTMLDivElement>(null),refresh=useRef<()=>void>(()=>{});
 // A selection cancels the in-flight poll; that expected rejection is not an error to show.
 const busyRef=useRef(busy);busyRef.current=busy;
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>;
  const update=async()=>{try{const result=await load();if(alive){setSources(result.sources);setFailure('');}}catch(e){if(alive&&!busyRef.current)setFailure((e as Error).message);}finally{if(alive){setLoading(false);timer=setTimeout(update,PICKER_REFRESH_MS);}}};
  refresh.current=()=>{clearTimeout(timer);setLoading(true);void update();};void update();
  return()=>{alive=false;clearTimeout(timer);};
 },[load]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){
   const nodes=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')];const first=nodes[0],last=nodes.at(-1);
   if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first?.focus();}
  }};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[onClose]);
 return <div className="capture-picker-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div ref={dialog} className="capture-picker-dialog" role="dialog" aria-modal="true" aria-label="Choose capture source" tabIndex={-1}>
   <header><div><strong>{region?'Choose a display for your region':'Choose what to record'}</strong><p>Live previews · nothing is being recorded</p></div><button type="button" aria-label="Close capture sources" onClick={onClose}>×</button></header>
   <div className="capture-picker-content" aria-busy={loading||busy}>
    {(['display','window'] as const).filter(kind=>!region||kind==='display').map(kind=><section key={kind}>
     <h3>{kind==='display'?'Displays':'Windows'}</h3>
     <div className="capture-picker-grid">{sources.filter(source=>source.kind===kind).map(source=><button type="button" key={source.id} className="capture-picker-tile" aria-pressed={selectedId===source.id} disabled={busy} onClick={()=>onSelect(source)}>
      <span className="capture-picker-image">{source.thumbnail?<img src={source.thumbnail} alt="" draggable={false}/>:<Monitor size={24}/>}<span className="capture-picker-selection">{selectedId===source.id&&<Check size={12}/>}</span></span>
      <span className="capture-picker-name">{source.appIcon&&<img src={source.appIcon} alt=""/>}<span title={source.label}>{source.label}</span></span>
      <span className="capture-picker-detail">{captureSourceDetail(source)}</span>
     </button>)}</div>
     {!loading&&!sources.some(source=>source.kind===kind)&&<p>No {kind==='display'?'displays':'windows'} available.</p>}
    </section>)}
    {(loading||busy)&&<p role="status" className="capture-picker-progress"><LoaderCircle className="spin" size={14}/>{busy?'Opening your selection…':'Loading sources…'}</p>}
    {(failure||error)&&<div role="alert"><p>{error||failure}</p>{!busy&&<button type="button" className="button compact" onClick={()=>refresh.current()}>Try again</button>}</div>}
   </div>
   <footer>Choose a source to see its live preview.<span>Esc to close</span></footer>
  </div>
 </div>;
}
