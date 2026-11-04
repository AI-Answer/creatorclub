import {spawn} from 'node:child_process';
import path from 'node:path';
import {readMedia} from './storage.js';
import type {Media,TrackKind,TakeSynchronization} from '../shared/types.js';

const ffprobe=()=>process.env.SCENEFORGE_FFPROBE||'ffprobe';
function run(binary:string,args:string[],line?:(line:string)=>void):Promise<string>{return new Promise((resolve,reject)=>{
 const child=spawn(binary,args,{stdio:['ignore','pipe','pipe']});let out='',err='',pending='';
 child.stdout.on('data',chunk=>{if(!line){out+=chunk;return;}pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){line(pending.slice(0,end));pending=pending.slice(end+1);}});
 child.stderr.on('data',chunk=>{err=(err+chunk).slice(-6000);});child.once('error',reject);
 child.once('close',code=>{if(line&&pending)line(pending);code?reject(Error(`${path.basename(binary)} failed: ${err}`)):resolve(out);});
});}
const ratio=(value:unknown)=>{const [n,d]=String(value).split('/').map(Number);return d?n/d:0;};
/** Opus packet sample count from its TOC (RFC 6716 section 3.1). Container packet
 * durations round to milliseconds and may already include end-discard padding.
 * Reading the TOC avoids both that rounding and a full audio decode.
 */
function opusSamples(line:string){
 const bytes=/00000000: ([\da-f]{2})([\da-f]{2})?/i.exec(line);if(!bytes)return NaN;
 const toc=parseInt(bytes[1],16),config=toc>>3,code=toc&3;
 const count=code===0?1:code===3?(parseInt(bytes[2],16)&63):2;
 const frame=config>=16?120*(2**(config&3)):config>=12?480*(2**(config&1)):(config&3)===3?2880:480*(2**(config&3));
 return count>0&&frame*count<=5760?frame*count:NaN;
}
/** Probe exact stream bounds without decoding video. MP4 sample tables and PCM
 * durations are exact; unindexed/live WebM falls back to a bounded-memory packet
 * scan. Opus uses TOC sample counts, pre-skip and discard-padding. Audio without exact stream
 * timing or packet side-data support uses the streaming decoder fallback.
 */
export async function recordingTiming(input:string,video:boolean){
 const metadata=JSON.parse(await run(ffprobe(),['-v','error','-select_streams',video?'v:0':'a:0','-show_streams','-show_format','-show_program_version','-of','json',input]));
 const stream=metadata.streams?.[0];if(!stream)throw Error('A recording source has no decodable stream.');
 const fps=ratio(stream.r_frame_rate)||ratio(stream.avg_frame_rate)||30,sampleRate=Number(stream.sample_rate)||undefined;
 const exactDuration=Number(stream.duration_ts)*ratio(stream.time_base),start=Number(stream.start_time)||0;
 const indexedVideo=video&&String(metadata.format?.format_name).split(',').some(f=>['mov','mp4'].includes(f));
 if((indexedVideo||!video&&(/^(pcm_|aac$|alac$|flac$)/.test(stream.codec_name)))&&Number.isFinite(exactDuration)&&exactDuration>0){
  return {firstPts:start,duration:exactDuration,fps,sampleRate,frames:Number(stream.nb_frames)||undefined};
 }
 // Older bundled ffprobe cannot expose packet skip/discard side data. Its
 // streaming audio decoder is the accurate fallback for live WebM.
 const probeMajor=Number(/(\d+)\./.exec(metadata.program_version?.version||'')?.[1]);
 let first=Infinity,end=-Infinity,frames=0,samples=0,invalid=false;
 if(video||stream.codec_name==='opus'&&probeMajor>=6){
  const opus=!video;
  await run(ffprobe(),['-v','error','-select_streams',video?'v:0':'a:0','-show_packets',...(opus?['-show_data']:[]),'-show_entries',`packet=pts_time,duration_time${opus?',data:side_data=skip_samples,discard_padding':''}`,'-of','compact=p=0',input],line=>{
   const value=(key:string)=>Number(new RegExp(`(?:^|[|:])${key}=([^|]+)`).exec(line)?.[1]);
   const pts=value('pts_time');if(!Number.isFinite(pts))return;
   const skip=opus?(value('skip_samples')||0):0,discard=opus?(value('discard_padding')||0):0;
   const count=opus?opusSamples(line)-skip-discard:0,duration=opus?count/sampleRate!:(value('duration_time')||1/fps);
   if(!Number.isFinite(duration)||duration<0){invalid=true;return;}
   first=Math.min(first,pts+skip/(sampleRate||1));end=Math.max(end,pts+duration);frames++;samples+=count;
  });
 }else{
  await run(ffprobe(),['-v','error','-select_streams','a:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,nb_samples','-of','compact=p=0',input],line=>{
   const row=Object.fromEntries(line.split('|').map(part=>part.split('='))),pts=Number(row.best_effort_timestamp_time),count=Number(row.nb_samples);
   if(!Number.isFinite(pts)||!Number.isFinite(count)||count<=0)return;
   first=Math.min(first,pts);end=Math.max(end,pts+count/sampleRate!);frames++;samples+=count;
  });
 }
 if(invalid||!frames||end<=first)throw Error('The recording source contains no valid samples.');
 // WebM's millisecond PTS can put Opus's first decoded sample half a millisecond
 // before stream start, even though pre-skip starts the playback clock at zero.
 return {firstPts:video?first:Math.max(start,first),duration:video?end-first:samples/sampleRate!,fps,sampleRate,frames};
}
export interface SynchronizeInput {startedAtMs:number;sources:Array<{mediaId:string;track:TrackKind;firstSampleAtMs:number;sourceTimestampUs?:number}>;}
/** Original assets remain the playable media. Only clip placement and source
 * bounds change; Stop never encodes, pads, writes files or registers new media.
 */
export async function synchronizeRecording(input:SynchronizeInput):Promise<{media:Media[];offsets:number[];synchronization:TakeSynchronization}>{
 if(!input||!Number.isFinite(input.startedAtMs)||!Array.isArray(input.sources)||!input.sources.length||input.sources.length>8||input.sources.some(s=>!s||!['screen','camera','audio'].includes(s.track)||!Number.isFinite(s.firstSampleAtMs)||s.sourceTimestampUs!==undefined&&!Number.isFinite(s.sourceTimestampUs)||Math.abs(s.firstSampleAtMs-input.startedAtMs)>86400_000))throw Error('Invalid recording synchronization timestamps.');
 const sources=await Promise.all(input.sources.map(async source=>{const media=await readMedia(source.mediaId);if((source.track==='audio')!==(media.kind==='audio'))throw Error('Recording source kind does not match its track.');return {...source,media,timing:await recordingTiming(media.path,media.kind==='video')};}));
 const primary=sources.find(s=>s.media.audioRole==='microphone')??sources.find(s=>s.track==='screen')??sources[0];
 const originAtMs=primary.firstSampleAtMs,clockDuration=primary.timing.duration;
 if(clockDuration<=0||clockDuration>86400)throw Error('Invalid recording duration.');
 const coverage=sources.map(s=>{
  const offset=(s.firstSampleAtMs-originAtMs)/1000,end=offset+s.timing.duration;
  if(offset>=clockDuration||end<=0)throw Error('A recording source has no samples overlapping the recording clock.');
  const lostDuration=clockDuration-(Math.min(clockDuration,end)-Math.max(0,offset));
  // A failed/partial device must not shorten healthy narration to a tiny take.
  const excluded=s!==primary&&(lostDuration>1+1e-9||lostDuration>clockDuration*.25+1e-9);
  return {source:s,offset,end,lostDuration,excluded};
 });
 const included=coverage.filter(s=>!s.excluded);
 const rawStart=Math.max(...included.map(s=>s.offset)),rawEnd=Math.min(...included.map(s=>s.end));
 const frameRate=Math.max(0,...sources.filter(s=>s.media.kind==='video').map(s=>s.timing.fps));
 // One grid on the mic clock, rounded inward so no source is extended. Never
 // round each source trim independently: audio keeps its precise sample offset.
 const takeStart=frameRate?Math.ceil(rawStart*frameRate-1e-9)/frameRate:rawStart;
 const takeEnd=frameRate?Math.floor(rawEnd*frameRate+1e-9)/frameRate:rawEnd;
 const duration=takeEnd-takeStart;
 if(duration<=0)throw Error('Recording sources have no common complete video frame.');
 const synchronization:TakeSynchronization={version:3,startedAtMs:input.startedAtMs,originAtMs,duration,takeStart,takeEnd,...(frameRate?{frameRate}:{}),sources:coverage.map(({source:s,offset,excluded,lostDuration})=>{
  const sourceIn=Math.max(0,takeStart-offset),sourceOut=Math.min(s.timing.duration,takeEnd-offset);
  if(sourceOut<=sourceIn)throw Error('A recording source has no samples overlapping the recording clock.');
  return {mediaId:s.mediaId,firstSampleAtMs:s.firstSampleAtMs,offset,firstPts:s.timing.firstPts,decodedDuration:s.timing.duration,sourceIn,sourceOut,...(excluded?{intersectionExclusion:{reason:'insufficient-coverage' as const,lostDuration}}:{}),...(s.sourceTimestampUs!==undefined?{sourceTimestampUs:s.sourceTimestampUs}:{})};
 })};
 // Supply accurate duration even when the original live WebM had no Duration.
 return {media:sources.map(s=>({...s.media,duration:s.timing.duration})),offsets:coverage.map(s=>Math.max(0,s.offset-takeStart)),synchronization};
}
