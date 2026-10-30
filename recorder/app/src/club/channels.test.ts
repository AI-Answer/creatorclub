import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {Sidebar}=await import('./Sidebar');
const {ToastProvider}=await import('./ui');
const {SettingsScreen}=await import('./screens/SettingsScreen');

const ws=(slug:string,name:string)=>({slug,name,handle:`@${slug}`,channelUrl:`https://www.youtube.com/@${slug}`,topics:['ai'],audience:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'});
const two={current:'samin',workspaces:[ws('samin','Samin Yasar'),ws('ana','Ana')]};
const claudeIn={claude:{installed:true,version:'2.1.0',signedIn:true,account:'dani@example.com'},codex:{installed:false,version:null,signedIn:false}};

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await flush();};
const type=async(input:Element,value:string,proto:object=HTMLInputElement.prototype)=>act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const text=(container:Element)=>container.textContent??'';
const withServer=async(reply:(call:FakeCall)=>FakeReply|Promise<FakeReply>,run:(calls:FakeCall[])=>Promise<void>)=>{
 FakeEventSource.install();const server=installFetch(call=>reply(call)??(call.path==='/publishing'&&call.method==='GET'?{body:{postiz:{connected:false,address:null,channel:null},defaultVisibility:'public'}}:undefined));
 try{await run(server.calls);}finally{server.restore();}
};
const emit=(type:string,data?:unknown)=>act(async()=>{FakeEventSource.last().emit(type,data);});

const sidebar=(props:Partial<Parameters<typeof Sidebar>[0]>={})=>createElement(Sidebar,{route:{name:'home'},collapsed:false,onToggle(){},onSearch(){},onHelp(){},onSwitched(){},onAdd(){},videos:[],epoch:0,...props});

test('channel switcher: shows the current channel, lists all of them, switches, and offers Add a channel',async()=>{
 await withServer(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:two};
  if(call.path==='/workspaces/ana/current')return {body:{current:'ana'}};
 },async calls=>{
  const switched:string[]=[];let added=0;
  const ui=await mountUI(sidebar({onSwitched:()=>switched.push('switched'),onAdd:()=>{added++;}}));
  try{
   await flush();const c=ui.container;
   const trigger=c.querySelector('[aria-haspopup="menu"]')!;
   assert.match(text(trigger),/Samin Yasar/);assert.match(text(trigger),/@samin/);
   assert.equal(c.querySelector('[role="menu"]'),null,'closed at first');
   await press(trigger);
   const items=[...c.querySelectorAll('[role="menuitemradio"]')];
   assert.deepEqual(items.map(i=>i.textContent!.trim()),['Samin Yasar','Ana']);
   assert.deepEqual(items.map(i=>i.getAttribute('aria-checked')),['true','false']);
   assert.ok([...c.querySelectorAll('[role="menuitem"]')].some(i=>i.textContent!.trim()==='Add a channel'));
   await press(items[1]);
   assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.path),['/workspaces/ana/current']);
   assert.deepEqual(switched,['switched']);
   assert.equal(c.querySelector('[role="menu"]'),null,'closes after choosing');
   assert.match(text(c.querySelector('[aria-haspopup="menu"]')!),/Ana/);
   await press(c.querySelector('[aria-haspopup="menu"]')!);
   await press([...c.querySelectorAll('[role="menuitem"]')].find(i=>i.textContent!.trim()==='Add a channel')!);
   assert.equal(added,1);
   assert.equal(c.querySelector('[role="menu"]'),null);
  }finally{await ui.close();}
 });
});

test('channel switcher: a failed switch says one sentence and keeps the current channel; with no channels it is a plain Add a channel link',async()=>{
 await withServer(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:two};
 },async()=>{
  const ui=await mountUI(createElement(ToastProvider,null,sidebar()));
  try{
   await flush();const c=ui.container;
   await press(c.querySelector('[aria-haspopup="menu"]')!);
   await press(c.querySelectorAll('[role="menuitemradio"]')[1]);
   assert.match(text(c.querySelector('[role="status"]')!),/Couldn't switch channels\./);
   assert.match(text(c.querySelector('[aria-haspopup="menu"]')!),/Samin Yasar/);
  }finally{await ui.close();}
 });
 await withServer(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:null,workspaces:[]}};
 },async()=>{
  const ui=await mountUI(sidebar());
  try{await flush();const link=ui.container.querySelector<HTMLAnchorElement>('a[aria-label="Add a channel"]')!;assert.equal(link.getAttribute('href'),'#/welcome?step=2');assert.equal(ui.container.querySelector('[aria-haspopup="menu"]'),null);}finally{await ui.close();}
 });
});

test('Settings: Rebuild voice guide that needs answers shows the questions, and saving them says so',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:'samin',workspaces:[ws('samin','Samin')]}};
  if(call.path==='/workspaces/samin'&&call.method==='GET')return {body:{...ws('samin','Samin'),about:'Beginners learning Claude.'}};
  if(call.path==='/followed')return {body:[]};
  if(call.path==='/signals-config')return {body:{}};
  if(call.path==='/workspaces/samin/voice')return {status:202,body:{id:call.body&&(call.body as {answers?:unknown}).answers?'j_save':'j_rebuild',kind:'voice',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   await press(c.querySelector('button[aria-label="Edit channel"]')!);await press(c.querySelector('button[aria-label="Edit voice"]')!);
   await press(button(c,'Rebuild voice guide'));
   await emit('done',{voice:'needs-answers'});
   assert.doesNotMatch(text(c),/Rebuilt your voice guide/);
   assert.equal(c.querySelectorAll('section textarea').length,5,'About, Ending rule and the three questions');
   const areas=[...c.querySelectorAll('textarea')].slice(-3);
   await type(areas[0],'Warm.',HTMLTextAreaElement.prototype);
   await type(areas[1],'Beginners learning Claude.',HTMLTextAreaElement.prototype);
   await press(button(c,'Save answers'));
   assert.deepEqual(calls.filter(call=>call.path==='/workspaces/samin/voice').at(-1)?.body,{answers:{voice:'Warm.',audience:'Beginners learning Claude.',moves:''}});
   await emit('done',{voice:'built'});
   assert.match(text(c),/Saved your voice guide/);
   assert.equal(c.querySelectorAll('section textarea').length,2,'the questions are gone');
   assert.equal([...c.querySelectorAll('textarea')][0].value,'Beginners learning Claude.','About picks up the audience answer');
   assert.equal((button(c,'Save changes') as HTMLButtonElement).disabled,true,'and is not marked as an unsaved edit');
  }finally{await ui.close();}
 });
});
