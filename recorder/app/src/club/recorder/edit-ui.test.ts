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
  if(url==='/api/media/upload')return Response.json([camera]);
  if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`&&method==='PUT')return Response.json({minimal:true,id:p.id,updatedAt:p.updatedAt},{headers:{ETag:'"t"'}});
  if(url===`/api/projects/${p.id}`)return Response.json(current,{headers:{ETag:'"t"'}});
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url===`/api/projects/${p.id}/automation`)return Response.json({jobs:jobs(p)});
  if(url===`/api/projects/${p.id}/transcribe`)return Response.json({...plan(p),id:'transcription-r4',kind:'transcription',status:'running',proposal:undefined});
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

test('embedded Edit: Borumi\'s layout (rail of nine tools, the transcript in its own column beside the picture, a short transport bar), and Remove them applies every cut',async()=>{
 localStorage.clear();
 const server=serve(p=>[plan(p)]),exported:boolean[]=[];
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack:()=>{},onExported:(done:boolean)=>exported.push(done)}));
 try{
  await flush();await flush();
  const header=ui.container.querySelector('.project-header')!;
  const visible=ui.container.textContent??'';
  for(const word of ['Borumi','Edit with your AI'])assert.ok(!visible.includes(word),`no "${word}"`);
  assert.ok(!/project/i.test(visible),`no "project" in the embedded editor: ${visible.match(/.{0,40}project.{0,40}/i)?.[0]}`);
  assert.equal(header.querySelector('.project-header-controls'),null,'the top strip holds no controls: they sit on the timeline bar');
  const bar=[...ui.container.querySelectorAll('.club-timeline-bar button')].map(b=>b.getAttribute('aria-label')??b.textContent?.trim());
  assert.deepEqual(bar,['Go to start','Play','Go to end','Playback speed','Select tool','Blade tool','Snap to edges','Transcript','Zoom out','Zoom in','View'],'Borumi\'s transport: start, play, end and speed in the middle; Select, Blade and Snap, the transcript toggle, the timeline zoom and View (fit, split, delete, notes) on the right; undo and history sit in the video\'s header');
  assert.ok(!bar.includes('Export video'),'Export lives in the video header, keeping the transport controls consistent');
  assert.equal(ui.container.querySelector('.panel-rail'),null);
  assert.equal(ui.container.querySelector('.inspector'),null,'no tool panel is open yet');
  assert.ok(ui.container.querySelector('.club-edit-transcript .transcript-panel'),'the transcript has its own column beside the picture, as in Borumi');
  const rail=[...ui.container.querySelectorAll('.club-rail button')].map(b=>b.textContent?.trim());
  assert.deepEqual(rail,['Canvas','Layout','Clip','Zoom','Elements','Music','Captions','Cursor','Automate','More'],'Borumi\'s nine tools in Borumi\'s order; Graphics, media and Cutroom sit under More');
  await act(async()=>[...ui.container.querySelectorAll<HTMLButtonElement>('.club-rail button')].find(b=>b.textContent?.trim()==='Captions')!.click());
  assert.equal(ui.container.querySelector('.club-edit-side .inspector h2')?.textContent,'Captions','a tool opens its panel on the side');
  assert.ok(ui.container.querySelector('.club-edit-transcript .transcript-panel'),'and the transcript stays open beside the picture');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('button[aria-label="Close Captions"]')!.click());
  assert.equal(server.calls.filter(c=>c.url.endsWith('/quick-action')).length,0,'a plan already exists: none is started');
  assert.ok(primaries(ui.container).includes('Export'),'Export is the primary while Continue waits for an export');

  await act(async()=>button(header,'Remove them').click());for(let i=0;i<12;i++)await flush();
  const apply=server.calls.find(c=>c.url==='/api/automation/j1/apply');
  assert.deepEqual(apply?.body,{changeIds:['silence-a','repeat-b']},'every proposed cut, also the ones not selected by default');
  assert.ok(!ui.container.querySelector('.project-header')?.textContent?.includes('pauses and repeats'),'the card goes away once applied');
  const duration=()=>ui.container.querySelector('.club-time')?.textContent;
  assert.ok(duration()?.includes('6:48'),`the cut timeline is shown: ${duration()}`);
  assert.ok(header.textContent?.includes('Removed 3m 12s'),'a quiet line says what was removed');
  await act(async()=>button(header,'Undo').click());for(let i=0;i<4;i++)await flush();
  assert.ok(server.calls.some(c=>c.url==='/api/automation/j1/undo'&&c.method==='POST'),'Undo uses SceneForge\'s undo of that change');
  assert.ok(duration()?.includes('10:00'),`the timeline is back: ${duration()}`);
  assert.ok(!header.textContent?.includes('Removed'),'the line goes away after Undo');

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
  await act(async()=>header.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click());
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
  await act(async()=>next.container.querySelector<HTMLButtonElement>('button[title^="Snapping"]')!.click());
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(b=>b.textContent?.includes('Snap to edges'))!.click());
  assert.ok(!header.textContent?.includes('Removed'),'an edit after the removal ends the Undo line');
 }finally{await next.close();again.restore();}
});

test('keys pressed in the companion panel stay there: M, S and Delete do nothing to the timeline',async()=>{
 localStorage.clear();
 const server=serve(()=>[]);
 const ui=await mountUI(createElement('div',null,createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack:()=>{}}),createElement('aside',{className:'cmp'},createElement('button',{type:'button'},'Cut them'))));
 try{
  await flush();await flush();
  const inPanel=ui.container.querySelector<HTMLButtonElement>('.cmp button')!;
  const press=(target:Element,key:string)=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));});
  for(const key of ['m','s','Delete'])await press(inPanel,key);
  assert.equal(ui.container.querySelectorAll('.club-marker').length,0,'M in the panel adds no marker');
  assert.ok(!ui.container.textContent?.includes('Move the playhead'),'S in the panel does not split');
  await press(document.body,'m');
  assert.equal(ui.container.querySelectorAll('.club-marker').length,1,'the same key on the editor still adds one');
 }finally{await ui.close();server.restore();}
});

test('Edit exports from the visible workspace header, saves first, and reports the completed export',async()=>{
 const server=serve(()=>[]),exported:boolean[]=[];
 const ui=await mountUI(createElement('div',null,createElement('div',{id:'ws-edit-export'}),createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack(){},onExported:done=>exported.push(done)})));
 try{
  for(let i=0;i<6;i++)await flush();
  const host=ui.container.querySelector('#ws-edit-export')!;
  assert.equal(button(host,'Export').disabled,false,'the visible header has the export action');
  assert.equal(ui.container.querySelector('.project-header')?.contains(button(host,'Export')),false,'the action is outside the hidden editor header');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Open export options"]')!.click());
  assert.deepEqual([...host.querySelectorAll('.cex-item .cex-title')].map(node=>node.textContent),['Export Video','Export Audio','Export Transcript'],'Borumi\'s export menu, limited to what this app exports');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Open export options"]')!.click());
  await act(async()=>button(host,'Export').click());
  for(let i=0;i<8;i++)await flush();
  const request=server.calls.find(call=>call.url==='/api/export');
  assert.ok(request,'export starts through the saved export API');
  assert.ok(exported.includes(true),'the footer receives completion from the actual export control');
  assert.ok(host.textContent?.includes('Video exported'));
  assert.equal(button(host,'Export').classList.contains('is-primary'),false,'Continue takes over as the primary after export');
 }finally{await ui.close();server.restore();}
});


test('empty transcript keeps the named scene plan, one caption prompt, and Auto-edit uses the same caption action',async()=>{
 localStorage.clear();const server=serve(()=>[]);
 server.p.scenes[0].name='Opening';server.p.scenes[0].script='Here is the first planned line.';
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack(){}}));
 try{
  await flush();await flush();
  const transcript=ui.container.querySelector('.club-edit-transcript')!;
  assert.ok(transcript.textContent?.includes('Scene 1 · Opening'));
  assert.ok(transcript.textContent?.includes('Here is the first planned line.'));
  assert.equal(transcript.querySelector('.club-ts-empty'),null);
  assert.equal(transcript.textContent?.match(/Make captions to edit by words\./g)?.length,1);
  assert.equal([...transcript.querySelectorAll('button')].filter(b=>b.textContent==='Make captions').length,1);
  await act(async()=>button(ui.container.querySelector('.club-rail')!,'Clip').click());
  await act(async()=>button(ui.container.querySelector('.club-rail')!,'Automate').click());
  assert.deepEqual([...ui.container.querySelectorAll('.club-rail button[aria-pressed=true]')].map(b=>b.textContent),['Automate']);
  const sheet=ui.container.querySelector('.club-auto-sheet')!;
  assert.ok(sheet.textContent?.includes('Even out volume'));assert.ok(sheet.textContent?.includes('Suggest layout and titles'));
  await act(async()=>sheet.querySelector<HTMLButtonElement>('[data-option=fillers] [aria-label="More options"]')!.click());
  await act(async()=>button(sheet,'Make captions').click());await flush();await flush();
  assert.equal(server.calls.filter(c=>c.url===`/api/projects/${server.p.id}/transcribe`&&c.method==='POST').length,1);
 }finally{await ui.close();server.restore();}
});


test('the Auto-edit caption error retries making captions',async()=>{
 const {EditAutoSheet}=await import('./EditAutoSheet');const server=serve(()=>[]);let attempts=0;
 const ui=await mountUI(createElement(EditAutoSheet,{project:server.p,jobs:[],merge(){},reload:async()=>{},flush:async()=>server.p,change(){},refresh:async()=>{},onPreview(){},onClose(){},notify(){},onMakeCaptions:async()=>{if(++attempts===1)throw Error('offline');}}));
 try{
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[data-option=fillers] [aria-label="More options"]')!.click());
  await act(async()=>button(ui.container,'Make captions').click());await flush();
  assert.ok(ui.container.textContent?.includes("Couldn't make captions."));
  await act(async()=>button(ui.container,'Try again').click());await flush();
  assert.equal(attempts,2);assert.equal(ui.container.querySelector('[role=alert]'),null);
  assert.equal(server.calls.filter(c=>c.url.endsWith('/quick-action')).length,0);
 }finally{await ui.close();server.restore();}
});


test('embedded Edit with no media keeps the editor, safe transport and inline import and record actions',async()=>{
 localStorage.clear();const server=serve(()=>[]);server.p.media=[];server.p.clips=[];for(const scene of server.p.scenes)scene.duration=0;
 const modes:string[]=[],states:{selected:number}[]=[];
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack(){},onMode:mode=>modes.push(mode),onEditState:state=>states.push(state)}));
 try{
  await flush();await flush();
  assert.ok(ui.container.textContent?.includes('Drop media here, or record a scene'));
  for(const selector of ['.club-rail','.club-edit-stage .stage-empty','.club-timeline','.club-timeline-bar','.club-edit-transcript .transcript-panel'])assert.ok(ui.container.querySelector(selector),selector);
  for(const selector of ['.trim-handle','.stage-transform'])assert.equal(ui.container.querySelector(selector),null,selector);
  assert.equal(button(ui.container,'Play').disabled,true);
  const zoom=ui.container.querySelector<HTMLInputElement>('input[aria-label="Timeline zoom"]')!;
  for(const value of [zoom.min,zoom.max,zoom.step,zoom.value])assert.ok(Number.isFinite(Number(value)),value);
  assert.ok(!ui.container.innerHTML.includes('NaN')&&!ui.container.innerHTML.includes('Infinity'));
  for(const key of [' ','l','s','Delete','ArrowRight','ArrowLeft','+','-'])await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
  assert.equal(button(ui.container,'Play').disabled,true,'empty playback shortcuts stay stopped');
  await act(async()=>button(ui.container,'Canvas').click());assert.ok(ui.container.querySelector('.club-edit-side .inspector'));
  await act(async()=>button(ui.container,'Close Canvas').click());
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>/Export/.test(b.textContent??'')),false);
  assert.equal(states.at(-1)?.selected,0);
  await act(async()=>button(ui.container.querySelector('.club-timeline-empty')!,'Record').click());assert.deepEqual(modes,['Record']);
  await act(async()=>button(ui.container.querySelector('.club-timeline-empty')!,'Import media').click());assert.ok(ui.container.querySelector('[role=dialog]'),'Import opens without needing footage');
 }finally{await ui.close();server.restore();}
});


for(const target of ['.stage-empty','.club-row'] as const)test(`dropping a file on the empty ${target} imports it in place`,async()=>{
 localStorage.clear();const server=serve(()=>[]);server.p.media=[];server.p.clips=[];for(const scene of server.p.scenes)scene.duration=0;
 const ui=await mountUI(createElement(ClubRecorder,{projectId:server.p.id,mode:'Edit',onBack(){}}));
 try{
  await flush();await flush();
  const drop=Object.assign(new Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{files:[new File(['video'],'camera.mov',{type:'video/quicktime'})],getData:()=>''}});
  await act(async()=>{ui.container.querySelector(target)!.dispatchEvent(drop);});for(let i=0;i<4;i++)await flush();
  assert.equal(server.calls.filter(call=>call.url==='/api/media/upload').length,1,'one upload through the existing importer');
  assert.equal(ui.container.querySelector('.club-timeline-empty'),null,'the imported footage replaces the hint');
  assert.ok(ui.container.querySelector('[data-clip-id]'),'the imported clip is on the timeline');
 }finally{await ui.close();server.restore();}
});

test('a new-project import request is acknowledged once and does not reopen on later renders',async()=>{
 localStorage.clear();const server=serve(()=>[]);server.p.media=[];server.p.clips=[];let opened=0;
 const props={projectId:server.p.id,mode:'Edit' as const,onBack(){},onImportOpened(){opened++;}};
 const ui=await mountUI(createElement(ClubRecorder,{...props,importNonce:1}));
 try{
  await flush();await flush();assert.equal(opened,1);assert.ok(ui.container.querySelector('[role=dialog]'));
  await ui.render(createElement(ClubRecorder,{...props,importNonce:undefined}));
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click());
  await ui.render(createElement(ClubRecorder,{...props,importNonce:undefined}));
  assert.equal(opened,1);assert.equal(ui.container.querySelector('[role=dialog]'),null);
 }finally{await ui.close();server.restore();}
});
