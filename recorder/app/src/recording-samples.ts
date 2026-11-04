/** Feed the recorder the same samples whose first delivery we timestamp. A cloned
 * preview or MediaRecorder's delayed `start` event cannot establish this boundary.
 * Keep source timestamps intact: rewriting them on delivery introduces VFR jitter.
 */
type Sample={timestamp:number;close():void};
type Processor={readable:ReadableStream<Sample>};
type Generator=MediaStreamTrack&{writable:WritableStream<Sample>};
type SampleAPI={
 MediaStreamTrackProcessor?:new(options:{track:MediaStreamTrack;maxBufferSize:number})=>Processor;
 MediaStreamTrackGenerator?:new(options:{kind:string})=>Generator;
};
export function recordingSamples(input:MediaStream,onFirst:(atMs:number,sourceTimestampUs:number)=>void,onError:(error:Error)=>void,clock=()=>performance.timeOrigin+performance.now()){
 const api=globalThis as unknown as SampleAPI;
 if(!api.MediaStreamTrackProcessor||!api.MediaStreamTrackGenerator)throw Error('This browser cannot timestamp recording samples. Use the Creator Compiler desktop app.');
 const source=input.getTracks()[0].clone();
 const processor=new api.MediaStreamTrackProcessor({track:source,maxBufferSize:1});
 const output=new api.MediaStreamTrackGenerator({kind:source.kind});
 const reader=processor.readable.getReader(),writer=output.writable.getWriter();
 let closed=false,started=false,first=true;
 const close=()=>{if(closed)return;closed=true;source.stop();output.stop();void reader.cancel().catch(()=>{});void writer.abort().catch(()=>{});};
 void(async()=>{
  try{while(!closed){const {value,done}=await reader.read();if(done)break;
   try{if(!started)continue;if(first){first=false;onFirst(clock(),value.timestamp);}await writer.write(value);}finally{value.close();}
  }}catch(error){if(!closed)onError(error as Error);}finally{close();}
 })();
 const start=()=>{if(!closed)started=true;};
 return {stream:new MediaStream([output]),start,close};
}
