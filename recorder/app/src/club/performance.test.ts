import {mountUI} from '../test-dom';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {clubFetch} from './api';
import {visibleInterval} from './visible-interval';
import {useBoardEvents} from './workspace/useBoardFiles';
import {FakeEventSource} from './test-fakes';
import {Kanban} from './production/Kanban';
import type {Video} from '../../shared/club';
import type {IdeaActionSet} from './useIdeaActions';

test('opted-in concurrent GETs share a request; completed responses, aborted reads and writes are not shared',async()=>{
 const before=globalThis.fetch;let calls=0;
 const releases:Array<()=>void>=[];
 globalThis.fetch=async()=>{calls++;await new Promise<void>(resolve=>releases.push(resolve));return new Response('{"value":1}');};
 try{
  const a=clubFetch('/perf-read',{dedupe:true}),b=clubFetch('/perf-read',{dedupe:true});assert.equal(calls,1);
  releases.shift()!();assert.deepEqual(await Promise.all([a,b]),[{value:1},{value:1}]);
  const c=clubFetch('/perf-read',{dedupe:true}),d=clubFetch('/perf-read',{signal:new AbortController().signal});assert.equal(calls,3);
  releases.splice(0).forEach(release=>release());await Promise.all([c,d]);
  const old=clubFetch('/perf-read',{dedupe:true}),write=clubFetch('/perf-other',{method:'POST'});
  releases.pop()!();await write;
  const fresh=clubFetch('/perf-read',{dedupe:true});assert.equal(calls,6,'write invalidates concurrent reads before a refresh');
  releases.splice(0).forEach(release=>release());await Promise.all([old,fresh]);
 }finally{globalThis.fetch=before;}
});

test('failed concurrent GETs are retried',async()=>{
 const before=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('offline');};
 try{await Promise.allSettled([clubFetch('/perf-fail',{dedupe:true}),clubFetch('/perf-fail',{dedupe:true})]);assert.equal(calls,1);await assert.rejects(clubFetch('/perf-fail',{dedupe:true}));assert.equal(calls,2);}
 finally{globalThis.fetch=before;}
});

test('ordinary reads remain independent so an explicit refresh can supersede an older read',async()=>{
 const before=globalThis.fetch;let calls=0;
 const releases:Array<()=>void>=[];
 globalThis.fetch=async()=>{calls++;await new Promise<void>(resolve=>releases.push(resolve));return new Response('{}');};
 try{const reads=[clubFetch('/perf-fresh'),clubFetch('/perf-fresh')];assert.equal(calls,2);releases.forEach(release=>release());await Promise.all(reads);}
 finally{globalThis.fetch=before;}
});

test('memoized tile bodies preserve current callbacks and show changed content',async()=>{
 const {TileBody}=await import('./workspace/TileBody');
 let removed='';
 const tile={id:'memo-note',kind:'text' as const,text:'Original text',meta:{},createdAt:'2026-01-01'};
 const props={tile,videoId:'perf',onRemove(){removed='old';},onOpen(){},onRetryRead(){},onBreakdown(){}};
 const ui=await mountUI(createElement(TileBody,props));
 try{
  await ui.render(createElement(TileBody,{...props,onRemove(){removed='latest';}}));
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Remove from the board"]')!.click());
  assert.equal(removed,'latest');
  await ui.render(createElement(TileBody,{...props,tile:{...tile,text:'Changed content'}}));
  assert.match(ui.container.textContent!,/Changed content/);
 }finally{await ui.close();}
});

test('polling makes no hidden requests, refreshes on return, and cleans up',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 let hidden=false,count=0;
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 const stop=visibleInterval(()=>count++,5000,true);
 try{
  assert.equal(count,1);t.mock.timers.tick(10000);assert.equal(count,3);
  hidden=true;document.dispatchEvent(new Event('visibilitychange'));t.mock.timers.tick(60000);assert.equal(count,3);
  hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(count,4);t.mock.timers.tick(5000);assert.equal(count,5);
  stop();t.mock.timers.tick(10000);assert.equal(count,5);
 }finally{stop();delete (document as unknown as {hidden?:boolean}).hidden;}
});

test('hidden board streams close and return with one refresh, including changes missed before first open',async()=>{
 FakeEventSource.install();let hidden=false,count=0;
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 function Watch(){useBoardEvents('perf',()=>count++,0);return null;}
 const ui=await mountUI(createElement(Watch));
 try{
  const source=FakeEventSource.last();
  await act(async()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(source.closed,true);
  await act(async()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));await new Promise(resolve=>setTimeout(resolve,10));});
  assert.notEqual(FakeEventSource.last(),source);assert.equal(count,1);
 }finally{await ui.close();delete (document as unknown as {hidden?:boolean}).hidden;delete (globalThis as {EventSource?:unknown}).EventSource;}
});

test('Kanban drag state skips unchanged cards and memoized cards call the latest handlers',async()=>{
 const videos:Video[]=Array.from({length:20},(_,i)=>({id:`v${i}`,title:`Video ${i}`,stage:'ideas',order:i,createdAt:'2026-01-01',updatedAt:'2026-01-01',stageDates:{},planning:{research:false,package:false,outline:false}}));
 const original=Date.prototype.toLocaleString;let renders=0,opened='';
 Date.prototype.toLocaleString=function(){renders++;return original.call(this);};
 const props={videos,scenes:{},ideas:{actions:{} as IdeaActionSet},onAdd:async()=>{},onMove(){},onOpen(){opened='old';}};
 const ui=await mountUI(createElement(Kanban,props));
 try{
  renders=0;
  await act(async()=>{const event=new Event('dragstart',{bubbles:true});Object.defineProperty(event,'dataTransfer',{value:{setData(){}}});ui.container.querySelector('[data-card-id="v0"]')!.dispatchEvent(event);});
  assert.equal(renders,1,'only the dragged card needs new contents');
  await ui.render(createElement(Kanban,{...props,onOpen(){opened='new';}}));
  await act(async()=>ui.container.querySelector<HTMLElement>('[data-card-id="v1"]')!.click());
  assert.equal(opened,'new');
 }finally{await ui.close();Date.prototype.toLocaleString=original;}
});

test('covers defer image requests until their card is near the viewport',async()=>{
 const before=globalThis.IntersectionObserver;let notify!:IntersectionObserverCallback;
 const observed=new Set<Element>();
 class Observer {constructor(callback:IntersectionObserverCallback){notify=callback;}observe(element:Element){observed.add(element);}unobserve(element:Element){observed.delete(element);}disconnect(){observed.clear();}}
 globalThis.IntersectionObserver=Observer as unknown as typeof IntersectionObserver;
 const {KanbanCard}=await import('./production/KanbanCard');
 const video:Video={id:'deferred',title:'Offscreen',stage:'ideas',order:0,createdAt:'2026-01-01',updatedAt:'2026-01-01',stageDates:{},planning:{research:false,package:false,outline:false}};
 const ui=await mountUI(createElement(KanbanCard,{video,scenes:undefined,dragging:false,onOpen(){},onMove(){},onDragStart(){},onDragEnd(){}}));
 try{
  assert.equal(ui.container.querySelector('img'),null);assert.equal(observed.size,1);
  await act(async()=>notify([{target:[...observed][0],isIntersecting:true} as IntersectionObserverEntry],{} as IntersectionObserver));
  assert.match(ui.container.querySelector('img')!.src,/deferred\/cover/);assert.equal(observed.size,0);
 }finally{await ui.close();globalThis.IntersectionObserver=before;}
});
