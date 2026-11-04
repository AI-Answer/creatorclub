import {recordingNow} from './recording-session';
export function waitForCountdown(ms:number,signal:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{if(signal.aborted){reject(new DOMException('Countdown cancelled','AbortError'));return;}const abort=()=>{clearTimeout(timer);reject(new DOMException('Countdown cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
export async function recordingCountdown(signal:AbortSignal,tick:(value:number)=>void,chime:()=>void,wait=waitForCountdown){
 for(const value of [3,2,1]){if(signal.aborted)throw new DOMException('Countdown cancelled','AbortError');tick(value);chime();await wait(1000,signal);}
 if(signal.aborted)throw new DOMException('Countdown cancelled','AbortError');
}
/** A take keeps this much from before "go", so a first word spoken on the beat is never clipped. */
export const PRE_ROLL_MS=500;
/** Capture arms when the countdown shows 2, leaving screen capture time to be rolling before the pre-roll begins. */
export const ARM_AT_COUNT=2;
/** Runs the countdown while capture arms. `arm` starts at ARM_AT_COUNT, or at go when the countdown is off or skipped.
 * An arming failure ends the countdown at once (`cancel`) and is the error thrown; a cancelled countdown waits for
 * arming to settle first, so the caller can discard everything it started. */
export async function countdownWithPreRoll<T>({countdown,arm,cancel,clock=recordingNow}:{countdown:(onTick:(value:number)=>void)=>Promise<void>;arm:()=>Promise<T>;cancel:()=>void;clock?:()=>number}):Promise<{armed:T;goAtMs:number;keepFromMs:number}>{
 let armed:Promise<T>|undefined;const failed:{error?:unknown}={};
 const begin=()=>{if(!armed){armed=arm();armed.catch(error=>{if(!('error'in failed))failed.error=error;cancel();});}return armed;};
 try{await countdown(value=>{if(value<=ARM_AT_COUNT)begin();});}
 catch(error){const first='error'in failed;await armed?.catch(()=>{});throw first?failed.error:error;}
 const goAtMs=clock();
 return {armed:await begin(),goAtMs,keepFromMs:goAtMs-PRE_ROLL_MS};
}
export function countdownChime(){
 const context=new AudioContext();void context.resume().catch(()=>{});
 return {play:()=>{const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;oscillator.frequency.value=740;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.14,now+.012);gain.gain.exponentialRampToValueAtTime(.001,now+.17);oscillator.connect(gain).connect(context.destination);oscillator.start(now);oscillator.stop(now+.18);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};},close:()=>context.close().catch(()=>{})};
}
