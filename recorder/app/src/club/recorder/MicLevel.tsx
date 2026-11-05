import {useCallback,useRef} from 'react';
import {AudioMeter} from '../../AudioMeter';
import type {MeterAudio} from '../../recording-meter';

/** Borumi's last 100 levels (capture-warnings bundle, `_ = 100`). */
export const MIC_WAVE_SAMPLES=100;

/** Borumi's microphone row (capture-warnings bundle C:430-512, shape "wave"): a 40px tile with the last 100 levels drawn as one shape
 * mirrored about the middle, its outline #74b9ff at 2px and its fill a #81ecec to #0984e3 gradient. Each level is the frame's peak from
 * -50 to 0 dB, the same level the recording island shows. */
export type WaveColours={line:string;top:string;bottom:string};
export function drawMicWave(context:CanvasRenderingContext2D,width:number,height:number,levels:readonly number[],colours:WaveColours){
 context.clearRect(0,0,width,height);context.strokeStyle=colours.line;context.lineWidth=2;context.beginPath();
 const step=width/MIC_WAVE_SAMPLES,mid=height/2;
 levels.forEach((level,index)=>{const x=index*step,y=mid-level*mid;if(index===0)context.moveTo(x,y);else context.lineTo(x,y);});
 for(let index=levels.length-1;index>=0;index--)context.lineTo(index*step,mid+levels[index]*mid);
 context.closePath();context.stroke();
 const fill=context.createLinearGradient(0,0,0,height);fill.addColorStop(0,colours.top);fill.addColorStop(1,colours.bottom);context.fillStyle=fill;context.fill();
}

export function MicLevel({stream,audio,live,background,onLevel,onPeak}:{stream:MediaStream|null;audio:MeterAudio;live:boolean;background:boolean;onLevel(level:number|null):void;onPeak?:(level:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null),levels=useRef<number[]>([]);
 const peak=useCallback((level:number)=>{
  onPeak?.(level);
  levels.current.push(Math.max(0,Math.min(1,level)));if(levels.current.length>MIC_WAVE_SAMPLES)levels.current.shift();
  const c=canvas.current,b=box.current;if(!c||!b)return;c.width=b.clientWidth*2;c.height=b.clientHeight*2;const g=c.getContext('2d');if(!g)return;const css=getComputedStyle(c);drawMicWave(g,c.width,c.height,levels.current,{line:css.getPropertyValue('--br-wave-line').trim(),top:css.getPropertyValue('--br-wave-top').trim(),bottom:css.getPropertyValue('--br-wave-bottom').trim()});
 },[onPeak]);
 return <div className="rec-mic-wave" ref={box} role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100}>
  <canvas ref={canvas} className="rec-mic-wave-canvas"/>
  <div className="rec-meter-sampler"><AudioMeter stream={stream} label="Microphone" audio={audio} live={live} background={background} onLevel={onLevel} onPeak={peak} emptyHint="No sound yet"/></div>
 </div>;
}
