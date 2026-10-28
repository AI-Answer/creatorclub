import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject} from '../../shared/types';
const {default:ClubApp}=await import('./ClubApp');
const {ClubRecorder}=await import('./ClubRecorder');
const {VideoBottomBar}=await import('./VideoBottomBar');
const {OutlierChip}=await import('./ui');

test('the shell routes through board, video steps and settings, and keeps the place in the hash',async()=>{
 window.location.hash='';
 const ui=await mountUI(createElement(ClubApp));
 try{
  assert.equal(window.location.hash,'#/board');assert.ok(ui.container.querySelector('aside'),'sidebar on the board');
  await act(async()=>button(ui.container,'Open example').click());
  assert.equal(window.location.hash,'#/video/example/plan');assert.equal(ui.container.querySelector('aside'),null,'the video page uses the whole window');
  assert.match(ui.container.querySelector('[aria-label="Breadcrumb"]')!.textContent||'',/Hidden features in Claude Code/);
  assert.equal(ui.container.querySelector('[aria-current="step"]')!.textContent,'1Plan');
  await act(async()=>button(ui.container,'Continue to recording').click());
  assert.equal(window.location.hash,'#/video/example/record');
  await act(async()=>button(ui.container,'Back to plan').click());
  await act(async()=>button(ui.container,'4Publish').click());
  assert.equal(window.location.hash,'#/video/example/publish');assert.equal(ui.container.querySelectorAll('footer button').length,5,'no continue button after Publish');
  await act(async()=>button(ui.container,'Board').click());
  await act(async()=>button(ui.container,'Settings').click());
  assert.equal(window.location.hash,'#/settings');assert.equal(ui.container.querySelector('[aria-current="page"]')!.textContent,'Settings');
  window.location.hash='#/video/example/edit';await act(async()=>{window.dispatchEvent(new Event('hashchange'));});
  assert.equal(ui.container.querySelector('[aria-current="step"]')!.textContent,'3Edit','a hash change from outside moves the shell');
 }finally{await ui.close();window.location.hash='';}
});

test('the bottom bar ticks done steps and leaves out back and continue without handlers',async()=>{
 const picked:string[]=[];
 const ui=await mountUI(createElement(VideoBottomBar<'a'|'b'|'c'>,{steps:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],current:'b',done:['a'],onStep:id=>picked.push(id)}));
 try{
  const buttons=[...ui.container.querySelectorAll('button')];assert.equal(buttons.length,3);
  assert.match(buttons[0].textContent||'',/\(done\)/);assert.equal(buttons[1].getAttribute('aria-current'),'step');
  await act(async()=>buttons[2].click());assert.deepEqual(picked,['c']);
 }finally{await ui.close();}
});

test('the outlier chip colours by band and hides without a number',async()=>{
 const ui=await mountUI(createElement('div',null,createElement(OutlierChip,{multiplier:23.4,label:'usual views'}),createElement(OutlierChip,{multiplier:Number.NaN})));
 try{const chips=ui.container.querySelectorAll('[data-band]');assert.equal(chips.length,1);assert.equal(chips[0].getAttribute('data-band'),'orange');assert.equal(chips[0].textContent,'23×usual views');}
 finally{await ui.close();}
});

test('ClubRecorder opens one project in the forced mode without SceneForge navigation',async()=>{
 const p=createProject('Hidden features'),other=createProject('Another'),originalFetch=globalThis.fetch,opened:string[]=[];let backs=0;
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 globalThis.fetch=async(input,init)=>{
  const url=String(input);if(url==='/api/projects')return Response.json([p,other]);
  if(url===`/api/projects/${p.id}`){if(!init?.method||init.method==='GET')opened.push(p.id);return Response.json(p,{headers:{ETag:'"test"'}});}
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url.endsWith('/agent-chat'))return Response.json({jobs:[]});
  if(url.includes('/automation'))return Response.json({jobs:[]});return Response.json([]);
 };
 const onBack=()=>{backs++;};
 const ui=await mountUI(createElement(ClubRecorder,{projectId:p.id,mode:'Edit',onBack}));
 try{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(opened.includes(p.id),'the given project is fetched');
  assert.equal((ui.container.querySelector('[aria-label="Project name"]') as HTMLInputElement)?.value,'Hidden features');
  assert.equal(ui.container.querySelector('.recent-project-main'),null,'no SceneForge Home');
  assert.equal(ui.container.querySelector('.brand'),null,'no SceneForge brand');
  assert.equal(ui.container.querySelector('.workflow-tabs'),null,'no Script/Record/Edit step bar');
  assert.ok(![...ui.container.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Projects'),'no Projects button');
  assert.equal(ui.container.querySelector('.onboarding, [aria-label="Close setup"]'),null,'no SceneForge welcome');
  assert.ok(ui.container.querySelector('.edit-workspace'),'Edit mode is shown');
  await ui.render(createElement(ClubRecorder,{projectId:p.id,mode:'Record',onBack}));
  assert.ok(ui.container.querySelector('#recording-presets-slot'),'Record mode follows the prop');
  await act(async()=>(ui.container.querySelector('[aria-label="Close project"]') as HTMLButtonElement).click());
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(backs,1,'closing the project goes back to the club');
 }catch(error){if(error instanceof AggregateError)throw Error(error.errors.map(item=>item.stack||String(item)).join('\n'));throw error;}
 finally{globalThis.fetch=originalFetch;await ui.close();}
});
