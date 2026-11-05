import {useEffect,useRef,useState} from 'react';
import {MeterAudio,WaveformHistory,drawWaveform,fitCanvas,frameRms,peakLevel,rmsLevel,smoothLevel} from './recording-meter';

export function AudioMeter({stream,label,emptyHint,audio,live,background=false,onLevel,onPeak}:{stream:MediaStream|null;label:string;emptyHint:string;audio:MeterAudio;live:boolean;background?:boolean;onLevel?:(level:number|null)=>void;onPeak?:(level:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),meter=useRef<HTMLDivElement>(null),sample=useRef<((now:number,paint:boolean)=>void)|null>(null);
 const [heard,setHeard]=useState(false),[monitorError,setMonitorError]=useState(''),[shown,setShown]=useState(true);
 const hasAudio=Boolean(stream?.getAudioTracks().some(t=>t.readyState==='live'));
 useEffect(()=>{
  const element=meter.current;if(!element)return;
  const update=()=>setShown(!document.hidden&&intersecting);let intersecting=true;
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{intersecting=entries[0]?.isIntersecting??false;update();}):null;observer?.observe(element);
  document.addEventListener('visibilitychange',update);update();
  return()=>{observer?.disconnect();document.removeEventListener('visibilitychange',update);};
 },[]);
 useEffect(()=>{
  // The sampler is the only writer of aria-valuenow; reset it whenever monitoring restarts or stops.
  meter.current?.setAttribute('aria-valuenow','0');
  setHeard(false);setMonitorError('');onLevel?.(null);if(!hasAudio||!stream)return;
  let heardAudio=false,acquired=false,percent=-1,previous=0,last=0;
  let input:MediaStreamAudioSourceNode|undefined,analyser:AnalyserNode|undefined,theme:MutationObserver|undefined;
  const history=new WaveformHistory();let colors={top:'currentColor',bottom:'currentColor',line:'currentColor'};
  const readColors=()=>{if(!meter.current)return;const css=getComputedStyle(meter.current);colors={top:css.getPropertyValue('--meter-top').trim()||colors.top,bottom:css.getPropertyValue('--meter-bottom').trim()||colors.bottom,line:css.getPropertyValue('--meter-line').trim()||colors.line};};
  const close=()=>{sample.current=null;meter.current?.setAttribute('aria-valuenow','0');theme?.disconnect();input?.disconnect();analyser?.disconnect();if(acquired)audio.release();acquired=false;onLevel?.(null);};
  try{
   const context=audio.acquire();acquired=true;
   input=context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));const node=analyser=context.createAnalyser();node.fftSize=2048;input.connect(node);
   const data=new Float32Array(node.fftSize);readColors();theme=new MutationObserver(readColors);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
   sample.current=(now,paint)=>{
    node.getFloatTimeDomainData(data);const rms=frameRms(data),target=rmsLevel(rms),elapsed=last?now-last:16.67;
    if(elapsed>250){history.clear();previous=0;}last=now;
    const level=previous=smoothLevel(previous,target,Math.min(elapsed,100));onLevel?.(level);onPeak?.(peakLevel(data));
    const next=Math.round(level*100);if(percent!==next){percent=next;meter.current?.setAttribute('aria-valuenow',String(next));}
    // Sound detection keeps its original raw RMS threshold, independent of the display curve.
    if(rms>.006&&!heardAudio){heardAudio=true;setHeard(true);}
    if(!paint)return;
    history.push(now,level);const element=canvas.current,ctx=element?.getContext('2d');if(!element||!ctx)return;
    const dpr=window.devicePixelRatio||1;fitCanvas(element,dpr);
    drawWaveform(ctx,history.samples,now,element.width,element.height,{...colors,lineWidth:dpr},history.duration);
   };
  }catch(error){setMonitorError((error as Error).message);close();}
  return close;
 },[stream,hasAudio,audio,onLevel]);
 useEffect(()=>{
  const tick=sample.current;if(!live||!tick)return;
  // The recording HUD still receives levels while the main window is hidden; no canvas paints there.
  if(background){const timer=setInterval(()=>tick(performance.now(),false),100);return()=>clearInterval(timer);}
  if(!shown)return;
  let frame=requestAnimationFrame(function loop(now){tick(now,true);frame=requestAnimationFrame(loop);});
  return()=>cancelAnimationFrame(frame);
 },[stream,hasAudio,audio,onLevel,live,background,shown]);
 return <div className="capture-audio"><div ref={meter} role="meter" aria-label={`${label} input level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>{hasAudio&&!monitorError?<canvas ref={canvas}/>:<span className="capture-flatline"/>}</div><span className={`capture-source-hint${monitorError?' is-error':''}`}>{monitorError?`Level monitor unavailable: ${monitorError}`:hasAudio?heard?'Sound detected · live input':'Listening · no sound detected yet':emptyHint}</span></div>;
}
