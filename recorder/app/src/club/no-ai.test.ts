import {clearWelcomeProgress} from './welcome-progress';
import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {AiStatus,Outline,Video,Workspace} from '../../shared/club';
import {FakeEventSource,installFetch} from './test-fakes';
import {rememberAiStatus} from './ai-status';
const {WelcomeScreen}=await import('./screens/WelcomeScreen');
const {IdeaPage}=await import('./idea/IdeaPage');
const {usePlan}=await import('./usePlan');
const {NewVideo}=await import('./shell/NewVideo');
const {Companion}=await import('./workspace/Companion');
const {ToastProvider}=await import('./ui');

const off:AiStatus={claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
const workspace:Workspace={slug:'my-channel',name:'My channel',handle:'',channelUrl:'',topics:[],audience:[],about:'',cta:'',createdAt:''};
const video:Video={id:'v1',title:'Handmade',stage:'planning',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=async(c:Element,label:string)=>{await act(async()=>button(c,label).click());await flush();};

// Explicitly signed out, including when a previous screen cached a signed-in account.
test('no AI: skip creates a usable local workspace, saves setup, and lands on Home',async()=>{
 clearWelcomeProgress();rememberAiStatus(off);const routes:unknown[]=[];
 const fake=installFetch(call=>{
  if(call.path==='/ai/status')return {body:off};
  if(call.path==='/workspaces')return {body:{current:null,workspaces:[]}};
  if(call.path==='/workspaces/fresh')return {body:workspace};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
 });
 const ui=await mountUI(createElement(WelcomeScreen,{navigate:route=>routes.push(route)}));
 try{
  await flush();assert.equal(button(ui.container,'Continue').disabled,false);
  await click(ui.container,'Skip setup');
  assert.deepEqual(routes.at(-1),{name:'home'});
  assert.deepEqual(fake.calls.filter(c=>c.method==='POST').map(c=>[c.path,c.body]),[
   ['/workspaces/fresh',{name:'My channel',topics:[],audience:[]}],['/settings/welcomed',undefined],
  ]);
 }finally{await ui.close();fake.restore();}
});

test('no AI: finish fresh setup without signing in or starting voice and discovery jobs',async()=>{
 clearWelcomeProgress();rememberAiStatus(off);FakeEventSource.install();const routes:unknown[]=[];
 const fake=installFetch(call=>{
  if(call.path==='/ai/status')return {body:off};
  if(call.path==='/workspaces/fresh')return {body:workspace};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
 });
 const ui=await mountUI(createElement(WelcomeScreen,{navigate:route=>routes.push(route)}));
 try{
  await flush();const c=ui.container;
  await click(c,'Continue');
  await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label^="I\'m starting fresh"]')!.click());await flush();
  await act(async()=>{const input=c.querySelector<HTMLInputElement>('#w-name')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Samin');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await click(c,'Claude');await click(c,'Complete beginners');await click(c,'Continue');await click(c,'Continue');
  assert.deepEqual(routes.at(-1),{name:'home'});
  const writes=fake.calls.filter(call=>call.method==='POST');
  assert.deepEqual(writes.map(call=>call.path),['/workspaces/fresh','/settings/welcomed']);
  assert.equal('voice' in (writes[0].body as object),false);
  assert.equal(FakeEventSource.all.length,0);
 }finally{await ui.close();fake.restore();}
});

function Handmade(){
 const plan=usePlan(video,{onVideo(){},onRecord(){}});
 const [focusId,setFocusId]=useState<string|null>(null);
 return createElement('div',null,createElement(IdeaPage,{video,plan,known:[],focusId,boardKey:0,navigate(){},onFocus:setFocusId,onTitle(){},onTarget(){},onRecordScene(){},onVideo(){}}),createElement('button',{disabled:!plan.continueAction||plan.continueAction.disabled,onClick:()=>plan.continueAction?.run()},'Start planned recording'));
}
test('no AI: type the first scene, rename it, then start planned recording, and delete it from its menu',async()=>{
 clearWelcomeProgress();rememberAiStatus(off);FakeEventSource.install();let outline:Outline|null=null;
 const fake=installFetch(call=>{
  if(call.path==='/ai/status')return {body:off};
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline,running:{},ready:{}}};
  if(call.path==='/videos/v1/outline'&&call.method==='PUT'){outline={scenes:(call.body as Outline).scenes};return {body:outline};}
  if(call.path.startsWith('/videos/v1/script/scene/')&&call.method==='PUT'){
   outline!.scenes[0].script=(call.body as {text:string}).text;return {body:{outline}};
  }
  if(call.path==='/videos/v1/recorder')return {body:{...video,recorderProjectId:'p1'}};
 });
 const ui=await mountUI(createElement(ToastProvider,null,createElement(Handmade)));
 const edit=async(label:string,text:string)=>{const el=ui.container.querySelector<HTMLElement>(`[role="textbox"][aria-label="${label}"]`)!;assert.ok(el);await act(async()=>{el.innerText=text;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('focusout',{bubbles:true}));});await flush();};
 try{
  await flush();const c=ui.container;
  // With no AI the sketch still opens, to fill in by hand; Suggest waits for an AI.
  assert.equal(button(c,'Suggest a sketch').disabled,true);
  await act(async()=>button(c,'Script').click());await flush();
  // Borumi's empty Script step: start typing. Writing the scenes with an AI waits for one to be connected.
  assert.equal(button(c,'Write the scenes with Claude').disabled,true);
  assert.equal(button(c,'Write the scenes with Claude').title,'Connect an AI in Settings');
  const area=c.querySelector<HTMLTextAreaElement>('.bs-empty-input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'Here is the demo I made.');area.dispatchEvent(new Event('input',{bubbles:true}));});
  await flush();await flush();
  assert.ok(c.querySelector('[aria-label="Scene 1"]'),'the first keystroke makes the first scene');
  await click(c,'Scene 1');
  const name=c.querySelector<HTMLInputElement>('input[aria-label="Scene name"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(name,'My introduction');name.dispatchEvent(new Event('input',{bubbles:true}));name.blur();});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,550));});
  const saved=outline as Outline|null;assert.ok(saved);
  assert.equal(saved.scenes[0].title,'My introduction');
  assert.equal(saved.scenes[0].script,'Here is the demo I made.');
  // Record is driven by usePlan, not by any AI job or account.
  assert.ok(!fake.calls.some(c=>c.method==='POST'));
  await click(c,'Start planned recording');
  assert.deepEqual(fake.calls.filter(c=>c.method==='POST').map(c=>c.path),['/videos/v1/recorder']);
  // Borumi's scene menu opens on right-click; the AI item waits for an AI.
  await act(async()=>c.querySelector('[aria-label="Scene 1"]')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:10,clientY:10})));await flush();
  const aiScript=[...c.ownerDocument.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item=>item.textContent?.includes('script with Claude'))!;
  assert.equal(aiScript.disabled,true);
  await click(c.ownerDocument.body,'Delete scene');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,550));});
  assert.equal((outline as Outline|null)?.scenes.length,0);
  assert.equal(c.querySelector('[aria-label="Scene 1"]'),null);
 }finally{await ui.close();fake.restore();}
});

test('no AI: Quick recording creates a video and opens Record with only local writes',async()=>{
 clearWelcomeProgress();rememberAiStatus(off);const routes:unknown[]=[];
 const fake=installFetch(call=>{
  if(call.path==='/ai/status')return {body:off};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/videos')return {body:video};
  if(call.path==='/videos/v1/recorder')return {body:{...video,recorderProjectId:'p1',quickRecording:true}};
 });
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NewVideo,{videos:[],onClose(){},onOpen:route=>routes.push(route)})));
 try{
  await flush();assert.equal(ui.container.querySelector('.new-breakdown'),null,'no Break down in New video');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Quick recording"]')!.click());await flush();
  assert.deepEqual(routes,[{name:'video',id:'v1',tab:'record'}]);
  assert.deepEqual(fake.calls.filter(c=>c.method==='POST').map(c=>c.path),['/videos','/videos/v1/recorder']);
  assert.deepEqual(fake.calls.find(c=>c.path==='/videos/v1/recorder')?.body,{quick:true});
 }finally{await ui.close();fake.restore();}
});

test('no AI: Companion preserves history and applied Undo, and its rail can reopen it',async()=>{
 clearWelcomeProgress();rememberAiStatus(off);localStorage.setItem('cc.companion.open','1');
 const message={id:'m1',role:'assistant',text:'Saved answer',tab:'idea',cards:[{action:{type:'use_title',text:'Saved title'},state:'applied',version:'v1',result:'Title changed'}]};
 const fake=installFetch(call=>call.path==='/ai/status'?{body:off}:call.path.endsWith('/companion')?{body:{messages:[message]}}:call.path.endsWith('/undo')?{body:{message:{...message,cards:[]},changed:[]}}:undefined);
 const ui=await mountUI(createElement(Companion,{videoId:'v1',tab:'idea',screen:'Idea',pkg:null,outline:null,onChanged(){}}));
 try{
  await flush();const c=ui.container;
  if(c.querySelector('.cmp.collapsed'))await act(async()=>c.querySelector<HTMLButtonElement>('.cmp-rail')!.click());
  assert.match(c.textContent??'',/Saved answer/);
  assert.match(c.textContent??'',/Connect an AI in Settings/);
  assert.equal(c.querySelector<HTMLTextAreaElement>('textarea')!.disabled,true);
  assert.equal(c.querySelector<HTMLButtonElement>('[aria-label="Send (Enter)"]')!.disabled,true);
  assert.equal(c.querySelector('.cmp-applied-btn'),null,'no separate Applied history: the reply says what it changed');
  assert.match(c.querySelector('.cmp-changed-line')?.textContent??'',/Title changed/);
  await act(async()=>c.querySelector<HTMLButtonElement>('.cmp-changed-undo')!.click());await flush();
  assert.ok(fake.calls.some(call=>call.path.endsWith('/undo')&&call.method==='POST'));
  assert.ok(fake.calls.filter(call=>call.method==='POST').every(call=>call.path.endsWith('/undo')));
  await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Hide Ask Claude"]')!.click());await flush();
  const rail=c.querySelector<HTMLButtonElement>('.cmp-rail')!;
  assert.equal(rail.disabled,false);
  await act(async()=>c.querySelector<HTMLButtonElement>('[aria-label="Open Ask Claude"]')!.click());await flush();assert.ok(c.querySelector('textarea'));
 }finally{await ui.close();fake.restore();localStorage.removeItem('cc.companion.open');}
});
