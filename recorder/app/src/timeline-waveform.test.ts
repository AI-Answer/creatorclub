import test from 'node:test';import assert from 'node:assert/strict';
import {TimelineWaveformCache,WAVEFORM_MAX_PEAKS,hasWaveform,waveformBars,waveformHeight,waveformMediaKey,waveformEnvelopePath,waveformSpikesPath} from './timeline-waveform';
import {defaultEffects,defaultTransform,type Clip,type Media} from '../shared/types';
const media:Media={id:'source',path:'/fixture/source.wav',name:'Audio',kind:'audio',duration:10,width:0,height:0};
const clip:Clip={id:'c',mediaId:'source',name:'Trimmed',track:'audio',start:20,sourceIn:4,sourceOut:8,speed:2,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('speech columns stay mirrored and separated, while silence draws no artificial sound',()=>{
 const path=waveformSpikesPath([{x:1,peak:0},{x:3,peak:.006},{x:5,peak:.2}],40,20);
 assert.equal((path.match(/M/g)??[]).length,2);assert.equal(waveformSpikesPath([{x:1,peak:0}],40,20),'');
 const columns=[...path.matchAll(/M([\d.]+) ([\d.]+)h1V([\d.]+)h-1Z/g)];assert.equal(columns.length,2);
 for(const [,x,top,bottom] of columns){assert.ok(Number(x)>1);assert.ok(Math.abs(Number(top)+Number(bottom)-80)<.02);}
 assert.ok(Number(columns[0][3])-Number(columns[0][2])>14,'quiet speech occupies a readable part of the body');
 assert.ok(Number(columns[1][3])-Number(columns[1][2])>Number(columns[0][3])-Number(columns[0][2]),'louder speech remains taller');
});
test('trim and speed sample later source bins instead of beginning of file',()=>{const peaks=Array.from({length:10},(_,i)=>i/10),bars=waveformBars(clip,media,peaks,3,20,22);assert.deepEqual(bars,[{x:1.5,peak:.5},{x:4.5,peak:.7}]);});
test('visible scroll window maps source time and preserves quiet amplitude, gaps and bounds',()=>{const peaks=[0,0,0,0,.01,.01,.02,.02,0,0];assert.deepEqual(waveformBars(clip,media,peaks,3,21,22),[{x:4.5,peak:.02}]);assert.deepEqual(waveformBars(clip,media,peaks,3,0,19),[]);assert.deepEqual(waveformBars(clip,{...media,duration:0},peaks,3,20,22),[]);assert.ok(waveformBars(clip,media,peaks,100000,20,22).length<=1200);});
test('bars sit on a fixed timeline pixel grid so a moving window keeps every shared bar unchanged',()=>{
 const long={...clip,start:20.37,sourceIn:1,sourceOut:9,speed:1},peaks=Array.from({length:200},(_,i)=>(i*37%101)/100),scale=55,origin=long.start*scale;
 const a=waveformBars(long,media,peaks,scale,20,24),b=waveformBars(long,media,peaks,scale,21.3,27),byX=new Map(a.map(bar=>[bar.x,bar.peak]));let shared=0;
 for(const bar of [...a,...b])assert.ok(Math.abs(((bar.x+origin-1.5)/3)-Math.round((bar.x+origin-1.5)/3))<1e-9);
 for(const bar of b)if(byX.has(bar.x)){shared++;assert.equal(bar.peak,byX.get(bar.x));}assert.ok(shared>=40);
 assert.deepEqual(waveformBars(clip,media,Array.from({length:10},(_,i)=>i/10),3,20,22,1),[{x:3,peak:.7}]);
});
test('one filled envelope per clip mirrors each bar about the centerline and collapses flat runs',()=>{
 assert.equal(waveformEnvelopePath([{x:1.5,peak:.001},{x:4.5,peak:0},{x:7.123,peak:1}],14,12),'M1.5 14L1.5 12 4.5 14 7.12 2 7.12 14 7.12 26 4.5 14 1.5 16Z');
 assert.equal(waveformEnvelopePath([]),'');assert.equal(waveformEnvelopePath([{x:1,peak:0},{x:3,peak:0}]),'');
 const flat=waveformEnvelopePath([{x:1,peak:.001},{x:3,peak:.001},{x:5,peak:.001},{x:7,peak:.001}],10,12);assert.equal(flat,'M1 10L1 8 7 8 7 10 7 12 1 12Z');
 const peaks=Array.from({length:10},(_,i)=>i/10);assert.equal(waveformBars(clip,media,peaks,3,20,22,4096,2).length,3);
});
test('muted and gain-adjusted clips retain raw source waveform without normalization',()=>{const peaks=Array(10).fill(.04);for(const change of [{muted:true},{gain:20},{gain:0}])assert.ok(waveformBars({...clip,...change},media,peaks,3,20,22).every(b=>b.peak===.04));assert.ok(hasWaveform({...media,kind:'video'}));assert.ok(!hasWaveform({...media,kind:'video',hasAudio:false}));assert.ok(!hasWaveform({...media,kind:'image'}));});
test('zoom past source resolution interpolates bin centers instead of stretching peaks into blocks',()=>{
 const m={...media,duration:1},c={...clip,start:0,sourceIn:0,sourceOut:1,speed:1},bars=waveformBars(c,m,[0,1],100,0,1,200,1);
 assert.equal(bars.length,100);assert.equal(bars[10].peak,0);assert.equal(bars[90].peak,1);
 for(let i=26;i<74;i++)assert.ok(Math.abs(bars[i].peak-bars[i-1].peak-.02)<1e-10,'each pixel moves smoothly between the source bin centers');
 const scrolled=waveformBars(c,m,[0,1],100,.333,.719,200,1);for(const bar of scrolled)assert.equal(bar.peak,bars.find(b=>b.x===bar.x)!.peak);
 const trimmed=waveformBars({...c,start:20,sourceIn:.25,sourceOut:.75,speed:2},m,[0,1],100,20,20.25,200,1);assert.ok(Math.abs(trimmed[0].peak-.02)<1e-10);assert.ok(Math.abs(trimmed.at(-1)!.peak-.98)<1e-10);
});
test('three-hour sources retain 50 Hz detail and max-pooling keeps only visible pixel columns',()=>{
 const m={...media,duration:10800},c={...clip,start:0,sourceIn:0,sourceOut:m.duration,speed:1},peaks=Array.from({length:540000},(_,i)=>(i*37%101)/100);
 const detail=waveformBars(c,m,peaks,1000,100,101,1200,1);assert.equal(detail.length,1000);assert.ok(new Set(detail.map(b=>b.peak)).size>200);
 for(const [from,to] of [[0,10800],[314,8014],[10780,10800]]){const bars=waveformBars(c,m,peaks,.1,from,to,1200,1);assert.ok(bars.length<=Math.ceil((to-from)*.1)+2);for(const bar of bars){const lo=Math.max(0,Math.floor((bar.x-.5)/.1*50)),hi=Math.min(peaks.length,Math.ceil((bar.x+.5)/.1*50));assert.equal(bar.peak,Math.max(...peaks.slice(lo,hi)));}}
 const invalid=Array(130).fill(NaN);invalid[120]=.3;assert.equal(waveformBars({...c,sourceOut:1},{...m,duration:1},invalid,1,0,1,1200,1)[0].peak,.3);
});
test('cache accepts compact numeric arrays through 24 hours and rejects oversized payloads',async()=>{
 assert.equal(WAVEFORM_MAX_PEAKS,24*60*60*50);assert.equal(JSON.parse(waveformMediaKey(media))[0],'wave-v3');
 const peaks=Array(99000).fill(.0123),cache=new TimelineWaveformCache(async()=>peaks);let received:readonly number[]=[];const off=cache.subscribe(media,p=>received=p);await tick();assert.equal(received.length,99000);assert.equal(received[98999],.0123);off();
 const maximum=Array(WAVEFORM_MAX_PEAKS).fill(0),full=new TimelineWaveformCache(async()=>maximum),release=full.subscribe({...media,duration:86400},p=>received=p);await tick();assert.equal(received.length,WAVEFORM_MAX_PEAKS);release();
 const tooLong=new TimelineWaveformCache(async()=>Array(WAVEFORM_MAX_PEAKS+1).fill(0)),done=tooLong.subscribe(media,p=>received=p);await tick();assert.deepEqual(received,[]);done();
});
test('cache deduplicates active sources, bounds concurrency and withdraws hidden queued requests',async()=>{
 let active=0,max=0;const calls:string[]=[],finish=new Map<string,(p:number[])=>void>();const cache=new TimelineWaveformCache(m=>{calls.push(m.id);active++;max=Math.max(max,active);return new Promise<number[]>(resolve=>finish.set(m.id,p=>{active--;resolve(p)}));},2,2);
 const values:number[][]=[];const a=cache.subscribe(media,p=>values.push([...p])),b=cache.subscribe(media,p=>values.push([...p]));const c=cache.subscribe({...media,id:'two'},()=>{}),d=cache.subscribe({...media,id:'hidden'},()=>{});await tick();assert.deepEqual(calls,['source','two']);d();a();finish.get('source')!([.1,.2]);finish.get('two')!([.3]);await tick();assert.equal(max,2);assert.deepEqual(values,[[.1,.2]]);assert.equal(calls.length,2);b();c();const cached:number[][]=[];cache.subscribe(media,p=>cached.push([...p]))();assert.deepEqual(cached,[[.1,.2]]);assert.equal(calls.length,2);
});
test('late completion cannot update unsubscribed view, identity changes refetch and failures do not loop',async()=>{
 let resolve!:(p:number[])=>void,calls=0,received=0;const cache=new TimelineWaveformCache(()=>{calls++;return new Promise<number[]>(r=>resolve=r)});const release=cache.subscribe(media,()=>received++);await tick();release();resolve([.7]);await tick();assert.equal(received,0);cache.subscribe(media,()=>received++)();assert.equal(received,1);const replacement={...media,path:'/fixture/relinked.wav'};assert.notEqual(waveformMediaKey(media),waveformMediaKey(replacement));cache.subscribe(replacement,()=>{})();await tick();assert.equal(calls,2);resolve([]);await tick();const bad=new TimelineWaveformCache(async()=>{calls++;throw Error('unavailable')});bad.subscribe(media,()=>{});await tick();const count=calls;bad.subscribe(media,()=>{})();await tick();assert.equal(calls,count);
});
test('embedded whole-source envelopes avoid requests and result cache evicts least recently used unused data',async()=>{let calls=0;const cache=new TimelineWaveformCache(async()=>{calls++;return [.1]},1,1);let received:readonly number[]=[];cache.subscribe({...media,waveform:[.01,.02]},p=>received=p)();assert.deepEqual(received,[.01,.02]);assert.equal(calls,0);let off=cache.subscribe(media,()=>{});await tick();off();off=cache.subscribe({...media,id:'two'},()=>{});await tick();off();cache.subscribe(media,()=>{});await tick();assert.equal(calls,3);});
import {resolveShortcut,shortcutDefinitions} from './shortcuts';
test('E toggles waveforms only in the editor outside typing, repeat and modal contexts',()=>{const definition=shortcutDefinitions.find(d=>d.id==='toggleWaveforms')!;assert.equal(definition.extension,true);assert.equal(resolveShortcut({key:'e'},{scope:'edit'})?.id,'toggleWaveforms');for(const context of [{scope:'record' as const},{scope:'edit' as const,editable:true},{scope:'edit' as const,modal:true}])assert.equal(resolveShortcut({key:'e'},context),null);assert.equal(resolveShortcut({key:'e',repeat:true},{scope:'edit'}),null);assert.equal(resolveShortcut({key:'e',isComposing:true},{scope:'edit'}),null);});

test('fixed dBFS curve exposes quiet speech and preserves loudness, silence and headroom',()=>{
 assert.equal(waveformHeight(0),0);assert.equal(waveformHeight(1),13);
 assert.equal(waveformHeight(.000001),0);assert.equal(waveformHeight(NaN),0);assert.equal(waveformHeight(Infinity),0);assert.equal(waveformHeight(-1),0);assert.equal(waveformHeight(2),13);
 // A real quiet mic at -44 dBFS occupied less than 8% of the old square-root envelope: now over a third is visible.
 assert.ok(waveformHeight(.006,30)>11);assert.ok(waveformHeight(.01,30)>13);
 const amplitudes=[.001,.006,.01,.04,.1,.6,1],heights=amplitudes.map(p=>waveformHeight(p,30));
 assert.ok(heights.every((h,i)=>i===0||h>heights[i-1]));
 // Equal 20 dB changes occupy equal height; no source is independently normalized to full height.
 const step=waveformHeight(.01)-waveformHeight(.001);
 assert.ok(Math.abs((waveformHeight(.1)-waveformHeight(.01))-step)<1e-9);
 assert.ok(waveformHeight(.6,30)<30);
});
test('failed waveform retries with backoff while visible and can be subscribed again after leaving',async()=>{
 let calls=0;const cache=new TimelineWaveformCache(async()=>{if(++calls<2)throw Error('offline');return [.2,.4];},128,2,15),values:number[][]=[];
 const release=cache.subscribe(media,peaks=>values.push([...peaks]));await tick();assert.equal(calls,1);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,2);assert.deepEqual(values.at(-1),[.2,.4]);release();
 const bad=new TimelineWaveformCache(async()=>{calls++;throw Error('offline');},128,2,15),off=bad.subscribe(media,()=>{});await tick();off();const before=calls;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,before);const retry=bad.subscribe(media,()=>{});await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,before+1);retry();
});
