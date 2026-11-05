/** Level meters share one AudioContext: each context runs its own realtime audio thread. It is suspended while the editor window is hidden. */
export class MeterAudio {
 private context:AudioContext|null=null;
 private users=0;
 private active=true;
 constructor(private create:()=>AudioContext=()=>new AudioContext({latencyHint:'playback'})){}
 acquire():AudioContext{const context=this.context??this.create();this.context=context;this.users++;void(this.active?context.resume():context.suspend()).catch(()=>{});return context;}
 release(){if(!this.users||--this.users)return;const context=this.context;this.context=null;void context?.close().catch(()=>{});}
 setActive(active:boolean){if(this.active===active)return;this.active=active;const context=this.context;if(context)void(active?context.resume():context.suspend()).catch(()=>{});}
}
/** RMS is measured before display scaling, so zero crossings cannot cancel each other. */
export function frameRms(data:Float32Array|Uint8Array):number{
 if(!data.length)return 0;
 let sum=0;const bytes=data instanceof Uint8Array;
 for(const value of data){const sample=bytes?(value-128)/128:value;sum+=sample*sample;}
 return Math.sqrt(sum/data.length);
}
/** dBFS display floor -60, ceiling -6. Gentle perceptual lift: -20 dBFS -> 81%. */
export function rmsLevel(rms:number):number{
 if(!(rms>0))return 0;
 const normalized=Math.max(0,Math.min(1,(20*Math.log10(rms)+60)/54));
 return normalized**.7;
}
/** Borumi's recorder level (its Ne): the frame's peak in dBFS, -50 to 0, as a straight 0 to 1. */
export function peakLevel(data:Float32Array):number{
 let peak=0;for(const value of data){const a=Math.abs(value);if(a>peak)peak=a;}
 if(!(peak>0)||!Number.isFinite(peak))return 0;
 const db=20*Math.log10(peak);return (Math.max(-50,Math.min(0,db))+50)/50;
}
export function audioLevel(data:Uint8Array):number{return rmsLevel(frameRms(data));}
export function waveformLevel(data:Float32Array):number{return rmsLevel(frameRms(data));}
/** Time-based attack/release behaves the same at 30, 60 and 120 Hz. */
export function smoothLevel(previous:number,target:number,elapsedMs:number):number{
 const tau=target>previous?35:110;
 const level=previous+(target-previous)*(1-Math.exp(-Math.max(0,elapsedMs)/tau));
 return level<.001?0:Math.max(0,Math.min(1,level));
}
export type EnvelopeSample={time:number;level:number};
/** Five seconds of timestamped history, independent of frame rate and canvas width. */
export class WaveformHistory{
 readonly samples:EnvelopeSample[]=[];
 constructor(readonly duration=5000){}
 push(time:number,level:number){
  this.samples.push({time,level});
  while(this.samples.length>1&&this.samples[1].time<=time-this.duration)this.samples.shift();
 }
 clear(){this.samples.length=0;}
}
/** Sizes the backing store to the element's CSS box at devicePixelRatio. */
export function fitCanvas(canvas:{width:number;height:number;clientWidth:number;clientHeight:number},dpr:number):boolean{
 const width=Math.max(1,Math.round(canvas.clientWidth*dpr)),height=Math.max(1,Math.round(canvas.clientHeight*dpr));
 if(canvas.width===width&&canvas.height===height)return false;
 canvas.width=width;canvas.height=height;return true;
}
export type EnvelopeStyle={top:string;bottom:string;line:string;lineWidth:number};
/** Mirrored closed envelope. Midpoint curves round the lobes without bars or overshoot. */
export function drawWaveform(ctx:CanvasRenderingContext2D,samples:readonly EnvelopeSample[],now:number,width:number,height:number,style:EnvelopeStyle,duration=5000){
 ctx.clearRect(0,0,width,height);
 const mid=height/2,amplitude=Math.max(0,mid-style.lineWidth),start=now-duration;
 const points=[{x:0,level:samples[0]?.time<=start?samples[0].level:0},...samples.map(s=>({x:Math.max(0,(s.time-start)/duration*width),level:s.level})),{x:width,level:samples.at(-1)?.level??0}];
 ctx.beginPath();
 const trace=(sign:number,reverse:boolean)=>{
  const ordered=reverse?[...points].reverse():points;
  const y=(p:{level:number})=>mid+sign*p.level*amplitude;
  const first=ordered[0];if(reverse)ctx.lineTo(first.x,y(first));else ctx.moveTo(first.x,y(first));
  for(let i=1;i<ordered.length-1;i++){const p=ordered[i],next=ordered[i+1];ctx.quadraticCurveTo(p.x,y(p),(p.x+next.x)/2,(y(p)+y(next))/2);}
  const last=ordered.at(-1)!;ctx.lineTo(last.x,y(last));
 };
 trace(-1,false);trace(1,true);ctx.closePath();
 const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,style.top);gradient.addColorStop(1,style.bottom);ctx.fillStyle=gradient;ctx.fill();
 ctx.strokeStyle=style.line;ctx.lineWidth=style.lineWidth;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
}
