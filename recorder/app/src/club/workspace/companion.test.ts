import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Outline,Package} from '../../../shared/club';
import type {CompanionChanged,CompanionMessage,CompanionReplyMessage} from '../../../shared/companion';
import {atBottom,elapsed,lookingAt,previewOf,screenSummary,stepSummary,suggestions,withDividers} from './companion-logic';
import {blocks} from './Markdown';
const {Companion}=await import('./Companion');
const {FakeEventSource,installFetch}=await import('../test-fakes');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const text=(root:Element)=>root.textContent??'';
const pkg:Package={angle:'',twist:'',titles:['Old title','',''],thumbnailText:'',hook:{visual:'',spoken:'Old hook',text:''}};
const outline:Outline={scenes:[{id:'s1',title:'Opening',talkingPoints:['Show it'],show:'',seconds:60},{id:'s2',title:'Level 1',talkingPoints:['One click'],show:'',seconds:120}]};

// ---------------------------------------------------------------- what needs no screen

test('it says what it is looking at, and the suggestions follow the step',()=>{
 assert.equal(lookingAt('plan',{index:1,title:'Level 1'}),'Plan · Scene 2');
 assert.equal(lookingAt('board'),'Board');
 assert.deepEqual(suggestions('plan',{scenes:0}),['Draft the scenes','Write three hooks','Suggest three titles']);
 assert.equal(suggestions('plan',{scenes:2,scene:{index:1}})[0],'Tighten scene 2');
 assert.equal(suggestions('record',{scenes:2,scene:{index:0}})[0],'Shorten scene 1 to fit its time');
 assert.equal(suggestions('publish',{scenes:2})[0],'Write the description');
 assert.deepEqual(suggestions('edit',{scenes:2}),[]);
 assert.notDeepEqual(suggestions('board',{scenes:0}),suggestions('plan',{scenes:0}));
});

test('a divider marks each change of step, and "Now on" when the screen moved on',()=>{
 const messages:CompanionMessage[]=[
  {id:'a',role:'user',text:'Hooks?',at:'2026-10-27T10:00:00.000Z',context:{tab:'board'}},
  {id:'b',role:'assistant',text:'Here.',tab:'board',cards:[]},
  {id:'c',role:'user',text:'Tighten',context:{tab:'plan'}},
 ];
 const items=withDividers(messages,'record');
 assert.deepEqual(items.map(item=>item.kind==='divider'?item.label:item.key),['Board · Tue 27 Oct','a','b','Plan','c','Now on Record']);
 assert.equal(withDividers(messages,'plan').at(-1)?.kind,'message','no divider when the screen is still there');
});

test('a finished reply sums up its steps in one line',()=>{
 assert.equal(elapsed(400),'0s');assert.equal(elapsed(12_400),'12s');assert.equal(elapsed(65_000),'1m 05s');
 assert.equal(stepSummary([{label:'Reading the board',ms:300},{label:'Thinking it through',ms:7000},{label:'Writing the reply',ms:1000},{label:'Drafting scenes',ms:3000},{label:'Checking the changes',ms:50}]),'Read the board, drafted scenes · 11s');
 assert.equal(stepSummary([{label:'Thinking it through',ms:2000}]),'Answered · 2s');
});

test('Preview shows what a card changes, now and after',()=>{
 assert.deepEqual(previewOf({type:'use_hook',text:'New hook'},pkg,outline),{field:'Spoken hook',now:['Old hook'],after:['New hook']});
 assert.deepEqual(previewOf({type:'set_description',text:'D'},null,null).now,['(empty)']);
 assert.deepEqual(previewOf({type:'set_scene',sceneId:'s2',talkingPoints:['Two clicks']},pkg,outline),{field:'Scene 2',now:['Level 1','• One click'],after:['Level 1','• Two clicks']});
 assert.deepEqual(previewOf({type:'set_scene',sceneId:'gone',title:'x'},pkg,outline).now,['This scene is no longer in the plan.']);
 assert.deepEqual(previewOf({type:'draft_scenes',scenes:[{title:'A',talkingPoints:[],show:'',seconds:90},{title:'B',talkingPoints:[],show:'',seconds:30}]},pkg,outline).after,['1. A (0:00)','2. B (1:30)']);
});

test('the log follows only a reader at the bottom; the screen summary is short',()=>{
 assert.equal(atBottom({scrollHeight:1000,scrollTop:560,clientHeight:400}),true);
 assert.equal(atBottom({scrollHeight:1000,scrollTop:300,clientHeight:400}),false);
 assert.equal(screenSummary('plan',{pkg,outline}),'Package with 1 of 3 titles and hook written; 2 scenes');
 assert.equal(screenSummary('record',{pkg,outline,recorded:1}),'Recording; 2 scenes, 1 recorded');
});

test('Markdown: paragraphs, lists and headings; text still streaming stays as written',()=>{
 assert.deepEqual(blocks('One\ntwo\n\n- a\n- b\n1. c\n## Head'),[{kind:'p',lines:['One','two']},{kind:'ul',items:['a','b']},{kind:'ol',items:['c']},{kind:'p',lines:['**Head**']}]);
 assert.deepEqual(blocks('Half **bold'),[{kind:'p',lines:['Half **bold']}]);
});

// ---------------------------------------------------------------- the panel, streaming

function serve(state:{messages:CompanionMessage[];running?:{jobId:string;messageId:string}}){
 return installFetch(({method,path,body})=>{
  if(path==='/settings')return {body:{defaultAi:'claude'}};
  if(path==='/videos/v1/companion'&&method==='GET')return {body:{messages:state.messages,...(state.running?{running:state.running}:{})}};
  if(path==='/videos/v1/companion'&&method==='POST'){
   const b=body as {message:string;retryOf?:string;context:unknown};
   const message={id:b.retryOf??`q${state.messages.length}`,role:'user' as const,text:b.message,context:b.context as {tab:'plan'}};
   if(!b.retryOf)state.messages.push(message);
   return {status:202,body:{jobId:`j${state.messages.length}`,message}};
  }
  if(method==='DELETE'&&path.startsWith('/jobs/'))return {body:{status:'cancelled'}};
  const card=/^\/videos\/v1\/companion\/(\w+)\/cards\/(\d+)\/(apply|undo)$/.exec(path);
  if(card){
   const reply=state.messages.find(message=>message.id===card[1]) as CompanionReplyMessage;
   const next={...reply,cards:reply.cards.map((each,index)=>index===Number(card[2])?card[3]==='apply'?{...each,state:'applied' as const,version:'cv_aaaaaaaaaaaa',result:'Set as your spoken hook'}:{action:each.action,state:'undone' as const}:each)};
   state.messages=state.messages.map(message=>message.id===next.id?next:message);
   return {body:{message:next,changed:['package']}};
  }
 });
}

const mount=(changed:CompanionChanged[][]=[])=>mountUI(createElement(Companion,{videoId:'v1',tab:'plan',scene:{id:'s2',index:1,title:'Level 1'},screen:'Package',pkg,outline,onChanged:(list:CompanionChanged[])=>changed.push(list)}));

test('asking streams: the steps with their time, a skeleton before the first words, the words without the actions, then the reply and its card',async()=>{
 FakeEventSource.install();
 const state={messages:[] as CompanionMessage[]},server=serve(state),changed:CompanionChanged[][]=[];
 const ui=await mount(changed);
 try{
  await flush();
  const c=ui.container;
  assert.match(text(c),/Looking at: Plan · Scene 2/);
  assert.match(text(c),/Ask Claude/);
  await act(async()=>button(c,'Write three hooks').click());await flush();
  const asked=server.calls.find(call=>call.method==='POST'&&call.path==='/videos/v1/companion')!;
  assert.deepEqual(asked.body,{message:'Write three hooks',context:{tab:'plan',sceneId:'s2',sceneTitle:'Level 1',screen:'Package'}},'the screen goes with the question');
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j1/events','the reply is followed over SSE');
  assert.ok(c.querySelector('.cmp-me')?.textContent==='Write three hooks','your message shows at once');
  assert.ok(c.querySelector('.cmp-skel'),'a skeleton before the first words');
  assert.ok(c.querySelector('button[aria-label="Stop (Esc)"]'),'Send becomes Stop');
  assert.equal(c.querySelector('.cmp-sugg'),null,'suggestions wait while it works');

  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Reading the plan'}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Thinking it through'}));
  const steps=()=>[...c.querySelectorAll('.cmp-steps.live li')].map(li=>({on:li.classList.contains('on'),text:li.querySelector('span:not(.cmp-t):not(.cmp-pulse)')?.textContent}));
  assert.deepEqual(steps(),[{on:false,text:'Reading the plan'},{on:true,text:'Thinking it through'}]);
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Three **hooks** '}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Three **hooks** '}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:16,text:'below.'}));
  assert.equal(c.querySelector('.cmp-skel'),null,'the skeleton goes when words arrive');
  assert.equal(c.querySelector('.cmp-md.streaming')?.textContent,'Three hooks below.','a replayed piece is not shown twice');
  assert.equal(c.querySelector('.cmp-md.streaming strong')?.textContent,'hooks','markdown renders while it streams');

  const reply:CompanionReplyMessage={id:'r1',role:'assistant',text:'Three **hooks** below.',tab:'plan',cards:[{action:{type:'use_hook',text:'You never opened this.'},state:'offered'}],steps:[{label:'Reading the plan',ms:200},{label:'Writing hooks',ms:4000}]};
  state.messages.push(reply);
  await act(async()=>FakeEventSource.last().emit('done',reply));await flush();
  assert.equal(c.querySelector('.cmp-reply.live'),null);
  assert.equal(c.querySelector('.cmp-sum-line')?.textContent,'Read the plan, wrote hooks · 4s','the steps fold into one line');
  assert.equal(c.querySelector('.cmp-steps'),null);
  await act(async()=>(c.querySelector('.cmp-sum-line') as HTMLElement).click());
  assert.equal(c.querySelectorAll('.cmp-steps li').length,2,'and open again');

  await act(async()=>button(c,'Preview').click());
  assert.match(c.querySelector('.cmp-preview')?.textContent??'',/NowOld hookAfterYou never opened this\./);
  await act(async()=>button(c,'Use as hook').click());await flush();
  assert.deepEqual(changed,[['package']],'the screen hears what changed');
  assert.match(c.querySelector('.cmp-card')?.textContent??'',/Set as your spoken hook/);
  await act(async()=>button(c,'Undo').click());await flush();
  assert.ok(button(c,'Apply again'),'an undone card can be applied again');
  assert.equal(changed.length,2);
 }finally{server.restore();await ui.close();}
});

test('Esc stops a reply and keeps what had arrived; a failure says so and Try again asks the same question',async()=>{
 FakeEventSource.install();
 const state={messages:[] as CompanionMessage[]},server=serve(state);
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  await act(async()=>button(c,'Suggest three titles').click());await flush();
  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Thinking it through'}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Half an answer'}));
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));await flush();
  assert.ok(server.calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j1'),'Esc cancels the job');
  assert.equal(c.querySelector('.cmp-reply.live'),null);
  assert.match(text(c),/Half an answer/);
  assert.equal(c.querySelector('.cmp-note')?.textContent,'Stopped');

  await act(async()=>button(c,'Write three hooks').click());await flush();
  await act(async()=>FakeEventSource.last().emit('failed',{message:'Claude is not signed in.'}));
  assert.match(c.querySelector('[role="alert"]')?.textContent??'',/Claude is not signed in\.Try again/);
  await act(async()=>button(c,'Try again').click());await flush();
  const retried=server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/companion').at(-1)!;
  assert.deepEqual((retried.body as {retryOf?:string;message:string}),{message:'Write three hooks',context:{tab:'plan',sceneId:'s2',sceneTitle:'Level 1',screen:'Package'},retryOf:'q1'});
  assert.equal(c.querySelectorAll('.cmp-me').length,2,'the question is not shown twice');
 }finally{server.restore();await ui.close();}
});

test('a reopened panel finds the reply still being written, and the panel remembers being hidden',async()=>{
 FakeEventSource.install();
 const state={messages:[{id:'q0',role:'user',text:'Draft the scenes',context:{tab:'board'}}] as CompanionMessage[],running:{jobId:'j9',messageId:'q0'}},server=serve(state);
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j9/events');
  assert.ok(c.querySelector('.cmp-reply.live'));
  assert.match(text(c),/Board/,'a divider names the step it was asked on');
  await act(async()=>(c.querySelector('button[aria-label="Hide Ask Claude"]') as HTMLElement).click());
  assert.ok(c.querySelector('.cmp.collapsed'));
  assert.equal(localStorage.getItem('cc.companion.open'),'0');
  await ui.close();
  const again=await mount();
  await flush();
  assert.ok(again.container.querySelector('.cmp.collapsed'),'still hidden when it comes back');
  await act(async()=>(again.container.querySelector('.cmp-rail') as HTMLElement).click());
  assert.equal(localStorage.getItem('cc.companion.open'),'1');
  await again.close();
 }finally{server.restore();localStorage.removeItem('cc.companion.open');}
});
