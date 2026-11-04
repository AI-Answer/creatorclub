import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement as h} from 'react';
import {Window} from 'happy-dom';
import {AudioMeter} from './AudioMeter';
import {MeterAudio} from './recording-meter';

test('meter pauses hidden canvases, samples for the recording HUD, and releases nodes/context on device change and unmount',async()=>{
 const browser=new Window(),saved=new Map<string,PropertyDescriptor|undefined>(),frames=new Map<number,FrameRequestCallback>();let nextFrame=0,intersection!:(entries:Array<{isIntersecting:boolean}>)=>void,observerDisconnected=0;
 const calls={contexts:0,closed:0,sourceDisconnected:0,analyserDisconnected:0,reads:0,paints:0};
 const context=new MeterAudio(()=>{
  calls.contexts++;
  return {resume:async()=>{},suspend:async()=>{},close:async()=>{calls.closed++;},
   createMediaStreamSource:()=>({connect:()=>{},disconnect:()=>{calls.sourceDisconnected++;}}),
   createAnalyser:()=>({fftSize:2048,getFloatTimeDomainData:(data:Float32Array)=>{calls.reads++;data.fill(.1);},disconnect:()=>{calls.analyserDisconnected++;}}),
  } as unknown as AudioContext;
 });
 const canvasContext={clearRect:()=>{calls.paints++;},beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},quadraticCurveTo:()=>{},closePath:()=>{},fill:()=>{},stroke:()=>{},createLinearGradient:()=>({addColorStop:()=>{}})};
 browser.HTMLCanvasElement.prototype.getContext=(()=>canvasContext) as any;
 for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,MutationObserver:browser.MutationObserver,
  getComputedStyle:browser.getComputedStyle.bind(browser),IS_REACT_ACT_ENVIRONMENT:true,
  IntersectionObserver:class{constructor(callback:typeof intersection){intersection=callback;}observe(){}disconnect(){observerDisconnected++;}},
  MediaStream:class{constructor(private tracks:unknown[]){}getAudioTracks(){return this.tracks;}},
  requestAnimationFrame:(callback:FrameRequestCallback)=>{const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:(id:number)=>frames.delete(id),
 })){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const {createRoot}=await import('react-dom/client');const host=browser.document.createElement('div');browser.document.body.append(host);const root=createRoot(host as unknown as HTMLElement);
 const stream=()=>({getAudioTracks:()=>[{readyState:'live'}]} as unknown as MediaStream),first=stream(),second=stream(),levels:Array<number|null>=[],onLevel=(level:number|null)=>levels.push(level);
 const render=async(input:MediaStream|null,live=true,background=false)=>act(async()=>root.render(h(AudioMeter,{stream:input,label:'Microphone',emptyHint:'Off',audio:context,live,background,onLevel})));
 const frame=async(time:number)=>act(async()=>{const [id,callback]=frames.entries().next().value!;frames.delete(id);callback(time);});
 try{
  await render(first);assert.equal(calls.contexts,1);assert.equal(frames.size,1);
  await frame(100);await frame(117);assert.ok(levels.some(level=>level!==null&&level>.5));assert.equal(calls.paints,2);
  await act(async()=>intersection([{isIntersecting:false}]));assert.equal(frames.size,0,'offscreen canvas has no RAF');
  const before=calls.paints;await render(first,true,true);await act(async()=>new Promise(resolve=>setTimeout(resolve,130)));
  assert.ok(calls.reads>2,'HUD gets levels while the card is hidden');assert.equal(calls.paints,before,'background sampling never paints');
  await render(first,false);const reads=calls.reads;await act(async()=>new Promise(resolve=>setTimeout(resolve,130)));assert.equal(calls.reads,reads,'inactive meter stops all sampling');
  await act(async()=>intersection([{isIntersecting:true}]));await render(second);assert.equal(calls.closed,1);assert.equal(calls.sourceDisconnected,1);assert.equal(calls.analyserDisconnected,1);assert.equal(calls.contexts,2);
  await render(null);assert.equal(calls.closed,2);assert.equal(frames.size,0);assert.equal(levels.at(-1),null);
 }finally{
  await act(async()=>root.unmount());assert.equal(calls.sourceDisconnected,2);assert.equal(calls.analyserDisconnected,2);assert.equal(observerDisconnected,1);assert.equal(frames.size,0);
  await browser.happyDOM.close();for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
 }
});
