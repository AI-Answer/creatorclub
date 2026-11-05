import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {OnePager as Data,Video} from '../../shared/club';
import {changesVideos} from './api';
import {rememberAiStatus} from './ai-status';
import {FakeEventSource,installFetch} from './test-fakes';
import {usePlan} from './usePlan';
import {ToastProvider} from './ui';
const {OnePager}=await import('./idea/OnePagerCard');
import {emptyOnePager,onepagerMarkdown,thumbnailBrief} from './idea/onepager';

const video:Video={id:'v1',title:'A video',stage:'planning',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
const good:Data={...emptyOnePager(),title:'The Strong Title',backupTitle:'Another Good Title',logline:'We try the idea, find its limit, and fix it.',thumbnail:{headline:'A headline',visual:'A big plant beside a sensor.',closer:'Try this',template:'A split view'},whys:['Own video: 12,000 views, 2x.','Other video: 88,000 views, 4x.','A twist and an example everyone can try.'],flags:['Check the result.']};
const connected={installed:true,version:'test',signedIn:true},disconnected={installed:false,version:null,signedIn:false};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(el:HTMLElement)=>{await act(async()=>el.click());await flush();};
const edit=async(c:Element,label:string,text:string)=>{const el=c.querySelector<HTMLElement>(`[aria-label="${label}"]`);assert.ok(el,label);await act(async()=>{Object.defineProperty(el,'innerText',{value:text,writable:true,configurable:true});el.dispatchEvent(new Event('input',{bubbles:true}));});await act(async()=>el.dispatchEvent(new Event('focusout',{bubbles:true})));await flush();};
let latest!:ReturnType<typeof usePlan>;
let added=0;const titles:string[]=[];
function Probe(){latest=usePlan(video,{onVideo(){},onRecord(){}});return createElement(ToastProvider,null,latest.load.status==='ready'?createElement(OnePager,{video,plan:latest,onTitle:title=>titles.push(title),onBoardChanged:()=>added++}):null);}
function serve(initial:Data|null=good,{running={},ready={}}:{running?:object;ready?:object}={}){
 let saved=initial;
 const server=installFetch(call=>{
  if(call.path==='/settings')return {body:{defaultAi:'claude'}};
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null,onepager:saved,running,ready}};
  if(call.path==='/videos/v1/onepager'&&call.method==='PUT'){saved=call.body as Data;return {body:saved};}
  if(call.path==='/videos/v1/onepager'&&call.method==='POST')return {status:202,body:{id:'job-one',status:'running'}};
  if(call.path==='/jobs/job-one'&&call.method==='GET')return {body:{id:'job-one',status:'running'}};
  if(call.path==='/jobs/job-one'&&call.method==='DELETE')return {body:{id:'job-one',status:'cancelled'}};
  if(/\/onepager\/(undo|use)$/.test(call.path)){saved=good;return {body:{package:null,outline:null,onepager:saved}};}
  if(call.path==='/videos/v1/package/text')return {body:{package:{titles:[(call.body as {text:string}).text,'','']},previous:null}};
  if(call.path==='/videos/v1/research')return {status:201,body:{id:'note1',kind:'note',text:(call.body as {text:string}).text,meta:{}}};
 });
 return {...server,saved:()=>saved};
}

test('Markdown follows the one-pager template order, labels have no bullets, and thumbnailBrief is a single paragraph',()=>{
 assert.equal(changesVideos('PUT','/videos/v1/onepager'),false,'autosaving a slide does not reload the sidebar');
 const text=onepagerMarkdown({...good,title:'A [special] *title*',thumbnail:{...good.thumbnail,visual:'A plant\nnext to a sensor.'}});
 const headings=['## Thumbnail sketch','## Title(s)','## Logline','## Skeleton','## Why?','## Packaging reference','## Flags'];
 for(let i=1;i<headings.length;i++)assert.ok(text.indexOf(headings[i])>text.indexOf(headings[i-1]));
 assert.match(text,/\*\*Intro:\*\* /);assert.ok(!text.includes('- **Intro'));
 assert.ok(text.includes('A \\[special\\] \\*title\\*'));
 assert.equal(thumbnailBrief(emptyOnePager()),'');
 assert.equal(thumbnailBrief({...good,thumbnail:{...good.thumbnail,visual:'A plant\nnext to a sensor.'}}),'Headline: A headline. Visual: A plant next to a sensor. Closer: Try this. Layout: A split view.');
});

test('manual template works without AI; every field saves inline and Saving… becomes Saved',async()=>{
 rememberAiStatus({claude:disconnected,codex:disconnected});
 const server=serve(null),ui=await mountUI(createElement(Probe));
 try{
  const c=ui.container;
  assert.ok(button(c,'Write one-pager').disabled);assert.match(c.textContent!,/fill in the one-pager yourself/);
  assert.equal(c.querySelectorAll('[aria-label$=" sentence"]').length,6);
  assert.equal(c.querySelector('.onepager-heading .btn.primary')?.textContent,'Write one-pager');
  assert.ok(![...c.querySelectorAll('button')].some(b=>['Copy','Add to board','Use as video title'].includes(b.textContent??'')));
  assert.equal(new Set([...c.querySelectorAll('[aria-label$=" sentence"]')].map(el=>el.getAttribute('data-ph'))).size,6);
  assert.equal(c.querySelector('[aria-label="Thumbnail headline"]'),null,'an empty sketch is one quiet prompt');
  await press(button(c,'Add a headline, the picture, and a closing line'));
  const fields:[string,string][]=[['One-pager title','My title'],['One-pager backup title','Backup'],['One-pager logline','A whole sentence.'],['Thumbnail headline','Big plant'],['Thumbnail visual','The plant and sensor.'],['Thumbnail closer','Try it'],['Thumbnail layout','Split view'],['Beat 1 label','The promise'],['Beat 1 sentence','We see the result.'],['Why 1','Find my related video.'],['Why 2','Find an external outlier.'],['Why 3','Anyone can try it.'],['One-pager flags','Check the soil.\nCheck the cost.']];
  for(const [label,text] of fields)await edit(c,label,text);
  assert.equal(server.saved()!.title,'My title');assert.equal(server.saved()!.skeleton[0].label,'The promise');assert.deepEqual(server.saved()!.flags,['Check the soil.','Check the cost.']);assert.match(c.textContent!,/Saved/);
  await edit(c,'One-pager title',video.title);assert.match(c.querySelector('.onepager-in-use')!.textContent!,/Current title/);assert.equal([...c.querySelectorAll('button')].filter(b=>b.textContent==='Use as video title').length,1);assert.ok(button(c,'Use as video title'));
  await act(async()=>latest.editOnepager({...latest.onepager!,logline:'Unsaved typing'}));assert.equal(latest.onepagerSave,'saving');
  await act(async()=>latest.flush());assert.equal(latest.onepagerSave,'saved');
 }finally{await ui.close();server.restore();}
});

test('skeleton can grow to ten beats and shrink to six, and Copy/Add to board use identical clean Markdown',async()=>{
 rememberAiStatus({claude:connected,codex:disconnected});added=0;
 const server=serve(),ui=await mountUI(createElement(Probe));
 const original=navigator.clipboard;let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{copied=text;}},configurable:true});
 try{
  const c=ui.container;
  for(let i=0;i<4;i++)await press(button(c,'Add a line'));
  assert.equal(c.querySelectorAll('[aria-label$=" sentence"]').length,10);assert.ok(![...c.querySelectorAll('button')].some(b=>b.textContent==='Add a line'));
  for(let i=0;i<4;i++)await press(c.querySelector<HTMLButtonElement>('[aria-label="Remove beat 1"]')!);
  assert.equal(c.querySelectorAll('[aria-label$=" sentence"]').length,6);assert.equal(c.querySelector('[aria-label="Remove beat 1"]'),null);
  await press(button(c,'Copy'));assert.equal(copied,onepagerMarkdown(latest.onepager!));
  await press(button(c,'Add to board'));
  const sent=server.calls.find(call=>call.path==='/videos/v1/research')!;assert.deepEqual(sent.body,{kind:'note',text:copied.trim()});assert.equal(added,1);
 }finally{Object.defineProperty(navigator,'clipboard',{value:original,configurable:true});await ui.close();server.restore();}
});

test('both Use as video title buttons send package/text after pending edits, update the video title and refresh the package',async()=>{
 rememberAiStatus({claude:connected,codex:disconnected});titles.length=0;
 const server=serve(),ui=await mountUI(createElement(Probe));
 try{
  const c=ui.container;
  const buttons=()=>[...c.querySelectorAll('button')].filter(button=>button.textContent==='Use as video title');
  await press(buttons()[0]);await press(buttons()[1]);
  assert.deepEqual(titles,[good.title,good.backupTitle]);
  assert.deepEqual(server.calls.filter(call=>call.path==='/videos/v1/package/text').map(call=>call.body),[{kind:'title',text:good.title},{kind:'title',text:good.backupTitle}]);
 }finally{await ui.close();server.restore();}
});

test('Write/Rewrite follows progress, failure retry, Stop, Undo and held-result notices',async()=>{
 rememberAiStatus({claude:connected,codex:disconnected});FakeEventSource.install();
 const server=serve(),ui=await mountUI(createElement(Probe));
 try{
  const c=ui.container;assert.equal(button(c,'Rewrite').classList.contains('primary'),false);await press(button(c,'Rewrite'));
  await act(async()=>FakeEventSource.last().emit('progress',{message:'Reading the board…'}));assert.match(c.textContent!,/Reading the board/);assert.ok(button(c,'Rewrite').disabled);
  await act(async()=>FakeEventSource.last().emit('failed',{message:'Try another time.'}));assert.match(c.textContent!,/Try another time/);
  await press(button(c,'Try again'));await press(button(c,'Stop'));assert.ok(server.calls.some(call=>call.path==='/jobs/job-one'&&call.method==='DELETE'));await act(async()=>FakeEventSource.last().emit('cancelled',{}));
  await press(button(c,'Rewrite'));await act(async()=>FakeEventSource.last().emit('done',{value:good,replaced:'earlier-token'}));
  assert.match(c.textContent!,/Replaced the one-pager/);await press(button(c,'Undo'));assert.ok(server.calls.some(call=>call.path==='/videos/v1/onepager/undo'));
  await press(button(c,'Rewrite'));await act(async()=>FakeEventSource.last().emit('done',{value:{...good,title:'Held title'},held:'held-token'}));
  assert.equal(latest.onepager!.title,good.title);assert.match(c.textContent!,/New one-pager ready/);await press(button(c,'Use it'));assert.ok(server.calls.some(call=>call.path==='/videos/v1/onepager/use'));
 }finally{await ui.close();server.restore();}
});

test('reopening the page follows a running onepager job and offers a recovered held result',async()=>{
 rememberAiStatus({claude:connected,codex:disconnected});FakeEventSource.install();
 const server=serve(good,{running:{onepager:'job-one'},ready:{onepager:'ready-token'}}),ui=await mountUI(createElement(Probe));
 try{assert.ok(FakeEventSource.last().url.includes('job-one'));assert.match(ui.container.textContent!,/New one-pager ready/);assert.ok(button(ui.container,'Stop'));await press(button(ui.container,'Use it'));assert.deepEqual(server.calls.find(call=>call.path==='/videos/v1/onepager/use')!.body,{token:'ready-token'});}
 finally{await ui.close();server.restore();}
});

test('a delayed job event never replaces typing that is still waiting to save',async()=>{
 rememberAiStatus({claude:connected,codex:disconnected});FakeEventSource.install();
 const server=serve(),ui=await mountUI(createElement(Probe));
 try{
  await press(button(ui.container,'Rewrite'));
  await act(async()=>latest.editOnepager({...good,title:'My words while it runs'}));
  await act(async()=>FakeEventSource.last().emit('done',{value:{...good,title:'Delayed AI words'},replaced:'earlier-token'}));
  assert.equal(latest.onepager!.title,'My words while it runs');
  await act(async()=>latest.flush());assert.equal(server.saved()!.title,'My words while it runs');
  assert.equal(latest.notices.onepager,undefined);
 }finally{await ui.close();server.restore();}
});

test('a failed hand-save keeps the draft and Try again saves it',async()=>{
 rememberAiStatus({claude:connected,codex:disconnected});let fail=true,saved:unknown;
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/plan')return {body:{package:null,outline:null,onepager:good,running:{},ready:{}}};
  if(call.path==='/videos/v1/onepager'&&call.method==='PUT'){if(fail)return {status:500,body:{error:'Disk is unavailable.'}};saved=call.body;return {body:saved};}
 });
 const ui=await mountUI(createElement(Probe));
 try{
  await edit(ui.container,'One-pager title','Keep my draft');assert.match(ui.container.textContent!,/Couldn't save/);assert.equal(latest.onepager!.title,'Keep my draft');
  fail=false;await press(button(ui.container,'Try again'));assert.equal((saved as Data).title,'Keep my draft');assert.match(ui.container.textContent!,/Saved/);
 }finally{await ui.close();server.restore();}
});
