import {mountUI} from '../test-dom';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,Profiler} from 'react';
import {clubFetch} from './api';
import {visibleInterval} from './visible-interval';
import {useBoardEvents} from './workspace/useBoardFiles';
import {FakeEventSource} from './test-fakes';
import {Kanban} from './production/Kanban';
import {laneX,letGo,pickUp,slotY,END_Y} from './kanban-test-drag';
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

test('Kanban drag: no React render while the card follows the pointer, one commit on drop, and memoized cards call the latest handlers',async()=>{
 // Five lanes of twenty cards. A card's render calls toLocaleString once, so counting calls counts card renders.
 const stages=['ideas','planning','recording','editing','publishing'] as const;
 const videos:Video[]=stages.flatMap(stage=>Array.from({length:20},(_,i)=>({id:`${stage}${i}`,title:`Video ${i}`,stage,order:i,createdAt:'2026-01-01',updatedAt:'2026-01-01',stageDates:{},planning:{research:false,package:false,outline:false}})));
 const original=Date.prototype.toLocaleString;let renders=0,commits=0,opened='';const moves:unknown[][]=[];
 Date.prototype.toLocaleString=function(){renders++;return original.call(this);};
 const props={videos,scenes:{},ideas:{actions:{} as IdeaActionSet},onAdd:async()=>{},onMove(...args:unknown[]){moves.push(args);},onOpen(){opened='old';}};
 const tree=(extra:Partial<typeof props>={})=>createElement(Profiler,{id:'kanban',onRender:()=>{commits++;}},createElement(Kanban,{...props,...extra}));
 const ui=await mountUI(tree());
 try{
  const c=ui.container,source=()=>c.querySelector<HTMLElement>('[data-card-id="ideas0"]')!;
  renders=0;commits=0;
  // Pick up the first idea and sweep it across every lane and down each one: 60 pointer moves.
  await pickUp(c,source(),laneX(c,'ideas'),slotY(3),20);
  for(const stage of ['planning','recording','editing']){
   for(const y of [slotY(0),slotY(5),END_Y])await act(async()=>{document.dispatchEvent(new window.PointerEvent('pointermove',{bubbles:true,clientX:laneX(c,stage),clientY:y,pointerId:1,buttons:1}));});
  }
  await act(async()=>{document.dispatchEvent(new window.PointerEvent('pointermove',{bubbles:true,clientX:laneX(c,'planning'),clientY:slotY(2),pointerId:1,buttons:1}));});
  assert.equal(commits,0,'moving a card never renders the board');
  assert.equal(renders,0,'or any card');
  assert.ok(!!c.querySelector('.kanban-drag-overlay'),'a copy of the card follows the pointer');
  assert.equal(c.querySelector('[data-column="planning"] [data-drop-line]')?.getAttribute('data-before-id'),'planning2');
  const shifted=[...c.querySelectorAll<HTMLElement>('[data-column="planning"] [data-slot]')].map(slot=>slot.style.transform);
  assert.deepEqual(shifted.slice(0,3),['','','translate3d(0,100px,0)'],'cards from the gap down slide aside with a transform');
  const ideas=[...c.querySelectorAll<HTMLElement>('[data-column="ideas"] [data-slot]')].slice(1,3).map(slot=>slot.style.transform);
  assert.deepEqual(ideas,['translate3d(0,-100px,0)','translate3d(0,-100px,0)'],'the lane it left closes up');
  await letGo(laneX(c,'planning'),slotY(2));
  assert.deepEqual(moves,[['ideas0','planning','planning2']]);
  assert.ok(commits<=1,`one commit for the drop, got ${commits}`);assert.equal(renders,0,'the drop renders no card either (the parent owns the new order)');
  assert.equal(!!c.querySelector('.kanban-drag-overlay'),false);assert.equal(!!c.querySelector('[data-drop-line]'),false);
  assert.equal(c.querySelectorAll('[data-slot][style*="translate"]').length,0,'every card is back at rest');
  await ui.render(tree({onOpen(){opened='new';}}));
  await act(async()=>c.querySelector<HTMLElement>('[data-card-id="ideas1"]')!.click());
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
 const ui=await mountUI(createElement(KanbanCard,{video,scenes:undefined,onOpen(){},onMove(){}}));
 try{
  assert.equal(ui.container.querySelector('img'),null);assert.equal(observed.size,1);
  await act(async()=>notify([{target:[...observed][0],isIntersecting:true} as IntersectionObserverEntry],{} as IntersectionObserver));
  assert.match(ui.container.querySelector('img')!.src,/deferred\/cover/);assert.equal(observed.size,0);
 }finally{await ui.close();globalThis.IntersectionObserver=before;}
});
