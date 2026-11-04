import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement as h} from 'react';
import {TakeAudioMeter,takeEnvelope} from './TakeAudioMeter';
const {TakeSource}=await import('./TakeReview');
import {frameRms} from './recording-meter';
import type {Media} from '../shared/types';

test('tile levels use the shared dBFS curve: synthetic speech is prominent, silence stays zero',()=>{
 const sine=(rms:number)=>new Float32Array(2048).map((_,i)=>Math.SQRT2*rms*Math.sin(2*Math.PI*i/64));
 const quiet=takeEnvelope(Array(500).fill(frameRms(sine(.01))),5).at(-1)!.level;
 const speech=takeEnvelope(Array(500).fill(frameRms(sine(.1))),5).at(-1)!.level;
 assert.ok(quiet>.45&&quiet<.6);assert.ok(speech>.75&&speech<.9);
 assert.ok(takeEnvelope(Array(500).fill(0),5).every(sample=>sample.level===0));
});

test('tiles paint mirrored gradients over five seconds, show quiet system audio, and clean up hidden work',async()=>{
 const saved=new Map<string,PropertyDescriptor|undefined>();const frames=new Map<number,FrameRequestCallback>();let next=0,disconnects=0,intersection!:(entries:{isIntersecting:boolean}[])=>void;
 const points:number[][]=[],gradients:string[]=[],calls:string[]=[];
 const ctx={clearRect:()=>calls.push('clear'),beginPath:()=>{},moveTo:(...p:number[])=>points.push(p),lineTo:(...p:number[])=>points.push(p),quadraticCurveTo:(...p:number[])=>points.push(p),closePath:()=>{},fill:()=>calls.push('fill'),stroke:()=>calls.push('stroke'),createLinearGradient:()=>({addColorStop:(_n:number,color:string)=>gradients.push(color)})};
 const proto=window.HTMLCanvasElement.prototype,original=proto.getContext;
 proto.getContext=(()=>ctx) as any;
 for(const [key,value] of Object.entries({requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next;},cancelAnimationFrame:(id:number)=>frames.delete(id),IntersectionObserver:class{constructor(callback:typeof intersection){intersection=callback;}observe(){}disconnect(){disconnects++;}}})){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 }
 const flush=async()=>act(async()=>{for(const [id,callback] of [...frames]){frames.delete(id);callback(100);}});
 const render=(peaks:number[],position=10,system=true)=>h(TakeAudioMeter,{peaks,duration:10,position,system});
 const ui=await mountUI(render(Array(1000).fill(.1)));
 try{
  const canvas=ui.container.querySelector('canvas')!;Object.defineProperties(canvas,{clientWidth:{value:400},clientHeight:{value:200}});
  await flush();assert.deepEqual(calls,['clear','fill','stroke']);assert.equal(gradients.length,2);
  assert.ok(points.some(p=>p[1]<50));assert.ok(points.some(p=>p[1]>150),'mirrored speech fills most of the tile');
  assert.ok(points.every(p=>p[0]>=0&&p[0]<=400),'only a five-second window is drawn');
  assert.ok(!ui.container.textContent?.includes('No computer audio in this take'));
  await ui.render(render(Array(1000).fill(0)));await flush();assert.ok(ui.container.textContent?.includes('No computer audio in this take'));assert.equal(ui.container.querySelector('line'),null,'no stray playback cursor');
  points.length=0;await ui.render(h(TakeAudioMeter,{peaks:[...Array(250).fill(.3),...Array(750).fill(0)],duration:10,position:4,from:2.5,to:10,system:true}));await flush();
  assert.ok(points.length&&points.every(p=>Math.abs(p[1]-100)<2),'a countdown chime in the trimmed pre-roll head is never drawn');assert.ok(ui.container.textContent?.includes('No computer audio in this take'));
  assert.equal(takeEnvelope([.3,.3,0,0],4,2)[0].time,2000);assert.equal(takeEnvelope([.3,.3,0,0],4,2)[0].level,0);
  await act(async()=>intersection([{isIntersecting:false}]));assert.equal(frames.size,0);
  await ui.render(render([.1]));assert.equal(frames.size,0,'offscreen updates never schedule painting');
  await act(async()=>intersection([{isIntersecting:true}]));assert.equal(frames.size,1);
  await ui.close();assert.equal(frames.size,0);assert.equal(disconnects,1);
 }finally{if(ui.container.isConnected)await ui.close();proto.getContext=original;for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});

test('camera review binds recorded media and holds its final frame instead of hiding it at take end',async()=>{
 const media:Media={id:'camera',name:'Camera',path:'/tmp/camera.webm',kind:'video',width:640,height:360,duration:5,fps:30};
 const source=(time:number)=>h(TakeSource,{media,label:'Camera (Canon)',offset:1,sourceIn:0,sourceOut:5,time,playing:false,rate:1});
 const ui=await mountUI(source(0));
 try{
  const video=ui.container.querySelector('video')!;assert.equal(video.style.visibility,'hidden');
  await ui.render(source(6));assert.equal(video.style.visibility,'visible');assert.ok(video.currentTime<5&&video.currentTime>4.9);assert.equal(video.getAttribute('src'),'/api/media/camera/file');
  await act(async()=>video.dispatchEvent(new Event('loadeddata')));assert.ok(video.currentTime<5);
 }finally{await ui.close();}
});

test('source waveform fetch aborts on unmount without creating audio contexts',async()=>{
 const original=globalThis.fetch;let signal:AbortSignal|undefined;
 globalThis.fetch=async(_input,options)=>{signal=options?.signal as AbortSignal;return new Promise(()=>{});};
 try{
  const media:Media={id:'system',name:'System',path:'/tmp/system.wav',kind:'audio',width:0,height:0,audioRole:'system',duration:5};
  const ui=await mountUI(h(TakeSource,{media,label:'Computer audio (Screen 1)',offset:0,sourceIn:0,sourceOut:5,time:0,playing:false,rate:1}));
  assert.ok(ui.container.textContent?.includes('Loading waveform'));await ui.close();assert.equal(signal?.aborted,true);
 }finally{globalThis.fetch=original;}
});
