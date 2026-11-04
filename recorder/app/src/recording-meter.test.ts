import test from 'node:test';
import assert from 'node:assert/strict';
import {MeterAudio,WaveformHistory,audioLevel,drawWaveform,fitCanvas,frameRms,rmsLevel,smoothLevel,waveformLevel} from './recording-meter';
function contexts(){const made:Array<{calls:string[]}>=[];const create=()=>{const calls:string[]=[];made.push({calls});return {resume:async()=>{calls.push('resume');},suspend:async()=>{calls.push('suspend');},close:async()=>{calls.push('close');}} as unknown as AudioContext;};return {made,create};}
test('meters share one audio context that closes only after the last meter releases it',()=>{const c=contexts(),audio=new MeterAudio(c.create);const first=audio.acquire(),second=audio.acquire();assert.equal(first,second);assert.equal(c.made.length,1);audio.release();assert.deepEqual(c.made[0].calls,['resume','resume']);audio.release();assert.equal(c.made[0].calls.at(-1),'close');audio.release();assert.equal(c.made[0].calls.filter(v=>v==='close').length,1);audio.acquire();assert.equal(c.made.length,2);});
test('a hidden editor suspends the meter context and showing it resumes without recreating it',()=>{const c=contexts(),audio=new MeterAudio(c.create);audio.setActive(false);audio.acquire();assert.deepEqual(c.made[0].calls,['suspend']);audio.setActive(false);audio.setActive(true);assert.deepEqual(c.made[0].calls,['suspend','resume']);audio.setActive(false);assert.deepEqual(c.made[0].calls,['suspend','resume','suspend']);assert.equal(c.made.length,1);});
test('an unavailable audio context is reported to the meter without leaking a user count',()=>{let fail=true;const c=contexts(),audio=new MeterAudio(()=>{if(fail)throw new Error('No audio output');return c.create();});assert.throws(()=>audio.acquire(),/No audio output/);fail=false;audio.acquire();audio.release();assert.equal(c.made[0].calls.at(-1),'close');});
test('RMS and dBFS mapping put silence at zero, speech at mid/high and clipping at one',()=>{
 assert.equal(waveformLevel(new Float32Array(2048)),0);
 assert.equal(waveformLevel(new Float32Array(0)),0);
 assert.equal(audioLevel(new Uint8Array(2048).fill(128)),0);
 assert.equal(audioLevel(new Uint8Array(0)),0);
 assert.equal(rmsLevel(.001),0); // -60 dBFS
 const speech=new Float32Array(2048).map((_,i)=>Math.SQRT2*.1*Math.sin(2*Math.PI*i/64));
 assert.ok(Math.abs(frameRms(speech)-.1)<1e-7);
 assert.ok(waveformLevel(speech)>.75&&waveformLevel(speech)<.9,'-20 dBFS speech is prominent');
 const quiet=new Float32Array(2048).map((_,i)=>Math.SQRT2*.01*Math.sin(2*Math.PI*i/64));
 assert.ok(waveformLevel(quiet)>.45&&waveformLevel(quiet)<.6,'quiet -40 dBFS speech stays visible');
 assert.equal(rmsLevel(10**(-6/20)),1);assert.equal(waveformLevel(new Float32Array(2048).fill(1)),1);
 assert.equal(audioLevel(new Uint8Array([0,255,0,255])),1);
 assert.ok(frameRms(new Float32Array([-.1,.1]))>.099,'opposite samples do not average to zero');
});
test('smoothing has quick attack, gentle release, frame-rate independence, and settles to silence',()=>{
 const attack=smoothLevel(0,1,35),release=smoothLevel(1,0,35);
 assert.ok(attack>.6&&attack<.7);assert.ok(release>.7&&release<.8);
 let at60=0,at120=0;for(let i=0;i<6;i++)at60=smoothLevel(at60,.8,100/6);for(let i=0;i<12;i++)at120=smoothLevel(at120,.8,100/12);
 assert.ok(Math.abs(at60-at120)<1e-10);assert.equal(smoothLevel(.8,0,2000),0);
 assert.equal(smoothLevel(.5,1,0),.5);assert.equal(smoothLevel(.5,1,-1),.5);
});
test('scrolling history keeps five seconds and one boundary sample, with stable left-to-right order',()=>{
 const history=new WaveformHistory();for(let time=0;time<=10000;time+=20)history.push(time,.5);
 assert.equal(history.samples[0].time,5000);assert.equal(history.samples.at(-1)?.time,10000);
 assert.equal(history.samples.length,251);history.clear();assert.equal(history.samples.length,0);
});
test('canvas backing store follows CSS size times device pixel ratio and only resizes on change',()=>{const c={width:300,height:150,clientWidth:200,clientHeight:24};assert.equal(fitCanvas(c,2),true);assert.deepEqual([c.width,c.height],[400,48]);assert.equal(fitCanvas(c,2),false);const hidden={width:5,height:5,clientWidth:0,clientHeight:0};fitCanvas(hidden,2);assert.deepEqual([hidden.width,hidden.height],[1,1]);});
test('waveform is a filled mirrored smoothed path with a thin silence line',()=>{
 const calls:Array<{name:string;args:number[]}>=[];
 const ctx={strokeStyle:'',fillStyle:'',lineWidth:0,lineJoin:'miter',lineCap:'butt',
  createLinearGradient:()=>({addColorStop:()=>{}}),
  ...Object.fromEntries(['clearRect','beginPath','moveTo','lineTo','quadraticCurveTo','closePath','fill','stroke'].map(name=>[name,(...args:number[])=>calls.push({name,args})]))
 } as unknown as CanvasRenderingContext2D;
 const style={top:'#81ecec',bottom:'#0984e3',line:'#74b9ff',lineWidth:1};
 drawWaveform(ctx,[{time:0,level:0},{time:2500,level:.8},{time:5000,level:0}],5000,200,40,style);
 assert.equal(calls.filter(c=>c.name==='fill').length,1);assert.equal(calls.filter(c=>c.name==='stroke').length,1);
 const curves=calls.filter(c=>c.name==='quadraticCurveTo');assert.ok(curves.some(c=>c.args[1]<20));assert.ok(curves.some(c=>c.args[1]>20));
 assert.equal(ctx.lineJoin,'round');assert.equal(ctx.lineWidth,1);
 calls.length=0;drawWaveform(ctx,[{time:0,level:0},{time:5000,level:0}],5000,200,40,style);
 for(const call of calls.filter(c=>['moveTo','lineTo','quadraticCurveTo'].includes(c.name))){assert.equal(call.args[1],20);if(call.args.length===4)assert.equal(call.args[3],20);}
});
