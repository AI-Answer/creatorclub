import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createProject,clipDuration,type RecordedTake,type TrackKind} from '../shared/types.js';
import {confirmTake,activateSceneTake} from '../src/recorded-takes.js';
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

test('different source onsets, nonzero PTS and lengths import as one microphone-aligned take, with matching content and captions',async()=>{
 const camera=path.join(folder,'camera.mp4'),screen=path.join(folder,'screen.mp4'),mic=path.join(folder,'mic.wav'),system=path.join(folder,'system.wav');
 video(camera,2.4,.8,5);video(screen,4,1.1);
 run(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:a','pcm_s16le',mic]);
 run(['-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=2','-c:a','pcm_s16le',system]);
 const files=[camera,screen,mic,system],before=await Promise.all(files.map(hash));
 const originals=await Promise.all([source(camera),source(screen),source(mic,'microphone'),source(system,'system')]);
 const tracks:TrackKind[]=['camera','screen','audio','audio'],starts=[1200,900,1000,1400];
 const aligned=await synchronizeRecording({startedAtMs:800,sources:originals.map((m,i)=>({mediaId:m.id,track:tracks[i],firstSampleAtMs:starts[i]}))});
 assert.deepEqual(aligned.offsets,[0,0,0,0]);assert.equal(aligned.synchronization.originAtMs,1000);assert.equal(aligned.synchronization.duration,3);
 assert.equal(aligned.synchronization.sources[0].firstPts,5);assert.ok(Math.abs(aligned.synchronization.sources[0].decodedDuration-2.4)<1e-6);
 const p=createProject(),take:RecordedTake={id:'synchronized',createdAt:'now',sceneId:p.scenes[0].id,media:aligned.media,tracks,offsets:aligned.offsets,synchronization:aligned.synchronization};
 confirmTake(p,take);assert.deepEqual(p.clips.map(c=>c.start),[0,0,0,0]);assert.deepEqual(p.clips.map(clipDuration),[3,3,3,3]);assert.equal(p.scenes[0].duration,3);
 for(const [i,m] of aligned.media.entries()){
  const timing=await recordingTiming(m.path,i<2);assert.ok(Math.abs(timing.firstPts)<1/30);assert.ok(Math.abs(timing.duration-3)<1/30);
  if(i<2){const frames=run(['-i',m.path,'-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);let firstWhite=0;while(firstWhite<frames.length/3&&frames[firstWhite*3+1]<200)firstWhite++;assert.ok(Math.abs(firstWhite/30-1)<=1/30,`visual event at ${firstWhite/30} must align to mic time 1s`);assert.equal(brightAt(m.path,.9),false);assert.equal(brightAt(m.path,1.1),true);assert.equal(brightAt(m.path,2.95),true);}
 }
 assert.deepEqual(run(['-i',aligned.media[2].path,'-f','s16le','pipe:1']),run(['-i',mic,'-f','s16le','pipe:1']),'microphone samples must be unchanged');
 const sys=run(['-i',aligned.media[3].path,'-f','s16le','pipe:1']);assert.ok(sys.subarray(0,Math.round(.4*48000)*2).every(b=>b===0),'late system audio gets silence, not a shifted timeline clip');
 const captions=mapSourceCaptions(p,new Map([[aligned.media[2].id,[{id:'word',start:1,end:1.2,text:'Flash',words:[{text:'Flash',start:1,end:1.2}]}]]]));
 assert.equal(captions[0].start,1);assert.equal(captions[0].words![0].start,1);
 p.captions=captions;const initial=structuredClone(p);activateSceneTake(p,take.sceneId,take.id,'keep-both');assert.deepEqual(p,initial,'reactivation must not add a take-sized gap or shift the transcript');
 const saved=await storage.saveProject(p);assert.deepEqual((await storage.readProject(saved.id)).recordedTakes![0].synchronization,aligned.synchronization);
 assert.deepEqual(await Promise.all(files.map(hash)),before,'original captures must remain byte-identical');
});

test('live WebM without Duration uses decoded sample length, including Opus pre-skip',async()=>{
 const file=path.join(folder,'live.webm');run(['-f','lavfi','-i','sine=sample_rate=48000:duration=1.25','-c:a','libopus','-live','1','-f','webm',file]);
 const input=await source(file,'microphone');assert.equal(input.duration,0,'fixture reproduces the missing container Duration');
 const timing=await recordingTiming(file,false);assert.ok(Math.abs(timing.duration-1.25)<.002);
 const aligned=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:input.id,track:'audio',firstSampleAtMs:1050}]});
 assert.ok(Math.abs(aligned.media[0].duration-1.25)<.002);assert.equal(aligned.offsets[0],0);
 const decoded=await recordingTiming(aligned.media[0].path,false);assert.ok(Math.abs(decoded.duration-aligned.media[0].duration)<1/48000);
});

test('late cameras get held opening frames and short tails are held, without retiming the performance',async()=>{
 const file=path.join(folder,'late.mp4'),mic=path.join(folder,'short-mic.wav');video(file,.8,.4);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=2','-c:a','pcm_s16le',mic]);
 const [v,a]=await Promise.all([source(file),source(mic,'microphone')]);
 const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:1300},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]});
 assert.equal(brightAt(result.media[0].path,.1),false);assert.equal(brightAt(result.media[0].path,.6),false);assert.equal(brightAt(result.media[0].path,.8),true);assert.equal(brightAt(result.media[0].path,1.9),true);
 await assert.rejects(synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:4000},{mediaId:a.id,track:'audio',firstSampleAtMs:1000}]}),/no samples overlapping/);
});

test('sub-frame microphone ends never round video down and make a short take disappear early',async()=>{
 const file=path.join(folder,'fractional-camera.mp4'),mic=path.join(folder,'fractional-mic.wav');
 run(['-f','lavfi','-i','color=red:s=96x64:r=30000/1001:d=0.234','-c:v','libx264','-threads','2',file]);
 run(['-f','lavfi','-i','sine=sample_rate=48000:duration=0.18','-c:a','pcm_s16le',mic]);
 const [v,a]=await Promise.all([source(file),source(mic,'microphone')]);
 const result=await synchronizeRecording({startedAtMs:1000,sources:[{mediaId:v.id,track:'camera',firstSampleAtMs:1000},{mediaId:a.id,track:'audio',firstSampleAtMs:1058}]});
 const p=createProject();confirmTake(p,{id:'fractional',sceneId:p.scenes[0].id,media:result.media,tracks:['camera','audio'],offsets:result.offsets,synchronization:result.synchronization});
 assert.deepEqual(p.clips.map(c=>[c.start,clipDuration(c)]),[[0,.18],[0,.18]]);
 const timing=await recordingTiming(result.media[0].path,true);assert.ok(timing.duration>=.18);assert.ok(timing.duration-.18<1/29.97);
});
