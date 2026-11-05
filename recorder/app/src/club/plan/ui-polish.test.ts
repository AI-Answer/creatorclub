import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import fs from 'node:fs';
import {rememberAiStatus} from '../ai-status';
import {FakeEventSource,installFetch} from '../test-fakes';
import type {Video} from '../../../shared/club';
const {BoardTip}=await import('../workspace/BoardTip');
const {Companion}=await import('../workspace/Companion');
const {IdeaPage}=await import('../idea/IdeaPage');
const {usePlan}=await import('../usePlan');
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const video:Video={id:'v_polish',title:'A small useful board',stage:'planning',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
rememberAiStatus({claude:{installed:true,version:'test',signedIn:true},codex:{installed:false,version:null,signedIn:false}});
function PlanProbe(){
 const plan=usePlan(video,{onVideo(){},onRecord(){}});
 return createElement(IdeaPage,{video,plan,known:[],focusId:null,boardKey:0,navigate(){},onBoardChanged(){},onFocus(){},onTitle(){},onTarget(){},onRecordScene(){},onVideo(){}});
}
test('Plan view avoids the global page layout and does not repeat board navigation or a zero count',async()=>{
 localStorage.clear();
 const fake=installFetch(({path})=>{
  if(path.endsWith('/plan'))return {body:{package:null,outline:null,onepager:null,running:{},ready:{}}};
  if(path.endsWith('/research')||path.endsWith('/thumbnails'))return {body:[]};
  if(path==='/higgsfield/status')return {body:{signedIn:false,hint:'Sign in to Higgsfield.'}};
  if(path.endsWith('/board/files'))return {body:{folder:{path:'/tmp/cc-ui-b/club',hidden:0},notes:[]}};
  if(path==='/settings')return {body:{defaultAi:'claude',helpSeen:['board']}};
  return {body:{}};
 });
 const ui=await mountUI(createElement(PlanProbe));
 try{
  await flush();await flush();
  const root=ui.container.querySelector('.idea-page')!;
  assert.ok(root);assert.equal(root.classList.contains('page'),false,'generic page adds inset padding and clips the Idea scroll area');
  assert.equal(button(ui.container,'Script').getAttribute('aria-pressed'),'true');
  assert.equal(ui.container.querySelector('.idea-list'),null,'the script stands alone: links and notes are added on the Board');
  await act(async()=>button(ui.container,'Board').click());await flush();await flush();
  assert.equal(ui.container.querySelector('.idea-body .idea-doc'),null,'Board keeps the plan and slide on Plan');
  assert.ok(ui.container.querySelector('.idea-summary'),'Board defaults to its compact read-only Plan summary');
  assert.equal(ui.container.querySelector('.idea-summary [contenteditable]'),null);
  assert.match(ui.container.querySelector('.idea-summary')!.textContent!,/A small useful board/);
  await act(async()=>button(ui.container,'Items').click());
  assert.ok(ui.container.querySelector('.idea-list-add'),'Items shows the existing card list');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('.idea-pane-switch button')!.click());
  await act(async()=>button(ui.container,'Open the script').click());
  assert.ok(ui.container.querySelector('.idea-doc'));
 }finally{await ui.close();fake.restore();}
});
test('board help exposes each shortcut as a key and a separate readable action',async()=>{
 const ui=await mountUI(createElement(BoardTip,{onClose(){}}));
 try{
  assert.equal(ui.container.querySelectorAll('.board-help-keys kbd').length,8);
  assert.deepEqual([...ui.container.querySelectorAll('.board-help-keys kbd')].map(k=>k.textContent),['Drag on empty space','Space + drag','N','S','Shift + 1','⌘A','Delete','Esc']);
  assert.equal(ui.container.querySelectorAll('.board-help-keys dd').length,8);
 }finally{await ui.close();}
});
test('plain suggestion labels keep their skill behavior, and collapsing retains a named icon rail',async()=>{
 localStorage.clear();FakeEventSource.install();
 const fake=installFetch(({path,method,body})=>{
  if(path==='/settings')return {body:{defaultAi:'claude'}};
  if(path.endsWith('/companion')&&method==='GET')return {body:{messages:[]}};
  if(path.endsWith('/companion')&&method==='POST')return {status:202,body:{jobId:'j_polish',message:{id:'q_polish',role:'user',text:(body as {message:string}).message,context:{tab:'edit'}}}};
  return {body:{}};
 });
 const ui=await mountUI(createElement(Companion,{videoId:video.id,tab:'edit',screen:'Edit',pkg:null,outline:null,onChanged(){}}));
 try{
  await flush();await flush();
  if(ui.container.querySelector('.cmp.collapsed'))await act(async()=>ui.container.querySelector<HTMLButtonElement>('.cmp-rail')!.click());
  const suggestions=ui.container.querySelector('.cmp-sugg')!;
  assert.match(suggestions.textContent!,/Polish the whole video/);assert.doesNotMatch(suggestions.textContent!,/\/proof-edit/);
  assert.match(ui.container.querySelector('.cmp-context')!.textContent!,/^Sees: Edit/);
  await act(async()=>button(ui.container,'Polish the whole video').click());await flush();
  assert.equal((fake.calls.find(c=>c.method==='POST'&&c.path.endsWith('/companion'))!.body as {message:string}).message,'/proof-edit Polish the whole video');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Hide Ask Claude"]')!.click());await flush();
  const rail=ui.container.querySelector('.cmp-rail')!;
  assert.equal(rail.getAttribute('title'),'Ask Claude');
  assert.ok(rail.querySelector('img,svg'));assert.ok(rail.querySelector('.cmp-sr'),'the rail label is for screen readers');
 }finally{await ui.close();fake.restore();localStorage.clear();}
});
test('Package B styles use only regular, medium and semibold weights',()=>{
 for(const file of ['../idea/idea.css','../idea/onepager.css','../idea/thumbnail-studio.css','../workspace/board.css','../workspace/companion.css','../workspace/outliner.css','./plan-select.css']){
  const css=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  for(const match of css.matchAll(/font-weight:\s*(\d+)/g))assert.ok(['400','500','600'].includes(match[1]),`${file}: ${match[0]}`);
 }
});

test('small boards retain their reading scale, while large boards fit completely',async()=>{
 const {readableBoardView}=await import('./board-fit');
 assert.equal(readableBoardView({x:20,y:20,w:900,h:600},800,600).z,1);
 assert.ok(readableBoardView({x:20,y:20,w:1500,h:900},800,600).z<1);
});
