import {useEffect,useMemo,useRef,useState} from 'react';
import {drawWaveform,fitCanvas,rmsLevel,smoothLevel,type EnvelopeSample} from './recording-meter';

/** Review data is absolute source peaks. Reuse the input meter's dBFS display
 * curve; never normalize a quiet take to full height. */
export function takeEnvelope(peaks:readonly number[],duration:number):EnvelopeSample[]{
 let previous=0;
 const step=duration*1000/peaks.length;
 return peaks.map((peak,index)=>({time:index*step,level:previous=smoothLevel(previous,rmsLevel(peak),step)}));
}
/** Recorded amplitude data needs no extra AudioContext or analyser, and cannot
 * interfere with the audio element's output. */
export function TakeAudioMeter({peaks,duration,position,system=false,loading=false,error=''}:{peaks:number[];duration:number;position:number;system?:boolean;loading?:boolean;error?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null),[shown,setShown]=useState(!document.hidden),[revision,setRevision]=useState(0);
 const samples=useMemo(()=>takeEnvelope(peaks,duration),[peaks,duration]);
 const quiet=!peaks.some(value=>rmsLevel(value)>0);
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
 return <div ref={host} className="take-audio-meter" role="img" aria-label={system?'Computer audio waveform':'Microphone waveform'}><canvas ref={canvas}/>{(loading||error||(system&&quiet))&&<span className="take-audio-hint" role="status">{error|| (loading?'Loading waveform…':'No computer audio yet')}</span>}</div>;
}
