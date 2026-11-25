import {mountUI} from '../test-dom';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {VIDEO_STAGES,type Video} from '../../shared/club';
import {searchOptions} from './search';
import {applyMove} from './production';
import {OptimisticMoves} from './production/optimistic-moves';
import {Kanban} from './production/Kanban';
import {KanbanCard,coverSources} from './production/KanbanCard';
import {edgeSpeed,insertionIndex} from './production/kanban-drag';
import {laneX,layoutBoard,pause,pickUp,slotY} from './kanban-test-drag';
import type {IdeaActionSet} from './useIdeaActions';
const mk=(id:string,over:Partial<Video>={}):Video=>({id,number:12,title:'A thoughtful video',stage:'ideas',order:0,createdAt:'2026-10-01',updatedAt:'2026-10-01',stageDates:{},planning:{research:false,package:false,outline:false},...over});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('the palette shows a video by its title only, with no CC- number',()=>{
 const videos=[mk('a'),mk('b',{number:13})];
 const found=searchOptions(videos,'thoughtful').filter(option=>option.id.startsWith('video:'));assert.equal(found.length,2);for(const option of found)if(option.id.startsWith('video:'))assert.equal(option.hint,undefined,'no CC- number next to the video');
});

test('a failed optimistic save rolls back only that move and preserves a later queued gesture',async()=>{
 const initial=[mk('a'),mk('b',{number:13,order:1})];let shown=initial;
 let rejectFirst!:(reason:unknown)=>void;const firstSave=new Promise<Video>((_,reject)=>{rejectFirst=reject;});let calls=0;
 const queue=new OptimisticMoves(initial,next=>{shown=next;},async move=>{
  if(++calls===1)return firstSave;
  return applyMove(initial,move.id,move.stage,move.beforeId,move.at).find(v=>v.id===move.id)!;
 });
 const first=queue.place('a','recording',null).catch(reason=>reason);
 assert.equal(shown.find(v=>v.id==='a')!.stage,'recording','draws before server returns');
 const second=queue.place('b','editing',null);assert.equal(calls,1,'requests save in gesture order');
 rejectFirst(new Error('offline'));assert.match((await first).message,/offline/);await second;
 assert.equal(shown.find(v=>v.id==='a')!.stage,'ideas');assert.equal(shown.find(v=>v.id==='b')!.stage,'editing');assert.equal(calls,2);
});

test('keyboard arrows navigate spatially, Enter opens, command/control arrows move to adjacent stages',async()=>{
 localStorage.removeItem('cc-kanban-published-collapsed');
 const videos=[mk('a'),mk('b',{order:1}),mk('c',{stage:'planning'})],moves:unknown[]=[],opened:string[]=[];
 const ui=await mountUI(createElement(Kanban,{videos,scenes:{},ideas:{actions:{} as IdeaActionSet},onAdd:async()=>{},onOpen:v=>opened.push(v.id),onMove:(...args)=>moves.push(args)}));
 try{
  const card=(id:string)=>ui.container.querySelector<HTMLElement>(`[data-card-id="${id}"]`)!;
  const key=async(id:string,key:string,options={})=>act(async()=>{card(id).focus();card(id).dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));});
  await key('a','ArrowDown');assert.equal(document.activeElement,card('b'));
  await key('b','ArrowRight');assert.equal(document.activeElement,card('c'));
  await key('c','ArrowLeft');assert.equal(document.activeElement,card('a'));
  await key('c','Enter');assert.deepEqual(opened,['c']);
  await key('a',' ');assert.deepEqual(opened,['c','a'],'Space opens a card like Enter');
  await key('a','ArrowRight',{metaKey:true});await key('c','ArrowLeft',{ctrlKey:true});await key('a','ArrowLeft',{metaKey:true});
  assert.deepEqual(moves,[['a','planning',null],['c','ideas',null]]);
  assert.deepEqual([...ui.container.querySelectorAll('[data-column]')].map(el=>el.getAttribute('data-column')),VIDEO_STAGES);
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[aria-label="Collapse Published"]')!.click());
  assert.equal(localStorage.getItem('cc-kanban-published-collapsed'),'true');assert.ok(ui.container.querySelector('.col-collapsed'));
 }finally{await ui.close();}
 const remount=await mountUI(createElement(Kanban,{videos:[],scenes:{},ideas:{actions:{} as IdeaActionSet},onAdd:async()=>{},onOpen:()=>{},onMove:()=>{}}));
 try{assert.ok(remount.container.querySelector('.col-collapsed'));}finally{await remount.close();localStorage.removeItem('cc-kanban-published-collapsed');}
});

test('cover shows only a real picture: local thumbnail/frame, then a published video\'s own YouTube thumbnail; no picture means no cover',async()=>{
 const video=mk('a',{stage:'published',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ'});
 assert.match(coverSources(video)[0],/^\/api\/club\/videos\/a\/cover/);assert.match(coverSources(video)[1],/i.ytimg.com/);
 assert.deepEqual(coverSources(mk('b',{stage:'planning'})).length,1,'an unpublished video has no YouTube fallback');
 const props={video,scenes:[],onOpen(){},onMove(){}};
 const ui=await mountUI(createElement(KanbanCard,props));
 try{
  const img=()=>ui.container.querySelector('img'),cover=()=>ui.container.querySelector<HTMLElement>('.kcard-cover');
  const fire=async(type:string)=>{await act(async()=>img()!.dispatchEvent(new Event(type)));};
  assert.equal(img()!.getAttribute('loading'),null,'eager: a lazy image inside a hidden box never loads');assert.equal(cover()!.hidden,true,'hidden until the picture loads');
  await fire('error');
  assert.match(img()!.getAttribute('src')!,/i.ytimg.com/);await fire('load');assert.equal(cover()!.hidden,false);
  await fire('error');assert.equal(cover(),null,'no picture, no cover');
  await ui.render(createElement(KanbanCard,{...props,video:{...video,updatedAt:'2026-10-02'}}));
  assert.match(img()!.getAttribute('src')!,/\/cover/);
 }finally{await ui.close();}
});

test('insertion index: a card passes another once its middle is below that card\'s middle, and an open slot does not flip the answer',()=>{
 const tops=[0,100,200],heights=[90,90,90];
 assert.equal(insertionIndex(tops,heights,null,100,10),0);
 assert.equal(insertionIndex(tops,heights,null,100,50),1);
 assert.equal(insertionIndex(tops,heights,null,100,1000),3);
 assert.equal(insertionIndex([],[],null,100,50),0,'an empty lane takes the card first');
 // With the slot open at 1, cards from 1 down are drawn 100 px lower; the same pointer keeps the same answer.
 assert.equal(insertionIndex(tops,heights,1,100,60),1);
 assert.equal(insertionIndex(tops,heights,1,100,146),1,'past the old middle (145) but above the shifted one (245)');
 assert.equal(insertionIndex(tops,heights,1,100,246),2);
});

test('edge auto-scroll speeds up toward the edge and stops outside the zone',()=>{
 assert.equal(edgeSpeed(60,56),0);assert.equal(edgeSpeed(56,56),0);
 assert.ok(edgeSpeed(40,56)>0);assert.ok(edgeSpeed(10,56)>edgeSpeed(40,56));
 assert.equal(edgeSpeed(-20,56),18,'past the edge is full speed');
});

const board=async(onMove:(...args:unknown[])=>void,onOpen:(video:Video)=>void=()=>{})=>{
 localStorage.removeItem('cc-kanban-published-collapsed');
 const videos=[mk('a'),mk('b',{order:1}),mk('c',{stage:'planning'})];
 return mountUI(createElement(Kanban,{videos,scenes:{},ideas:{actions:{} as IdeaActionSet},onAdd:async()=>{},onOpen,onMove}));
};

test('pointer drag: a small press is still a click; Escape puts the card back; the click after a drag does not open the card',async()=>{
 const moves:unknown[][]=[],opened:string[]=[];
 const ui=await board((...args)=>moves.push(args),video=>opened.push(video.id));
 try{
  const c=ui.container,card=(id:string)=>c.querySelector<HTMLElement>(`[data-card-id="${id}"]`)!;
  layoutBoard(c);const box=card('a').getBoundingClientRect();
  await pickUp(c,card('a'),box.left+box.width/2+1,box.top+box.height/2+2,1);
  assert.equal(!!c.querySelector('.kanban-drag-overlay'),false,'2 px is not a drag');
  await act(async()=>{document.dispatchEvent(new window.PointerEvent('pointerup',{bubbles:true,pointerId:1}));card('a').click();});
  assert.deepEqual(opened,['a']);
  await pickUp(c,card('a'),laneX(c,'planning'),slotY(0));
  assert.ok(!!c.querySelector('.kanban-drag-overlay'));assert.ok(!!c.querySelector('.kanban.is-dragging'));
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
  await pause(320);
  assert.deepEqual(moves,[],'Escape cancels');assert.equal(!!c.querySelector('.kanban-drag-overlay'),false);assert.equal(!!c.querySelector('.is-dragging'),false);
  await pickUp(c,card('b'),laneX(c,'planning'),slotY(1));
  await act(async()=>{document.dispatchEvent(new window.PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:laneX(c,'planning'),clientY:slotY(1)}));card('b').click();});
  await pause(320);
  assert.deepEqual(opened,['a'],'the click that ends a drag is swallowed');
  assert.deepEqual(moves,[['b','planning',null]]);
 }finally{await ui.close();}
});

test('pointer drag with reduced motion drops at once, with no settle animation',async()=>{
 const before=window.matchMedia,moves:unknown[][]=[];
 window.matchMedia=((query:string)=>({matches:query.includes('reduce'),media:query,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
 const ui=await board((...args)=>moves.push(args));
 try{
  const c=ui.container;
  await pickUp(c,c.querySelector<HTMLElement>('[data-card-id="b"]')!,laneX(c,'ideas'),slotY(0));
  assert.ok(!!c.querySelector('.kanban.reduced-motion'),'sibling shifts are instant');
  await act(async()=>{document.dispatchEvent(new window.PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:laneX(c,'ideas'),clientY:slotY(0)}));});
  assert.deepEqual(moves,[['b','ideas','a']],'committed in the same task as the pointerup');
  assert.equal(!!c.querySelector('.kanban-drag-overlay'),false);
 }finally{await ui.close();window.matchMedia=before;}
});

test('pointer drag: a small sideways move of the first card does not swap it with the card below',async()=>{
 const moves:unknown[][]=[];
 const ui=await board((...args)=>moves.push(args));
 try{
  const c=ui.container,card=c.querySelector<HTMLElement>('[data-card-id="a"]')!;
  layoutBoard(c);const box=card.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
  await pickUp(c,card,x+6,y,3);
  assert.ok(!!c.querySelector('.kanban-drag-overlay'),'6 px is a drag');
  await act(async()=>{document.dispatchEvent(new window.PointerEvent('pointerup',{bubbles:true,pointerId:1,clientX:x+6,clientY:y}));});
  await pause(320);
  assert.deepEqual(moves,[],'the card stays where it was');
 }finally{await ui.close();}
});
