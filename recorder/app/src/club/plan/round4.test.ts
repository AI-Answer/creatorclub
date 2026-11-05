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
  // The Script view's chip says Script, so the suggestions are about the scenes.
  assert.match(ui.container.querySelector('.cmp-sugg')!.textContent!,/Tighten the first scene/);
  await act(async()=>button(ui.container,'Board').click());await flush();await flush();
  assert.equal(button(ui.container,'Summary').getAttribute('aria-pressed'),'true');
  assert.match(ui.container.querySelector('.idea-summary-proof')!.textContent!,/No similar video on the board yet · Find one in Research/);
  assert.match(ui.container.querySelector('.cmp-sugg')!.textContent!,/What do these have in common\?What should this video cover\?/);
  assert.doesNotMatch(ui.container.querySelector('.cmp-sugg')!.textContent!,/scene/i);
  assert.match(ui.container.querySelector('.cmp-context')!.textContent!,/Sees: Board/);
  await act(async()=>button(ui.container.querySelector('.idea-summary')!,'Find one in Research').click());
  assert.deepEqual(routes,[{name:'discover'}]);
  await act(async()=>button(ui.container,'Open the script').click());await flush();
  assert.match(ui.container.querySelector('.cmp-sugg')!.textContent!,/Tighten the first scene/);
 }finally{await ui.close();fake.restore();Object.assign(window,{matchMedia});localStorage.clear();}
});
