import {mountUI,button} from '../test-dom';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import type {ThumbnailCandidate,ThumbnailRequest} from '../../shared/higgsfield';
import {FakeEventSource,installFetch} from './test-fakes';
const {ThumbnailStudio}=await import('./idea/ThumbnailStudio');
const {HiggsfieldRow}=await import('./settings/HiggsfieldRow');
const video:Video={id:'v_higgs',title:'Build with AI',stage:'ideas',order:0,createdAt:'2026-11-04',updatedAt:'2026-11-04',stageDates:{},planning:{research:false,package:false,outline:false}};
const candidate:ThumbnailCandidate={id:'h_candidate',prompt:'A robot',model:'nano_banana_pro',params:{aspect_ratio:'16:9',resolution:'1k'},file:'candidate.png',createdAt:'2026-11-04T00:00:00Z'};
const flush=(ms=0)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const textChange=async(input:HTMLInputElement|HTMLTextAreaElement,value:string)=>act(async()=>{
 const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));
});

test('studio shows a quiet setup hint without generation controls when the CLI needs sign-in',async()=>{
 const fake=installFetch(({path})=>path==='/higgsfield/status'?{body:{installed:true,signedIn:false,hint:'Run higgsfield auth login in Terminal.'}}:path.endsWith('/thumbnails')?{body:[]}:undefined);
 const ui=await mountUI(createElement(ThumbnailStudio,{video,thumbnailText:'BUILD IT'}));
 try{await flush();assert.match(ui.container.textContent!,/Sign in to Higgsfield to make thumbnails/);assert.ok(button(ui.container,'Open Settings').classList.contains('primary'));assert.doesNotMatch(ui.container.textContent!,/Run higgsfield auth login/);assert.equal(ui.container.querySelector('textarea'),null);assert.equal(fake.calls.some(c=>c.path==='/higgsfield/cost'),false);}finally{await ui.close();fake.restore();}
});
test('generation requires its current estimate, streams candidates, previews feed sizes, uses, varies, copies and removes',async()=>{
 FakeEventSource.install();localStorage.clear();let items:ThumbnailCandidate[]=[];
 const fake=installFetch(({path,method})=>{
  if(path==='/higgsfield/status')return {body:{installed:true,signedIn:true,email:'creator@example.com',credits:100}};
  if(path==='/higgsfield/soul-ids')return {body:[{id:'soul-1',name:'Creator'}]};
  if(path==='/higgsfield/cost')return {body:{credits:2}};
  if(path.endsWith('/thumbnails/generate'))return {body:{id:'j_fake',status:'running'}};
  if(path.endsWith('/thumbnails'))return {body:items};
  if(method==='DELETE'){items=[];return {body:{}};}
  return {body:{}};
 });
 const ui=await mountUI(createElement(ThumbnailStudio,{video,thumbnailText:'BUILD IT'}));
 try{
  await flush();assert.equal(button(ui.container,'Generate').disabled,true);
  await flush(550);assert.match(ui.container.textContent!,/About 2 credits/);assert.equal(button(ui.container,'Generate').disabled,false);
  await act(async()=>button(ui.container,'Generate').click());await flush();
  const call=fake.calls.find(c=>c.path.endsWith('/generate'))!;assert.equal((call.body as ThumbnailRequest).model,'nano_banana_pro');assert.match((call.body as ThumbnailRequest).prompt,/"BUILD IT"/);
  assert.ok(ui.container.querySelector('[aria-label="Making thumbnail"]'));
  items=[candidate];await act(async()=>FakeEventSource.last().emit('progress',{message:'Saved thumbnail 1 of 1.',candidate,done:1,total:1}));
  assert.equal(ui.container.querySelectorAll('.ts-candidate').length,1);assert.ok(ui.container.querySelector('img[alt="Thumbnail at phone size"]'));assert.ok(ui.container.querySelector('img[alt="Thumbnail at desktop size"]'));
  await act(async()=>FakeEventSource.last().emit('done',items));await flush();assert.equal(ui.container.querySelector('[aria-label="Making thumbnail"]'),null);
  await act(async()=>button(ui.container,'Use as thumbnail').click());await flush();assert.ok(fake.calls.some(c=>c.path.endsWith('/h_candidate/use')));
  await act(async()=>button(ui.container,'Add to board').click());await flush();assert.ok(fake.calls.some(c=>c.path.endsWith('/h_candidate/board')));
  await act(async()=>button(ui.container,'Make variations').click());await flush();assert.equal(button(ui.container,'Generate').disabled,true);
  const change=ui.container.querySelector<HTMLInputElement>('#ts-change-v_higgs')!;await textChange(change,'Make it brighter');await flush(550);
  const estimated=fake.calls.filter(c=>c.path==='/higgsfield/cost').at(-1)!.body as ThumbnailRequest;
  assert.equal(estimated.parentId,candidate.id);assert.deepEqual(estimated.references,[{kind:'candidate',id:candidate.id}]);assert.match(estimated.prompt,/Make it brighter/);
  await act(async()=>button(ui.container,'Remove').click());await flush();assert.equal(ui.container.querySelectorAll('.ts-candidate').length,0);
 }finally{await ui.close();fake.restore();}
});
test('Put me in it chooses Soul 2 and a trained face; changing the prompt invalidates an old cost',async()=>{
 FakeEventSource.install();localStorage.clear();
 const fake=installFetch(({path})=>{
  if(path==='/higgsfield/status')return {body:{installed:true,signedIn:true}};
  if(path==='/higgsfield/soul-ids')return {body:[{id:'soul-1',name:'Creator'}]};
  if(path==='/higgsfield/cost')return {body:{credits:3}};
  if(path.endsWith('/thumbnails'))return {body:[]};
 });
 const ui=await mountUI(createElement(ThumbnailStudio,{video,thumbnailText:'BUILD IT'}));
 try{
  await flush(550);const checkbox=[...ui.container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(input=>input.parentElement!.textContent!.includes('Put me in it'))!;
  await act(async()=>checkbox.click());await flush(550);
  const body=fake.calls.filter(c=>c.path==='/higgsfield/cost').at(-1)!.body as ThumbnailRequest;assert.equal(body.model,'text2image_soul_v2');assert.equal(body.soulId,'soul-1');
  assert.equal(button(ui.container,'Generate').disabled,false);await textChange(ui.container.querySelector('textarea')!,'An edited prompt');assert.equal(button(ui.container,'Generate').disabled,true);
 }finally{await ui.close();fake.restore();}
});
test('settings reports the connected email, plan and credits',async()=>{
 const fake=installFetch(()=>({body:{installed:true,signedIn:true,email:'creator@example.com',plan:'pro',credits:123}}));
 const ui=await mountUI(createElement(HiggsfieldRow));
 try{await flush();assert.match(ui.container.textContent!,/Connected as creator@example.com · pro · 123 credits/);}finally{await ui.close();fake.restore();}
});
test('returning to the studio rejoins its remembered job and exposes saved candidates after failure',async()=>{
 FakeEventSource.install();localStorage.setItem('cc.higgsfield.v_higgs','j_rejoin');let items:ThumbnailCandidate[]=[];
 const fake=installFetch(({path})=>{
  if(path==='/higgsfield/status')return {body:{installed:true,signedIn:true}};
  if(path==='/higgsfield/soul-ids')return {body:[]};
  if(path==='/higgsfield/cost')return {body:{credits:2}};
  if(path.endsWith('/thumbnails'))return {body:items};
 });
 const ui=await mountUI(createElement(ThumbnailStudio,{video,thumbnailText:'BUILD IT'}));
 try{
  await flush();assert.equal(FakeEventSource.last().url,'/api/club/jobs/j_rejoin/events');assert.equal(button(ui.container,'Generate').disabled,true);
  items=[candidate];await act(async()=>FakeEventSource.last().emit('failed',{message:'Your Higgsfield account is out of credits.'}));await flush();
  assert.match(ui.container.textContent!,/out of credits/);assert.equal(ui.container.querySelectorAll('.ts-candidate').length,1);assert.equal(localStorage.getItem('cc.higgsfield.v_higgs'),null);
 }finally{await ui.close();fake.restore();localStorage.clear();}
});
