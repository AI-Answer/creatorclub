import {mountUI} from './test-dom';
import test from 'node:test';import assert from 'node:assert/strict';
import {act,createElement,Profiler,useState} from 'react';
import {createProject,defaultEffects,defaultTransform} from '../shared/types';
import {createPlayhead} from './playhead';
const {TimelineClub}=await import('./TimelineClub');
const pause=(ms:number)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
test('33 minute timeline: playback, hover, scroll and gesture render budget',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientWidth');Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>1000});
 const p=createProject('33 minute benchmark');p.id='timeline-benchmark';p.media=[{id:'m',name:'Video',path:'/tmp/benchmark.mov',kind:'video',duration:1980,width:1920,height:1080,hasAudio:true,waveform:Array.from({length:99_000},(_,i)=>.03+.2*Math.abs(Math.sin(i*.023)))}];
 p.clips=Array.from({length:14},(_,i)=>({id:`c${i}`,mediaId:'m',name:`Scene ${i+1}`,track:'screen' as const,start:i*1980/14,sourceIn:i*1980/14,sourceOut:(i+1)*1980/14,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}));
 p.scenes=Array.from({length:14},(_,i)=>({id:`s${i}`,name:`${i+1}. Scene title`,script:'',notes:'',start:i*1980/14,duration:1980/14}));
 p.captions=Array.from({length:650},(_,i)=>({id:`cap${i}`,start:i*1980/650,end:(i+.9)*1980/650,text:`Spoken sentence ${i}`}));
 const playhead=createPlayhead(),selected=new Set<string>();let commits=0,ms=0,scales=0;
 const noop=()=>{};function Harness(){const [scale,setScale]=useState(8);return createElement(Profiler,{id:'timeline',onRender:(_id,_phase,time)=>{commits++;ms+=time;}},createElement(TimelineClub,{project:p,playhead,scale,onScale:s=>{scales++;setScale(s);},selectedIds:selected,onSelectMany:noop,onSeek:noop,change:noop,onDropMedia:noop,tool:'select',onSplit:noop,follow:false,showWaveforms:true,onOpen:noop,autoFit:false}));}
 const ui=await mountUI(createElement(Harness));const samples:Record<string,unknown>={};const reset=()=>{commits=0;ms=0;};const record=(key:string)=>{samples[key]={commits,reactMs:+ms.toFixed(2)};reset();};
 try{
  record('mount');for(let i=0;i<1200;i++)playhead.set(i/60);assert.equal(commits,0,'playback never renders the timeline');record('playback1200');
  const ruler=ui.container.querySelector('.club-ruler')!;
  for(let i=0;i<24;i++)await act(async()=>{ruler.dispatchEvent(new window.PointerEvent('pointermove',{bubbles:true,clientX:100+i*15,buttons:0}));});await pause(25);assert.equal(commits,0,'hover never renders the timeline');record('hover24');
  const scroll=ui.container.querySelector<HTMLElement>('.timeline-scroll')!;
  for(let i=0;i<100;i++)await act(async()=>{scroll.scrollLeft=i*5;scroll.dispatchEvent(new Event('scroll',{bubbles:true}));});record('scroll100');
  reset();for(let i=0;i<12;i++){await act(async()=>{const event=new window.WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:400,deltaY:-8});Object.defineProperties(event,{ctrlKey:{value:true},clientX:{value:400}});scroll.dispatchEvent(event);});await pause(18);}await pause(200);record('zoom12');assert.equal(scales,1,'a pinch commits its real geometry only once');samples.scaleCommits=scales;samples.visibleCaptions=ui.container.querySelectorAll('.row-captions .club-effect').length;
  console.log('TIMELINE_BENCHMARK',JSON.stringify(samples));assert.ok(Number.isFinite(ms));
 }finally{await ui.close();if(descriptor)Object.defineProperty(HTMLElement.prototype,'clientWidth',descriptor);else delete (HTMLElement.prototype as {clientWidth?:number}).clientWidth;}
});
