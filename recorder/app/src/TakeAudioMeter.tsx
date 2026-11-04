import {useEffect,useMemo,useRef,useState} from 'react';
import {drawWaveform,fitCanvas,rmsLevel,smoothLevel,type EnvelopeSample} from './recording-meter';

/** Review data is absolute source peaks. Reuse the input meter's dBFS display
 * curve; never normalize a quiet take to full height. The envelope starts at `from`
 * (seconds), so sound before the take never decays into its first moments. */
export function takeEnvelope(peaks:readonly number[],duration:number,from=0):EnvelopeSample[]{
 let previous=0;
 const step=duration*1000/peaks.length,first=Math.max(0,Math.ceil(from*1000/step-1e-9));
 return peaks.slice(first).map((peak,index)=>({time:(first+index)*step,level:previous=smoothLevel(previous,rmsLevel(peak),step)}));
}
/** Recorded amplitude data needs no extra AudioContext or analyser, and cannot
 * interfere with the audio element's output. Only the take's range [from, to] of the
 * source is drawn: capture arms during the countdown, so the file starts before the take. */
export function TakeAudioMeter({peaks,duration,position,from=0,to=duration,system=false,loading=false,error=''}:{peaks:number[];duration:number;position:number;from?:number;to?:number;system?:boolean;loading?:boolean;error?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null),[shown,setShown]=useState(!document.hidden),[revision,setRevision]=useState(0);
 const samples=useMemo(()=>takeEnvelope(peaks,duration,from),[peaks,duration,from]);
 const quiet=!samples.some(sample=>sample.time<=to*1000&&sample.level>0);
 useEffect(()=>{
  let intersecting=true;const update=()=>setShown(intersecting&&!document.hidden);
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{intersecting=entries[0]?.isIntersecting??false;update();}):null;
  const redraw=()=>setRevision(value=>value+1);
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(redraw):null;
  const theme=typeof MutationObserver==='function'?new MutationObserver(redraw):null;
  if(host.current){observer?.observe(host.current);resize?.observe(host.current);}
  theme?.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
  document.addEventListener('visibilitychange',update);update();
  return()=>{observer?.disconnect();resize?.disconnect();theme?.disconnect();document.removeEventListener('visibilitychange',update);};
 },[]);
 useEffect(()=>{
  if(!shown)return;
  const frame=requestAnimationFrame(()=>{
   const element=canvas.current,ctx=element?.getContext('2d');if(!element||!ctx)return;
   const dpr=window.devicePixelRatio||1;fitCanvas(element,dpr);
   const now=position*1000,start=now-5000;
   // One boundary sample keeps the left edge continuous; omit future sound.
   let first=samples.findIndex(sample=>sample.time>=start);if(first<0)first=samples.length;
   const visible=samples.slice(Math.max(0,first-1)).filter(sample=>sample.time<=now);
   const css=getComputedStyle(element);
   drawWaveform(ctx,visible,now,element.width,element.height,{top:css.getPropertyValue('--meter-top').trim()||'#81ecec',bottom:css.getPropertyValue('--meter-bottom').trim()||'#0984e3',line:css.getPropertyValue('--meter-line').trim()||'#74b9ff',lineWidth:dpr});
  });
  return()=>cancelAnimationFrame(frame);
 },[samples,position,shown,revision]);
 return <div ref={host} className="take-audio-meter" role="img" aria-label={system?'Computer audio waveform':'Microphone waveform'}><canvas ref={canvas}/>{(loading||error||(system&&quiet))&&<span className="take-audio-hint" role="status">{error|| (loading?'Loading waveform…':'No computer audio in this take')}</span>}</div>;
}
