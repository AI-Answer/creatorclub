import {takeTimelineDuration} from '../shared/take-timing.js';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createProject,clipDuration,type RecordedTake,type TrackKind} from '../shared/types.js';
import {confirmTake,activateSceneTake,takePreviewProject} from '../src/recorded-takes.js';
import {mapSourceCaptions} from './automation-plans.js';
const folder=await fs.mkdtemp(path.join(os.tmpdir(),'cc-recording-sync-'));
process.env.SCENEFORGE_DATA_DIR=path.join(folder,'studio');
const storage=await import('./storage.js'),{probeMedia}=await import('./media.js'),{synchronizeRecording,recordingTiming}=await import('./recording-sync.js');
await storage.initStorage();after(()=>fs.rm(folder,{recursive:true,force:true}));
const run=(args:string[])=>execFileSync(process.env.SCENEFORGE_FFMPEG||'ffmpeg',['-nostdin','-v','error','-y',...args],{maxBuffer:32*1024*1024});
const hash=async(file:string)=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
async function source(file:string,audioRole?:'microphone'|'system'){const media=await probeMedia(file,storage.CACHE_DIR);if(audioRole)media.audioRole=audioRole;await storage.registerMedia(media);return media;}
const video=(file:string,length:number,event:number,pts=0)=>run(['-f','lavfi','-i',`color=red:s=96x64:r=30:d=${length}`,'-vf',`drawbox=color=white:t=fill:enable='gte(t,${event})'`,'-c:v','libx264','-threads','2','-preset','ultrafast','-output_ts_offset',String(pts),file]);
function brightAt(file:string,time:number){const b=run(['-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.equal(b.length,3);return b[1]>200;}
const ranges=(p:ReturnType<typeof createProject>)=>p.clips.map(c=>[c.start,c.sourceIn,c.sourceOut]);
const near=(actual:number,expected:number,tolerance=1/30)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} must be within ${tolerance} of ${expected}`);
async function tree(){return (await fs.readdir(folder,{recursive:true})).sort();}

test('unequal captures intersect into equal zero-start clips, matching content/captions and no filesystem writes',async()=>{
 const camera=path.join(folder,'camera.mp4'),screen=path.join(folder,'screen.mp4'),mic=path.join(folder,'mic.wav'),system=path.join(folder,'system.wav');
 video(camera,2.4,.8,5);video(screen,4,1.1);
 run(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:a','pcm_s16le',mic]);
 run(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=2.4','-c:a','pcm_s16le',system]);
 const files=[camera,screen,mic,system],before=await Promise.all(files.map(hash));
 const originals=await Promise.all([source(camera),source(screen),source(mic,'microphone'),source(system,'system')]);
 const tracks:TrackKind[]=['camera','screen','audio','audio'],starts=[1200,900,1000,1100],beforeTree=await tree();
 const aligned=await synchronizeRecording({startedAtMs:800,sources:originals.map((m,i)=>({mediaId:m.id,track:tracks[i],firstSampleAtMs:starts[i],sourceTimestampUs:i===0?123456:undefined}))});
 assert.deepEqual(await tree(),beforeTree,'synchronization must not create files, media registrations or aligned directories');
 assert.deepEqual(aligned.media.map(m=>[m.id,m.path]),originals.map(m=>[m.id,m.path]));
 assert.deepEqual(aligned.offsets,[0,0,0,0]);assert.equal(aligned.synchronization.version,3);assert.equal(aligned.synchronization.originAtMs,1000);near(aligned.synchronization.duration,2.3,1e-9);
 assert.equal(aligned.synchronization.takeStart,.2);assert.equal(aligned.synchronization.takeEnd,2.5);assert.equal(aligned.synchronization.frameRate,30);assert.ok(aligned.synchronization.sources.every(s=>!s.intersectionExclusion));
 assert.deepEqual(aligned.synchronization.sources.map(s=>s.offset),[.2,-.1,0,.1]);
 assert.equal(aligned.synchronization.sources[0].firstPts,5);assert.equal(aligned.synchronization.sources[0].sourceTimestampUs,123456);near(aligned.synchronization.sources[0].decodedDuration,2.4,1e-6);
 const p=createProject(),take:RecordedTake={id:'synchronized',createdAt:'now',sceneId:p.scenes[0].id,media:aligned.media,tracks,offsets:aligned.offsets,synchronization:aligned.synchronization};
 const preview=takePreviewProject(p,take);confirmTake(p,take);
 const expected=[[0,0,2.3],[0,.3,2.6],[0,.2,2.5],[0,.1,2.4]];
 for(const [i,range] of ranges(p).entries())range.forEach((n,j)=>near(n,expected[i][j],1e-6));
 assert.deepEqual(ranges(preview),ranges(p));near(p.scenes[0].duration,2.3,1e-9);near(p.recordedTakes![0].timeline!.duration,2.3,1e-9);near(takeTimelineDuration(take),2.3,1e-9);
 for(const c of p.clips){assert.equal(c.start,0);near(clipDuration(c),2.3,1e-9);}
 assert.ok(p.clips[0].linkId);assert.equal(new Set(p.clips.map(c=>c.linkId)).size,1);
 // Mic time 1s is take time .8s after removing the common .2s head.
 for(const c of p.clips.slice(0,2)){
  const m=p.media.find(m=>m.id===c.mediaId)!;
  assert.equal(brightAt(m.path,c.sourceIn+.7-c.start),false);assert.equal(brightAt(m.path,c.sourceIn+.9-c.start),true);
  const event=c.track==='camera'?.8:1.1;near(c.start+event-c.sourceIn,.8);
 }
 const captions=mapSourceCaptions(p,new Map([[aligned.media[2].id,[{id:'word',start:1,end:1.2,text:'Flash',words:[{text:'Flash',start:1,end:1.2}]}]]]));
 assert.equal(captions[0].start,.8);assert.equal(captions[0].words![0].start,.8);
 const bounded=mapSourceCaptions(p,new Map([[aligned.media[2].id,[{id:'edges',start:0,end:3,text:'Before Head Tail After',words:[{text:'Before',start:0,end:.1},{text:'Head',start:.1,end:.3},{text:'Tail',start:2.4,end:2.6},{text:'After',start:2.7,end:3}]}]]]));
 assert.deepEqual(bounded.flatMap(c=>c.words?.map(w=>w.text)),['Head','Tail']);
 near(bounded[0].start,0,1e-9);near(bounded.at(-1)!.end,2.3,1e-9);
 const segment=mapSourceCaptions(p,new Map([[aligned.media[2].id,[{id:'segment',start:0,end:3,text:'Clipped segment'}]]]));
 near(segment[0].start,0,1e-9);near(segment[0].end,2.3,1e-9);
 p.captions=captions;const initial=structuredClone(p);activateSceneTake(p,take.sceneId,take.id,'keep-both');assert.deepEqual(p,initial,'reactivation must not append the take or shift its transcript');
 const saved=await storage.saveProject(p);assert.deepEqual((await storage.readProject(saved.id)).recordedTakes![0].synchronization,aligned.synchronization);
 assert.deepEqual(await Promise.all(files.map(hash)),before,'original captures must remain byte-identical');
});

test('pre-roll keeps from half a second before go; sources armed earlier are trimmed and judged only on the kept window',async()=>{
 const camera=path.join(folder,'preroll-camera.mp4'),screen=path.join(folder,'preroll-screen.mp4'),mic=path.join(folder,'preroll-mic.wav');
 video(camera,3.9,2);video(screen,4,1);run(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-c:a','pcm_s16le',mic]);
 const media=await Promise.all([source(camera),source(screen),source(mic,'microphone')]),tracks:TrackKind[]=['camera','screen','audio'],starts=[1100,2300,1000];
 const input=(keepFromMs?:number)=>({startedAtMs:900,...(keepFromMs===undefined?{}:{keepFromMs}),sources:media.map((m,i)=>({mediaId:m.id,track:tracks[i],firstSampleAtMs:starts[i]}))});
 // Go at 3000 ms: the take keeps from 2500 ms. Screen capture rolled 1.3 s after the microphone, still before the pre-roll.
 const aligned=await synchronizeRecording(input(2500)),sync=aligned.synchronization;
 near(sync.takeStart!,1.5,1e-9);near(sync.takeEnd!,4,1e-9);near(sync.duration,2.5,1e-9);assert.deepEqual(aligned.offsets,[0,0,0]);
 assert.ok(sync.sources.every(s=>!s.intersectionExclusion),'a source that began before the kept window misses nothing');
 near(sync.sources[0].sourceIn!,1.4,1e-9);near(sync.sources[1].sourceIn!,.2,1e-9);near(sync.sources[2].sourceIn!,1.5,1e-9);
 assert.ok(sync.sources.every(s=>Math.abs(s.sourceOut!-s.sourceIn!-2.5)<1e-9),'every clip keeps the same length');
 // Without a pre-roll window the late screen would count as missing 1.3 s of the clock and be left out.
 assert.equal((await synchronizeRecording(input())).synchronization.sources[1].intersectionExclusion?.reason,'insufficient-coverage');
 // Capture that armed after go (no countdown) has nothing before the pre-roll point: the result is unchanged.
 assert.deepEqual((await synchronizeRecording(input(500))).synchronization,(await synchronizeRecording(input())).synchronization);
 await assert.rejects(synchronizeRecording({...input(),keepFromMs:Number.NaN}),/Invalid recording synchronization/);
});
test('live WebM without Duration counts Opus samples and pre-skip without decoding or rewriting audio',async()=>{
 for(const packetDuration of [2.5,20,60]){
  const file=path.join(folder,`live-${packetDuration}.webm`);run(['-f','lavfi','-i','sine=sample_rate=48000:duration=1.25','-c:a','libopus','-frame_duration',String(packetDuration),'-live','1','-f','webm',file]);
  const input=await source(file,'microphone');assert.equal(input.duration,0,'fixture reproduces the missing container Duration');
  const timing=await recordingTiming(file,false);near(timing.duration,1.25,1/48000);
  const aligned=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:input.id,track:'audio',firstSampleAtMs:1050}]});
  near(aligned.media[0].duration,1.25,1/48000);assert.equal(aligned.media[0].path,input.path);assert.equal(aligned.media[0].id,input.id);assert.equal(aligned.offsets[0],0);
  assert.equal((await storage.readMedia(input.id)).duration,0,'the existing media catalog is not rewritten');
 }
});

test('failed camera is excluded from the intersection and keeps its own shorter coverage',async()=>{
 const file=path.join(folder,'late.mp4'),mic=path.join(folder,'short-mic.wav');video(file,.8,.4);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=2','-c:a','pcm_s16le',mic]);
 const [v,a]=await Promise.all([source(file),source(mic,'microphone')]);
 const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:1300},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]});
 const p=createProject();confirmTake(p,{id:'late',sceneId:p.scenes[0].id,media:result.media,tracks:['camera','audio'],offsets:result.offsets,synchronization:result.synchronization});
 assert.deepEqual(ranges(p),[[.3,0,.8],[0,0,2]]);assert.equal(result.synchronization.sources[0].intersectionExclusion?.reason,'insufficient-coverage');near(result.synchronization.sources[0].intersectionExclusion!.lostDuration,1.2,1e-9);assert.ok(p.clips[0].linkId);assert.equal(p.clips[0].linkId,p.clips[1].linkId);near(p.clips[0].start+clipDuration(p.clips[0]),1.1,1e-6);assert.equal(p.scenes[0].duration,2);
 await assert.rejects(synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:4000},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]}),/no samples overlapping/);
 await assert.rejects(synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:100},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]}),/no samples overlapping/);
});

test('fractional-frame tails round the common range inward without rounding audio offsets',async()=>{
 const file=path.join(folder,'fractional-camera.mp4'),mic=path.join(folder,'fractional-mic.wav');
 run(['-f','lavfi','-i','color=red:s=96x64:r=30000/1001:d=0.234','-frames:v','7','-c:v','libx264','-threads','2',file]);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=0.18','-c:a','pcm_s16le',mic]);
 const [v,a]=await Promise.all([source(file),source(mic,'microphone')]);
 const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:1000},{mediaId:a.id,track:'audio',firstSampleAtMs:1058}]});
 const p=createProject();confirmTake(p,{id:'fractional',sceneId:p.scenes[0].id,media:result.media,tracks:['camera','audio'],offsets:result.offsets,synchronization:result.synchronization});
 assert.equal(p.clips[0].sourceIn,.058);const duration=5*1001/30000;
 for(const c of p.clips){assert.equal(c.start,0);near(clipDuration(c),duration,1e-9);assert.ok(c.sourceOut<=result.synchronization.sources.find(s=>s.mediaId===c.mediaId)!.decodedDuration+1e-9);}
 near(p.scenes[0].duration,duration,1e-9);assert.equal(p.clips[1].sourceIn,0);near(p.clips[1].sourceOut,duration,1e-9);
});

test('without a microphone the screen is the clock, otherwise the first source is',async()=>{
 const camera=path.join(folder,'fallback-camera.mp4'),screen=path.join(folder,'fallback-screen.mp4'),system=path.join(folder,'fallback-system.wav');video(camera,3,1);video(screen,2,1);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=4','-c:a','pcm_s16le',system]);
 const [v,s,a]=await Promise.all([source(camera),source(screen),source(system,'system')]);
 const entries=[{mediaId:a.id,track:'audio' as const,firstSampleAtMs:900},{mediaId:v.id,track:'camera' as const,firstSampleAtMs:1100},{mediaId:s.id,track:'screen' as const,firstSampleAtMs:1000}];
 const result=await synchronizeRecording({startedAtMs:800,sources:entries});assert.equal(result.synchronization.originAtMs,1000);near(result.synchronization.duration,1.9,1e-9);
 const first=await synchronizeRecording({startedAtMs:800,sources:entries.slice(0,2)});assert.equal(first.synchronization.originAtMs,900);assert.equal(first.synchronization.duration,3);
});

test('without a microphone the guardrail and the frame grid run on the screen clock',async()=>{
 const camera=path.join(folder,'nomic-camera.mp4'),screen=path.join(folder,'nomic-screen.mp4'),system=path.join(folder,'nomic-system.wav');
 video(camera,.6,.3);video(screen,4,1);run(['-f','lavfi','-i','sine=sample_rate=48000:duration=4','-c:a','pcm_s16le',system]);
 const [c,s,a]=await Promise.all([source(camera),source(screen),source(system,'system')]);
 const result=await synchronizeRecording({startedAtMs:900,sources:[{mediaId:c.id,track:'camera',firstSampleAtMs:1000},{mediaId:s.id,track:'screen',firstSampleAtMs:1000},{mediaId:a.id,track:'audio',firstSampleAtMs:1013}]});
 const sync=result.synchronization,by=(id:string)=>sync.sources.find(source=>source.mediaId===id)!;
 assert.equal(sync.originAtMs,1000);
 // The camera covers 0.6 s of a 4 s screen clock, so it is excluded and ends early on its own.
 assert.equal(by(c.id).intersectionExclusion?.reason,'insufficient-coverage');near(by(c.id).intersectionExclusion!.lostDuration,3.4,1e-6);
 assert.equal(by(s.id).intersectionExclusion,undefined);assert.equal(by(a.id).intersectionExclusion,undefined);
 // Screen and system audio share [0.013, 4]; the start rounds up to the next 30 fps frame, the end stays on the grid.
 near(sync.takeStart!,1/30,1e-9);near(sync.takeEnd!,4,1e-9);near(sync.duration,4-1/30,1e-9);
 near(by(s.id).sourceIn!,1/30,1e-9);near(by(a.id).sourceIn!,1/30-.013,1e-9);
 near(by(s.id).sourceOut!-by(s.id).sourceIn!,by(a.id).sourceOut!-by(a.id).sourceIn!,1e-9);
});
test('guardrail uses either one second or 25 percent, while modest camera stop latency trims every track',async()=>{
 for(const [name,micDuration,cameraDuration,excluded] of [['absolute',10,8.8,true],['relative',2,1.4,true],['failed',3,.3,true],['normal',3,2.6,false]] as const){
  const camera=path.join(folder,`guard-${name}.mp4`),mic=path.join(folder,`guard-${name}.wav`);video(camera,cameraDuration,0);
  run(['-f','lavfi','-i',`sine=sample_rate=48000:duration=${micDuration}`,'-c:a','pcm_s16le',mic]);
  const [v,a]=await Promise.all([source(camera),source(mic,'microphone')]);
  const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:1000},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]});
  assert.equal(!!result.synchronization.sources[0].intersectionExclusion,excluded,name);
  near(result.synchronization.duration,excluded?micDuration:cameraDuration,1e-9);
  assert.deepEqual(result.offsets,[0,0]);
  const p=createProject();confirmTake(p,{id:name,sceneId:p.scenes[0].id,media:result.media,tracks:['camera','audio'],offsets:result.offsets,synchronization:result.synchronization});
  near(clipDuration(p.clips[0]),cameraDuration,1e-9);near(clipDuration(p.clips[1]),excluded?micDuration:cameraDuration,1e-9);
  await storage.saveProject(p);
 }
});

test('highest video rate defines one common frame grid and audio-only sources keep sample precision',async()=>{
 const camera=path.join(folder,'grid-camera.mp4'),screen=path.join(folder,'grid-screen.mp4'),mic=path.join(folder,'grid-mic.wav');
 video(camera,3,1);
 run(['-f','lavfi','-i','color=red:s=96x64:r=60:d=3','-c:v','libx264','-threads','2',screen]);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=3.013','-c:a','pcm_s16le',mic]);
 const [v,s,a]=await Promise.all([source(camera),source(screen),source(mic,'microphone')]);
 const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:1021},{mediaId:s.id,track:'screen',firstSampleAtMs:1011},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]});
 assert.equal(result.synchronization.frameRate,60);near(result.synchronization.takeStart!,2/60,1e-9);assert.equal(result.synchronization.takeEnd,3);
 const p=createProject();confirmTake(p,{id:'grid',sceneId:p.scenes[0].id,media:result.media,tracks:['camera','screen','audio'],offsets:result.offsets,synchronization:result.synchronization});
 for(const c of p.clips){assert.equal(c.start,0);near(clipDuration(c),178/60,1e-9);}
 const audio=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]});
 assert.equal(audio.synchronization.frameRate,undefined);near(audio.synchronization.duration,3.013,1/48000);
});

test('ten-minute 4K recording synchronization only probes and completes in under 2.5 seconds',async(t)=>{
 const seed=path.join(folder,'4k-seed.mp4'),file=path.join(folder,'ten-minutes.mp4'),mic=path.join(folder,'ten-minutes.webm');
 run(['-f','lavfi','-i','color=red:s=3840x2160:r=30:d=1','-c:v','libx264','-threads','2','-preset','ultrafast',seed]);
 run(['-stream_loop','599','-i',seed,'-c','copy',file]);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=600','-c:a','libopus','-live','1','-f','webm',mic]);
 const [v,a]=await Promise.all([source(file),source(mic,'microphone')]),before=await tree();
 const begin=performance.now();
 const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'screen',firstSampleAtMs:1000},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]});
 const elapsed=performance.now()-begin;t.diagnostic(`600s 3840x2160 H.264 + live Opus synchronize: ${elapsed.toFixed(1)} ms`);
 assert.ok(elapsed<2500,`probe-only synchronization took ${elapsed.toFixed(1)}ms`);near(result.synchronization.duration,600,1/48000);near(result.synchronization.sources[0].decodedDuration,600,1/30);
 assert.deepEqual(result.media.map(m=>m.id),[v.id,a.id]);assert.deepEqual(await tree(),before,'long takes must not create any files');
});


test('excluded camera before the take range preserves originals while healthy tracks save, load and install',async()=>{
 const camera=path.join(folder,'excluded-camera.mp4'),screen=path.join(folder,'healthy-screen.mp4'),mic=path.join(folder,'healthy-mic.wav');
 video(camera,.4,0);video(screen,3.2,0);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=4','-c:a','pcm_s16le',mic]);
 const originals=await Promise.all([source(camera),source(screen),source(mic,'microphone')]),before=await Promise.all([camera,screen,mic].map(hash));
 const aligned=await synchronizeRecording({startedAtMs:1000,sources:originals.map((m,i)=>({mediaId:m.id,track:(['camera','screen','audio'] as const)[i],firstSampleAtMs:i===1?1800:1000}))});
 near(aligned.synchronization.takeStart!,.8,1e-9);near(aligned.synchronization.duration,3.2,1e-9);
 assert.deepEqual(aligned.media.map(m=>m.id),originals.map(m=>m.id));
 assert.equal(aligned.synchronization.sources[0].intersectionExclusion?.reason,'insufficient-coverage');
 const p=createProject(),take:RecordedTake={id:'excluded-camera',createdAt:'now',sceneId:p.scenes[0].id,media:aligned.media,tracks:['camera','screen','audio'],offsets:aligned.offsets,synchronization:aligned.synchronization};
 assert.deepEqual(takePreviewProject(p,take).clips.map(c=>c.track),['screen','audio']);
 const saved=await storage.saveProject({...p,recordedTakes:[take]}),loaded=await storage.readProject(saved.id);
 confirmTake(loaded,loaded.recordedTakes![0]);
 assert.deepEqual(loaded.clips.map(c=>c.track),['screen','audio']);
 for(const clip of loaded.clips)near(clipDuration(clip),3.2,1e-9);
 assert.equal(loaded.recordedTakes![0].media.length,3);assert.equal(loaded.recordedTakes![0].timeline!.clips.length,2);
 await storage.saveProject(loaded);
 const installed=await storage.readProject(saved.id);assert.equal(installed.clips.length,2);assert.equal(installed.recordedTakes![0].synchronization!.sources.length,3);
 assert.deepEqual(await Promise.all([camera,screen,mic].map(hash)),before);
});
