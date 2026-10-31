import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {AiStatus,Video} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {WelcomeScreen}=await import('./screens/WelcomeScreen');
const {HomeScreen}=await import('./screens/HomeScreen');
const {forgetAiStatus,rememberAiStatus}=await import('./ai-status');
const {fixedOptions,searchOptions,scoreOption,workingVideo}=await import('./search');
const {trapTab,focusableIn}=await import('./ui/overlay');
const {VIDEO_STEPS,STEPS_SENTENCE,GLOSSARY,POSTIZ_LINE,PLACES,SHORTCUTS,TREND_HELP,FIND_IDEA}=await import('./steps');
const {TAB_LABEL}=await import('./workspace/rules');
const {BoardTip}=await import('./workspace/BoardTip');
const {ToastProvider}=await import('./ui');

const signedOut:AiStatus={claude:{installed:false,version:null,signedIn:false},codex:{installed:false,version:null,signedIn:false}};
const claudeIn:AiStatus={...signedOut,claude:{installed:true,version:'2.1.0',signedIn:true,account:'dani@example.com'}};
const chatgptIn:AiStatus={...signedOut,codex:{installed:true,version:'0.1.0',signedIn:true,account:'ChatGPT'}};
const workspace={slug:'maya',name:'Maya',handle:'',channelUrl:'',topics:['Claude'],audience:['Complete beginners'],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=async(container:Element,text:string)=>{await act(async()=>button(container,text).click());await flush();};
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const emit=(kind:string,data?:unknown)=>act(async()=>{FakeEventSource.last().emit(kind,data);});
const text=(container:Element|null)=>(container?.textContent??'').replace(/\s+/g,' ').trim();
const pressLabeled=async(container:Element,prefix:string)=>{await act(async()=>container.querySelector<HTMLButtonElement>(`button[aria-label^="${prefix}"]`)!.click());await flush();};

/** A server whose AI check answers only when `release` is called, so the check can be looked at while it runs. */
function slowStatus(status:AiStatus){
 let release=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 return {release,reply:async(call:FakeCall):Promise<FakeReply>=>{if(call.path==='/ai/status'){await gate;return {body:status};}}};
}
const withServer=async(reply:(call:FakeCall)=>FakeReply|Promise<FakeReply>,run:(calls:FakeCall[])=>Promise<void>)=>{
 FakeEventSource.install();const server=installFetch(reply);
 try{await run(server.calls);}finally{server.restore();}
};
const welcome=(navigate:(route:unknown,options?:unknown)=>void=()=>{},initialStep?:number)=>createElement(WelcomeScreen,{navigate:navigate as never,initialStep});

test('Welcome step 1: the first account check says what it is doing, how long it takes and that you can carry on, then shows the accounts',async()=>{
 forgetAiStatus();
 const slow=slowStatus(claudeIn);
 await withServer(slow.reply,async()=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   const line=c.querySelector('.progress-line')!;
   assert.ok(line,'a progress line, not a bare spinner');
   assert.match(text(line),/Checking which accounts are signed in on this computer…/);
   assert.match(text(line),/Usually 10 to 20 seconds\./);
   assert.match(text(line),/\d+s so far\./);
   assert.match(text(line),/You can press Continue and carry on while it runs\./);
   assert.ok(line.querySelector('[role="progressbar"]'));
   assert.equal(c.querySelector('[aria-label="Checking your AI"]'),null,'the old bare spinner is gone');
   assert.equal([...c.querySelectorAll('button')].some(b=>/^Connect/.test(b.textContent!)),false,'nothing to press on rows that are not read yet');
   assert.equal(button(c,'Continue').disabled,false,'Continue is not held up by the check');
   slow.release();await flush();await flush();
   assert.equal(c.querySelector('.progress-line'),null,'the line goes when the answer is in');
   assert.match(text(c),/Connected as dani@example\.com/);
   assert.deepEqual([...c.querySelectorAll('button.primary')].map(b=>b.textContent),['Continue']);
  }finally{await ui.close();}
 });
});

test('Welcome step 1 starts from the last known answer, so coming back is not another wait; ChatGPT says what it is instead of "as ChatGPT"',async()=>{
 rememberAiStatus(chatgptIn);
 const slow=slowStatus(chatgptIn);
 await withServer(slow.reply,async()=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   assert.match(text(c),/Connected with your ChatGPT account/,'known at once');
   assert.doesNotMatch(text(c),/Connected as ChatGPT/);
   assert.match(text(c.querySelector('.progress-line')),/Checking again that your accounts are still signed in…/);
   assert.equal(button(c,'Continue').disabled,false);
   assert.doesNotMatch(text(c),/sign-in page in your browser/,'nothing about opening a sign-in page while an account is connected');
   slow.release();await flush();await flush();
   assert.equal(c.querySelector('.progress-line'),null);
  }finally{await ui.close();forgetAiStatus();}
 });
});

test('Welcome: with no AI signed in Continue waits and says where to connect; a failed check never blocks and has Try again',async()=>{
 forgetAiStatus();
 await withServer(call=>call.path==='/ai/status'?{body:signedOut}:undefined,async()=>{
  const ui=await mountUI(welcome());
  try{
   await flush();await flush();const c=ui.container;
   assert.equal(button(c,'Continue').disabled,true);
   assert.match(text(c),/Connect opens Claude's or ChatGPT's own sign-in page/);
  }finally{await ui.close();}
 });
 forgetAiStatus();
 await withServer(call=>call.path==='/ai/status'?{status:500}:undefined,async()=>{
  const ui=await mountUI(welcome());
  try{
   await flush();await flush();const c=ui.container;
   assert.match(text(c.querySelector('[role="alert"]')),/Try again/);
   assert.equal(button(c,'Continue').disabled,false,'a check that failed says nothing either way');
  }finally{await ui.close();}
 });
});

test('Welcome step 2: adding a channel waits for the account check and says so; with no AI it points back to step 1',async()=>{
 forgetAiStatus();
 const slow=slowStatus(signedOut);
 const routes:unknown[]=[];
 await withServer(slow.reply,async()=>{
  const ui=await mountUI(welcome((route,options)=>routes.push([route,options])));
  try{
   await flush();const c=ui.container;
   await click(c,'Continue');
   assert.match(text(c),/Step 2 of 4/);
   assert.deepEqual(routes.at(-1),[{name:'welcome',step:2},undefined],'the step is in the address');
   await pressLabeled(c,'Add my channel');
   await type(c.querySelector('#ch-url')!,'youtube.com/@maya');
   assert.equal(button(c,'Add channel').disabled,true);
   assert.match(text(c),/Still checking your AI account \(10 to 20 seconds\)\./);
   slow.release();await flush();await flush();
   assert.match(text(c),/No AI account is signed in yet\. Adding a channel needs one\./);
   await click(c,'Connect an AI');
   assert.match(text(c),/Step 1 of 4/);
   assert.deepEqual(routes.at(-1),[{name:'welcome',step:1},undefined]);
  }finally{await ui.close();}
 });
});

test('Welcome: a link to a step that is not ready opens the furthest one that is, and Back and forward follow the address',async()=>{
 forgetAiStatus();
 const routes:unknown[]=[];
 await withServer(call=>call.path==='/ai/status'?{body:claudeIn}:undefined,async()=>{
  const ui=await mountUI(welcome((route,options)=>routes.push([route,options]),4));
  try{
   await flush();await flush();const c=ui.container;
   assert.match(text(c),/Step 2 of 4/,'no channel yet: step 4 opens step 2');
   assert.deepEqual(routes.at(-1),[{name:'welcome',step:2},{replace:true}],'the address is corrected without a new history entry');
   await ui.render(welcome((route,options)=>routes.push([route,options]),1));await flush();
   assert.match(text(c),/Step 1 of 4/,'the address moved, the screen followed');
  }finally{await ui.close();}
 });
});

test('Welcome: the search for videos that work starts when the channel exists, runs behind the other steps and says so, then step 4 shows it with its estimate',async()=>{
 forgetAiStatus();
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces/fresh')return {status:201,body:{...workspace}};
  if(call.path==='/trending')return {body:{items:[],updatedAt:null,followed:0}};
  if(call.path==='/trending/refresh')return {status:202,body:{id:'j_scan',kind:'trending-refresh',status:'running',createdAt:''}};
  if(call.path==='/breakdowns'||call.path==='/videos'||call.path==='/recent')return {body:[]};
  if(call.path==='/settings/welcomed')return {body:{welcomed:true}};
 },async calls=>{
  const ui=await mountUI(welcome());
  try{
   await flush();const c=ui.container;
   await click(c,'Continue');await pressLabeled(c,"I'm starting fresh");
   await type(c.querySelector('#w-name')!,'Maya');await click(c,'Claude');await click(c,'Complete beginners');
   assert.equal(calls.some(call=>call.path==='/trending'),false,'nothing is searched before there is a channel');
   await click(c,'Continue');await click(c,'Continue');
   assert.match(text(c),/Step 4 of 4/);
   assert.ok(calls.some(call=>call.path==='/trending/refresh'),'the search started');
   await emit('progress',{message:'Searching for Claude (1 of 3)…'});
   const line=c.querySelector('.welcome-body .progress-line')!;
   assert.match(text(line),/Searching for Claude \(1 of 3\)…/);
   assert.match(text(line),/Usually 1 to 2 minutes\./);
   assert.match(text(line),/You don't have to wait\. Go to Home and the videos will be there when it finishes\./);
   assert.equal(c.querySelector('[aria-label="Searching YouTube for your topics"][role="status"]'),null,'no bare spinner');
   assert.equal(button(c,'Go to Home').disabled,false,'leaving is allowed while it runs');
   assert.equal([...c.querySelectorAll('button.primary')].length,0);
  }finally{await ui.close();}
 });
});

test('Welcome: the search starts as soon as the channel is added, so it can run while you answer the voice questions',async()=>{
 forgetAiStatus();
 await withServer(call=>{
  if(call.path==='/ai/status')return {body:claudeIn};
  if(call.path==='/workspaces'&&call.method==='POST')return {status:202,body:{id:'j_add',kind:'add-channel',status:'running',createdAt:''}};
  if(call.path==='/trending')return {body:{items:[],updatedAt:null,followed:0}};
  if(call.path==='/trending/refresh')return {status:202,body:{id:'j_scan',kind:'trending-refresh',status:'running',createdAt:''}};
  if(call.path==='/breakdowns'||call.path==='/videos'||call.path==='/recent')return {body:[]};
 },async calls=>{
  const ui=await mountUI(welcome());
  try{
   await flush();await flush();const c=ui.container;
   await click(c,'Continue');await pressLabeled(c,'Add my channel');
   await type(c.querySelector('#ch-url')!,'youtube.com/@maya');await click(c,'Add channel');
   assert.match(text(c.querySelector('.progress-line')),/Reading your channel…/);
   assert.match(text(c.querySelector('.progress-line')),/Usually 1 to 2 minutes\./);
   await emit('done',{workspace:{...workspace,channelUrl:'https://youtube.com/@maya'},voice:'needs-answers'});
   await click(c,'Continue');
   assert.equal(c.querySelector('h1')!.textContent,'How you talk');
   assert.ok(calls.some(call=>call.path==='/trending/refresh'),'already searching on step 3');
   assert.match(text(c.querySelector('.welcome-aside')),/Searching YouTube for your topics in the background\. It never holds you up\./);
   assert.equal(button(c,'Continue').disabled,false);
  }finally{await ui.close();}
 });
});

const video=(id:string,title:string,stage:Video['stage'],extra:Partial<Video>={}):Video=>({id,title,stage,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...extra});

test('Home for a new channel shows the search progress with an estimate instead of a spinner, and the checklist already works',async()=>{
 await withServer(call=>{
  if(call.path==='/videos')return {body:[]};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/workspaces')return {body:{current:'maya',workspaces:[workspace]}};
  if(call.path==='/workspaces/maya')return {body:workspace};
  if(call.path==='/trending')return {body:{items:[],updatedAt:null,followed:0}};
  if(call.path==='/trending/refresh')return {status:202,body:{id:'j_scan',kind:'trending-refresh',status:'running',createdAt:''}};
  if(call.path==='/breakdowns')return {body:[]};
  if(call.path==='/videos/scenes')return {body:{}};
 },async()=>{
  const routes:unknown[]=[];
  const ui=await mountUI(createElement(ToastProvider,null,createElement(HomeScreen,{navigate:route=>routes.push(route),onNewVideo(){}})));
  try{
   await flush();await flush();const c=ui.container;
   await emit('progress',{message:'Searching for Claude (2 of 3)…'});
   const line=c.querySelector('.progress-line')!;
   assert.match(text(line),/Searching for Claude \(2 of 3\)…/);assert.match(text(line),/Usually 1 to 2 minutes\./);
   assert.match(text(line),/New video starts from a title you already have\./);
   assert.deepEqual([...c.querySelectorAll('.checklist-row .ck-title')].map(t=>text(t)),['Set up','Discover','Board','Plan','Record','Edit','Publish']);
   await act(async()=>[...c.querySelectorAll<HTMLElement>('button.checklist-row')].find(b=>/Discover/.test(b.textContent!))!.click());
   assert.deepEqual(routes.at(-1),{name:'discover'},'a row is a way in, not a label');
  }finally{await ui.close();}
 });
});

test('one set of step names: Help, Home, the video tabs and the Board tip read the same words, and Postiz is explained once with its price',async()=>{
 assert.deepEqual(VIDEO_STEPS.map(step=>step.name),Object.values(TAB_LABEL),'the steps are the tabs of a video, in order');
 assert.equal(VIDEO_STEPS.length,5);
 assert.equal(STEPS_SENTENCE,'Every video goes through five steps: Board, Plan, Record, Edit, Publish.');
 FakeEventSource.install();
 const server=installFetch(()=>undefined);
 const ui=await mountUI(createElement(BoardTip,{onClose(){}}));
 try{
  assert.match(text(ui.container),/This is the first of the five steps: Board, Plan, Record, Edit, Publish\./);
  assert.doesNotMatch(text(ui.container),/\b[123] (Gather|Ask|Draft)/,'no second, numbered model');
 }finally{await ui.close();server.restore();}
 const withPrice=VIDEO_STEPS.filter(step=>step.does.includes(POSTIZ_LINE));
 assert.deepEqual(withPrice.map(step=>step.name),['Publish']);
 assert.match(POSTIZ_LINE,/\$29 a month/);
 assert.ok(GLOSSARY.some(item=>item.term==='Scene')&&GLOSSARY.some(item=>item.term==='Take'));
});

// ---------------------------------------------------------------- search

const videos=[video('i1','Claude for receipts','ideas'),video('p1','Hidden features in Claude Code','planning',{updatedAt:'2026-10-05T00:00:00.000Z'}),video('r1','Agents for small shops','recording',{updatedAt:'2026-10-07T00:00:00.000Z'})];
const labels=(query:string,list:readonly Video[]=videos,open?:string)=>searchOptions(list,query,open).map(option=>option.label);

test('search finds steps, settings groups, actions and help for the words a beginner types',()=>{
 for(const [word,expected] of [['help','Help'],['record','Record'],['publish','Publish'],['scene','Scene'],['channel','Channel'],['channel','Add a channel'],['channel','Followed channels'],['postiz','Publishing and look'],['dark','Publishing and look'],['claude','Connected AI'],['shortcuts','Keyboard shortcuts'],['edit','Edit'],['board','Board'],['calendar','Videos calendar'],['voice','Channel']] as const){
  assert.ok(labels(word).includes(expected),`"${word}" finds ${expected}: ${labels(word).join(', ')}`);
 }
 assert.equal(labels('record')[0],'Record','the step comes before a video that has the word in its title');
 assert.equal(labels('hidden')[0],'Hidden features in Claude Code');
 assert.ok(!labels('').includes('First launch setup')&&!labels('setup').includes('First launch setup'),'no First launch setup entry');
 assert.deepEqual(labels('zzzz'),[]);
 assert.ok(!labels('').some(label=>label==='Scene'),'the word list of Help only shows when you search for it');
 assert.equal(searchOptions(Array.from({length:60},(_,n)=>video(`v${n}`,`Video ${n}`,'ideas')),'video').length,40);
});

test('a step opens on the video that is open, else on the one worked on last, and explains itself when nothing is in production',()=>{
 const target=(label:string,list:readonly Video[],open?:string)=>fixedOptions(list,open).find(option=>option.label===label)!.target;
 assert.deepEqual(target('Record',videos,'p1'),{route:{name:'video',id:'p1',tab:'record'}},'the open video');
 assert.deepEqual(target('Edit',videos),{route:{name:'video',id:'r1',tab:'edit'}},'the one touched last, never an idea');
 assert.deepEqual(target('Publish',[videos[0]]),{action:'help',topic:'step:publish'},'no video in production: what the step is');
 assert.equal(workingVideo([videos[0]]),undefined);
 assert.ok(scoreOption({id:'x',label:'Record',kind:'Step',icon:'record',target:{action:'help'}},'rec')!>scoreOption({id:'y',label:'Hidden',kind:'Step',hint:'record',icon:'record',target:{action:'help'}},'rec')!);
 assert.equal(scoreOption({id:'x',label:'Record',kind:'Step',icon:'record',target:{action:'help'}},'record publish'),null,'every word has to match');
});

// ---------------------------------------------------------------- focus

test('Tab is trapped inside a panel: the last control goes to the first, Shift Tab the other way, and focus from outside is pulled in',()=>{
 const panel=document.createElement('div');
 panel.innerHTML='<button id="a">A</button><input id="b"><button id="c" disabled>C</button><button id="d">D</button><div hidden><button id="e">E</button></div><button id="f" tabindex="-1">F</button>';
 document.body.append(panel);
 try{
  assert.deepEqual(focusableIn(panel).map(el=>el.id),['a','b','d'],'disabled, hidden and tabindex -1 are skipped');
  const el=(id:string)=>panel.querySelector<HTMLElement>(`#${id}`)!;
  assert.equal(trapTab(panel,el('d'),false),el('a'));
  assert.equal(trapTab(panel,el('a'),true),el('d'));
  assert.equal(trapTab(panel,el('b'),false),null,'inside the panel the browser moves it');
  assert.equal(trapTab(panel,document.body,false),el('a'));
  assert.equal(trapTab(panel,document.body,true),el('d'));
  const empty=document.createElement('div');
  assert.equal(trapTab(empty,null,false),empty,'a panel with nothing to focus keeps focus on itself');
 }finally{panel.remove();}
});

test('the words of Help, the checklist and search follow the copy rules: no please, successfully, exclamation marks or banned words, and no one\'s name',()=>{
 const all=JSON.stringify([VIDEO_STEPS.map(step=>[step.name,step.does]),GLOSSARY,PLACES,SHORTCUTS,TREND_HELP,FIND_IDEA,fixedOptions([],null).map(option=>[option.label,option.hint])]);
 assert.doesNotMatch(all,/please|successfully|!|\bProject\b|\bBrief\b|\bLane\b|\bPicked\b|Research board|Borumi|Codex|Samin/i);
});
