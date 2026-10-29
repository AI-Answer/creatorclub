import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {AiStatus} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {default:ClubApp}=await import('./ClubApp');
const {WelcomeScreen}=await import('./screens/WelcomeScreen');
const {SettingsScreen}=await import('./screens/SettingsScreen');

const signedOut:AiStatus={claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
const claudeIn:AiStatus={...signedOut,claude:{installed:true,version:'2.1.0',signedIn:true,account:'dani@example.com'}};
const workspace={slug:'samin',name:'Samin',handle:'@samin',channelUrl:'https://youtube.com/@samin',topics:['ai','claude'],audience:['Creators'],about:'Teaches Claude',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};
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

const pressLabeled=async(container:Element,prefix:string)=>{await act(async()=>container.querySelector<HTMLButtonElement>(`button[aria-label^="${prefix}"]`)!.click());await flush();};
const welcome=(navigate:(route:unknown)=>void=()=>{})=>createElement(WelcomeScreen,{navigate:navigate as never});
const rated=(level:'high'|'mid'|'low',note:string)=>({level,note});
const breakdown={
 id:'bd_aaaaaaaaaaaa',url:'https://www.youtube.com/watch?v=abcdefghijk',platform:'youtube',createdAt:'2026-10-28T00:00:00.000Z',
 video:{title:'How I built it',channel:'Duncan Rogoff | AI',views:760000,likes:14000,comments:1200,ageDays:3,thumbnail:'',multiplier:2.84},
 whyItWorked:{titlePackaging:'A bold claim.',hookSpeed:'Fast.',structure:['Claim'],retention:'Loops.',payoff:'A result.',short:['Clear claim']},
 reusableOutline:['Claim'],viewerQuestions:[],
 concepts:[1,2,3].map(n=>({title:`Concept ${n}`,angle:`Angle ${n}`,twist:`Twist ${n}`,hook:`Hook ${n}`,demand:rated('high','x'),gap:rated('mid','x'),show:rated('low','x'),why:`Why ${n}`})),
};
const trendItem={videoId:'abcdefghijk',title:'How I built it',channel:'Duncan Rogoff | AI',kind:'followed',views:760000,likes:null,comments:null,published:'2026-10-24',ageDays:3,vpd:200000,mult:2.84,fit:true,reason:'Because you picked Claude'};

test('opening the overview before setup was finished goes to first launch; a finished setup, an existing install or an unreachable server does not',async()=>{
 const posts:string[]=[];
 for(const [welcomed,status,workspaces,expected] of [[false,signedOut,none,'#/welcome'],[false,claudeIn,none,'#/welcome'],[false,signedOut,one,'#/welcome'],[true,signedOut,none,'#/overview'],[false,claudeIn,one,'#/overview']] as const){
  await withServer(call=>{
   if(call.path==='/settings')return {body:{defaultAi:null,welcomed,appearance:null,geminiKey:null,helpSeen:[]}};
   if(call.path==='/settings/welcomed'){posts.push(call.method);return {body:{welcomed:true}};}
   return baseRoutes(status,workspaces)(call);
  },async()=>{
   window.location.hash='';const ui=await mountUI(createElement(ClubApp));
   try{await flush();assert.equal(window.location.hash,expected);}finally{await ui.close();window.location.hash='';}
  });
 }
 assert.deepEqual(posts,['POST'],'an install that already has a channel and an AI is marked as set up, once');
 FakeEventSource.install();const original=globalThis.fetch;globalThis.fetch=(async()=>{throw new TypeError('offline');}) as typeof fetch;
 window.location.hash='';const ui=await mountUI(createElement(ClubApp));
 try{await flush();assert.equal(window.location.hash,'#/overview');}finally{globalThis.fetch=original;await ui.close();window.location.hash='';}
});

test('the theme saved in settings is applied when the app opens',async()=>{
 localStorage.clear();
 await withServer(call=>{if(call.path==='/settings')return {body:{defaultAi:null,welcomed:true,appearance:'dark',geminiKey:null,helpSeen:[]}};},async()=>{
  window.location.hash='#/settings';const ui=await mountUI(createElement(ClubApp));
  try{await flush();assert.equal(document.documentElement.dataset.theme,'dark');}finally{await ui.close();window.location.hash='';localStorage.clear();}
 });
});

test('Welcome step 1: Connect Claude installs with progress, waits for the browser, then Continue works',async()=>{
 let status=signedOut;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:status};
  if(call.path==='/ai/connect')return {status:202,body:{id:'j_1',kind:'connect-claude',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   assert.match(text(c),/Step 1 of 4/);
   assert.equal(c.querySelector('h1')!.textContent,'Connect your AI');
   assert.match(text(c),/CreatorClub uses your own Claude or ChatGPT account/);
   assert.equal(c.querySelectorAll('button.primary').length,1,'one primary button');
   assert.ok(button(c,'Connect Claude').classList.contains('primary'));
   assert.equal(button(c,'Continue').disabled,true);
   assert.equal([...c.querySelectorAll('button')].some(b=>b.textContent==='Back'),false,'no Back on the first step');
   assert.equal(c.querySelector('input'),null,'never asks for a key');

   await click(c,'Connect Claude');
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'claude'});
   await emit('progress',{phase:'installing'});
   assert.ok(c.querySelector('[role="progressbar"]'),'a progress bar while installing');
   for(const line of ['one','two','three','four'])await emit('progress',{phase:'installing',line});
   assert.deepEqual([...c.querySelectorAll('li')].map(li=>li.textContent),['two','three','four'],'the last lines stream by');
   await emit('progress',{phase:'signing-in'});
   assert.match(text(c),/Finish signing in to Claude in your browser\./);
   assert.equal(button(c,'Continue').disabled,true,'not before it is connected');

   status=claudeIn;
   await emit('done',{provider:'claude',account:'dani@example.com'});
   assert.equal(FakeEventSource.last().closed,true);
   assert.equal(button(c,'Continue').disabled,false,'status is read again, and an AI is connected');
  }finally{await ui.close();}
 });
});

test('Welcome step 1 with an AI already connected: Connected chip, Continue is the one primary button',async()=>{
 await withServer(baseRoutes(claudeIn,none),async()=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   assert.match(text(c),/Connected as dani@example\.com/);
   assert.ok(![...c.querySelectorAll('button')].some(b=>b.textContent==='Connect Claude'));
   assert.ok(button(c,'Connect ChatGPT'));
   assert.equal(button(c,'Continue').disabled,false);
   assert.deepEqual([...c.querySelectorAll('button.primary')].map(b=>b.textContent),['Continue']);
  }finally{await ui.close();}
 });
});

test('Welcome: Connect ChatGPT sends codex, and a failed install is one sentence with Try again; a server error never shows raw text',async()=>{
 let connects=0,fail=false;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/ai/connect')return fail?{status:500}:{status:202,body:{id:`j_${++connects}`,kind:'connect-codex',status:'running',createdAt:''}};
 },async calls=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   await click(c,'Connect ChatGPT');
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'codex'});
   await emit('failed',{message:"Couldn't install ChatGPT."});
   assert.match(text(c),/Couldn't install ChatGPT\./);
   await click(c,'Try again');
   assert.deepEqual(calls.filter(call=>call.path==='/ai/connect').map(call=>call.body),[{provider:'codex'},{provider:'codex'}]);
   fail=true;await emit('failed',{message:'Still no.'});await click(c,'Try again');
   assert.match(text(c),/That did not work\./);
  }finally{await ui.close();}
 });
});

test('Welcome: Cancel while signing in ends the job and goes back to the buttons; one pressed before the server answers still ends it',async()=>{
 let jobs=0,release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let late=false;
 await withServer(async call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/ai/connect'){if(late)await gate;return {status:202,body:{id:late?'j_late':`j_${++jobs}`,kind:'connect-claude',status:'running',createdAt:''}};}
  if(call.method==='DELETE')return {body:{status:'cancelled'}};
 },async calls=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   await click(c,'Connect Claude');
   await emit('progress',{phase:'signing-in'});
   assert.ok(button(c,'Cancel').classList.contains('ghost'),'a quiet button, not a second primary');
   const first=FakeEventSource.last();
   await click(c,'Cancel');
   assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.path),['/jobs/j_1']);
   assert.equal(first.closed,true);
   assert.ok(button(c,'Connect Claude'));
   first.emit('done',{provider:'claude',account:'old@example.com'});
   assert.doesNotMatch(text(c),/old@example\.com/,'the cancelled job is ignored');
   late=true;FakeEventSource.reset();
   await click(c,'Connect Claude');await click(c,'Cancel');
   release();await flush();
   assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.path),['/jobs/j_1','/jobs/j_late']);
   assert.equal(FakeEventSource.all.length,0,'never follows a cancelled job');
  }finally{await ui.close();}
 });
});

test('Welcome with a channel: add it, see how you talk, break a video down, and land on the new idea',async()=>{
 const routes:unknown[]=[];
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_add',kind:'add-channel',status:'running',createdAt:''}};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
  if(call.path==='/trending')return {body:{items:[trendItem,{...trendItem,videoId:'zzzzzzzzzzz',title:'Not for you',fit:false,reason:null}],updatedAt:'2026-10-28T00:00:00.000Z',followed:2}};
  if(call.path==='/breakdowns'&&call.method==='GET')return {body:[]};
  if(call.path==='/breakdowns'&&call.method==='POST')return {status:202,body:{id:'j_bd',kind:'breakdown',status:'running',createdAt:''}};
  if(call.path==='/videos')return {body:[]};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/breakdowns/bd_aaaaaaaaaaaa/concepts/1/add')return {status:201,body:{id:'v_new',title:'Concept 2'}};
 },async calls=>{
  const ui=await mountUI(welcome(route=>routes.push(route)));
  try{
   await flush();const c=ui.container;
   await click(c,'Continue');
   assert.match(text(c),/Step 2 of 4/);
   assert.equal(c.querySelector('h1')!.textContent,'Do you have a YouTube channel?');
   assert.equal(button(c,'Continue').disabled,true);
   await pressLabeled(c,'Add my channel');
   await type(c.querySelector('#ch-url')!,'youtube.com/@duncan');
   await click(c,'Add channel');
   assert.deepEqual(calls.find(call=>call.path==='/workspaces'&&call.method==='POST')?.body,{channelUrl:'youtube.com/@duncan'});
   assert.equal(button(c,'Back').disabled,true,'not while the channel is being added');
   await emit('progress',{message:'Reading your last 9 videos…'});
   assert.match(text(c),/Reading your last 9 videos…/);
   await emit('done',{workspace:{...workspace,slug:'duncan',name:'Duncan',about:'Practical AI for beginners.'},voice:'built'});
   assert.match(text(c),/Added/);
   await click(c,'Continue');
   assert.equal(c.querySelector('h1')!.textContent,'This is how you talk');
   assert.match(text(c),/Practical AI for beginners\./);
   assert.equal(calls.some(call=>call.path==='/settings/welcomed'),false);
   await click(c,'Continue');

   assert.match(text(c),/Step 4 of 4/);
   assert.equal(calls.filter(call=>call.path==='/settings/welcomed').length,1,'setup counts as done once the last step is reached');
   assert.match(text(c),/Working in your topics/);
   assert.match(text(c),/Because you picked Claude/);
   assert.doesNotMatch(text(c),/Not for you/,'only videos that fit your topics');
   assert.deepEqual([...c.querySelectorAll('button.primary')].map(b=>b.textContent),[],'no competing primary on the last step');
   await click(c,'Break this down');
   assert.deepEqual(calls.find(call=>call.path==='/breakdowns'&&call.method==='POST')?.body,{url:'https://www.youtube.com/watch?v=abcdefghijk'});
   await emit('done',breakdown);
   assert.match(text(c),/Add the concept you'd make\. That's your first idea\./);
   const adds=[...c.querySelectorAll('button')].filter(b=>b.textContent==='Add to my ideas');
   assert.equal(adds.length,3);
   await act(async()=>adds[1].click());await flush();
   assert.deepEqual(routes.at(-1),{name:'ideas',new:'v_new'});
  }finally{await ui.close();}
 });
});

test('Welcome with a channel that has too few captions asks the voice questions and writes the guide from them; Skip questions leaves them out',async()=>{
 for(const skip of [false,true]){
  await withServer(call=>{
   if(call.path==='/ai/status')return {body:claudeIn};
   if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_add',kind:'add-channel',status:'running',createdAt:''}};
   if(call.path==='/workspaces/quiet/voice')return {status:202,body:{id:'j_voice',kind:'voice',status:'running',createdAt:''}};
   if(call.path==='/trending')return {body:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}};
   if(call.path==='/breakdowns'||call.path==='/videos'||call.path==='/recent')return {body:[]};
   if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
  },async calls=>{
   const ui=await mountUI(welcome());
   try{
    await flush();const c=ui.container;
    await click(c,'Continue');await pressLabeled(c,'Add my channel');
    await type(c.querySelector('#ch-url')!,'youtube.com/@quiet');await click(c,'Add channel');
    await emit('done',{workspace:{...workspace,slug:'quiet',name:'Quiet'},voice:'needs-answers'});
    await click(c,'Continue');
    assert.equal(c.querySelector('h1')!.textContent,'How you talk');
    assert.match(text(c),/We couldn't read enough of your videos/);
    assert.equal(c.querySelectorAll('textarea').length,2,'two written questions and one with choices');
    assert.match(text(c),/All three are optional/);
    if(skip){
     await click(c,'Skip questions');
     assert.equal(calls.some(call=>call.path==='/workspaces/quiet/voice'),false);
    }else{
     const areas=[...c.querySelectorAll('textarea')];
     await typeArea(areas[0],'I teach Claude to beginners.');
     await click(c,'Upbeat and fast');
     await click(c,'Continue');
     assert.deepEqual(calls.find(call=>call.path==='/workspaces/quiet/voice')?.body,{answers:{voice:'Upbeat and fast',audience:'I teach Claude to beginners.'}});
     assert.equal(c.querySelector('h1')!.textContent,'How you talk','waits for the guide');
     await emit('done',{voice:'built'});
    }
    assert.match(text(c),/Step 4 of 4/);
   }finally{await ui.close();}
  });
 }
});

test('Welcome starting fresh: name, topics and who it is for create the channel with the voice answers; step 4 has one next action when nothing is followed',async()=>{
 const routes:unknown[]=[];
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces/fresh')return {status:201,body:{...workspace,slug:'ana',name:'Ana',person:'Ana',topics:['Claude','Woodworking'],audience:['Creators']}};
  if(call.path==='/workspaces/ana'&&call.method==='PUT')return {body:{...workspace,slug:'ana',name:'Ana Studio',person:'Ana'}};
  if(call.path==='/trending')return {body:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}};
  if(call.path==='/breakdowns'&&call.method==='GET')return {body:[]};
  if(call.path==='/breakdowns'&&call.method==='POST')return {status:202,body:{id:'j_bd',kind:'breakdown',status:'running',createdAt:''}};
  if(call.path==='/videos')return {body:[]};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
 },async calls=>{
  const ui=await mountUI(welcome(route=>routes.push(route)));
  try{
   await flush();const c=ui.container;
   await click(c,'Continue');await pressLabeled(c,"I'm starting fresh");
   assert.match(text(c),/Add your name, at least one topic and who it's for to continue\./);
   await type(c.querySelector('#w-name')!,'Ana');
   await click(c,'Claude');
   await type(c.querySelector('#w-other')!,'Woodworking');await click(c,'Add');
   assert.ok(button(c,'Woodworking').getAttribute('aria-pressed')==='true','a typed topic is added and picked');
   assert.equal(button(c,'Continue').disabled,true,'who it is for is still missing');
   await click(c,'Creators');
   await type(c.querySelector('#w-ch')!,'Ana Studio');
   await click(c,'Continue');
   assert.equal(c.querySelector('h1')!.textContent,'How you talk');
   assert.equal(calls.some(call=>call.path==='/workspaces/fresh'),false,'nothing is created before the voice step is done');
   await typeArea(c.querySelector('textarea')!,'I show beginners real AI work.');
   await click(c,'Calm and clear, like a teacher');
   await click(c,'Continue');
   assert.deepEqual(calls.find(call=>call.path==='/workspaces/fresh')?.body,{name:'Ana',topics:['Claude','Woodworking'],audience:['Creators'],voice:{audience:'I show beginners real AI work.',voice:'Calm and clear, like a teacher'}});
   assert.deepEqual(calls.find(call=>call.path==='/workspaces/ana'&&call.method==='PUT')?.body,{name:'Ana Studio'});

   assert.match(text(c),/Step 4 of 4/);
   assert.match(text(c),/Nothing to start from yet/);
   assert.doesNotMatch(text(c),/Samin/);
   const link=c.querySelector<HTMLInputElement>('input[aria-label="Video link"]')!;
   assert.equal(button(c,'Break down').disabled,true);
   await type(link,'https://youtu.be/abcdefghijk');
   await click(c,'Break down');
   assert.deepEqual(calls.find(call=>call.path==='/breakdowns'&&call.method==='POST')?.body,{url:'https://youtu.be/abcdefghijk'});
   await click(c,'Pick another video');
   await click(c,'Follow channels in Settings');
   assert.deepEqual(routes.at(-1),{name:'settings',section:'followed'});
   await click(c,'Back');
   assert.equal(c.querySelector('h1')!.textContent,'How you talk');
   assert.match(text(c),/Your voice guide is saved/);
   assert.equal(calls.filter(call=>call.path==='/workspaces/fresh').length,1,'going back never creates it twice');
  }finally{await ui.close();}
 });
});

test('Welcome: a failed create shows one sentence with Try again; Skip setup saves that setup is done and opens the overview',async()=>{
 const routes:unknown[]=[];let fail=true;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces/fresh')return fail?{status:400,body:{error:'Some details were not valid.'}}:{status:201,body:{...workspace,slug:'ana',name:'Ana'}};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
  if(call.path==='/trending')return {body:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}};
  if(call.path==='/breakdowns'||call.path==='/videos'||call.path==='/recent')return {body:[]};
 },async calls=>{
  const ui=await mountUI(welcome(route=>routes.push(route)));
  try{
   await flush();const c=ui.container;
   await click(c,'Continue');await pressLabeled(c,"I'm starting fresh");
   await type(c.querySelector('#w-name')!,'Ana');await click(c,'Claude');await click(c,'Creators');
   await click(c,'Continue');await click(c,'Skip questions');
   assert.match(text(c),/Some details were not valid\./);
   assert.equal(c.querySelector('h1')!.textContent,'How you talk','stays on the step');
   fail=false;await click(c,'Try again');
   assert.match(text(c),/Step 4 of 4/);
   assert.equal(calls.find(call=>call.path==='/workspaces/fresh'&&!(call.body as {voice?:unknown}).voice)!==undefined,true,'skipped questions send no voice');
   await click(c,"Look around");
   assert.deepEqual(routes.at(-1),{name:'overview'});
  }finally{await ui.close();}
 });
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
 },async calls=>{
  const routes2:unknown[]=[];
  const ui=await mountUI(welcome(route=>routes2.push(route)));
  try{
   await flush();await click(ui.container,'Skip setup');
   assert.equal(calls.filter(call=>call.path==='/settings/welcomed'&&call.method==='POST').length,1);
   assert.deepEqual(routes2,[{name:'overview'}]);
  }finally{await ui.close();}
 });
});

test('Settings: Claude and ChatGPT with their status and Connect or Reconnect, and the optional Gemini key',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings'&&call.method==='GET')return {body:{defaultAi:null,appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin')return {body:workspace};
  if(call.path==='/followed')return {body:[]};
  if(call.path==='/signals-config')return {body:{}};
 },async()=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   assert.deepEqual([...c.querySelectorAll('h2')].map(h=>h.textContent),['Connected AI','Channel','Appearance']);
   const names=[...c.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label')).filter(l=>/Connect|Reconnect/.test(l!));
   assert.deepEqual(names,['Reconnect Claude','Connect ChatGPT'],'Gemini has no sign-in');
   assert.match(text(c),/Connected as dani@example\.com/);
   assert.match(text(c),/Optional/);
   assert.match(text(c),/Lets CreatorClub watch videos with sound and motion when it breaks them down\./);
   assert.ok(c.querySelector('input[aria-label="Gemini API key"]'));
   assert.equal(c.querySelector('[aria-label="Default AI"] [aria-selected="true"]')!.textContent,'Claude','falls back to the connected AI');
   assert.deepEqual([...c.querySelectorAll('[aria-label="Theme"] button')].map(b=>b.textContent),['Light','Dark']);
   assert.equal(c.querySelector('[aria-label="Theme"] [aria-pressed="true"]')!.textContent,'Light','light by default');
  }finally{await ui.close();}
 });
});

test('Settings: the Gemini key is saved, shown masked and removed, and the full key is never shown',async()=>{
 let saved:string|null=null;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/settings'&&call.method==='GET')return {body:{defaultAi:null,appearance:null,geminiKey:saved}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/settings/gemini-key'&&call.method==='PUT'){const key=(call.body as {key:string}).key;if(key.length<20)return {status:400,body:{error:'Some details were not valid.'}};saved=`••••${key.slice(-4)}`;return {body:{geminiKey:saved}};}
  if(call.path==='/settings/gemini-key'&&call.method==='DELETE'){saved=null;return {body:{geminiKey:null}};}
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   const field=c.querySelector<HTMLInputElement>('input[aria-label="Gemini API key"]')!;
   assert.equal(field.type,'password');
   assert.equal(button(c,'Save key').disabled,true);
   await type(field,'too short');await click(c,'Save key');
   assert.match(text(c),/Some details were not valid\./);
   await type(field,'AIzaSyExampleKeyForTestingOnly1234');await click(c,'Save key');
   assert.deepEqual(calls.filter(call=>call.path==='/settings/gemini-key'&&call.method==='PUT').pop()?.body,{key:'AIzaSyExampleKeyForTestingOnly1234'});
   assert.match(text(c),/Key saved ••••1234/);
   assert.equal(text(c).includes('AIzaSy'),false);
   await click(c,'Remove key');
   assert.equal(calls.filter(call=>call.method==='DELETE').length,1);
   assert.ok(c.querySelector('input[aria-label="Gemini API key"]'),'the field is back');
  }finally{await ui.close();}
 });
});

test('Settings: reconnecting an AI that is already signed in asks the server to sign in again; Cancel returns the row to Connect',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
  if(call.path==='/ai/connect')return {status:202,body:{id:'j_r',kind:'connect-claude',status:'running',createdAt:''}};
  if(call.method==='DELETE')return {body:{status:'cancelled'}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   await pressLabeled(c,'Reconnect Claude');
   assert.deepEqual(calls.find(call=>call.path==='/ai/connect')?.body,{provider:'claude',reconnect:true});
   await emit('progress',{phase:'signing-in'});
   assert.equal(c.querySelector('button[aria-label="Reconnect Claude"]'),null);
   await click(c,'Cancel');
   assert.deepEqual(calls.filter(call=>call.method==='DELETE').map(call=>call.path),['/jobs/j_r']);
   assert.ok(c.querySelector('button[aria-label="Reconnect Claude"]'));
  }finally{await ui.close();}
 });
});

test('Settings: the default AI and the theme are saved in settings when chosen, and the theme applies at once',async()=>{
 localStorage.clear();
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:{...claudeIn,codex:{installed:true,version:'1',signedIn:true,account:'ChatGPT'}}};
  if(call.path==='/settings'&&call.method==='GET')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/settings'&&call.method==='PUT')return {body:call.body};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   await click(c.querySelector('[aria-label="Default AI"]')!,'ChatGPT');
   assert.deepEqual(calls.find(call=>call.method==='PUT')?.body,{defaultAi:'codex'});
   assert.equal(c.querySelector('[aria-label="Default AI"] [aria-selected="true"]')!.textContent,'ChatGPT');
   await click(c.querySelector('[aria-label="Theme"]')!,'Dark');
   assert.deepEqual(calls.filter(call=>call.method==='PUT').at(-1)?.body,{appearance:'dark'});
   assert.equal(document.documentElement.dataset.theme,'dark');
   await click(c.querySelector('[aria-label="Theme"]')!,'Light');
   assert.deepEqual(calls.filter(call=>call.method==='PUT').at(-1)?.body,{appearance:'light'});
   assert.equal(document.documentElement.dataset.theme,'light');
  }finally{await ui.close();localStorage.clear();}
 });
});

test('Settings: a saved theme is the one selected',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/settings')return {body:{defaultAi:null,appearance:'dark',geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
 },async()=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{await flush();assert.equal(ui.container.querySelector('[aria-label="Theme"] [aria-pressed="true"]')!.textContent,'Dark');}finally{await ui.close();}
 });
});

test('Settings: channel details (including your first name) save, and Rebuild voice guide follows its job or shows one sentence',async()=>{
 let voice:FakeReply={status:404};
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin'&&call.method==='GET')return {body:workspace};
  if(call.path==='/workspaces/samin'&&call.method==='PUT')return {body:{...workspace,...(call.body as object)}};
  if(call.path==='/workspaces/samin/voice')return voice;
  if(call.path==='/followed')return {body:[]};
  if(call.path==='/signals-config')return {body:{}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   const field=(label:string)=>[...c.querySelectorAll<HTMLLabelElement>('#set-channel label')].find(l=>l.querySelector('.field')?.textContent===label)!.querySelector('input')!;
   assert.equal(field('Your first name').value,'');
   assert.equal(field('Channel name').value,'Samin');
   assert.equal(field('Handle').value,'@samin');
   assert.deepEqual([...c.querySelectorAll('ul[aria-label="Topics"] li')].map(li=>li.textContent),['Ai','Claude']);
   assert.equal(button(c,'Save changes').disabled,true,'nothing to save yet');
   await type(field('Your first name'),'Dani');
   await type(c.querySelector('input[aria-label="Topics"]')!,'trading');await click(c,'Add');
   await act(async()=>c.querySelector<HTMLButtonElement>('button[aria-label="Remove Ai"]')!.click());
   await click(c,'Save changes');
   assert.deepEqual(calls.find(call=>call.method==='PUT'&&call.path==='/workspaces/samin')?.body,{name:'Samin',person:'Dani',handle:'@samin',topics:['claude','trading'],audience:['Creators'],about:'Teaches Claude',cta:''});
   assert.match(text(c),/Saved/);assert.equal(button(c,'Save changes').disabled,true);

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

test('Settings: followed channels and signal sources save at once, and a failed save keeps the list and says why',async()=>{
 let fail=false;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin')return {body:workspace};
  if(call.path==='/followed'&&call.method==='GET')return {body:[{name:'Riley',handle:'@RileyBrown',median:90000}]};
  if(call.path==='/followed'&&call.method==='PUT')return fail?{status:500}:{body:call.body};
  if(call.path==='/signals-config'&&call.method==='GET')return {body:{x:['alexfinn'],reddit:['ClaudeAI'],minXLikes:500}};
  if(call.path==='/signals-config'&&call.method==='PUT')return {body:{...(call.body as object),minXLikes:500}};
 },async calls=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   assert.deepEqual([...c.querySelectorAll('ul[aria-label="Followed channels"] li')].map(li=>li.textContent),['@RileyBrown']);
   await type(c.querySelector('input[aria-label="Followed channels"]')!,'@NateHerk');
   await act(async()=>c.querySelector<HTMLButtonElement>('input[aria-label="Followed channels"]')!.parentElement!.querySelector('button')!.click());await flush();
   assert.deepEqual(calls.filter(call=>call.path==='/followed'&&call.method==='PUT').at(-1)?.body,[{name:'Riley',handle:'@RileyBrown',median:90000},{name:'@NateHerk',handle:'@NateHerk'}]);
   await type(c.querySelector('input[aria-label="Followed channels"]')!,'@rileybrown');
   const puts=()=>calls.filter(call=>call.path==='/followed'&&call.method==='PUT').length;
   const before=puts();
   await act(async()=>c.querySelector<HTMLButtonElement>('input[aria-label="Followed channels"]')!.parentElement!.querySelector('button')!.click());await flush();
   assert.equal(puts(),before,'a channel already followed is not added again');

   fail=true;
   await act(async()=>c.querySelector<HTMLButtonElement>('button[aria-label="Remove @NateHerk"]')!.click());await flush();
   assert.match(text(c),/That did not work\./);
   assert.ok(c.querySelector('button[aria-label="Remove @NateHerk"]'),'the list is as it was');

   await type(c.querySelector('input[aria-label="Subreddits"]')!,'r/Claude');
   await act(async()=>c.querySelector<HTMLButtonElement>('input[aria-label="Subreddits"]')!.parentElement!.querySelector('button')!.click());await flush();
   assert.deepEqual(calls.filter(call=>call.path==='/signals-config'&&call.method==='PUT').at(-1)?.body,{x:['alexfinn'],xTopics:[],reddit:['ClaudeAI','r/Claude']});
  }finally{await ui.close();}
 });
});

test('Settings without a channel offers Add your channel',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:null,appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:none};
 },async()=>{
  let added=0;
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){added++;}}));
  try{await flush();await click(ui.container,'Add your channel');assert.equal(added,1);}finally{await ui.close();}
 });
});

test('copy rules: no please, successfully, exclamation marks, or banned words on these screens',async()=>{
 const banned=/please|successfully|!|\bbrief\b|\blane\b|\bpicked\b|\bproject\b|borumi|codex|style video|automate|samin/i;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/settings')return {body:{defaultAi:null,appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin')return {body:{...workspace,name:'Ana',handle:'@ana'}};
  if(call.path==='/followed')return {body:[]};
  if(call.path==='/signals-config')return {body:{}};
  if(call.path==='/trending')return {body:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}};
  if(call.path==='/breakdowns'||call.path==='/videos'||call.path==='/recent')return {body:[]};
 },async()=>{
  const ui=await mountUI(welcome());
  try{
   await flush();assert.doesNotMatch(text(ui.container),banned);
   await act(async()=>ui.container.querySelector<HTMLButtonElement>('button.linkish')!.click());
  }finally{await ui.close();}
  const settings=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{await flush();assert.doesNotMatch(text(settings.container),banned);}finally{await settings.close();}
 });
});

test('Welcome: a failed rename after creating a fresh channel retries only the rename, never a second channel',async()=>{
 let putFails=true;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces/fresh')return {status:201,body:{...workspace,slug:'ana',name:'Ana'}};
  if(call.path==='/workspaces/ana'&&call.method==='PUT')return putFails?{status:500}:{body:{...workspace,slug:'ana',name:'Ana Studio'}};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
  if(call.path==='/trending')return {body:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}};
  if(call.path==='/breakdowns'||call.path==='/videos'||call.path==='/recent')return {body:[]};
 },async calls=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   await click(c,'Continue');await pressLabeled(c,"I'm starting fresh");
   await type(c.querySelector('#w-name')!,'Ana');await click(c,'Claude');await click(c,'Creators');
   await type(c.querySelector('#w-ch')!,'Ana Studio');
   await click(c,'Continue');await click(c,'Skip questions');
   assert.match(text(c),/That did not work\./);
   putFails=false;await click(c,'Try again');
   assert.match(text(c),/Step 4 of 4/);
   assert.equal(calls.filter(call=>call.path==='/workspaces/fresh').length,1,'one channel');
   assert.equal(calls.filter(call=>call.path==='/workspaces/ana'&&call.method==='PUT').length,2);
  }finally{await ui.close();}
 });
});

test('Welcome: leaving waits for setup to be saved; a failed save shows one sentence and Try again, and does not navigate',async()=>{
 const routes:unknown[]=[];let fail=true;
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:signedOut};
  if(call.path==='/settings/welcomed')return fail?{status:500}:{body:{welcomed:true}};
 },async()=>{
  const ui=await mountUI(welcome(route=>routes.push(route)));
  try{
   await flush();const c=ui.container;
   await click(c,'Skip setup');
   assert.deepEqual(routes,[]);
   assert.match(text(c),/That did not work\./);
   fail=false;await click(c,'Try again');
   assert.deepEqual(routes,[{name:'overview'}]);
   assert.equal(c.querySelector('[role="alert"]'),null);
  }finally{await ui.close();}
 });
});

test('Settings opened at the followed channels scrolls there and focuses the input; signal sources have visible labels and readable prefixes',async()=>{
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:one};
  if(call.path==='/workspaces/samin')return {body:workspace};
  if(call.path==='/followed')return {body:[]};
  if(call.path==='/signals-config')return {body:{x:['alexfinn'],xTopics:['claude code'],reddit:['ClaudeAI']}};
 },async()=>{
  const scrolled:string[]=[];
  const original=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(this:Element){scrolled.push(this.id);};
  const ui=await mountUI(createElement(SettingsScreen,{section:'followed',onSetup(){}}));
  try{
   await flush();const c=ui.container;
   assert.deepEqual(scrolled,['set-followed']);
   assert.equal(document.activeElement,c.querySelector('input[aria-label="Followed channels"]'));
   assert.equal(c.querySelector('.set-nav .nav-item.active')!.textContent,'Channel');
   const labelsShown=[...c.querySelectorAll('#set-followed .small')].map(el=>el.textContent).filter(t=>['X accounts','X searches','Subreddits'].includes(t!));
   assert.deepEqual(labelsShown,['X accounts','X searches','Subreddits']);
   assert.deepEqual([...c.querySelectorAll('ul[aria-label="X accounts"] li')].map(li=>li.textContent),['@alexfinn']);
   assert.deepEqual([...c.querySelectorAll('ul[aria-label="X searches"] li')].map(li=>li.textContent),['"claude code"']);
   assert.deepEqual([...c.querySelectorAll('ul[aria-label="Subreddits"] li')].map(li=>li.textContent),['r/ClaudeAI']);
  }finally{await ui.close();Element.prototype.scrollIntoView=original;}
 });
});

test('Settings: the voice guide shows its summary and source; a channel with no videos answers the three questions instead of rebuilding',async()=>{
 const fresh={...workspace,slug:'ana',name:'Ana',handle:'',channelUrl:''};
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/settings')return {body:{defaultAi:'claude',appearance:null,geminiKey:null}};
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:'ana',workspaces:[fresh]}};
  if(call.path==='/workspaces/ana'&&call.method==='GET')return {body:fresh};
  if(call.path==='/workspaces/ana/voice'&&call.method==='GET')return {body:{summary:'Voice: Calm and clear.',transcripts:0}};
  if(call.path==='/followed')return {body:[]};
  if(call.path==='/signals-config')return {body:{}};
 },async()=>{
  const ui=await mountUI(createElement(SettingsScreen,{onSetup(){}}));
  try{
   await flush();const c=ui.container;
   assert.match(text(c),/Voice guide/);
   assert.match(text(c),/Voice: Calm and clear\./);
   assert.match(text(c),/Built from your answers\./);
   assert.equal(labels(c).includes('Rebuild voice guide'),false);
   assert.equal(c.querySelector('#set-channel')!.textContent!.includes('learns from your latest videos'),false);
   await click(c,'Answer the three voice questions again');
   assert.equal(c.querySelectorAll('#set-channel form textarea').length,3);
  }finally{await ui.close();}
 });
});
