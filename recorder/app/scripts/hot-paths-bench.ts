/**
 * Times the Node service's pure hot paths on a realistic 33-minute project: save (validate, clone, hash), Auto layout,
 * export chunk planning, bake layouts, subtitles, the timeline's ripple delete and split, and the per-sample loops of waveform
 * peaks and screen activity.
 * Run: SCENEFORGE_DATA_DIR=$(mktemp -d) node --import tsx scripts/hot-paths-bench.ts [--only name,name] [--reps n]
 * Profile: fast-anything scan -- node --import ./scripts/native-ts-resolve.mjs scripts/hot-paths-bench.ts
 * Used to decide what is worth porting to Rust (fast-anything); prints one line per workload with its median time.
 */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createProject,defaultEffects,defaultTransform,projectDuration,type Caption,type Clip,type Project} from '../shared/types.ts';
import {planAutoLayout,type ScreenActivity} from '../shared/auto-layout.ts';
import {bakeLayouts} from '../shared/layouts.ts';
import {captionParts} from '../shared/caption-parts.ts';
import {validateProject} from '../server/storage.ts';
import {sliceProject,subtitleText,accumulatePeaks,frameActivity} from '../server/media.ts';
import {applyProjectChange} from '../src/project-draft.ts';
import {deleteItems,splitLinked} from '../src/timeline-edit.ts';

const MINUTES=33,DURATION=MINUTES*60;
/** Deterministic pseudo-random numbers, so every run times the same project. */
let seed=12345;const rand=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const WORDS='so let me show you how this works click the button here and then we open the settings panel I think this is honestly the best part of the whole thing'.split(' ');

export function project():Project{
 seed=12345;
 const p=createProject('33 minute benchmark');p.id='bench';
 p.media=[
  {id:'screen',name:'Screen',path:'/tmp/screen.mov',kind:'video',duration:DURATION,width:2560,height:1440,hasAudio:false},
  {id:'camera',name:'Camera',path:'/tmp/camera.mov',kind:'video',duration:DURATION,width:1920,height:1080,hasAudio:false},
  {id:'mic',name:'Mic',path:'/tmp/mic.wav',kind:'audio',duration:DURATION,width:0,height:0,audioRole:'microphone'},
  {id:'music',name:'Music',path:'/tmp/music.mp3',kind:'audio',duration:240,width:0,height:0},
 ];
 // A jump-cut edit: 320 kept pieces of the take, each on screen, camera and mic, linked.
 const clips:Clip[]=[];let t=0,source=0;
 for(let i=0;i<320;i++){
  const length=3+rand()*6;source+=.2+rand()*1.5;
  for(const [track,mediaId] of [['screen','screen'],['camera','camera'],['audio','mic']] as const)
   clips.push({id:`${track}${i}`,mediaId,name:track,track,start:t,sourceIn:source,sourceOut:source+length,speed:1,gain:1,muted:false,linkId:`l${i}`,transform:defaultTransform(),effects:{...defaultEffects(),faceCenter:track==='camera'},effectTiming:{sourceIn:0,sourceOut:DURATION}});
  t+=length;source+=length;
 }
 clips.push({id:'music',mediaId:'music',name:'Music',track:'music',start:0,sourceIn:0,sourceOut:240,speed:1,gain:.3,muted:false,transform:defaultTransform(),effects:defaultEffects()});
 p.clips=clips;
 const total=projectDuration(p);
 // About 150 words a minute, in captions of 6 to 9 words with word timings.
 const captions:Caption[]=[];let w=0,ct=0;
 while(ct<total-3){
  const n=6+Math.floor(rand()*4),words=[];let wt=ct;
  for(let k=0;k<n;k++){const d=.25+rand()*.25;words.push({text:WORDS[w++%WORDS.length]+(k===n-1&&rand()<.6?'.':''),start:wt,end:wt+d});wt+=d+.03;}
  captions.push({id:`cap${captions.length}`,start:ct,end:wt,text:words.map(x=>x.text).join(' '),words});ct=wt+(rand()<.1?2.5:.2);
 }
 p.captions=captions;
 p.captionStyle.enabled=true;
 p.scenes=Array.from({length:14},(_,i)=>({id:`s${i}`,name:`Scene ${i+1}`,script:'Script '.repeat(200),notes:'',start:i*total/14,duration:total/14}));
 p.zooms=Array.from({length:60},(_,i)=>({id:`z${i}`,start:i*total/60+1,duration:3,scale:1.6,x:.5,y:.5,target:'screen' as const,easing:'smooth' as const}));
 p.elements=Array.from({length:30},(_,i)=>({id:`e${i}`,type:'text' as const,start:i*total/30,duration:4,text:'Label',x:.1,y:.1,width:.3,height:.1,color:'#fff',background:'#000',fontSize:48,opacity:1,rotation:0}));
 // Cursor sampled about 10 times a second over the whole recording.
 p.cursor.points=Array.from({length:Math.round(total*10)},(_,i)=>({time:i/10,x:rand(),y:rand(),pressed:rand()<.02,visible:true}));
 p.layouts=Array.from({length:40},(_,i)=>({id:`lay${i}`,start:i*total/40,duration:total/40-.5,preset:(['Creator','Screen only','Full frame'] as const)[i%3]}));
 return p;
}
export const activity=():ScreenActivity=>{seed=999;return {screen:{rate:1,values:Array.from({length:DURATION},()=>rand()<.2?.05+rand()*.3:rand()*.004)}};};

/** The export's chunk planner: ten-second windows, halved while a window holds too much (startExport). */
export function planChunks(p:Project){
 const fps=p.canvas.fps,duration=projectDuration(p),totalFrames=Math.max(1,Math.ceil((duration-1e-9)*fps));
 const graphicCount=(q:Project)=>q.captions.reduce((sum,c)=>sum+captionParts(c,q.captionStyle.maxWords).length,0)+q.elements.length+(q.motion?.length??0);
 const visualCount=(q:Project)=>q.clips.filter(c=>c.track!=='audio'&&c.track!=='music').length;
 let chunks=0;
 for(let startFrame=0;startFrame<totalFrames;){
  const start=startFrame/fps;let endFrame=Math.min(totalFrames,startFrame+Math.max(1,Math.floor(10*fps))),end=Math.min(duration,endFrame/fps),q=sliceProject(p,start,end);
  while((q.clips.length>12||visualCount(q)>6||graphicCount(q)>40||q.cursor.points.length>512)&&endFrame-startFrame>Math.ceil(fps)){endFrame=startFrame+Math.max(1,Math.floor((endFrame-startFrame)/2));end=Math.min(duration,endFrame/fps);q=sliceProject(p,start,end);}
  chunks++;startFrame=endFrame;
 }
 return chunks;
}

/** 33 minutes of 2-channel float PCM at 8 kHz, as ffmpeg pipes it to waveform(): 64 KiB chunks. */
function pcmChunks(){seed=7;const channels=2,frames=DURATION*8000,all=Buffer.alloc(frames*channels*4);for(let i=0;i<frames*channels;i++)all.writeFloatLE((rand()*2-1)*.5,i*4);const out:Buffer[]=[];for(let i=0;i<all.length;i+=65536)out.push(all.subarray(i,i+65536));return out;}
/** 33 minutes of 64x36 grey frames at 1 fps, as ffmpeg pipes them to screenActivity(). */
function grayChunks(){seed=8;const all=Buffer.alloc(DURATION*64*36);for(let i=0;i<all.length;i++)all[i]=Math.floor(rand()*256);const out:Buffer[]=[];for(let i=0;i<all.length;i+=65536)out.push(all.subarray(i,i+65536));return out;}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
function main(){
const p=project(),act=activity();
const workloads:Record<string,()=>unknown>={
 save:()=>{const s=structuredClone(p);validateProject(s);const json=JSON.stringify(s);return createHash('sha256').update(json).digest('hex');},
 validate:()=>validateProject(p),
 autoLayout:()=>planAutoLayout(p,{screenActivity:act}).length,
 bakeLayouts:()=>{const q=structuredClone(p);bakeLayouts(q);return q.clips.length;},
 exportChunks:()=>planChunks(p),
 subtitles:()=>subtitleText(p).length,
 // The editor's own edits, as the timeline makes them: delete one linked piece with ripple, and split at the playhead.
 deleteRipple:()=>applyProjectChange(p,d=>{deleteItems(d,['screen160'],true);}).clips.length,
 split:()=>applyProjectChange(p,d=>{splitLinked(d,p.clips.find(c=>c.id==='screen160')!.start+1,new Set(['screen160']));}).clips.length,
 waveformPeaks:(()=>{const chunks=pcmChunks();return ()=>{const bins=new Array<number>(DURATION*50).fill(0),state={sample:0,pending:Buffer.alloc(0)};for(const c of chunks)accumulatePeaks(bins,state,c,2,DURATION);return bins.length;};})(),
 screenActivity:(()=>{const chunks=grayChunks();return ()=>{const values:number[]=[],state={pending:Buffer.alloc(0)} as {previous?:Buffer;pending:Buffer};for(const c of chunks)frameActivity(values,state,c,64*36,12);return values.length;};})(),
};
const args=process.argv.slice(2),only=args.includes('--only')?args[args.indexOf('--only')+1].split(','):Object.keys(workloads),reps=args.includes('--reps')?Number(args[args.indexOf('--reps')+1]):7;
console.log(`project: ${p.clips.length} clips, ${p.captions.length} captions, ${p.captions.reduce((n,c)=>n+(c.words?.length??0),0)} words, ${p.cursor.points.length} cursor points, ${projectDuration(p).toFixed(0)} s`);
for(const name of only){
 const run=workloads[name];run();const times:number[]=[];
 for(let i=0;i<reps;i++){const t=performance.now();run();times.push(performance.now()-t);}
 times.sort((a,b)=>a-b);console.log(`${name.padEnd(15)} median ${times[times.length>>1].toFixed(2).padStart(9)} ms   min ${times[0].toFixed(2).padStart(9)} ms`);
}
process.exit(0);
}
