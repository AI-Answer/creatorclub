import type {AudioRole} from '../shared/types';
/** The UI and native recorder use the same Unix-epoch clock: the wall clock. performance.timeOrigin+performance.now() stops while a Mac
 * sleeps, so after a sleep it runs that long behind Date.now() and the native recorder's Date(): a take's timer then starts at hours (212:14)
 * and its browser samples no longer line up with the native screen. */
export const recordingNow=()=>Date.now();
export class RecordingClock {
 private startedAt=0;
 private pauseAt:number|null=null;
 private pausedFor=0;
 start(at:number){this.startedAt=at;this.pauseAt=null;this.pausedFor=0;}
 pause(at:number){if(this.pauseAt===null)this.pauseAt=Math.max(this.startedAt,at);}
 resume(at:number){if(this.pauseAt!==null){this.pausedFor+=Math.max(0,at-this.pauseAt);this.pauseAt=null;}}
 elapsed(at:number){return Math.max(0,((this.pauseAt??at)-this.startedAt-this.pausedFor)/1000);}
 offset(at:number){return Math.max(0,(at-this.startedAt)/1000);}
}
/** Video prefers H.264 (VideoToolbox hardware on Apple Silicon) over software VP9/VP8. Audio-only stays WebM/Opus. */
export function recorderMimeType(video:boolean,supported:(type:string)=>boolean):string|undefined{
 return (video?['video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['audio/webm;codecs=opus','audio/webm']).find(supported);
}
/** MP4 needs one-second keyframes so every 1 s timeslice carries a fragment; WebM keeps the encoder's default GOP. */
export function recorderOptions(video:boolean,mimeType:string):MediaRecorderOptions&{videoKeyFrameIntervalDuration?:number}{
 return video?{mimeType,videoBitsPerSecond:8_000_000,...(mimeType.startsWith('video/mp4')?{videoKeyFrameIntervalDuration:1000}:{})}:{mimeType,audioBitsPerSecond:192_000};
}
/** Browser screen/audio must never duplicate a native capture of the same source. */
export function browserRecordingSelection<T extends {screen:boolean;systemAudio:boolean}>(selection:T,native:boolean):T {
 return native?{...selection,screen:false,systemAudio:false}:{...selection};
}
export function nativeRecordingOutputs(output:{videoPath?:string;audioPath?:string},recordVideo:boolean,systemAudio:boolean):Array<{path:string;track:'screen'|'audio';audioRole?:AudioRole}>{
 const result:Array<{path:string;track:'screen'|'audio';audioRole?:AudioRole}>=[];
 if(recordVideo&&output.videoPath)result.push({path:output.videoPath,track:'screen'});
 if(systemAudio&&output.audioPath)result.push({path:output.audioPath,track:'audio',audioRole:'system'});
 return result;
}
export function nativeRecordingOutputErrors(output:{videoPath?:string;audioPath?:string},recordVideo:boolean,systemAudio:boolean):string[]{
 return [...(recordVideo&&!output.videoPath?['Native capture did not return the selected screen video.']:[]),...(systemAudio&&!output.audioPath?['Native capture did not return system sound.']:[])];
}
/** Plain-language note for a saved native take, or '' when nothing worth mentioning happened.
 * A few late frame slots are normal; the creator only hears about stutter they could notice. */
export function nativeRecordingNote(output:{stoppedEarly?:boolean;videoFrames?:number;lateVideoFrames?:number;droppedVideo?:number}):string{
 const notes:string[]=[];
 if(output.stoppedEarly)notes.push('macOS ended the screen recording early. Everything up to that point was saved.');
 const missed=(output.lateVideoFrames??0)+(output.droppedVideo??0),slots=(output.videoFrames??0)+missed;
 if(slots>0&&missed/slots>.05)notes.push('Your Mac was busy during this take, so the screen video may stutter in places. Play it back before you use it.');
 return notes.join(' ');
}
/** Serializes Pause/Resume, while Stop can immediately prevent further toggles. */
export class RecordingTransitionGate {
 private pending:Promise<void>|null=null;
 private stopping=false;
 private listeners=new Set<()=>void>();
 getSnapshot=()=>this.pending!==null;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private notify(){for(const listener of this.listeners)listener();}
 reset(){this.stopping=false;}
 run(work:()=>Promise<void>):Promise<void>|null {
  if(this.pending||this.stopping)return null;
  const promise=Promise.resolve().then(work);this.pending=promise;this.notify();
  void promise.finally(()=>{if(this.pending===promise){this.pending=null;this.notify();}}).catch(()=>{});
  return promise;
 }
 async stop(){this.stopping=true;await this.pending?.catch(()=>{});}
}

export type {RecordingStatus} from '../desktop/recording-state.cjs';
import type {RecordingStatus} from '../desktop/recording-state.cjs';
const recordingTransitions:Record<RecordingStatus,readonly RecordingStatus[]>={idle:['starting'],ready:['starting','idle'],starting:['recording','ready','idle'],recording:['paused','saving'],paused:['recording','saving'],saving:['idle','ready']};
export class RecordingLifecycle {
 private state={status:'idle' as RecordingStatus,reviewId:null as string|null,confirming:false};
 private listeners=new Set<()=>void>();
 get status(){return this.state.status;} get reviewId(){return this.state.reviewId;} get confirming(){return this.state.confirming;}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private patch(next:Partial<typeof this.state>){this.state={...this.state,...next};for(const listener of this.listeners)listener();}
 transition(status:RecordingStatus){if(status===this.status)return true;if(!recordingTransitions[this.status].includes(status))return false;this.patch({status});return true;}
 review(reviewId:string|null){this.patch({reviewId});}
 confirm(value:boolean){if(value&&this.confirming)return false;this.patch({confirming:value});return true;}
}
const recordingStates=new Map<RecordingLifecycle,RecordingStatus>();
let setupCount=0;
export const isRecordingActive=()=>[...recordingStates.values()].some(status=>!['idle','ready'].includes(status));
export const isCaptureSetupActive=()=>setupCount>0;
export function captureSetupOpened(){setupCount++;let open=true;return()=>{if(open){open=false;setupCount=Math.max(0,setupCount-1);}};}
/** Every instance reports the same combined state, including a detached take still saving. */
export function recordingStatus():RecordingStatus{return ['recording','paused','starting','saving'].find(status=>[...recordingStates.values()].includes(status as RecordingStatus)) as RecordingStatus||'idle';}
function publishRecordingState(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('sceneforge-recording-state',{detail:isRecordingActive()?recordingStatus():'idle'}));}
export function trackRecordingLifecycle(lifecycle:RecordingLifecycle){const sync=()=>{recordingStates.set(lifecycle,lifecycle.status);publishRecordingState();};sync();const stop=lifecycle.subscribe(sync);return()=>{stop();if(['idle','ready'].includes(lifecycle.status)){recordingStates.delete(lifecycle);publishRecordingState();return;}const finish=lifecycle.subscribe(()=>{sync();if(['idle','ready'].includes(lifecycle.status)){recordingStates.delete(lifecycle);finish();publishRecordingState();}});};}
export async function retryRecordingWrite<T>(write:()=>Promise<T>,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<T>{
 for(let attempt=0;;attempt++){try{return await write();}catch(error){if(attempt===3)throw error;await wait(150*2**attempt);}}
}
