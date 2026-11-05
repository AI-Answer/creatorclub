import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../../shared/club';
import {installFetch} from '../test-fakes';
import {rememberAiStatus} from '../ai-status';
import {emptyOnePager} from '../idea/onepager';
const {Workspace}=await import('../workspace/Workspace');
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const video:Video={id:'v_r4',title:'Three notes become one video',stage:'planning',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
const logline='Make a useful video plan from three connected notes.';
const tile=(id:string)=>({id,kind:'text',title:id,text:'A useful observation.',meta:{},pos:{x:50,y:50,w:280},createdAt:''});
rememberAiStatus({claude:{installed:true,version:'test',signedIn:true},codex:{installed:false,version:null,signedIn:false}});

test('matching title and logline are shown once, while Change keeps both fields editable',async()=>{
 localStorage.clear();
 const fake=installFetch(({path})=>{
  if(path.endsWith('/plan'))return {body:{package:null,outline:null,onepager:{...emptyOnePager(),title:video.title,logline},running:{},ready:{}}};
  if(path.endsWith('/research')||path.endsWith('/thumbnails')||path.endsWith('/scenes'))return {body:[]};
  if(path.endsWith('/companion'))return {body:{messages:[]}};
  if(path==='/higgsfield/status')return {body:{signedIn:false}};
  return {body:{}};
 });
 const ui=await mountUI(createElement(Workspace,{video,tab:'idea',back:{name:'videos',view:'board'},onVideo(){},navigate(){}}));
 try{
  await flush();await flush();
  const doc=ui.container.querySelector('.idea-doc')!;
  assert.equal(doc.textContent!.split(video.title).length-1,1);
  assert.equal(doc.textContent!.split(logline).length-1,1);
  assert.match(doc.querySelector('.idea-title-source')!.textContent!,/Uses the one-pager title · Change/);
  assert.equal(doc.querySelector('[aria-label="Video title"]'),null);
  await act(async()=>button(doc.querySelector('.idea-title-source')!,'Change').click());
  assert.equal(doc.querySelector('[aria-label="Video title"]')!.textContent,video.title);
  assert.equal(document.activeElement,doc.querySelector('[aria-label="Video title"]'));
  await act(async()=>button(doc.querySelector('.idea-intro')!,'Change').click());
  assert.equal(doc.querySelector('[aria-label="What it\'s about"][role=textbox]')!.textContent,logline);
 }finally{await ui.close();fake.restore();localStorage.clear();}
});

test('Board uses Summary and board prompts even with scenes, and restores Research proof navigation',async()=>{
 localStorage.clear();localStorage.setItem('cc.companion.open','1');
 const matchMedia=window.matchMedia;Object.assign(window,{matchMedia:(media:string)=>({matches:false,media,addEventListener(){},removeEventListener(){}})});
 const routes:unknown[]=[];
 const fake=installFetch(({path})=>{
  if(path.endsWith('/plan'))return {body:{package:null,outline:{scenes:[{id:'s_r4',title:'Opening',talkingPoints:[],show:'',seconds:60}]},onepager:null,running:{},ready:{}}};
  if(path.endsWith('/research'))return {body:[tile('one'),tile('two')]};
  if(path.endsWith('/thumbnails')||path.endsWith('/scenes'))return {body:[]};
  if(path.endsWith('/companion'))return {body:{messages:[]}};
  if(path.endsWith('/board/files'))return {body:{folder:{path:'/tmp/cc-ui-b/club',hidden:0},notes:null}};
  if(path==='/settings')return {body:{defaultAi:'claude',helpSeen:['board']}};
  return {body:{}};
 });
 const ui=await mountUI(createElement(Workspace,{video,tab:'idea',back:{name:'videos',view:'board'},onVideo(){},navigate:route=>routes.push(route)}));
 try{
  await flush();await flush();
  assert.match(ui.container.querySelector('.cmp-sugg')!.textContent!,/Tighten the first scene/);
  await act(async()=>button(ui.container,'Board').click());await flush();await flush();
  assert.equal(button(ui.container,'Summary').getAttribute('aria-pressed'),'true');
  assert.match(ui.container.querySelector('.idea-summary-proof')!.textContent!,/No similar video on the board yet · Find one in Research/);
  assert.match(ui.container.querySelector('.cmp-sugg')!.textContent!,/What do these have in common\?What should this video cover\?/);
  assert.doesNotMatch(ui.container.querySelector('.cmp-sugg')!.textContent!,/scene/i);
  assert.match(ui.container.querySelector('.cmp-context')!.textContent!,/Sees: Board/);
  await act(async()=>button(ui.container.querySelector('.idea-summary')!,'Find one in Research').click());
  assert.deepEqual(routes,[{name:'discover'}]);
  await act(async()=>button(ui.container,'Open in Plan').click());await flush();
  assert.match(ui.container.querySelector('.cmp-sugg')!.textContent!,/Tighten the first scene/);
 }finally{await ui.close();fake.restore();Object.assign(window,{matchMedia});localStorage.clear();}
});
