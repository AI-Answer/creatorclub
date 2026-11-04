import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordingSamples} from './recording-samples';

test('first-source timing comes from the samples fed to the recorder; queued pre-roll is discarded and previews stay live',async()=>{
 const keys=['MediaStreamTrackProcessor','MediaStreamTrackGenerator','MediaStream'] as const;
 const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 let input!:ReadableStreamDefaultController<any>,sourceStopped=false,outputStopped=false;
 const written:number[]=[],closed:number[]=[],first:Array<[number,number]>=[],failures:Error[]=[];
 const clone={kind:'video',stop(){sourceStopped=true;}};
 class Processor{readable=new ReadableStream({start(controller){input=controller;}});}
 class Generator{kind='video';writable=new WritableStream<any>({write(sample){written.push(sample.timestamp);}});stop(){outputStopped=true;}}
 class Stream{constructor(public tracks:unknown[]){}getTracks(){return this.tracks;}}
 Object.assign(globalThis,{MediaStreamTrackProcessor:Processor,MediaStreamTrackGenerator:Generator,MediaStream:Stream});
 const tick=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
 let relay:ReturnType<typeof recordingSamples>|undefined;
 try{
  relay=recordingSamples({getTracks:()=>[{clone:()=>clone}]} as unknown as MediaStream,(at,pts)=>first.push([at,pts]),e=>failures.push(e),()=>1250);
  const sample=(timestamp:number)=>({timestamp,close:()=>closed.push(timestamp)});
  input.enqueue(sample(100));await tick();assert.deepEqual(written,[]);assert.deepEqual(first,[]);
  relay.start();input.enqueue(sample(200));await tick();input.enqueue(sample(233));await tick();
  assert.deepEqual(first,[[1250,200]]);assert.deepEqual(written,[200,233]);assert.deepEqual(closed,[100,200,233]);
  relay.close();await tick();assert.equal(sourceStopped,true);assert.equal(outputStopped,true);assert.deepEqual(failures,[]);
 }finally{relay?.close();keys.forEach((key,i)=>{if(previous[i])Object.defineProperty(globalThis,key,previous[i]!);else Reflect.deleteProperty(globalThis,key);});}
});
