import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Outline,Package,VideoScene} from '../../../shared/club';
import type {CompanionChanged,CompanionMessage,CompanionReplyMessage,EditAction} from '../../../shared/companion';
import {describeEditAction} from '../../editing-actions';
import {atBottom,elapsed,greeting,lookingAt,previewOf,screenSummary,stepSummary,suggestions,withDividers} from './companion-logic';
import {blocks} from './Markdown';
import {normalizeThread,withPendingStops,withStep,withText} from './useCompanion';
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
 // Plan never repeats the buttons it shows (Draft scenes from the board, Write the package): what is left is options to choose from and opinions.
 assert.deepEqual(suggestions('plan',{scenes:0}),['What should the video open with?','Who is this video for?','What is the one thing a viewer should remember?']);
 assert.deepEqual(suggestions('plan',{scenes:0,hook:true}),['What should the video open with?','Who is this video for?','What is the one thing a viewer should remember?']);
 assert.equal(suggestions('plan',{scenes:2,scene:{index:1}})[0],'Tighten scene 2');
 assert.deepEqual(suggestions('plan',{scenes:2,longest:150}),['Tighten the first scene','Cut the longest scene to 90 seconds','What is missing before I record?']);
 assert.deepEqual(suggestions('plan',{scenes:2,longest:60,hook:true}),['Tighten the first scene','Make the hook sharper','What is missing before I record?']);
 for(const tab of ['board','plan','record','edit','publish'] as const)for(const facts of [{scenes:0},{scenes:3}]){
  assert.equal(suggestions(tab,facts).length,3);
  assert.equal(suggestions(tab,facts).some(idea=>/^Draft the scenes|package/i.test(idea)),false,`${tab} offers no chip that repeats a button on the page`);
 }
 assert.equal(suggestions('record',{scenes:2,scene:{index:0}})[0],'Shorten scene 1 to fit its time');
 assert.equal(suggestions('publish',{scenes:2})[0],'Write the description');
 assert.deepEqual(suggestions('edit',{scenes:2}),['/proof-edit Polish the whole video','Add a title at the start','Add a lower third with my name']);
 assert.equal(suggestions('edit',{scenes:2,selected:3})[1],'Trim the selected clip to the speech');
 assert.notDeepEqual(suggestions('board',{scenes:0}),suggestions('plan',{scenes:0}));
});

test('the suggestions follow what exists on every step: an empty board, nothing recorded, nothing to edit, a title to check',()=>{
 assert.deepEqual(suggestions('board',{scenes:0,tiles:0}),['What should this video cover?','Who is this video for?','Suggest three titles'],'nothing about tiles that are not there');
 assert.equal(suggestions('board',{scenes:0,tiles:3})[0],'Write three hooks from this board');
 assert.equal(suggestions('record',{scenes:3,recorded:0})[0],'What should I say first?');
 assert.equal(suggestions('record',{scenes:3,recorded:1})[0],'Shorten this scene to fit its time');
 assert.deepEqual(suggestions('edit',{scenes:3,recorded:0}),[],'nothing that edits before anything is recorded');
 assert.deepEqual(suggestions('publish',{scenes:3,titled:false}),['Write the description','Suggest thumbnail text']);
 assert.deepEqual(suggestions('publish',{scenes:3,titled:true,thumbnail:true}),['Write the description','Is the thumbnail text clear?','Is the title ready?']);
 assert.match(greeting('board',{scenes:0,tiles:0}),/^Add a video, link or note to the board/);
 assert.match(greeting('edit',{scenes:2,recorded:0}),/^Record a scene first/);
});

test('each step greets with its own one or two sentences, and Plan says what comes first until there are scenes',()=>{
 const tabs=['board','plan','record','edit','publish'] as const;
 const lines=tabs.map(tab=>greeting(tab,{scenes:0}));
 assert.equal(new Set(lines).size,tabs.length,'no two steps say the same');
 for(const line of lines){assert.ok(line.split(/(?<=\.)\s/).length<=2,line);assert.doesNotMatch(line,/with you on this video|!|please/i);}
 assert.match(greeting('plan',{scenes:0}),/^Plan the scenes first/);
 assert.match(greeting('plan',{scenes:4}),/^I can tighten a scene/);
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
 assert.deepEqual(previewOf({type:'set_description',text:'D'},null,null)!.now,['(empty)']);
 assert.deepEqual(previewOf({type:'set_scene',sceneId:'s2',talkingPoints:['Two clicks']},pkg,outline),{field:'Scene 2',now:['Level 1','• One click'],after:['Level 1','• Two clicks']});
 assert.deepEqual(previewOf({type:'set_scene',sceneId:'gone',title:'x'},pkg,outline)!.now,['This scene is no longer in the plan.']);
 assert.equal(previewOf({type:'cut_pauses',level:'balanced'},pkg,outline),undefined,'timeline cards preview on the stage');
 assert.deepEqual(previewOf({type:'draft_scenes',scenes:[{title:'A',talkingPoints:[],show:'',seconds:90},{title:'B',talkingPoints:[],show:'',seconds:30}]},pkg,outline)!.after,['1. A (0:00)','2. B (1:30)']);
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

type State={messages:CompanionMessage[];running?:{jobId:string;messageId:string;text:string;steps:string[]};jobs?:Record<string,string>};
function serve(state:State){
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
  if(method==='GET'&&path.startsWith('/jobs/'))return {body:{id:path.split('/').pop(),kind:'companion',status:state.jobs?.[path.split('/').pop()!]??'running',createdAt:''}};
  const card=/^\/videos\/v1\/companion\/(\w+)\/cards\/(\d+)\/(apply|undo)$/.exec(path);
  if(card){
   const reply=state.messages.find(message=>message.id===card[1]) as CompanionReplyMessage;
   const next={...reply,cards:reply.cards.map((each,index)=>index===Number(card[2])?card[3]==='apply'?{...each,state:'applied' as const,version:'cv_aaaaaaaaaaaa',result:'Set as your spoken hook'}:{action:each.action,state:'undone' as const}:each)};
   state.messages=state.messages.map(message=>message.id===next.id?next:message);
   return {body:{message:next,changed:['package']}};
  }
 });
}

const recordedScenes:VideoScene[]=[{id:'s1',title:'Opening',seconds:60,takes:[{id:'t1',seconds:50,kept:true,retained:false}],status:'Kept take 1'},{id:'s2',title:'Level 1',seconds:120,takes:[],status:'Not recorded'}];
const mount=(changed:CompanionChanged[][]=[],scenes?:VideoScene[])=>mountUI(createElement(Companion,{videoId:'v1',tab:'plan',scene:{id:'s2',index:1,title:'Level 1'},screen:'Package',pkg,outline,scenes,onChanged:(list:CompanionChanged[])=>changed.push(list)}));
const status=(root:Element)=>root.querySelector('.cmp-sr[role="status"]')?.textContent;

test('asking streams: the steps with their time, a skeleton before the first words, the words without the actions, then the reply and its card',async()=>{
 FakeEventSource.install();
 const state={messages:[] as CompanionMessage[]},server=serve(state),changed:CompanionChanged[][]=[];
 const ui=await mount(changed);
 try{
  await flush();
  const c=ui.container;
  assert.match(text(c.querySelector('.cmp-context')!),/Plan · Scene 2/);
  assert.match(text(c),/Ask Claude/);
  // Nothing asked yet: the step's greeting with its three prompts right under it, not a blank column and not the old welcome.
  const hello=c.querySelector('.cmp-log .cmp-hello')!;
  assert.match(text(hello),/^I can tighten a scene/);
  assert.deepEqual([...hello.querySelectorAll('.cmp-sugg button')].map(b=>b.textContent),['Tighten scene 2','Cut the longest scene to 90 seconds','Make the hook sharper']);
  assert.equal(c.querySelector('.cmp-foot .cmp-sugg'),null,'the prompts are not repeated at the bottom');
  assert.doesNotMatch(text(c),/with you on this video/);
  await act(async()=>button(c,'Tighten scene 2').click());await flush();
  const asked=server.calls.find(call=>call.method==='POST'&&call.path==='/videos/v1/companion')!;
  assert.deepEqual(asked.body,{message:'Tighten scene 2',context:{tab:'plan',sceneId:'s2',sceneTitle:'Level 1',screen:'Package'}},'the screen goes with the question');
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j1/events','the reply is followed over SSE');
  assert.ok(c.querySelector('.cmp-me')?.textContent==='Tighten scene 2','your message shows at once');
  assert.ok(c.querySelector('.cmp-skel'),'a skeleton before the first words');
  assert.ok(c.querySelector('button[aria-label="Stop (Esc)"]'),'Send becomes Stop');
  assert.equal(c.querySelector('.cmp-sugg'),null,'suggestions wait while it works');

  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Reading the plan',index:0}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Thinking it through',index:1}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Reading the plan',index:0}));
  assert.equal(status(c),'Thinking it through','screen readers hear the step, from one status line');
  assert.equal(c.querySelector('.cmp-log')?.getAttribute('aria-live'),'off','the log and its timer are not announced');
  assert.equal(c.querySelector('.cmp-reply.live')?.getAttribute('aria-live'),'off');
  const steps=()=>[...c.querySelectorAll('.cmp-steps.live li')].map(li=>({on:li.classList.contains('on'),text:li.querySelector('span:not(.cmp-t):not(.cmp-pulse)')?.textContent}));
  assert.deepEqual(steps(),[{on:false,text:'Reading the plan'},{on:true,text:'Thinking it through'}],'a replayed step is not shown twice');
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
  assert.equal(status(c),'Reply ready');
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
  await act(async()=>button(c,'Cut the longest scene to 90 seconds').click());await flush();
  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Thinking it through',index:0}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Half an answer'}));
  const deletes=()=>server.calls.filter(call=>call.method==='DELETE').length;
  // Esc elsewhere on the page is not the panel's: focus outside, a key another control already used, or an open dialog.
  const outside=document.createElement('input');document.body.append(outside);outside.focus();
  await act(async()=>outside.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
  const field=c.querySelector('textarea')!;
  const used=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});used.preventDefault();
  await act(async()=>field.dispatchEvent(used));
  const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog);
  await act(async()=>field.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  dialog.remove();outside.remove();
  assert.equal(deletes(),0,'none of those stop the reply');
  assert.ok(c.querySelector('.cmp-reply.live'));
  // Esc with focus in the panel stops it.
  field.focus();
  await act(async()=>field.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));await flush();
  assert.ok(server.calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j1'),'Esc cancels the job');
  assert.equal(c.querySelector('.cmp-reply.live'),null);
  assert.match(text(c),/Half an answer/);
  assert.equal(c.querySelector('.cmp-note')?.textContent,'Stopped');

  await act(async()=>button(c,'Tighten scene 2').click());await flush();
  await act(async()=>FakeEventSource.last().emit('failed',{message:'Claude is not signed in.'}));
  assert.match(c.querySelector('[role="alert"]')?.textContent??'',/Claude is not signed in\.Try again/);
  await act(async()=>button(c,'Try again').click());await flush();
  const retried=server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/companion').at(-1)!;
  assert.deepEqual((retried.body as {retryOf?:string;message:string}),{message:'Tighten scene 2',context:{tab:'plan',sceneId:'s2',sceneTitle:'Level 1',screen:'Package'},retryOf:'q1'});
  assert.equal(c.querySelectorAll('.cmp-me').length,2,'the question is not shown twice');
 }finally{server.restore();await ui.close();}
});

test('a reopened panel finds the reply still being written, and the panel remembers being hidden',async()=>{
 FakeEventSource.install();
 const state={messages:[{id:'q0',role:'user',text:'Draft the scenes',context:{tab:'board'}}] as CompanionMessage[],running:{jobId:'j9',messageId:'q0',text:'Half of the',steps:['Reading the board','Thinking it through']}},server=serve(state);
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j9/events');
  assert.ok(c.querySelector('.cmp-reply.live'));
  assert.equal(c.querySelector('.cmp-md.streaming')?.textContent,'Half of the','the text written so far shows at once');
  assert.equal(c.querySelectorAll('.cmp-steps.live li').length,2);
  // The replay from the start adds nothing that is already shown.
  await act(async()=>FakeEventSource.last().emit('progress',{type:'step',label:'Reading the board',index:0}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Half'}));
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:4,text:' of the reply'}));
  assert.equal(c.querySelector('.cmp-md.streaming')?.textContent,'Half of the reply');
  assert.equal(c.querySelectorAll('.cmp-steps.live li').length,2);
  assert.match(text(c),/Show 1 earlier message/,'what was asked on another step is one quiet line');
  await act(async()=>(c.querySelector('.cmp-earlier') as HTMLElement).click());
  assert.match(text(c),/Board/,'opened, a divider names the step it was asked on');
  await act(async()=>(c.querySelector('button[aria-label="Hide Ask Claude"]') as HTMLElement).click());
  assert.ok(c.querySelector('.cmp.collapsed'));
  for(let i=0;i<50&&document.activeElement!==c.querySelector('.cmp-rail');i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
  assert.equal(document.activeElement,c.querySelector('.cmp-rail'),'focus moves to the rail that reopens it');
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

test('replays never repeat: a step goes by its index, text by its offset',()=>{
 const one=withStep([],0,'A',1);
 assert.deepEqual(withStep(one,0,'A',2),one);
 assert.equal(withStep(one,1,'B',2).length,2);
 assert.equal(withText('Hello',0,'He'),'Hello');
 assert.equal(withText('Hello',3,'lo world'),'Hello world');
});

test('a dropped connection is not a failure while the reply still runs; Try again follows a running reply instead of asking twice',async()=>{
 FakeEventSource.install();
 const state:State={messages:[],jobs:{}},server=serve(state);
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  await act(async()=>button(c,'Tighten scene 2').click());await flush();
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Some '}));
  const first=FakeEventSource.last();
  // The browser gave up on the stream: the job is asked about, found running, and followed again.
  first.readyState=2;
  await act(async()=>first.emit('error'));await flush();
  assert.notEqual(FakeEventSource.last(),first,'followed again');
  assert.equal(c.querySelector('[role="alert"]'),null,'no failure is shown');
  assert.equal(c.querySelector('.cmp-md.streaming')?.textContent,'Some','what was shown stays');
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Some words.'}));
  assert.equal(c.querySelector('.cmp-md.streaming')?.textContent,'Some words.');

  // A real failure, then Try again while the server says the reply is in fact running: followed, not asked again.
  await act(async()=>FakeEventSource.last().emit('failed',{message:'Claude could not finish that.'}));
  assert.match(c.querySelector('[role="alert"]')?.textContent??'',/Claude could not finish that\./);
  state.running={jobId:'j1',messageId:'q0',text:'Some words.',steps:['Thinking it through']};
  const posts=()=>server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/companion').length;
  await act(async()=>button(c,'Try again').click());await flush();
  assert.equal(posts(),1,'not asked twice');
  assert.equal(FakeEventSource.last().url,'/api/club/jobs/j1/events');
  assert.ok(c.querySelector('.cmp-reply.live'));
 }finally{server.restore();await ui.close();}
});

test("after Stop the server's copy replaces the local one, so a reply that had already finished is not hidden",async()=>{
 FakeEventSource.install();
 const state:State={messages:[]},server=serve(state);
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  await act(async()=>button(c,'Cut the longest scene to 90 seconds').click());await flush();
  await act(async()=>FakeEventSource.last().emit('progress',{type:'text',at:0,text:'Three titles'}));
  // The reply finished on the server just as Stop was pressed.
  state.messages.push({id:'r9',role:'assistant',text:'Three titles below.',tab:'plan',cards:[]});
  const field=c.querySelector('textarea')!;field.focus();
  await act(async()=>field.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  assert.equal(c.querySelector('.cmp-note')?.textContent,'Stopped');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,500));});
  assert.equal(c.querySelector('.cmp-note'),null);
  assert.match(text(c),/Three titles below\./);
 }finally{server.restore();await ui.close();}
});

test("a draft that would replace recorded scenes asks first, with the Board's dialog",async()=>{
 FakeEventSource.install();
 const reply:CompanionReplyMessage={id:'r1',role:'assistant',text:'New scenes.',tab:'plan',cards:[{action:{type:'draft_scenes',scenes:[{title:'A',talkingPoints:[],show:'',seconds:60}]},state:'offered'}]};
 const state:State={messages:[{id:'q0',role:'user',text:'Draft',context:{tab:'plan'}},reply]},server=serve(state);
 const ui=await mount([],recordedScenes);
 try{
  await flush();
  const c=ui.container;
  const applies=()=>server.calls.filter(call=>call.path.endsWith('/apply')).length;
  await act(async()=>button(c,'Apply').click());
  assert.match(document.body.textContent??'',/This video already has 2 scenes, and 1 are recorded\. Applying these replaces them\./);
  await act(async()=>button(document.body,'Keep my scenes').click());
  assert.equal(applies(),0,'kept');
  await act(async()=>button(c,'Apply').click());
  await act(async()=>button(document.body,'Replace 2 scenes').click());await flush();
  assert.equal(applies(),1);
  // Undo would bring the old scenes back over scenes that have takes: it asks too.
  const undos=()=>server.calls.filter(call=>call.path.endsWith('/undo')).length;
  await act(async()=>button(c,'Undo').click());
  assert.match(document.body.textContent??'',/Undoing this replaces them\. You can apply it again from this card\./);
  await act(async()=>button(document.body,'Keep my scenes').click());
  assert.equal(undos(),0);
  await act(async()=>button(c,'Undo').click());
  await act(async()=>button(document.body,'Replace 2 scenes').click());await flush();
  assert.equal(undos(),1);
 }finally{server.restore();await ui.close();}
});

test('an applied card whose version is gone says it is too old to undo, and offers no Undo',async()=>{
 FakeEventSource.install();
 const reply:CompanionReplyMessage={id:'r1',role:'assistant',text:'Done.',tab:'plan',cards:[{action:{type:'use_hook',text:'Old'},state:'applied',result:'Set as your spoken hook',tooOld:true}]};
 const server=serve({messages:[{id:'q0',role:'user',text:'Hook',context:{tab:'plan'}},reply]});
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  assert.match(c.querySelector('.cmp-card')?.textContent??'',/Too old to undo/);
  assert.equal([...c.querySelectorAll('.cmp-card button')].some(b=>b.textContent?.includes('Undo')),false);
 }finally{server.restore();await ui.close();}
});

test('a stopped reply stays on screen until the server has saved its own copy, right after its question',()=>{
 const question:CompanionMessage={id:'q1',role:'user',text:'Q',context:{tab:'plan'}};
 const next:CompanionMessage={id:'q2',role:'user',text:'Next',context:{tab:'plan'}};
 const local:CompanionMessage={id:'stopped-j1',role:'assistant',text:'Half',tab:'plan',cards:[],status:'stopped'};
 const pending=new Map([['j1',{questionId:'q1',message:local}]]);
 const early=withPendingStops([question,next],pending);
 assert.deepEqual(early.messages.map(message=>message.id),['q1','stopped-j1','q2'],'kept, in its place, while the server has none');
 assert.deepEqual(early.settled,[]);
 const saved:CompanionMessage={id:'r1',role:'assistant',text:'Half',tab:'plan',cards:[],status:'stopped'};
 const late=withPendingStops([question,saved,next],pending);
 assert.deepEqual(late.messages.map(message=>message.id),['q1','r1','q2'],'replaced by the server copy');
 assert.deepEqual(late.settled,['j1']);
});

test('a reply that is not a conversation shows as an empty one',()=>{
 assert.deepEqual(normalizeThread([] as never).messages,[]);
 assert.deepEqual(normalizeThread(undefined).messages,[]);
 assert.deepEqual(normalizeThread({} as never).messages,[]);
 const asked:CompanionMessage={id:'q1',role:'user',text:'Q',context:{tab:'plan'}};
 assert.equal(normalizeThread({messages:[asked]} as never).messages.length,1);
});

// ---------------------------------------------------------------- on Edit

test('on Edit: a message carries the playhead and selection, a timeline card previews on the stage and applies through the editor as one undo step',async()=>{
 FakeEventSource.install();
 const reply:CompanionReplyMessage={id:'r1',role:'assistant',text:'One card.',tab:'edit',cards:[{action:{type:'cut_pauses',level:'balanced'},state:'offered'}]};
 const state={messages:[{id:'q0',role:'user',text:'Cut the pauses',context:{tab:'edit'}},reply] as CompanionMessage[]};
 const server=installFetch(({method,path,body})=>{
  if(path==='/settings')return {body:{defaultAi:'claude'}};
  if(path==='/videos/v1/companion'&&method==='GET')return {body:{messages:state.messages}};
  if(path==='/videos/v1/companion'&&method==='POST'){const b=body as {message:string;context:unknown};const message={id:'q9',role:'user' as const,text:b.message,context:b.context as {tab:'edit'}};state.messages.push(message);return {status:202,body:{jobId:'j9',message}};}
  const card=/^\/videos\/v1\/companion\/r1\/cards\/0\/(apply|undo)$/.exec(path);
  if(card){const next={...reply,cards:[card[1]==='apply'?{...reply.cards[0],state:'applied' as const,version:'cv_aaaaaaaaaaaa',result:'Cut 2 pauses, 6.4 s shorter'}:{...reply.cards[0],state:'undone' as const}]};state.messages=[state.messages[0],next];return {body:{message:next,changed:['timeline'],project:{id:'p1'},revision:'rev-2'}};}
 });
 const log:string[]=[];
 let previewKey:string|undefined;
 const bridge={
  context:()=>({playhead:6.5,selection:['screen-1'],range:{start:0,end:20}}),
  flush:async()=>{log.push('flush');},
  preview:(action:unknown,key:string)=>{log.push(action?`preview ${(action as {type:string}).type}`:'preview off');previewKey=action?key:undefined;return undefined;},
  estimate:()=>({text:'3 cuts · 0.9 s shorter'}),
  describe:(action:EditAction)=>describeEditAction(action),
  commit:async<T,>(run:(revision:string)=>Promise<T>)=>{log.push('commit');return run('rev-1');},
 };
 const changed:CompanionChanged[][]=[];
 const props=()=>({videoId:'v1',tab:'edit' as const,screen:'The editor',pkg,outline,onChanged:(list:CompanionChanged[])=>changed.push(list),editor:{get:()=>bridge as never,state:{selected:2,previewKey}}});
 const ui=await mountUI(createElement(Companion,props()));
 try{
  await flush();
  const c=ui.container;
  assert.match(text(c.querySelector('.cmp-context')!),/Edit · 2 selected/);
  assert.match(c.querySelector('.cmp-card')?.textContent??'',/Cut pausesCut pauses between your words longer than 1 s, keeping a breath on each side\./,'the card says what it does');
  assert.equal(c.querySelector('.cmp-card-est')?.textContent,'3 cuts · 0.9 s shorter','and how much it takes out');
  await act(async()=>button(c,'Preview').click());
  assert.deepEqual(log,['preview cut_pauses'],'Preview shows the cut on the stage');
  await ui.render(createElement(Companion,props()));
  assert.ok(button(c,'Hide preview'),'pressed while its preview is the one on the stage');
  await act(async()=>button(c,'Cut them').click());await flush();
  assert.deepEqual(log,['preview cut_pauses','preview off','commit'],'the preview goes, then the editor saves and applies');
  const applied=server.calls.find(call=>call.path==='/videos/v1/companion/r1/cards/0/apply')!;
  assert.deepEqual(applied.body,{revision:'rev-1'},'with the revision the editor saved');
  assert.deepEqual(changed,[['timeline']]);
  assert.match(c.querySelector('.cmp-card')?.textContent??'',/Cut 2 pauses, 6\.4 s shorter/);
  await act(async()=>button(c,'Undo').click());await flush();
  assert.equal(log.filter(entry=>entry==='commit').length,2,'Undo goes through the editor too');
  assert.deepEqual(server.calls.find(call=>call.path==='/videos/v1/companion/r1/cards/0/undo')!.body,{revision:'rev-1'});

  await act(async()=>button(c,'Add a title at the start').click());await flush();
  const asked=server.calls.find(call=>call.method==='POST'&&call.path==='/videos/v1/companion')!;
  assert.deepEqual(asked.body,{message:'Add a title at the start',context:{tab:'edit',screen:'The editor',playhead:6.5,selection:['screen-1'],range:{start:0,end:20}}},'the editor saves first, then its playhead and selection go with the question');
  assert.ok(log.includes('flush'));
 }finally{server.restore();await ui.close();}
});

test('a question from Claude shows its answers as buttons; tapping one sends it as the next message and settles the question',async()=>{
 FakeEventSource.install();
 const reply:CompanionReplyMessage={id:'r1',role:'assistant',text:'One thing first.',tab:'plan',cards:[{action:{type:'ask_choice',question:'Who is this video for?',options:['Beginners','People who already use it','Developers']},state:'offered'}]};
 const state={messages:[{id:'q0',role:'user',text:'Write the hook',context:{tab:'plan'}},reply] as CompanionMessage[]},server=serve(state);
 const ui=await mount();
 try{
  await flush();
  const c=ui.container;
  assert.equal(c.querySelector('.cmp-choice-q')?.textContent,'Who is this video for?');
  assert.deepEqual([...c.querySelectorAll('.cmp-choice-opts button')].map(b=>b.textContent),['Beginners','People who already use it','Developers']);
  assert.equal(c.querySelector('.cmp-card-a'),null,'a question has no Apply or Preview');
  assert.equal([...c.querySelectorAll('.cmp-sugg button')].length,0,'the suggestions step aside while a question waits');
  await act(async()=>button(c,'Beginners').click());await flush();
  const asked=server.calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/companion').at(-1)?.body as {message:string};
  assert.equal(asked.message,'Beginners');
  assert.ok([...c.querySelectorAll('.cmp-choice-opts button')].every(b=>(b as HTMLButtonElement).disabled),'once answered, the answers are settled');
 }finally{await ui.close();server.restore();}
});

test('on Edit, a moment marked as not liked puts Fix the parts I marked first',()=>{
 assert.deepEqual(suggestions('edit',{scenes:2,notes:1}),['/proof-edit Polish the whole video','Fix the parts I marked','Add a title at the start']);
 // After the polish, the next steps come from the video: the pacing check first, then what it still lacks, then whether it is ready.
 assert.deepEqual(suggestions('edit',{scenes:2,polished:true,stalls:[{start:26.4,end:34.2}],opening:true,named:true}),['Add something at 0:26–0:34: nothing changes on screen there','Cut the pauses']);
 assert.deepEqual(suggestions('edit',{scenes:2,polished:true,stalls:[],opening:true,named:false}),['Add a lower third with my name','Is this ready to publish?','Cut the pauses']);
 assert.equal(suggestions('edit',{scenes:2,notes:0})[1],'Add a title at the start');
});
