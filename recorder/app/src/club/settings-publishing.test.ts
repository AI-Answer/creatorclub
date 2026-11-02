import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {AiStatus,PublishingState} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {SettingsScreen}=await import('./screens/SettingsScreen');

const status:AiStatus={claude:{installed:true,version:'2',signedIn:true,account:'dani@example.com'},codex:{installed:false,version:null,signedIn:false}};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=async(element:Element|null)=>{await act(async()=>{(element as HTMLElement).click();});await flush();};
const type=(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const choose=async(select:Element,value:string)=>{await act(async()=>{(select as HTMLSelectElement).value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});await flush();};
const off:PublishingState={postiz:{connected:false,address:null,channel:null},defaultVisibility:'public'};
const on:PublishingState={postiz:{connected:true,address:null,channel:{id:'int_yt1',name:'Samin Yasar'}},defaultVisibility:'public'};

async function withSettings(reply:(call:FakeCall)=>FakeReply,run:(ui:Awaited<ReturnType<typeof mountUI>>,calls:FakeCall[])=>Promise<void>){
 FakeEventSource.install();
 const server=installFetch(call=>reply(call)??(call.path==='/ai/status'?{body:status}:call.path==='/settings'?{body:{defaultAi:'claude',appearance:null,geminiKey:null}}:call.path==='/workspaces'?{body:{current:null,workspaces:[]}}:undefined));
 const ui=await mountUI(createElement(SettingsScreen,{section:'publishing',onSetup(){}}));
 try{await flush();await run(ui,server.calls);}finally{await ui.close();server.restore();}
}

test('Settings is Borumi\'s two columns: a nav with one tab per group, and Publishing and look has Postiz, who can watch new videos and the theme',async()=>{
 await withSettings(call=>call.path==='/publishing'?{body:off}:undefined,async ui=>{
  const c=ui.container;
  assert.deepEqual([...c.querySelectorAll('.settings-nav a')].map(a=>a.textContent),['AI','Channel','Skills','Publishing & look']);
  assert.equal(c.querySelector('.settings-nav [aria-current="page"]')!.textContent,'Publishing & look');
  assert.deepEqual([...c.querySelectorAll('.settings-body-b h2')].map(h=>h.textContent),['Publishing and look'],'one group at a time');
  const group=c.querySelector('#set-publishing')!;
  assert.ok(group.textContent?.includes('Postiz'));
  assert.ok(group.querySelector('label[for="set-vis"]')?.textContent==='Who can watch new videos');
  assert.deepEqual([...group.querySelectorAll('[aria-label="Theme"] button')].map(b=>b.textContent),['System default','Light','Dark']);
  assert.ok(!/please|successfully|!/i.test(group.textContent??''));
 });
});

test('Postiz is connected here with the key pasted once; a wrong key is one sentence; the key is never shown again',async()=>{
 let state=off;
 await withSettings(({method,path,body})=>{
  if(path==='/publishing')return {body:state};
  if(method==='PUT'&&path==='/publishing/postiz'){
   if((body as {key:string}).key==='wrong')return {status:400,body:{error:"Postiz didn't accept that key. Copy it again from Postiz, Settings, Public API."}};
   state=on;return {body:{state:on,channels:[{id:'int_yt1',name:'Samin Yasar'}]}};
  }
  if(path==='/publishing/postiz/channels')return {body:{channels:[{id:'int_yt1',name:'Samin Yasar'}]}};
 },async(ui,calls)=>{
  const c=ui.container;
  const input=c.querySelector('#postiz-key') as HTMLInputElement;
  assert.equal(input.type,'password');
  assert.ok(c.textContent?.includes('In Postiz, open Settings, then Public API, and copy the key.'));
  await type(input,'wrong');await click(button(c.querySelector('#set-publishing')!,'Connect'));
  assert.ok(c.textContent?.includes("Postiz didn't accept that key."));
  await click(button(c,'Use your own Postiz server'));
  await type(c.querySelector('#postiz-address')!,'https://postiz.example.com');
  await type(c.querySelector('#postiz-key')!,'my-postiz-api-key-0001');await click(button(c.querySelector('#set-publishing')!,'Connect'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT').at(-1)?.body,{key:'my-postiz-api-key-0001',address:'https://postiz.example.com'});
  assert.ok(c.textContent?.includes('Postiz connected.')&&c.textContent.includes('Posts to Samin Yasar on YouTube.'));
  assert.equal(c.querySelector('#postiz-key'),null);
  assert.equal(c.textContent?.includes('my-postiz-api-key'),false);
 });
});

test('with more than one YouTube channel the person picks which one; with none Postiz says so and offers Check again',async()=>{
 let channels=[{id:'int_yt1',name:'Samin Yasar'},{id:'int_yt2',name:'Second channel'}];
 let state:PublishingState={postiz:{connected:true,address:null,channel:null},defaultVisibility:'public'};
 await withSettings(({method,path,body})=>{
  if(path==='/publishing'&&method==='GET')return {body:state};
  if(path==='/publishing/postiz/channels')return {body:{channels}};
  if(path==='/publishing'&&method==='PUT'){state={...state,postiz:{...state.postiz,channel:channels.find(item=>item.id===(body as {channelId:string}).channelId)!}};return {body:state};}
 },async(ui,calls)=>{
  const c=ui.container;
  const select=c.querySelector('#postiz-channel') as HTMLSelectElement;
  assert.deepEqual([...select.options].map(option=>option.textContent),['Choose a channel','Samin Yasar','Second channel']);
  await choose(select,'int_yt2');
  assert.deepEqual(calls.filter(call=>call.method==='PUT').at(-1)?.body,{channelId:'int_yt2'});
  assert.equal((c.querySelector('#postiz-channel') as HTMLSelectElement).value,'int_yt2');
  channels=[];
  await click(c.querySelector('#postiz-channel')&&[...c.querySelectorAll('button')].find(b=>b.textContent==='Disconnect')!);
 });
 await withSettings(({path})=>path==='/publishing'?{body:{postiz:{connected:true,address:null,channel:null},defaultVisibility:'public'}}:path==='/publishing/postiz/channels'?{body:{channels:[]}}:undefined,async ui=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes('Postiz has no YouTube channel yet, so connect one in Postiz and check again.'));
  assert.ok(button(c,'Check again'));
 });
});

test('Disconnect forgets the key, and the default visibility is saved when chosen',async()=>{
 let state=on;
 await withSettings(({method,path,body})=>{
  if(path==='/publishing'&&method==='GET')return {body:state};
  if(path==='/publishing/postiz/channels')return {body:{channels:[{id:'int_yt1',name:'Samin Yasar'}]}};
  if(path==='/publishing'&&method==='PUT'){state={...state,defaultVisibility:(body as {defaultVisibility:PublishingState['defaultVisibility']}).defaultVisibility};return {body:state};}
  if(path==='/publishing/postiz'&&method==='DELETE'){state=off;return {body:off};}
 },async(ui,calls)=>{
  const c=ui.container;
  await choose(c.querySelector('#set-vis')!,'unlisted');
  assert.deepEqual(calls.filter(call=>call.method==='PUT'&&call.path==='/publishing').at(-1)?.body,{defaultVisibility:'unlisted'});
  assert.equal((c.querySelector('#set-vis') as HTMLSelectElement).value,'unlisted');
  await click(button(c,'Disconnect'));
  assert.equal(calls.filter(call=>call.method==='DELETE'&&call.path==='/publishing/postiz').length,1);
  assert.ok(c.querySelector('#postiz-key'),'the key field is back');
 });
});

test('Settings still opens and says why when the publishing settings cannot be read',async()=>{
 await withSettings(call=>call.path==='/publishing'?{status:500}:undefined,async ui=>{
  const c=ui.container;
  assert.ok(c.textContent?.includes("That did not work."));
  assert.ok(c.querySelector('.settings-nav a[href="#/settings/ai"]'),'the other tabs are still there');
 });
});

test('a failed save of the default visibility says so, and Try again sends that same choice again',async()=>{
 let fail=true;
 await withSettings(({method,path,body})=>{
  if(path==='/publishing'&&method==='GET')return {body:on};
  if(path==='/publishing/postiz/channels')return {body:{channels:[{id:'int_yt1',name:'Samin Yasar'}]}};
  if(path==='/publishing'&&method==='PUT')return fail?{status:500}:{body:{...on,defaultVisibility:(body as {defaultVisibility:'private'}).defaultVisibility}};
 },async(ui,calls)=>{
  const c=ui.container;
  await choose(c.querySelector('#set-vis')!,'private');
  assert.ok(c.textContent?.includes("Couldn't save that choice.")||c.textContent?.includes('That did not work.'));
  fail=false;
  await click(button(c.querySelector('#set-publishing')!,'Try again'));
  const puts=calls.filter(call=>call.method==='PUT'&&call.path==='/publishing');
  assert.equal(puts.length,2);
  assert.deepEqual(puts[1].body,{defaultVisibility:'private'});
  assert.equal(c.querySelector('#set-publishing [role="alert"]'),null,'the error is gone once it worked');
 });
});
