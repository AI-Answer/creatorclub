import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {Sidebar}=await import('./Sidebar');
const {OnboardingScreen}=await import('./screens/OnboardingScreen');
const {SettingsScreen}=await import('./screens/SettingsScreen');

const ws=(slug:string,name:string)=>({slug,name,handle:`@${slug}`,channelUrl:`https://www.youtube.com/@${slug}`,topics:['ai'],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'});
const two={current:'samin',workspaces:[ws('samin','Samin Yasar'),ws('ana','Ana')]};
const claudeIn={claude:{installed:true,version:'2.1.0',signedIn:true,account:'dani@example.com'},codex:{installed:false,version:null,signedIn:false},gemini:{installed:false,version:null,signedIn:false}};

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await flush();};
const type=async(input:Element,value:string,proto:object=HTMLInputElement.prototype)=>act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const text=(container:Element)=>container.textContent??'';
const withServer=async(reply:(call:FakeCall)=>FakeReply|Promise<FakeReply>,run:(calls:FakeCall[])=>Promise<void>)=>{
 FakeEventSource.install();const server=installFetch(reply);
 try{await run(server.calls);}finally{server.restore();}
};
const emit=(type:string,data?:unknown)=>act(async()=>{FakeEventSource.last().emit(type,data);});
const questions=['In one or two sentences, how would you describe your voice?','Who is your audience and what do you teach them?','Any signature moves?'];

test('channel switcher: shows the current channel, lists all of them, switches, and offers Add channel',async()=>{
 await withServer(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:two};
  if(call.path==='/workspaces/ana/current')return {body:{current:'ana'}};
 },async calls=>{
  const routes:unknown[]=[],switched:string[]=[];
  const ui=await mountUI(createElement(Sidebar,{route:{name:'board'},navigate:route=>routes.push(route),onHelp(){},onSwitch:slug=>switched.push(slug)}));
  try{
   await flush();const c=ui.container;
   const trigger=c.querySelector('[aria-haspopup="menu"]')!;
   assert.match(text(trigger),/Samin Yasar/);
   assert.equal(c.querySelector('[role="menu"]'),null,'closed at first');
   await press(trigger);
   const items=[...c.querySelectorAll('[role="menuitemradio"]')];
   assert.deepEqual(items.map(i=>i.textContent!.trim().slice(1)),['Samin Yasar','Ana']);
   assert.deepEqual(items.map(i=>i.getAttribute('aria-checked')),['true','false']);
   assert.ok([...c.querySelectorAll('[role="menuitem"]')].some(i=>i.textContent!.trim()==='Add channel'));
   await press(items[1]);
   assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.path),['/workspaces/ana/current']);
   assert.deepEqual(switched,['ana']);
   assert.equal(c.querySelector('[role="menu"]'),null,'closes after choosing');
   assert.match(text(c.querySelector('[aria-haspopup="menu"]')!),/Ana/);
   await press(c.querySelector('[aria-haspopup="menu"]')!);
   await press([...c.querySelectorAll('[role="menuitem"]')].find(i=>i.textContent!.trim()==='Add channel')!);
   assert.deepEqual(routes,[{name:'onboarding'}]);
   assert.equal(c.querySelector('[role="menu"]'),null);
  }finally{await ui.close();}
 });
});

test('channel switcher: a failed switch says one sentence and keeps the current channel; with no channels it is a plain Add channel button',async()=>{
 await withServer(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:two};
 },async()=>{
  const ui=await mountUI(createElement(Sidebar,{route:{name:'board'},navigate(){},onHelp(){}}));
  try{
   await flush();const c=ui.container;
   await press(c.querySelector('[aria-haspopup="menu"]')!);
   await press(c.querySelectorAll('[role="menuitemradio"]')[1]);
   assert.match(text(c),/Couldn't switch channels\./);
   assert.match(text(c.querySelector('[aria-haspopup="menu"]')!),/Samin Yasar/);
  }finally{await ui.close();}
 });
 await withServer(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:null,workspaces:[]}};
 },async()=>{
  const routes:unknown[]=[];
  const ui=await mountUI(createElement(Sidebar,{route:{name:'board'},navigate:route=>routes.push(route),onHelp(){}}));
  try{await flush();await press(button(ui.container,'Add channel'));assert.deepEqual(routes,[{name:'onboarding'}]);assert.equal(ui.container.querySelector('[aria-haspopup="menu"]'),null);}finally{await ui.close();}
 });
});

test('Add channel with too few captions asks the three Voice DNA questions, then hands over to the board',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:null,workspaces:[]}};
  if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_add',kind:'add-channel',status:'running',createdAt:''}};
  if(call.path==='/workspaces/quiet/voice')return {status:202,body:{id:'j_voice',kind:'voice',status:'running',createdAt:''}};
 },async calls=>{
  let done=0;
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){done++;}}));
  try{
   await flush();const c=ui.container;
   await type(c.querySelector('input')!,'youtube.com/@quiet');
   await press(button(c,'Add channel'));
   await emit('done',{workspace:ws('quiet','Quiet'),voice:'needs-answers'});
   assert.equal(done,0,'the board waits for the answers');
   assert.equal(c.querySelector('h1')!.textContent,'How do you talk?');
   assert.deepEqual([...c.querySelectorAll('label > span:first-child')].map(s=>s.textContent),questions);
   assert.equal(c.querySelectorAll('textarea').length,3);
   assert.match(text(c),/Recurring analogies, phrases you always or never use, a standard closing line\./);
   assert.equal((button(c,'Save answers') as HTMLButtonElement).disabled,true,'voice and audience are needed');
   const areas=[...c.querySelectorAll('textarea')];
   await type(areas[0],'Warm and direct.',HTMLTextAreaElement.prototype);
   assert.equal((button(c,'Save answers') as HTMLButtonElement).disabled,true);
   await type(areas[1],'Beginners learning Claude.',HTMLTextAreaElement.prototype);
   assert.equal((button(c,'Save answers') as HTMLButtonElement).disabled,false,'the third question is optional');
   await press(button(c,'Save answers'));
   assert.deepEqual(calls.find(call=>call.path==='/workspaces/quiet/voice')?.body,{answers:{voice:'Warm and direct.',audience:'Beginners learning Claude.',moves:''}});
   assert.equal(FakeEventSource.last().url,'/api/club/jobs/j_voice/events');
   await emit('done',{voice:'built'});
   assert.equal(done,1);
  }finally{await ui.close();}
 });
});

test('Add channel with a built voice guide goes straight to the board',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:null,workspaces:[]}};
  if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_add',kind:'add-channel',status:'running',createdAt:''}};
 },async()=>{
  let done=0;
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){done++;}}));
  try{
   await flush();
   await type(ui.container.querySelector('input')!,'@samin');
   await press(button(ui.container,'Add channel'));
   await emit('done',{workspace:ws('samin','Samin'),voice:'built'});
   assert.equal(done,1);
  }finally{await ui.close();}
 });
});

test('Settings: Rebuild voice guide that needs answers shows the questions, and saving them says so',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude'}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:'samin',workspaces:[ws('samin','Samin')]}};
  if(call.path==='/workspaces/samin'&&call.method==='GET')return {body:{...ws('samin','Samin'),about:'Beginners learning Claude.'}};
  if(call.path==='/workspaces/samin/voice')return {status:202,body:{id:call.body&&(call.body as {answers?:unknown}).answers?'j_save':'j_rebuild',kind:'voice',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){}}));
  try{
   await flush();const c=ui.container;
   await press(button(c,'Rebuild voice guide'));
   await emit('done',{voice:'needs-answers'});
   assert.doesNotMatch(text(c),/Rebuilt your voice guide/);
   assert.equal(c.querySelectorAll('section textarea').length,4,'About plus the three questions');
   const areas=[...c.querySelectorAll('textarea')].slice(-3);
   await type(areas[0],'Warm.',HTMLTextAreaElement.prototype);
   await type(areas[1],'Beginners learning Claude.',HTMLTextAreaElement.prototype);
   await press(button(c,'Save answers'));
   assert.deepEqual(calls.filter(call=>call.path==='/workspaces/samin/voice').at(-1)?.body,{answers:{voice:'Warm.',audience:'Beginners learning Claude.',moves:''}});
   await emit('done',{voice:'built'});
   assert.match(text(c),/Saved your voice guide/);
   assert.equal(c.querySelectorAll('section textarea').length,1,'the questions are gone');
   assert.equal([...c.querySelectorAll('textarea')][0].value,'Beginners learning Claude.','About picks up the audience answer');
   assert.equal((button(c,'Save changes') as HTMLButtonElement).disabled,true,'and is not marked as an unsaved edit');
  }finally{await ui.close();}
 });
});

test('copy rules on the new screens: no please, successfully, exclamation marks or banned words',async()=>{
 const banned=/please|successfully|!|\bbrief\b|\blane\b|\bpicked\b|\bproject\b|borumi|style video|automate/i;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:null,workspaces:[]}};
  if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_add',kind:'add-channel',status:'running',createdAt:''}};
 },async()=>{
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){}}));
  try{
   await flush();
   await type(ui.container.querySelector('input')!,'@quiet');
   await press(button(ui.container,'Add channel'));
   await emit('done',{workspace:ws('quiet','Quiet'),voice:'needs-answers'});
   assert.doesNotMatch(text(ui.container),banned);
  }finally{await ui.close();}
 });
});
