import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {AiStatus} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {default:ClubApp}=await import('./ClubApp');
const {OnboardingScreen}=await import('./screens/OnboardingScreen');
const {SettingsScreen}=await import('./screens/SettingsScreen');

const signedOut:AiStatus={claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false},gemini:{installed:false,version:null,signedIn:false}};
const claudeIn:AiStatus={...signedOut,claude:{installed:true,version:'2.1.0',signedIn:true,account:'dani@example.com'}};
const workspace={slug:'samin',name:'Samin',handle:'@samin',channelUrl:'https://youtube.com/@samin',topics:['ai','claude'],about:'Teaches Claude',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};
const none={current:null,workspaces:[]};
const one={current:'samin',workspaces:[workspace]};

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=async(container:Element,text:string)=>{await act(async()=>button(container,text).click());await flush();};
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const typeArea=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const emit=(type:string,data?:unknown)=>act(async()=>{FakeEventSource.last().emit(type,data);});
const text=(container:Element)=>container.textContent??'';
const labels=(container:Element)=>[...container.querySelectorAll('button')].map(b=>b.textContent?.trim());
const withServer=async(reply:(call:FakeCall)=>FakeReply|Promise<FakeReply>,run:(calls:FakeCall[])=>Promise<void>)=>{
 FakeEventSource.install();const server=installFetch(reply);
 try{await run(server.calls);}finally{server.restore();}
};
const baseRoutes=(status:AiStatus,workspaces:unknown):((call:FakeCall)=>FakeReply)=>call=>{
 if(call.path==='/ai/status')return {body:status};
 if(call.path==='/workspaces'&&call.method==='GET')return {body:workspaces};
};

test('opening the board with no AI or no channel goes to first launch; a ready setup or an unreachable server does not',async()=>{
 for(const [status,workspaces,expected] of [[signedOut,none,'#/onboarding'],[claudeIn,none,'#/onboarding'],[signedOut,one,'#/onboarding'],[claudeIn,one,'#/board']] as const){
  await withServer(baseRoutes(status,workspaces),async()=>{
   window.location.hash='';const ui=await mountUI(createElement(ClubApp));
   try{await flush();assert.equal(window.location.hash,expected);}finally{await ui.close();window.location.hash='';}
  });
 }
 FakeEventSource.install();const original=globalThis.fetch;globalThis.fetch=(async()=>{throw new TypeError('offline');}) as typeof fetch;
 window.location.hash='';const ui=await mountUI(createElement(ClubApp));
 try{await flush();assert.equal(window.location.hash,'#/board');}finally{globalThis.fetch=original;await ui.close();window.location.hash='';}
});

test('Connect your AI: Connect Claude installs with progress, waits for the browser, then shows who is connected',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/ai/connect')return {status:202,body:{id:'j_1',kind:'connect-claude',status:'running',createdAt:''}};
 },async calls=>{
  let done=0;
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){done++;}}));
  try{
   await flush();
   const c=ui.container;
   assert.equal(c.querySelector('h1')!.textContent,'Connect your AI');
   assert.match(text(c),/CreatorClub uses your own Claude or ChatGPT account\./);
   assert.deepEqual(labels(c),['Connect Claude','Connect ChatGPT']);
   assert.equal(c.querySelectorAll('button.bg-primary').length,1,'one primary button');
   assert.ok(button(c,'Connect Claude').className.includes('bg-primary'));
   assert.equal(c.querySelector('input'),null,'never asks for a key');

   await click(c,'Connect Claude');
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'claude'});
   assert.equal(FakeEventSource.last().url,'/api/club/jobs/j_1/events');
   await emit('progress',{phase:'installing'});
   assert.ok(c.querySelector('[role="progressbar"]'),'a progress bar while installing');
   assert.match(text(c),/Installing Claude/);
   for(const line of ['one','two','three','four'])await emit('progress',{phase:'installing',line});
   const shown=[...c.querySelectorAll('li')].map(li=>li.textContent);
   assert.deepEqual(shown,['two','three','four'],'the last lines stream by');
   assert.deepEqual(labels(c),[],'no buttons while working');

   await emit('progress',{phase:'signing-in'});
   assert.match(text(c),/Finish signing in to Claude in your browser\./);
   assert.equal(c.querySelector('[role="progressbar"]'),null);

   await emit('progress',{phase:'connected',account:'dani@example.com'});
   await emit('done',{provider:'claude',account:'dani@example.com'});
   assert.match(text(c),/Connected as dani@example\.com/);
   assert.equal(FakeEventSource.last().closed,true,'the stream is closed after done');
   assert.deepEqual(labels(c),['Add your channel']);

   await click(c,'Add your channel');
   assert.equal(c.querySelector('h1')!.textContent,'Add your channel');
   assert.equal(done,0);
  }finally{await ui.close();}
 });
});

test('Connect ChatGPT sends codex; a failed install is one sentence and Try again starts it again',async()=>{
 let connects=0;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/ai/connect')return {status:202,body:{id:`j_${++connects}`,kind:'connect-codex',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){}}));
  try{
   await flush();const c=ui.container;
   await click(c,'Connect ChatGPT');
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'codex'});
   await emit('failed',{message:"Couldn't install ChatGPT."});
   assert.equal(FakeEventSource.last().closed,true);
   assert.match(text(c),/Couldn't install ChatGPT\./);
   assert.deepEqual(labels(c),['Try again']);
   assert.ok(button(c,'Try again').className.includes('bg-primary'));
   await click(c,'Try again');
   assert.equal(calls.filter(call=>call.path==='/ai/connect').length,2);
   assert.deepEqual(calls.filter(call=>call.path==='/ai/connect').map(call=>call.body),[{provider:'codex'},{provider:'codex'}]);
   assert.equal(FakeEventSource.all.length,2);
  }finally{await ui.close();}
 });
});

test('a server error on connect shows its sentence, never raw text',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/ai/connect')return {status:500};
 },async()=>{
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){}}));
  try{
   await flush();await click(ui.container,'Connect Claude');
   assert.match(text(ui.container),/That did not work\./);assert.deepEqual(labels(ui.container),['Try again']);
  }finally{await ui.close();}
 });
});

test('with an AI already connected, first launch starts at Add your channel',async()=>{
 await withServer(baseRoutes(claudeIn,none),async()=>{
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){},onDone(){}}));
  try{
   await flush();const c=ui.container;
   assert.equal(c.querySelector('h1')!.textContent,'Add your channel');
   assert.match(text(c),/Paste your YouTube channel\. We'll learn your topics and how you talk\./);
   const input=c.querySelector('input')!;
   assert.equal(input.getAttribute('placeholder'),'youtube.com/@yourchannel');
   assert.equal((button(c,'Add channel') as HTMLButtonElement).disabled,true,'needs a channel first');
   assert.equal(labels(c).includes('Open board'),false,'no board to go back to yet');
  }finally{await ui.close();}
 });
});

test('Add your channel: posts the channel, streams the job, and hands over to the board when it is done',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_9',kind:'add-channel',status:'running',createdAt:''}};
 },async calls=>{
  let done=0,board=0;
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){board++;},onDone(){done++;}}));
  try{
   await flush();const c=ui.container;
   await type(c.querySelector('input')!,'  youtube.com/@samin ');
   await click(c,'Add channel');
   assert.deepEqual(calls.find(call=>call.path==='/workspaces'&&call.method==='POST')?.body,{channelUrl:'youtube.com/@samin'});
   assert.equal(FakeEventSource.last().url,'/api/club/jobs/j_9/events');
   assert.ok(c.querySelector('[role="progressbar"]'));
   assert.equal(c.querySelector('input')!.hasAttribute('disabled'),true);
   await emit('progress',{message:'Reading your last 10 videos…'});
   assert.match(text(c),/Reading your last 10 videos…/);
   await emit('progress',{message:'Writing your voice guide…'});
   assert.match(text(c),/Writing your voice guide…/);
   assert.equal(done,0);
   await emit('done',{slug:'samin'});
   assert.equal(done,1);assert.equal(board,0);
   assert.equal(FakeEventSource.last().closed,true);
  }finally{await ui.close();}
 });
});

test('Add your channel also accepts a created workspace, and shows one sentence when the server refuses',async()=>{
 let created=true;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces'&&call.method==='POST')return created?{status:201,body:workspace}:{status:400,body:{error:'Some details were not valid.'}};
 },async()=>{
  let done=0,board=0;
  const ui=await mountUI(createElement(OnboardingScreen,{onBoard(){board++;},onDone(){done++;}}));
  try{
   await flush();const c=ui.container;
   assert.ok(labels(c).includes('Open board'),'another channel can be added from the sidebar');
   await click(c,'Open board');assert.equal(board,1);
   await type(c.querySelector('input')!,'youtube.com/@samin');
   await click(c,'Add channel');assert.equal(done,1);

   created=false;
   await click(c,'Add channel');
   assert.match(text(c),/Some details were not valid\./);
   assert.deepEqual(labels(c),['Try again']);
   assert.equal(done,1);
  }finally{await ui.close();}
 });
});

test('Settings: Claude, ChatGPT and Google with their status, Connect or Reconnect, and the Google note',async()=>{
 const status:AiStatus={...claudeIn,gemini:{installed:true,version:'0.9.0',signedIn:false}};
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:status};
  if(call.path==='/settings'&&call.method==='GET')return {body:{defaultAi:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin')return {body:workspace};
 },async()=>{
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){}}));
  try{
   await flush();const c=ui.container;
   assert.deepEqual([...c.querySelectorAll('h2')].map(h=>h.textContent),['Connected AI','Default AI','Channel','Appearance']);
   const buttonsByName=[...c.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label')).filter(l=>/Connect|Reconnect/.test(l!));
   assert.deepEqual(buttonsByName,['Reconnect Claude','Connect ChatGPT','Connect Google']);
   assert.match(text(c),/Connected as dani@example\.com/);
   assert.match(text(c),/Not connected/);
   assert.match(text(c),/Optional/);
   assert.match(text(c),/Lets CreatorClub watch videos with sound and motion\./);
   const defaultTabs=c.querySelector('[aria-label="Default AI"]')!;
   assert.equal(defaultTabs.querySelector('[aria-selected="true"]')!.textContent,'Claude','falls back to the connected AI');
   const appearance=c.querySelector('[aria-label="Appearance"]')!;
   assert.deepEqual([...appearance.querySelectorAll('button')].map(b=>b.textContent),['System','Light','Dark']);
   assert.equal(appearance.querySelector('[aria-selected="true"]')!.textContent,'Light','light by default');
  }finally{await ui.close();}
 });
});

test('Settings: connecting Google runs its job and the card turns to Connected after a refresh',async()=>{
 let status:AiStatus={...signedOut};
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:status};
  if(call.path==='/settings'&&call.method==='GET')return {body:{defaultAi:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/ai/connect')return {status:202,body:{id:'j_g',kind:'connect-gemini',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){}}));
  try{
   await flush();const c=ui.container;
   await act(async()=>c.querySelector<HTMLButtonElement>('button[aria-label="Connect Google"]')!.click());await flush();
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'gemini'});
   await emit('progress',{phase:'installing',line:'added 1 package'});
   assert.match(text(c),/Installing Google/);assert.match(text(c),/added 1 package/);
   assert.equal(c.querySelector('button[aria-label="Connect Google"]'),null,'the button waits while it works');
   status={...signedOut,gemini:{installed:true,version:'0.9.0',signedIn:true}};
   await emit('done',{provider:'gemini'});await flush();
   assert.ok(c.querySelector('button[aria-label="Reconnect Google"]'));
   assert.equal(calls.some(call=>call.path==='/workspaces/samin'),false);
   assert.match(text(c),/No channel yet\./);
  }finally{await ui.close();}
 });
});

test('Settings: reconnecting an AI that is already signed in asks the server to sign in again',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude'}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/ai/connect')return {status:202,body:{id:'j_r',kind:'connect-claude',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){}}));
  try{
   await flush();
   await act(async()=>ui.container.querySelector<HTMLButtonElement>('button[aria-label="Reconnect Claude"]')!.click());await flush();
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'claude',reconnect:true});
  }finally{await ui.close();}
 });
});

test('Settings: default AI and appearance are saved when chosen',async()=>{
 localStorage.clear();
 const original=(globalThis as {matchMedia?:unknown}).matchMedia;
 Object.assign(globalThis,{matchMedia:()=>({matches:true,addEventListener(){}})});
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:{...claudeIn,codex:{installed:true,version:'1',signedIn:true,account:'ChatGPT'}}};
  if(call.path==='/settings'&&call.method==='GET')return {body:{defaultAi:'claude'}};
  if(call.path==='/settings'&&call.method==='PUT')return {body:call.body};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){}}));
  try{
   await flush();const c=ui.container;
   await click(c.querySelector('[aria-label="Default AI"]')!,'ChatGPT');
   assert.deepEqual(calls.find(call=>call.method==='PUT')?.body,{defaultAi:'codex'});
   assert.equal(c.querySelector('[aria-label="Default AI"] [aria-selected="true"]')!.textContent,'ChatGPT');
   await click(c.querySelector('[aria-label="Appearance"]')!,'Dark');
   assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(localStorage.getItem('sceneforge.appearance'),'dark');
   await click(c.querySelector('[aria-label="Appearance"]')!,'Light');
   assert.equal(document.documentElement.dataset.theme,'light');
  }finally{await ui.close();localStorage.clear();Object.assign(globalThis,{matchMedia:original});}
 });
});

test('Settings: channel details save, and Rebuild voice guide follows its job or shows one sentence',async()=>{
 let voice:FakeReply={status:404};
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude'}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin'&&call.method==='GET')return {body:workspace};
  if(call.path==='/workspaces/samin'&&call.method==='PUT')return {body:{...workspace,...(call.body as object)}};
  if(call.path==='/workspaces/samin/voice')return voice;
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){}}));
  try{
   await flush();const c=ui.container;
   const inputs=[...c.querySelectorAll<HTMLInputElement>('section input')];
   assert.deepEqual(inputs.map(i=>i.value),['Samin','@samin','ai, claude']);
   assert.equal((button(c,'Save changes') as HTMLButtonElement).disabled,true,'nothing to save yet');
   await type(inputs[0],'Samin Yasar');await type(inputs[2],'ai, claude, trading , ');
   await typeArea(c.querySelector('textarea')!,'Teaches Claude Code');
   await click(c,'Save changes');
   assert.deepEqual(calls.find(call=>call.method==='PUT')?.body,{name:'Samin Yasar',handle:'@samin',topics:['ai','claude','trading'],about:'Teaches Claude Code'});
   assert.match(text(c),/Saved/);assert.equal((button(c,'Save changes') as HTMLButtonElement).disabled,true);

   await click(c,'Rebuild voice guide');
   assert.match(text(c),/That did not work\./);
   voice={status:202,body:{id:'j_v',kind:'voice',status:'running',createdAt:''}};
   await click(c,'Try again');
   assert.equal(FakeEventSource.last().url,'/api/club/jobs/j_v/events');
   await emit('progress',{message:'Reading your last 10 videos…'});
   assert.match(text(c),/Reading your last 10 videos…/);
   await emit('done',{});
   assert.match(text(c),/Rebuilt your voice guide/);
  }finally{await ui.close();}
 });
});

test('Settings without a channel offers Add your channel',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
 },async()=>{
  let added=0;
  const ui=await mountUI(createElement(SettingsScreen,{onAddChannel(){added++;}}));
  try{await flush();await click(ui.container,'Add your channel');assert.equal(added,1);}finally{await ui.close();}
 });
});

test('copy rules: no please, successfully, exclamation marks, or banned words on these screens',async()=>{
 const banned=/please|successfully|!|\bbrief\b|\blane\b|\bpicked\b|\bproject\b|borumi|style video|automate/i;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/settings')return {body:{defaultAi:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin')return {body:workspace};
 },async()=>{
  for(const element of [createElement(OnboardingScreen,{onBoard(){},onDone(){}}),createElement(SettingsScreen,{onAddChannel(){}})]){
   const ui=await mountUI(element);
   try{await flush();assert.doesNotMatch(text(ui.container),banned);}finally{await ui.close();}
  }
 });
});
