import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import type {Route} from './routes';
import {installFetch} from './test-fakes';
import {createProject} from '../../shared/types';
const {NewVideo,relativeVideoTime}=await import('./shell/NewVideo');
const {Workspace}=await import('./workspace/Workspace');
const {ToastProvider}=await import('./ui');
const video=(id:string,title:string,updatedAt='2026-11-03T12:00:00Z'):Video=>({id,title,stage:'ideas',createdAt:updatedAt,updatedAt,order:0,planning:{research:false,package:false,outline:false},stageDates:{}});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('one Quick recording click creates a default-titled video, sets up its project and opens Record without moving through Plan',async()=>{
 const routes:Route[]=[];let closed=false;
 const fake=installFetch(call=>{
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/videos'&&call.method==='POST')return {body:video('new1',(call.body as {title:string}).title)};
  if(call.path==='/videos/new1/recorder')return {body:{...video('new1','Quick'),recorderProjectId:'p1',quickRecording:true}};
 });
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NewVideo,{videos:[],onClose:()=>{closed=true;},onOpen:route=>routes.push(route)})));
 try{
  await act(async()=>{(ui.container.querySelector('[aria-label="Quick recording"]') as HTMLButtonElement).click();});await flush();
  assert.equal(closed,true);assert.deepEqual(routes,[{name:'video',id:'new1',tab:'record'}]);
  const writes=fake.calls.filter(call=>call.method==='POST');
  assert.deepEqual(writes.map(call=>call.path),['/videos','/videos/new1/recorder']);
  assert.match((writes[0].body as {title:string}).title,/^Quick recording /);
  assert.deepEqual(writes[1].body,{quick:true});
 }finally{await ui.close();fake.restore();}
});

test('recents follow opened order, show covers and relative update times, and open a video or all videos',async()=>{
 const routes:Route[]=[];
 const videos=[video('a','Newest update','2026-11-03T14:00:00Z'),video('b','Last opened','2026-11-03T12:00:00Z')];
 const fake=installFetch(call=>call.path==='/recent'?{body:['b','a']}:undefined);
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NewVideo,{videos,onClose(){},onOpen:route=>routes.push(route)})));
 try{
  await flush();const rows=ui.container.querySelectorAll<HTMLButtonElement>('.new-recent-row');
  assert.deepEqual([...rows].map(row=>row.querySelector('b')!.textContent),['Last opened','Newest update']);
  assert.match(rows[0].querySelector('img')!.getAttribute('src')!,/\/videos\/b\/cover$/);
  assert.ok(rows[0].querySelector('time'));
  await act(async()=>rows[0].click());
  await act(async()=>button(ui.container,'View all').click());
  assert.deepEqual(routes,[{name:'video',id:'b'},{name:'videos',view:'board'}]);
  assert.equal(relativeVideoTime('2026-11-03T12:00:00Z',Date.parse('2026-11-03T12:58:00Z')),'58m ago');
  assert.equal(relativeVideoTime('2026-11-03T12:00:00Z',Date.parse('2026-11-03T13:00:00Z')),'1h ago');
 }finally{await ui.close();fake.restore();}
});

test('failed quick setup keeps the created video and opens Record for retry instead of making another video',async()=>{
 const routes:Route[]=[];
 const fake=installFetch(call=>{
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/videos')return {body:video('saved','Quick')};
  if(call.path==='/videos/saved/recorder')return {status:500,body:{error:'Could not prepare recorder.'}};
 });
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NewVideo,{videos:[],onClose(){},onOpen:route=>routes.push(route)})));
 try{
  await act(async()=>{(ui.container.querySelector('[aria-label="Quick recording"]') as HTMLButtonElement).click();});await flush();
  assert.deepEqual(routes,[{name:'video',id:'saved',tab:'record'}]);
  assert.ok(ui.container.textContent?.includes('Could not prepare recorder.'));
  assert.equal(fake.calls.filter(call=>call.path==='/videos').length,1);
 }finally{await ui.close();fake.restore();}
});

test('an existing idea can set up its one-scene recording from Record without creating a new video',async()=>{
 const changes:Video[]=[];const routes:Route[]=[];
 const fake=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[]};
  if(call.path==='/videos/v1/recorder')return {body:{...video('v1','Existing'),stage:'recording',quickRecording:true,recorderProjectId:'p1'}};
 });
 const ui=await mountUI(createElement(ToastProvider,null,createElement(Workspace,{video:video('v1','Existing'),tab:'record',back:{name:'home'},onVideo:next=>changes.push(next),navigate:route=>routes.push(route)})));
 try{
  await flush();assert.equal(button(ui.container,'Record without a plan').disabled,false);
  await act(async()=>button(ui.container,'Record without a plan').click());await flush();
  assert.deepEqual(fake.calls.filter(call=>call.method==='POST').map(call=>[call.path,call.body]),[['/videos/v1/recorder',{quick:true}]]);
  assert.equal(changes[0].recorderProjectId,'p1');assert.deepEqual(routes,[{name:'video',id:'v1',tab:'record'}]);
 }finally{await ui.close();fake.restore();}
});

test('an unplanned one-scene project opens the live recorder source controls, while Plan stays optional',async()=>{
 const project=createProject('Quick recording');
 project.scenes[0].name='Quick recording';project.scenes[0].script='';
 const ready={...video('v1',project.name),stage:'recording' as const,recorderProjectId:project.id,quickRecording:true};
 const previousSource=globalThis.EventSource;
 class Source extends EventTarget{close(){}}
 Object.assign(globalThis,{EventSource:Source});localStorage.clear();
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 const fake=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null}};
  if(call.path==='/videos/v1/scenes')return {body:[{id:project.scenes[0].id,title:'Quick recording',seconds:0,takes:[],status:'Not recorded'}]};
  if(call.path===`/api/projects/${project.id}`)return {body:project};
  if(call.path==='/api/projects')return {body:[project]};
  if(call.path==='/api/health')return {body:{ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'}};
  if(call.path==='/api/automation/settings')return {body:{automaticTranscription:false}};
  if(call.path==='/disk')return {body:{freeBytes:500*1024**3,low:false}};
 });
 const page=(tab:'record'|'idea'|'edit')=>createElement(ToastProvider,null,createElement(Workspace,{video:ready,tab,back:{name:'home'},onVideo(){},navigate(){}}));
 const ui=await mountUI(page('record'));
 try{
  await flush();await flush();
  assert.ok(ui.container.querySelector('aside[aria-label="Recording sources"]'),'source picker is mounted');
  // Borumi's empty Record step: nothing planned and nothing recorded yet.
  assert.ok(ui.container.textContent?.includes('Ready to record?'));
  assert.equal(button(ui.container,'Start recording').disabled,false,'a plan is never required to start recording');
  assert.ok(button(ui.container,'Import from file...'));
  await ui.render(page('idea'));await flush();
  assert.ok(ui.container.querySelector('.bs-root'),'Idea is the script, there whenever a plan is wanted: never a step to get through first');
  await ui.render(page('edit'));await flush();
  assert.ok(ui.container.textContent?.includes('Nothing recorded yet'));
  assert.equal(button(ui.container,'Record a scene').disabled,false);
 }finally{await ui.close();fake.restore();Object.assign(globalThis,{EventSource:previousSource});}
});
