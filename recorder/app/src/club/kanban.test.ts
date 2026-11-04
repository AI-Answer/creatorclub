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
import type {IdeaActionSet} from './production/IdeaLane';
const mk=(id:string,over:Partial<Video>={}):Video=>({id,number:12,title:'A thoughtful video',stage:'ideas',order:0,createdAt:'2026-10-01',updatedAt:'2026-10-01',stageDates:{},planning:{research:false,package:false,outline:false},...over});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('palette finds a video by its prefixed ID or bare number and shows the ID',()=>{
 const videos=[mk('a'),mk('b',{number:13})];
 for(const query of ['CC-12','cc-12','12']){const results=searchOptions(videos,query);assert.equal(results.find(option=>option.id.startsWith('video:'))?.id,'video:a');assert.equal(results.find(option=>option.id==='video:a')?.hint,'CC-12');}
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

test('cover tries the local thumbnail/frame before YouTube, then uses a tinted placeholder; errors reset for new sources',async()=>{
 const video=mk('a',{stage:'published',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ'});
 assert.match(coverSources(video)[0],/^\/api\/club\/videos\/a\/cover/);assert.match(coverSources(video)[1],/i.ytimg.com/);
 const props={video,scenes:[],dragging:false,onOpen(){},onMove(){},onDragStart(){},onDragEnd(){}};
 const ui=await mountUI(createElement(KanbanCard,props));
 try{
  const error=async()=>{await act(async()=>ui.container.querySelector('img')!.dispatchEvent(new Event('error')));};
  assert.equal(ui.container.querySelector('img')!.getAttribute('loading'),'lazy');await error();
  assert.match(ui.container.querySelector('img')!.getAttribute('src')!,/i.ytimg.com/);await error();assert.equal(ui.container.querySelector('img'),null);assert.ok(ui.container.querySelector('.kcard-placeholder'));
  await ui.render(createElement(KanbanCard,{...props,video:{...video,updatedAt:'2026-10-02'}}));
  assert.match(ui.container.querySelector('img')!.getAttribute('src')!,/\/cover/);
 }finally{await ui.close();}
});
