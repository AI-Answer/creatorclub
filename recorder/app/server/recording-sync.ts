import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {probeMedia} from './media.js';
import {UPLOAD_DIR,CACHE_DIR,readMedia,registerMedia,atomicJSON} from './storage.js';
import type {Media,TrackKind,TakeSynchronization} from '../shared/types.js';

const ffmpeg=()=>process.env.SCENEFORGE_FFMPEG||'ffmpeg';
const ffprobe=()=>process.env.SCENEFORGE_FFPROBE||'ffprobe';
function run(binary:string,args:string[],line?:(line:string)=>void):Promise<string>{return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let out='',err='',pending='';
 child.stdout.on('data',chunk=>{if(!line){out+=chunk;return;}pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){line(pending.slice(0,end));pending=pending.slice(end+1);}});
 child.stderr.on('data',chunk=>{err=(err+chunk).slice(-6000);});child.once('error',reject);
 child.once('close',code=>{if(line&&pending)line(pending);code?reject(Error(`${path.basename(binary)} failed: ${err}`)):resolve(out);});
});}
/** Decode the selected recording stream. Container Duration may be missing (live
 * WebM), include a nonzero start PTS, or round a short MP4 by a whole millisecond.
 * Streaming frame rows keeps memory bounded even for multi-hour recordings.
 */
export async function recordingTiming(input:string,video:boolean){
 const metadata=JSON.parse(await run(ffprobe(),['-v','error','-select_streams',video?'v:0':'a:0','-show_streams','-of','json',input]));
 const stream=metadata.streams?.[0];if(!stream)throw Error('A recording source has no decodable stream.');
 const [n,d]=String(stream.avg_frame_rate||'0/1').split('/').map(Number),fps=d&&n/d||30;
 let first=Infinity,end=-Infinity,frames=0,samples=0;
 await run(ffprobe(),['-v','error','-select_streams',video?'v:0':'a:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,duration_time,pkt_duration_time,nb_samples','-of','compact=p=0',input],line=>{
  const row=Object.fromEntries(line.split('|').map(part=>part.split('=')));
  const pts=Number(row.best_effort_timestamp_time);if(!Number.isFinite(pts))return;
  const duration=video?(Number(row.duration_time||row.pkt_duration_time)||1/fps):Number(row.nb_samples)/Number(stream.sample_rate);
  if(!Number.isFinite(duration)||duration<=0)return;first=Math.min(first,pts);end=Math.max(end,pts+duration);frames++;samples+=Number(row.nb_samples)||0;
 });
 if(!frames||end<=first)throw Error('The recording source contains no decoded samples.');
 return {firstPts:first,duration:video?end-first:samples/Number(stream.sample_rate),fps,sampleRate:Number(stream.sample_rate)||undefined,frames};
}
export interface SynchronizeInput {startedAtMs:number;sources:Array<{mediaId:string;track:TrackKind;firstSampleAtMs:number;sourceTimestampUs?:number}>;}
/** Originals are immutable. New playable files carry padding/trims, so preview,
 * export and transcription all consume the identical microphone-based clock.
 */
export async function synchronizeRecording(input:SynchronizeInput):Promise<{media:Media[];offsets:number[];synchronization:TakeSynchronization}>{
 if(!input||!Number.isFinite(input.startedAtMs)||!Array.isArray(input.sources)||!input.sources.length||input.sources.length>8||input.sources.some(s=>!s||!['screen','camera','audio'].includes(s.track)||!Number.isFinite(s.firstSampleAtMs)||s.sourceTimestampUs!==undefined&&!Number.isFinite(s.sourceTimestampUs)||Math.abs(s.firstSampleAtMs-input.startedAtMs)>86400_000))throw Error('Invalid recording synchronization timestamps.');
 const sources=await Promise.all(input.sources.map(async source=>{const media=await readMedia(source.mediaId);if((source.track==='audio')!==(media.kind==='audio'))throw Error('Recording source kind does not match its track.');return {...source,media,timing:await recordingTiming(media.path,media.kind==='video')};}));
 const primary=sources.find(s=>s.media.audioRole==='microphone')??sources.find(s=>s.track==='audio')??sources.find(s=>s.track==='screen')??sources[0];
 const originAtMs=primary.firstSampleAtMs,duration=Math.round(primary.timing.duration*48000)/48000;
 if(duration<=0||duration>86400)throw Error('Invalid recording duration.');
 const folder=path.join(UPLOAD_DIR,'recordings','aligned-'+randomUUID());await fs.mkdir(folder,{recursive:true});
 const media:Media[]=[];
 try{for(const [i,source] of sources.entries()){
  const offset=(source.firstSampleAtMs-originAtMs)/1000,video=source.media.kind==='video';
  if(offset>=duration||offset+source.timing.duration<=0)throw Error('A recording source has no samples overlapping the microphone.');
  const trim=Math.max(0,-offset),pad=Math.max(0,offset),file=path.join(folder,`${i}.${video?'mp4':'wav'}`);
  const args=['-nostdin','-v','error','-y','-i',source.media.path];
  if(video){
   // Reset before trimming: input may have nonzero PTS. Freeze missing head/tail
   // frames; never stretch the performance to fit another source's duration.
   const filter=`setpts=PTS-STARTPTS,trim=start=${trim},setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=${pad}:stop_mode=clone:stop_duration=${duration},fps=${source.timing.fps},trim=end_frame=${Math.ceil(duration*source.timing.fps)},setpts=PTS-STARTPTS`;
   args.push('-map','0:v:0','-an','-vf',filter,'-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart');
  }else{
   const delay=Math.round(pad*48000);
   args.push('-map','0:a:0','-vn','-af',`asetpts=PTS-STARTPTS,atrim=start=${trim},asetpts=PTS-STARTPTS,aresample=48000,adelay=${delay}S:all=1,apad,atrim=end_sample=${Math.round(duration*48000)},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le','-ar','48000');
  }
  args.push(file);await run(ffmpeg(),args);
  const aligned=await probeMedia(file,CACHE_DIR);if(aligned.duration+1e-6<duration)throw Error('Aligned recording is shorter than its microphone timeline.');aligned.name=source.media.name;if(source.media.audioRole)aligned.audioRole=source.media.audioRole;media.push(aligned);
 }
 const synchronization:TakeSynchronization={version:1,startedAtMs:input.startedAtMs,originAtMs,duration,sources:sources.map(s=>({mediaId:s.mediaId,firstSampleAtMs:s.firstSampleAtMs,offset:(s.firstSampleAtMs-originAtMs)/1000,firstPts:s.timing.firstPts,decodedDuration:s.timing.duration,...(s.sourceTimestampUs!==undefined?{sourceTimestampUs:s.sourceTimestampUs}:{})}))};
 await atomicJSON(path.join(folder,'synchronization.json'),synchronization);
 for(const aligned of media)await registerMedia(aligned);
 return {media,offsets:media.map(()=>0),synchronization};
 }catch(error){await fs.rm(folder,{recursive:true,force:true});throw error;}
}
