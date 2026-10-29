import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,StrictMode} from 'react';
import type {AutomationJob} from '../../../shared/automation';
import type {ExportRecord} from '../../../shared/export-history';
import type {Media,Project} from '../../../shared/types';
import {createProject} from '../../../shared/types';
import {insertMedia} from '../../api';
const {ClubRecorder}=await import('../ClubRecorder');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const camera:Media={id:'m1',name:'cam',path:'/tmp/cam.mov',kind:'video',duration:600,width:10,height:10,hasAudio:true};
const primaries=(root:Element)=>[...root.querySelectorAll('button')].filter(b=>/\b(bg-primary|primary)\b/.test(b.className)&&!b.disabled).map(b=>b.textContent?.trim());

const plan=(project:Project):AutomationJob=>({id:'j1',projectId:project.id,kind:'auto-cut',status:'ready',progress:1,message:'Review the proposed changes.',createdAt:'2026-10-29T10:00:00.000Z',updatedAt:'2026-10-29T10:00:00.000Z',automatic:false,applied:false,undone:false,
 proposal:{summary:'2 proposals',warnings:[],baseRevision:'r',beforeDuration:600,afterDuration:408,changes:[
  {id:'silence-a',category:'silence',label:'Shorten quiet gap',reason:'Quiet',start:10,end:130,selected:true},
  {id:'repeat-b',category:'repeat',label:'Repeated phrase',reason:'Same words',start:200,end:272,selected:false},
 ]}});

/** A one-clip project served like SceneForge's API; `jobs` is what the automation list answers. */
function serve(jobs:(p:Project)=>AutomationJob[]){
 const p=createProject('Hidden features');insertMedia(p,[camera]);
 // The saved timeline: the original, or after Remove them the cut one (408 s); Undo puts the original back.
 const cut:Project={...structuredClone(p),updatedAt:'2026-10-29T10:05:00.000Z'};cut.clips[0].sourceOut=cut.clips[0].sourceIn+408;for(const scene of cut.scenes)scene.duration=Math.min(scene.duration,408);
 let current:Project=p;
 const calls:{method:string;url:string;body?:unknown;ifMatch?:string}[]=[];
 const originalFetch=globalThis.fetch;
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET',body=typeof init?.body==='string'?JSON.parse(init.body):undefined;
  // Like a browser: a request whose signal is aborted before the answer arrives fails.
  await new Promise(resolve=>setTimeout(resolve,0));
  if(init?.signal?.aborted)throw new DOMException('The operation was aborted.','AbortError');
  calls.push({method,url,body,ifMatch:new Headers(init?.headers).get('If-Match')??undefined});
  if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`&&method==='PUT')return Response.json({minimal:true,id:p.id,updatedAt:p.updatedAt},{headers:{ETag:'"t"'}});
  if(url===`/api/projects/${p.id}`)return Response.json(current,{headers:{ETag:'"t"'}});
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url===`/api/projects/${p.id}/automation`)return Response.json({jobs:jobs(p)});
  if(url===`/api/projects/${p.id}/quick-action`)return Response.json({...plan(p),id:'j2',status:'running',proposal:undefined});
  if(url==='/api/automation/j1/apply'){current=cut;return Response.json({job:{...plan(p),status:'complete',applied:true,updatedAt:'2026-10-29T10:05:00.000Z'},project:cut});}
  if(url==='/api/automation/j1/undo'){current={...structuredClone(p),updatedAt:'2026-10-29T10:06:00.000Z'};return Response.json({job:{...plan(p),status:'complete',applied:true,undone:true,updatedAt:'2026-10-29T10:06:00.000Z'},project:current});}
  if(url.startsWith('/api/exports?'))return Response.json({jobs:[],nextOffset:null});
  if(url==='/api/export'){
   const record:ExportRecord={id:'e1',type:'export',status:'complete',progress:1,message:'',outputPath:'/x/e1.mp4',startedAt:'2026-10-29T11:00:00.000Z',completedAt:'2026-10-29T11:00:05.000Z',projectId:p.id,projectName:p.name,projectRevision:new Headers(init?.headers).get('If-Match')??'',snapshotCreatedAt:'',options:body.options,updatedAt:'',revision:1,output:{status:'available'},recovery:{status:'available',runtimeChanged:false}};
   return Response.json(record);
  }
  if(url.endsWith('/agent-chat')||url.includes('/automation'))return Response.json({jobs:[]});
  return Response.json([]);
 };
 return {p,calls,restore:()=>{globalThis.fetch=originalFetch;}};
}

test('embedded Edit: one suggestion, Ask Claude as the one AI entry, no Borumi, and Remove them applies every cut',async()=>{
 localStorage.clear();
 const server=serve(p=>[plan(p)]),exported:boolean[]=[];
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack:()=>{},onExported:(done:boolean)=>exported.push(done)}));
 try{
  await flush();await flush();
  const header=ui.container.querySelector('.project-header')!;
  assert.ok(header.textContent?.includes('Remove 3m 12s of pauses and repeats?'),'the duration comes from the plan: 120 s + 72 s');
  const visible=ui.container.textContent??'';
  for(const word of ['Borumi','Automate','Edit with your AI','Style video','Remove pauses','Auto-cut'])assert.ok(!visible.includes(word),`no "${word}"`);
  assert.ok(!/project/i.test(visible),`no "project" in the embedded editor: ${visible.match(/.{0,40}project.{0,40}/i)?.[0]}`);
  const rail=[...ui.container.querySelectorAll('.panel-rail button')].map(b=>b.textContent?.trim());
  assert.deepEqual(rail,['Canvas','Layout','Clip','Zoom','Elements','Music','Captions','Cursor'],'labelled icons, no Automate');
  assert.equal(ui.container.querySelector('.inspector'),null,'panels start collapsed');
  assert.equal([...header.querySelectorAll('button')].filter(b=>b.textContent?.trim()==='Ask Claude').length,1);
  assert.equal(server.calls.filter(c=>c.url.endsWith('/quick-action')).length,0,'a plan already exists: none is started');
  assert.ok(primaries(ui.container).includes('Export video'));

  await act(async()=>button(header,'Remove them').click());for(let i=0;i<12;i++)await flush();
  const apply=server.calls.find(c=>c.url==='/api/automation/j1/apply');
  assert.deepEqual(apply?.body,{changeIds:['silence-a','repeat-b']},'every proposed cut, also the ones not selected by default');
  assert.ok(!ui.container.querySelector('.project-header')?.textContent?.includes('pauses and repeats'),'the card goes away once applied');
  const duration=()=>ui.container.querySelector('.transport-time')?.textContent;
  assert.ok(duration()?.includes('06:48'),`the cut timeline is shown: ${duration()}`);
  assert.ok(header.textContent?.includes('Removed 3m 12s'),'a quiet line says what was removed');
  await act(async()=>button(header,'Undo').click());for(let i=0;i<4;i++)await flush();
  assert.ok(server.calls.some(c=>c.url==='/api/automation/j1/undo'&&c.method==='POST'),'Undo uses SceneForge\'s undo of that change');
  assert.ok(duration()?.includes('10:00'),`the timeline is back: ${duration()}`);
  assert.ok(!header.textContent?.includes('Removed'),'the line goes away after Undo');

  await act(async()=>button(header,'Export video').click());await flush();await flush();
  const started=server.calls.find(c=>c.url==='/api/export');
  assert.equal(started?.body&&(started.body as {options:{format:string;range?:unknown}}).options.format,'mp4');
  assert.equal((started?.body as {options:{range?:unknown}}).options.range,undefined,'the full timeline');
  assert.ok(started?.ifMatch,'the reviewed revision is sent');
  assert.ok(ui.container.textContent?.includes('Video exported'));
  assert.equal(exported.at(-1),true,'the club hears that this edit is exported');
 }finally{await ui.close();server.restore();}
});

test('embedded Edit: on first open with no plan yet, Remove pauses runs in the background without Claude',async()=>{
 localStorage.clear();
 const server=serve(()=>[]);
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack:()=>{}}));
 try{
  await flush();await flush();
  const started=server.calls.filter(c=>c.url===`/api/projects/${server.p.id}/quick-action`);
  assert.equal(started.length,1);
  assert.deepEqual(started[0].body,{kind:'auto-cut',semantic:false});
  assert.ok(ui.container.querySelector('.project-header')?.textContent?.includes('Looking for pauses and repeats…'));
 }finally{await ui.close();server.restore();}
});

test('embedded Edit under StrictMode, opened with clips already there: the first-open plan still starts, once',async()=>{
 localStorage.clear();
 const server=serve(()=>[]);
 const ui=await mountUI(createElement(StrictMode,null,createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack:()=>{}})));
 try{
  for(let i=0;i<6;i++)await flush();
  const started=server.calls.filter(c=>c.url===`/api/projects/${server.p.id}/quick-action`);
  assert.equal(started.length,1,'one plan request, not zero (aborted twice-run effect) and not two');
  assert.deepEqual(started[0].body,{kind:'auto-cut',semantic:false});
  assert.ok(ui.container.querySelector('.project-header')?.textContent?.includes('Looking for pauses and repeats…'),'the request completed and the editor follows the plan');
 }finally{await ui.close();server.restore();}
});

test('the Removed line ends with the next edit, and can be dismissed',async()=>{
 localStorage.clear();
 const server=serve(p=>[plan(p)]);
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack:()=>{}}));
 try{
  for(let i=0;i<3;i++)await flush();
  const header=ui.container.querySelector('.project-header')!;
  await act(async()=>button(header,'Remove them').click());for(let i=0;i<3;i++)await flush();
  assert.ok(header.textContent?.includes('Removed 3m 12s'));
  await act(async()=>header.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click());
  assert.ok(!header.textContent?.includes('Removed'),'dismissed');
  assert.ok(!server.calls.some(c=>c.url.endsWith('/undo')),'dismissing does not undo');
 }finally{await ui.close();server.restore();}
 const again=serve(p=>[plan(p)]);
 const next=await mountUI(createElement(ClubRecorder,{projectId:again.p.id,mode:'Edit',onBack:()=>{}}));
 try{
  for(let i=0;i<3;i++)await flush();
  const header=next.container.querySelector('.project-header')!;
  await act(async()=>button(header,'Remove them').click());for(let i=0;i<3;i++)await flush();
  assert.ok(header.textContent?.includes('Removed 3m 12s'));
  await act(async()=>(next.container.querySelector('.ripple-toggle input') as HTMLInputElement).click());
  assert.ok(!header.textContent?.includes('Removed'),'an edit after the removal ends the Undo line');
 }finally{await next.close();again.restore();}
});
