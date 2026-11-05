import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Outline,Package,Video} from '../../../shared/club';
import {rememberAiStatus} from '../ai-status';
import {installFetch} from '../test-fakes';
import {emptyOnePager} from '../idea/onepager';
const {Workspace}=await import('../workspace/Workspace');
const {Companion}=await import('../workspace/Companion');
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const video:Video={id:'v_r3',title:'One useful idea',stage:'planning',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
const pkg:Package={angle:'A useful idea',twist:'Try it with three notes',titles:[video.title,'A second title','A third title'],thumbnailText:'THREE NOTES',hook:{spoken:'Here is what we made.',visual:'The finished result',text:'One clear plan'}};
rememberAiStatus({claude:{installed:true,version:'test',signedIn:true},codex:{installed:false,version:null,signedIn:false}});

test('Continue to recording follows scene count across themes, scrolling, Board, and open or collapsed Claude',async()=>{
 localStorage.clear();const matchMedia=window.matchMedia;
 Object.assign(window,{matchMedia:(media:string)=>({matches:false,media,addEventListener(){},removeEventListener(){}})});
 let outline:Outline|null=null;
 const fake=installFetch(({path,method,body})=>{
  if(path.endsWith('/plan'))return {body:{package:pkg,outline,onepager:null,running:{},ready:{}}};
  if(path.endsWith('/outline')&&method==='PUT'){outline=body as Outline;return {body:outline};}
  if(path.endsWith('/scenes')||path.endsWith('/research')||path.endsWith('/thumbnails'))return {body:[]};
  if(path.endsWith('/companion'))return {body:{messages:[]}};
  if(path.endsWith('/board/files'))return {body:{folder:{path:'/tmp/cc-ui-b/club',hidden:0},notes:null}};
  if(path==='/settings')return {body:{defaultAi:'claude',helpSeen:['board']}};
  if(path==='/higgsfield/status')return {body:{signedIn:false}};
  return {body:{}};
 });
 const ui=await mountUI(createElement(Workspace,{video,tab:'idea',back:{name:'videos',view:'board'},onVideo(){},navigate(){}}));
 try{
  await flush();await flush();
  const check=(solid:boolean)=>assert.equal(button(ui.container,'Continue to recording').classList.contains('primary'),solid);
  const checkViews=async(solid:boolean)=>{
   for(const theme of ['light','dark']){
    ui.container.setAttribute('data-theme',theme);check(solid);
    await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Hide Ask Claude"]')!.click());check(solid);
    await act(async()=>ui.container.querySelector<HTMLButtonElement>('.cmp-rail')!.click());check(solid);
    await act(async()=>{const scroller=ui.container.querySelector<HTMLElement>('.idea-doc')!;scroller.scrollTop=500;scroller.dispatchEvent(new Event('scroll',{bubbles:true}));});check(solid);
    assert.ok(ui.container.querySelector('.idea-top-scrolled'));
    await act(async()=>button(ui.container,'Board').click());await flush();check(solid);
    await act(async()=>ui.container.querySelector<HTMLButtonElement>('.idea-views button')!.click());check(solid);
   }
  };
  await checkViews(false);
  assert.match(ui.container.querySelector('[data-part=scenes]')!.textContent!,/Start writing your amazing video\.\.\./,'Borumi\'s empty Script step');
  assert.ok(button(ui.container.querySelector('[data-part=scenes]')!,'Write the scenes with Claude'));
  const area=ui.container.querySelector<HTMLTextAreaElement>('.bs-empty-input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,'H');area.dispatchEvent(new Event('input',{bubbles:true}));});await flush();
  assert.equal(ui.container.querySelectorAll('.bs-row').length,1,'the first keystroke makes the first scene');
  await checkViews(true);
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent?.includes('Fill the empty parts')),false,'a completed package and scene list have no empty parts to fill');
 }finally{await ui.close();fake.restore();Object.assign(window,{matchMedia});localStorage.clear();}
});

test('Claude automatically yields below 1200px and can be reopened from its named rail',async()=>{
 localStorage.setItem('cc.companion.open','1');const matchMedia=window.matchMedia;
 let narrow=false;const listeners=new Set<()=>void>();
 Object.assign(window,{matchMedia:(media:string)=>({get matches(){return narrow;},media,addEventListener(_type:string,fn:()=>void){listeners.add(fn);},removeEventListener(_type:string,fn:()=>void){listeners.delete(fn);}})});
 const fake=installFetch(({path})=>path.endsWith('/companion')?{body:{messages:[]}}:{body:{defaultAi:'claude'}});
 const ui=await mountUI(createElement(Companion,{videoId:video.id,tab:'idea',screen:'Idea',pkg:null,outline:null,onChanged(){}}));
 try{
  await flush();assert.ok(ui.container.querySelector('textarea'));
  await act(async()=>{narrow=true;listeners.forEach(fn=>fn());});
  assert.equal(ui.container.querySelector('textarea'),null);
  assert.equal(ui.container.querySelector('.cmp-rail')!.getAttribute('title'),'Ask Claude');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('.cmp-rail')!.click());
  assert.ok(ui.container.querySelector('textarea'));
  await act(async()=>{narrow=false;listeners.forEach(fn=>fn());});
  await act(async()=>{narrow=true;listeners.forEach(fn=>fn());});
  assert.equal(ui.container.querySelector('textarea'),null,'entering the narrow window again collapses the panel');
 }finally{await ui.close();fake.restore();Object.assign(window,{matchMedia});localStorage.clear();}
});

test('Items and the canvas select the same card, including a request made before board data loads',async()=>{
 localStorage.clear();
 const tile={id:'t_r3',kind:'text',title:'A connected idea',text:'The detail behind the idea.',meta:{},pos:{x:50,y:50,w:280},createdAt:''};
 const fake=installFetch(({path})=>{
  if(path.endsWith('/plan'))return {body:{package:pkg,outline:null,onepager:null,running:{},ready:{}}};
  if(path.endsWith('/research'))return {body:[tile]};
  if(path.endsWith('/scenes')||path.endsWith('/thumbnails'))return {body:[]};
  if(path.endsWith('/companion'))return {body:{messages:[]}};
  if(path.endsWith('/board/files'))return {body:{folder:{path:'/tmp/cc-ui-b/club',hidden:0},notes:null}};
  if(path==='/settings')return {body:{defaultAi:'claude',helpSeen:['board']}};
  return {body:{}};
 });
 const ui=await mountUI(createElement(Workspace,{video,tab:'idea',back:{name:'videos',view:'board'},onVideo(){},navigate(){}}));
 try{
  await flush();await flush();
  await act(async()=>button(ui.container,'Board').click());await flush();await flush();
  await act(async()=>button(ui.container,'Items · 1').click());
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('.idea-list-card')!.click());await flush();await flush();
  assert.ok(ui.container.querySelector('[data-tile=t_r3]')!.classList.contains('sel'),'choosing an item selects its card on the canvas');
  await act(async()=>button(ui.container,'Items · 1').click());
  const list=ui.container.querySelector<HTMLButtonElement>('.idea-list-card')!;
  const card=ui.container.querySelector<HTMLElement>('[data-tile=t_r3]')!;
  assert.equal(list.getAttribute('aria-pressed'),'true');
  await act(async()=>list.click());await flush();
  assert.equal(list.getAttribute('aria-pressed'),'true');assert.ok(card.classList.contains('sel'));
  await act(async()=>{card.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});await flush();
  assert.equal(list.getAttribute('aria-pressed'),'false');
  await act(async()=>card.dispatchEvent(new Event('focusin',{bubbles:true})));await flush();
  assert.equal(list.getAttribute('aria-pressed'),'true');assert.ok(card.classList.contains('sel'));
 }finally{await ui.close();fake.restore();localStorage.clear();}
});
