import {ownChild} from './owned-processes.js';
import {spawn} from 'node:child_process';
import {existsSync,promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import * as storage from './storage.js';
import * as media from './media.js';
import {cutTimelineRange} from '../shared/timeline-edits.js';
import {clipDuration,createProject,defaultTransform,effectsForTrack,makeId,projectDuration,type Project} from '../shared/types.js';

const root=()=>path.join(storage.DATA_DIR,'cutroom');
const localEngine=path.resolve(import.meta.dirname,'../../../engine/cutroom/target/release/cutroom'+(process.platform==='win32'?'.exe':''));
const binary=()=>process.env.CREATOR_COMPILER_CUTROOM||(existsSync(localEngine)?localEngine:path.join(os.homedir(),'.cargo/bin/cutroom'+(process.platform==='win32'?'.exe':'')));
export const actions=['detect','check','privacy','preview','render'] as const;
type Action=typeof actions[number];
type Workspace={id:string;projectId:string;revision:string;name:string;status:'ready'|'running'|'complete'|'error'|'cancelled';action?:Action;log:string;error?:string;applied?:boolean;rendered?:boolean;generation:number;renderGeneration?:number};
const starting=new Map<string,AbortController>();
const active=new Map<string,AbortController>(),children=new Set<ReturnType<typeof spawn>>(),finished=new Set<Promise<void>>(),locked=new Set<string>();let closing=false;
async function workspaceLock<T>(id:string,work:()=>Promise<T>){if(closing||locked.has(id)||active.has(id))throw Object.assign(Error('Cutroom is already working or shutting down.'),{status:409});locked.add(id);try{return await work();}finally{locked.delete(id);}}
const folders=(id:string)=>path.join(root(),storage.safeId(id));
const manifest=(id:string)=>path.join(folders(id),'workspace.json');
async function save(w:Workspace){await storage.atomicJSON(manifest(w.id),w);return w;}
async function load(id:string):Promise<Workspace>{const w:Workspace=JSON.parse(await fs.readFile(manifest(id),'utf8'));if(w.status==='running'&&!active.has(id)){w.status='error';w.error='The service restarted while Cutroom was working. Run the operation again.';await save(w);}return w;}
function idle(w:Workspace){if(w.status==='running')throw Object.assign(Error('Cutroom is already working. Wait or cancel the current operation.'),{status:409});}

async function command(args:string[],signal?:AbortSignal):Promise<{stdout:string;stderr:string}>{
 return new Promise((resolve,reject)=>{
  signal?.throwIfAborted();const child=ownChild(spawn(binary(),args,{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true}),true);children.add(child);child.once('close',()=>children.delete(child));
  let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout=(stdout+b).slice(-2_000_000);});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-500_000);});
  let escalation:NodeJS.Timeout|undefined;const kill=()=>{if(escalation)return;escalation=setTimeout(()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid!,'SIGKILL');}catch{}},1500);escalation.unref();try{if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});else process.kill(-child.pid!,'SIGTERM');}catch{}};
  const timeout=setTimeout(kill,30*60*1000);timeout.unref();
  signal?.addEventListener('abort',kill,{once:true});if(signal?.aborted)kill();
  child.once('error',error=>{clearTimeout(timeout);if(escalation)clearTimeout(escalation);signal?.removeEventListener('abort',kill);reject(error);});
  child.once('close',(code)=>{clearTimeout(timeout);if(escalation){clearTimeout(escalation);try{if(process.platform!=='win32')process.kill(-child.pid!,'SIGKILL');}catch{}}signal?.removeEventListener('abort',kill);if(signal?.aborted)reject(Error('Cancelled'));else if(code!==0)reject(Error((stderr||stdout||'Cutroom failed.').slice(-12000)));else resolve({stdout,stderr});});
 });
}
export async function cutroomStatus(){try{const {stdout}=await command(['--version']);return {available:true,version:stdout.trim(),binary:binary()};}catch{return {available:false,message:'Install Cutroom with npm run setup:cutroom, or set CREATOR_COMPILER_CUTROOM to its executable.'};}}

/** Preserve the committed timeline and word timings; never rewrite the original recordings. */
export function sourceFromProject(p:Project){
 const used=new Set(p.clips.filter(c=>['screen','camera','audio'].includes(c.track)).map(c=>c.mediaId));
 const sourceMedia=p.media.filter(m=>used.has(m.id));
 const clips=p.clips.filter(c=>used.has(c.mediaId)&&['screen','camera','audio'].includes(c.track));
 if(!clips.some(c=>c.track==='camera'||c.track==='screen'))throw Error('Add camera or screen footage before opening Cutroom.');
 if(clips.some(c=>c.speed!==1))throw Error('Cutroom currently needs 1× footage. Export speed-adjusted clips before using the engine.');
 const audio=clips.filter(c=>!c.muted&&c.gain>0&&p.media.find(m=>m.id===c.mediaId)?.hasAudio);
 const narration=audio.some(c=>c.track==='audio')?audio.filter(c=>c.track==='audio'):audio.some(c=>c.track==='camera')?audio.filter(c=>c.track==='camera'):audio.filter(c=>c.track==='screen');
 const mappedClips=clips.filter(c=>c.track!=='audio').map(c=>({track:c.track as string,media:c.mediaId,start_ms:c.start*1000,dur_ms:clipDuration(c)*1000,media_in_ms:c.sourceIn*1000,take:0}));
 for(const c of narration)mappedClips.push({track:'mic',media:c.mediaId,start_ms:c.start*1000,dur_ms:clipDuration(c)*1000,media_in_ms:c.sourceIn*1000,take:0});
 const words=p.captions.flatMap(c=>c.words?.length?c.words:[]).filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start).sort((a,b)=>a.start-b.start);
 return {version:1,name:p.name,origin:'Creator Compiler committed timeline',duration_ms:projectDuration(p)*1000,
  media:sourceMedia.map(m=>({id:m.id,path:m.path,width:m.width||0,height:m.height||0,fps:m.fps||30,duration_ms:m.duration*1000})),
  clips:mappedClips,
  words:words.map(w=>({text:w.text,start_ms:w.start*1000,end_ms:w.end*1000})),
  scenes:p.scenes.map(s=>({name:s.name,start_ms:s.start*1000,end_ms:(s.start+s.duration)*1000}))};
}
export async function prepare(projectId:string){
 const p=await storage.readProject(projectId),source=sourceFromProject(p),id=randomUUID(),dir=folders(id);
 if(!(await cutroomStatus()).available)throw Error('Cutroom is not installed. Run npm run setup:cutroom.');
 await fs.mkdir(dir,{recursive:true});
 await storage.atomicJSON(path.join(dir,'source.json'),source);
 await storage.atomicJSON(path.join(dir,'project.json'),p);
 await fs.writeFile(path.join(dir,'cuts.yaml'),'cuts: []\n');
 const spec={source:'source.json',include:['cuts.yaml'],output:{height:1080,fps:30,chapter_cards:'off'},layout:{default:source.clips.some(c=>c.track==='screen')?'screen':'camera'},style:{accent:'#de5738'},chapters:[],beats:[]};
 await fs.writeFile(path.join(dir,'edit.yaml'),JSON.stringify(spec,null,2));
 return save({id,projectId:p.id,revision:storage.revision(p),name:p.name,status:'ready',log:`Snapshot ready: ${source.words.length} timed words. Cutroom renders its own camera/screen composition; editor overlays, transforms, effects, per-clip audio gain, music, and cursor styling are not included.`,generation:0});
}
export async function workspace(id:string){
 const w=await load(id);
 if(w.status==='running'&&!active.has(id)){w.status='error';w.error='The service restarted while Cutroom was working. Run the operation again.';await save(w);}
 const dir=folders(id),spec=JSON.parse(await fs.readFile(path.join(dir,'edit.yaml'),'utf8'));
 const review=await fs.readFile(path.join(dir,'review.md'),'utf8').catch(()=>'');
 const plan=await fs.readFile(path.join(dir,'plan.json'),'utf8').then(JSON.parse).catch(()=>undefined);
 const previewReady=await fs.access(path.join(dir,'preview.png')).then(()=>true).catch(()=>false);
 return {...w,graphics:{chapters:spec.chapters,beats:spec.beats},review,plan,previewUrl:previewReady?`/api/cutroom/${id}/preview.png`:undefined};
}
async function updateGraphicsWork(id:string,value:unknown){
 const w=await load(id);idle(w);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Provide an object with beats and optional chapters.');
 const v=value as {beats?:unknown;chapters?:unknown};
 if(!Array.isArray(v.beats)||v.beats.length>500||v.chapters!==undefined&&(!Array.isArray(v.chapters)||v.chapters.length>100))throw Error('Provide up to 500 beats and 100 chapters.');
 const dir=folders(id),file=path.join(dir,'edit.yaml'),previous=await fs.readFile(file,'utf8'),spec=JSON.parse(previous);
 spec.beats=v.beats;spec.chapters=v.chapters??[];
 await fs.writeFile(file,JSON.stringify(spec,null,2));
 try{const result=await command(['check',dir]);w.log=result.stdout+result.stderr;}catch(e){await fs.writeFile(file,previous);throw e;}
 w.generation++;w.status='ready';w.error=undefined;await save(w);return workspace(id);
}
async function runWork(id:string,action:Action,options:{at?:string},controller:AbortController){
 if(!actions.includes(action))throw Error('Unknown Cutroom action.');
 const w=await load(id);idle(w);
 if(action==='detect'){const source=JSON.parse(await fs.readFile(path.join(folders(id),'source.json'),'utf8'));if(!source.words.length)throw Error('Create a word-timed transcript before detecting retakes and silences.');}
 controller.signal.throwIfAborted();const dir=folders(id);active.set(id,controller);
 w.action=action;w.status='running';w.error=undefined;try{await save(w);}catch(error){active.delete(id);throw error;}
 const task=(async()=>{
  try{
   const args=action==='detect'?['cut',dir]:action==='preview'?['still',dir,'--at',options.at||'o:1','-o',path.join(dir,'preview.png')]:action==='render'?['render',dir,'-o',path.join(dir,'render.mp4'),'--codec','x264','--jobs','2']:[action,dir];
   const result=await command(args,controller.signal);w.log=(result.stdout+result.stderr).slice(-500000);
   if(action==='detect'){const plan=await command(['plan',dir],controller.signal);await fs.writeFile(path.join(dir,'plan.json'),plan.stdout);}
   if(action==='render'){w.rendered=true;w.renderGeneration=w.generation;}
   controller.signal.throwIfAborted();if(action==='detect'||action==='privacy')w.generation++;w.status='complete';
  }catch(e){w.status=controller.signal.aborted?'cancelled':'error';w.error=(e as Error).message;}
  finally{try{await save(w);}finally{active.delete(id);}}
 })().catch(error=>console.error('Could not save Cutroom result',error));finished.add(task);void task.finally(()=>finished.delete(task));
 return w;
}
export async function cancel(id:string){const w=await load(id);starting.get(id)?.abort();active.get(id)?.abort();return w;}
export function applyCutroomRanges(current:Project,ranges:number[][]){
 const p=structuredClone(current);
 for(const [a,b] of [...ranges].sort((a,b)=>b[0]-a[0])){
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a)throw Error('Invalid Cutroom cut range.');
  cutTimelineRange(p,a,b,true);
 }
 return p;
}
async function applyCutsWork(id:string,expectedRevision:string){
 const w=await load(id);idle(w);if(w.applied)throw Error('These cuts have already been applied. Prepare a fresh snapshot to analyze again.');
 if(expectedRevision!==w.revision)throw Object.assign(Error('Review the original snapshot revision before applying cuts.'),{status:409});
 const current=await storage.readProject(w.projectId);if(storage.revision(current)!==w.revision)throw Object.assign(Error('The project changed. Prepare and review a fresh Cutroom snapshot.'),{status:409});
 const plan=JSON.parse(await fs.readFile(path.join(folders(id),'plan.json'),'utf8'));
 if(!Array.isArray(plan.cuts)||!plan.cuts.length)throw Error('Detect cuts first. There are no cuts to apply.');
 const ranges=plan.cuts.map(([a,b]:[number,number])=>[a/1000,b/1000]);
 const p=applyCutroomRanges(current,ranges);await storage.saveProject(p,{expectedRevision:w.revision,checkpoint:true});w.applied=true;await save(w);return p;
}
async function importRenderWork(id:string){
 const w=await load(id);idle(w);if(!w.rendered||w.renderGeneration!==w.generation)throw Error('Render the current Cutroom edit before importing it.');
 const m=await storage.registerMedia(await media.probeMedia(path.join(folders(id),'render.mp4'),storage.CACHE_DIR));
 const p=createProject(w.name+' · Cutroom render');p.media=[m];p.canvas.width=m.width||1920;p.canvas.height=m.height||1080;p.canvas.padding=0;p.canvas.radius=0;
 p.clips=[{id:makeId(),mediaId:m.id,name:m.name,track:'screen',start:0,sourceIn:0,sourceOut:m.duration,speed:1,gain:1,muted:false,transform:{...defaultTransform(),x:0,y:0,width:1,height:1},effects:effectsForTrack('screen')}];
 p.scenes[0].duration=m.duration;return storage.saveProject(p);
}
export function previewPath(id:string){return path.join(folders(id),'preview.png');}
export function renderPath(id:string){return path.join(folders(id),'render.mp4');}

export const updateGraphics=(id:string,value:unknown)=>workspaceLock(id,()=>updateGraphicsWork(id,value));
export const run=(id:string,action:Action,options:{at?:string}={})=>workspaceLock(id,()=>{const controller=new AbortController();starting.set(id,controller);return runWork(id,action,options,controller).finally(()=>starting.delete(id));});
export const applyCuts=(id:string,revision:string)=>workspaceLock(id,()=>applyCutsWork(id,revision));
export const importRender=(id:string)=>workspaceLock(id,()=>importRenderWork(id));
export async function initCutroom(){for(const id of await fs.readdir(root()).catch(()=>[]))await load(id).catch(error=>console.error('Could not repair Cutroom workspace',id,error));}
export async function shutdownCutroom(){closing=true;const owned=[...children];for(const c of starting.values())c.abort();for(const c of active.values())c.abort();for(const child of children)try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid!,'SIGTERM');}catch{}const escalation=setTimeout(()=>{for(const child of children)try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid!,'SIGKILL');}catch{}},1500);try{await Promise.allSettled([...finished,...[...children].map(child=>new Promise<void>(resolve=>child.once('close',()=>resolve())))]);}finally{clearTimeout(escalation);for(const child of owned)try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid!,'SIGKILL');}catch{}}}

export const activeCutroomJobs=()=>active.size+locked.size;
