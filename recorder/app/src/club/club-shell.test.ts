import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject} from '../../shared/types';
const {default:ClubApp}=await import('./ClubApp');
const {installFetch}=await import('./test-fakes');
const {ClubRecorder}=await import('./ClubRecorder');
const {OutlierChip}=await import('./ui');

const ws={slug:'samin',name:'Samin Yasar',handle:'@samin',channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};
const stored={id:'v1',title:'Hidden features in Claude Code',stage:'planning',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:true,package:false,outline:false}};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('the shell routes through production, video steps and settings, and keeps the place in the hash',async()=>{
 window.location.hash='#/production';
 const server=installFetch(call=>{
  if(call.path==='/ai/status')return {body:{claude:{installed:true,version:'2',signedIn:true},codex:{installed:false,version:null,signedIn:false}}};
  if(call.path==='/workspaces')return {body:{current:'samin',workspaces:[ws]}};
  if(call.path==='/videos')return {body:[stored]};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/settings')return {body:{defaultAi:'claude',welcomed:true}};
  if(call.path==='/videos/v1')return {body:stored};
  if(call.path==='/videos/v1/opened')return {status:204};
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/research')return {body:[]};
 });
 const ui=await mountUI(createElement(ClubApp));
 try{
  await flush();
  assert.equal(window.location.hash,'#/production');assert.ok(ui.container.querySelector('nav[aria-label="Main"]'),'sidebar on Production');
  assert.equal(ui.container.querySelector('[role="dialog"]'),null,'a returning visitor sees no dialog');
  await act(async()=>[...ui.container.querySelectorAll<HTMLElement>('[data-card]')].find(card=>/Hidden features/.test(card.textContent||''))!.click());await flush();
  assert.equal(window.location.hash,'#/video/v1/plan');assert.ok(ui.container.querySelector('nav[aria-label="Main"]'),'the sidebar stays beside a video');
  assert.match(ui.container.querySelector('.ws-title')!.textContent||'',/Hidden features in Claude Code/);
  assert.ok(server.calls.some(call=>call.path==='/videos/v1/opened'&&call.method==='POST'),'opening a video is noted for Recent videos');
  assert.equal(ui.container.querySelector('.tabs [aria-current="page"]')!.textContent,'Plan');
  assert.equal(ui.container.querySelector('.steps'),null,'the top tabs are the only step navigation');
  assert.equal(ui.container.querySelector('.strip'),null,'Plan has no scene chips');
  assert.ok(ui.container.querySelector('.sidebar.collapsed'),'the sidebar is its rail on every step of a video');
  assert.ok(ui.container.querySelector('.pkg')&&ui.container.querySelector('.scn'),'Plan opens with the package and the scenes side by side');
  await act(async()=>[...ui.container.querySelectorAll<HTMLElement>('.tabs a')].find(a=>a.textContent==='Record')!.click());
  assert.equal(window.location.hash,'#/video/v1/record');
  assert.ok(ui.container.querySelector('.sidebar.collapsed'),'the sidebar is the rail on Record');
  assert.ok(ui.container.querySelector('.strip'),'Record has the scene chips');
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent?.startsWith('Back to')),false,'no Back button: the steps are the way back');
  await act(async()=>[...ui.container.querySelectorAll<HTMLElement>('.tabs a')].find(a=>a.textContent==='Plan')!.click());
  assert.ok(ui.container.querySelector('.sidebar.collapsed'),'and stays the rail on Plan');
  await act(async()=>[...ui.container.querySelectorAll<HTMLElement>('.tabs a')].find(a=>a.textContent==='Publish')!.click());
  assert.equal(window.location.hash,'#/video/v1/publish');assert.ok(![...ui.container.querySelectorAll('button')].some(b=>b.textContent?.startsWith('Continue')),'no continue button after Publish');
  await act(async()=>ui.container.querySelector<HTMLElement>('.crumb a')!.click());await flush();
  assert.equal(window.location.hash,'#/production');
  await act(async()=>ui.container.querySelector<HTMLElement>('a[href="#/settings"]')!.click());await flush();
  assert.equal(window.location.hash,'#/settings');assert.equal(ui.container.querySelector('[aria-current="page"]')!.textContent,'Settings');
  window.location.hash='#/video/v1/edit';await act(async()=>{window.dispatchEvent(new Event('hashchange'));});await flush();
  assert.equal(ui.container.querySelector('.tabs [aria-current="page"]')!.textContent,'Edit','a hash change from outside moves the shell');
  window.location.hash='#/video/gone/plan';await act(async()=>{window.dispatchEvent(new Event('hashchange'));});await flush();
  assert.match(ui.container.textContent||'',/Video not found/);
 }finally{await ui.close();server.restore();window.location.hash='';}
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

test('leaving a video step saves edits the autosave has not written yet',async()=>{
 const p=createProject('Hidden features'),originalFetch=globalThis.fetch,saved:boolean[]=[];
 localStorage.clear();
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async(input,init)=>{
  const url=String(input);if(url==='/api/projects')return Response.json([p]);
  if(url===`/api/projects/${p.id}`){if(init?.method==='PUT'){saved.push(JSON.parse(String(init.body)).settings.snap);return new Response(null,{status:204,headers:{ETag:'"next"'}});}return Response.json(p,{headers:{ETag:'"test"'}});}
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url.endsWith('/agent-chat')||url.includes('/automation'))return Response.json({jobs:[]});return Response.json([]);
 };
 const ui=await mountUI(createElement(ClubRecorder,{projectId:p.id,mode:'Edit',onBack:()=>{}}));
 try{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('button[title^="Magnetic snapping"]')!.click());
  assert.deepEqual(saved,[],'still inside the autosave debounce');
  await ui.render(createElement('div'));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(saved,[!p.settings.snap],'unmounting the embedded editor flushed the save');
 }finally{globalThis.fetch=originalFetch;await ui.close();}
});
