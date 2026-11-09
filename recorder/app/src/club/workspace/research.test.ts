import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {CHANNEL_BOARD,type BoardCanvas,type BoardFiles,type ResearchTile,type Video} from '../../../shared/club';
import {installFetch} from '../test-fakes';
import {boxOf,edgePoint,frameAround,inFrame,inRect,linkLine,rectBetween,boxAt} from './board-layout';
import {boardBase} from './board-base';
const {Board}=await import('./Board');
const {ToastProvider}=await import('../ui');

/*
 * One Board for a video and for Research: the routes it uses, the geometry of selections, lines and frames, and the canvas itself (empty state,
 * multi-select with Delete and Undo, Esc, grouping, connecting by keyboard, removing a line, and starting a video from a selection).
 */

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const at='2026-10-30T00:00:00.000Z';
const note=(id:string,text:string,x:number,y:number):ResearchTile=>({id,kind:'note',title:text,text,meta:{},createdAt:at,pos:{x,y,w:280},doc:{root:'video',path:`notes/${id}.md`,hash:`h-${id}`}});
const files:BoardFiles={folder:{path:'/Users/me/Documents/Creator Compiler/samin/research',display:'~/Documents/Creator Compiler/samin/research',hidden:0},notes:null};
const idea:Video={id:'v_idea',title:'Receipts with Claude',stage:'ideas',order:0,createdAt:at,updatedAt:at,stageDates:{},planning:{research:false,package:false,outline:false},idea:{why:'People hate receipts.'}};

function fakeServer(tiles:ResearchTile[],canvas:BoardCanvas={links:[],frames:[]}){
 return installFetch(call=>{
  if(call.path==='/channel/research'&&call.method==='GET')return {body:tiles};
  if(call.path==='/channel/board/canvas')return {body:canvas};
  if(call.path==='/channel/board/files')return {body:files};
  if(call.path==='/videos')return {body:[idea]};
  if(call.path==='/recent')return {body:[]};
  if(call.path==='/breakdowns')return {body:[]};
  if(call.path==='/channel/board/links'&&call.method==='POST'){const body=call.body as {from:string;to:string};return {status:201,body:{id:'l_new',...body}};}
  if(call.path==='/channel/board/frames'&&call.method==='POST')return {status:201,body:{id:'f_new',...(call.body as object)}};
  if(call.path.startsWith('/channel/board/')&&(call.method==='DELETE'||call.method==='PATCH'))return {status:call.method==='DELETE'?204:200,body:call.method==='PATCH'?call.body:undefined};
  if(call.path==='/channel/research/start-video')return {status:201,body:{video:{...idea,id:'v_new',title:'Started'},tiles:2}};
  if(call.path.startsWith('/channel/research/')&&call.method==='PATCH')return {body:tiles.find(tile=>call.path.endsWith(tile.id))};
  if(call.path==='/settings')return {body:{helpSeen:[]}};
  return undefined;
 });
}
const mount=(selection?:(ids:readonly string[])=>void)=>mountUI(createElement(ToastProvider,null,createElement(Board,{board:CHANNEL_BOARD,onSelection:selection})));
const key=(target:Element,name:string,init:KeyboardEventInit={})=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...init}));});
const pointer=(target:Element,type:string,init:PointerEventInit={})=>act(async()=>{target.dispatchEvent(new window.PointerEvent(type,{bubbles:true,cancelable:true,button:0,...init}));});
const toasts=(c:Element)=>[...c.ownerDocument.querySelectorAll('.cc-toast')].map(toast=>toast.textContent);

test('a Board is named by a video id or CHANNEL_BOARD, and their routes never meet',()=>{
 assert.equal(boardBase('v_1'),'/videos/v_1');
 assert.equal(boardBase('a b'),'/videos/a%20b');
 assert.equal(boardBase(CHANNEL_BOARD),'/channel');
});

test('the geometry of a Board: a dragged rectangle, a frame around cards and the cards in it, and a line drawn edge to edge',()=>{
 const tiles=[note('a','A',100,100),note('b','B',500,100),note('c','C',100,900)];
 const heights={a:200,b:240,c:180};
 assert.deepEqual(rectBetween({x:300,y:50},{x:50,y:400}),{x:50,y:50,w:250,h:350});
 assert.deepEqual(inRect({x:50,y:50,w:500,h:200},tiles,heights),['a','b'],'what the rectangle touches');
 const frame=frameAround(['a','b'].map(id=>boxOf(tiles.find(tile=>tile.id===id)!,heights)));
 assert.deepEqual(frame,{x:72,y:38,w:736,h:330});
 assert.deepEqual(inFrame(frame,tiles),['a','b'],'a frame holds the cards whose corner is inside it');
 const line=linkLine({x:0,y:0,w:100,h:100},{x:300,y:0,w:100,h:100});
 assert.deepEqual([line.from,line.to,line.mid],[{x:100,y:50},{x:300,y:50},{x:200,y:50}]);
 assert.deepEqual(edgePoint({x:0,y:0,w:100,h:100},{x:50,y:400}),{x:50,y:100});
 assert.equal(boxAt({x:120,y:150},[{id:'a',x:100,y:100,w:280,h:200},{id:'b',x:110,y:110,w:100,h:100}]),'b','the card on top');
 assert.equal(boxAt({x:5,y:5},[{id:'a',x:100,y:100,w:280,h:200}]),undefined);
});

test('an empty Research shows one sentence and the Add menu, and no Draft scenes or first-visit tip',async()=>{
 const server=fakeServer([]);
 const ui=await mount();
 try{
  await flush();await flush();
  const empty=ui.container.querySelector('.board-empty')!;
  assert.match(empty.textContent!,/Your research starts here/);assert.match(empty.textContent!,/Paste a link, drop a screenshot, or press N for a note/);
  assert.equal(empty.querySelectorAll('p').length,1);
  assert.ok(button(empty,'Add to board'),'the Add menu');
  assert.equal(ui.container.querySelector('.btoolbar')!.textContent!.includes('Add to board'),false,'one Add menu, not two');
  assert.equal(ui.container.querySelector('.board-actions'),null,'no Draft scenes, no help');
  assert.equal(document.querySelector('[role=dialog]'),null,'no tip');
  assert.ok(server.calls.some(call=>call.path==='/channel/research'),'it reads Research');
  assert.ok(!server.calls.some(call=>call.path.startsWith('/videos/')),'never a video');
 }finally{await ui.close();server.restore();}
});

test('cards are selected together: Shift-click adds, Delete removes them all with one Undo, Esc clears the selection',async()=>{
 const tiles=[note('a','Alpha',60,60),note('b','Beta',400,60),note('c','Gamma',740,60)];
 const server=fakeServer(tiles);
 const picked:string[][]=[];
 const ui=await mount(ids=>picked.push([...ids]));
 try{
  await flush();await flush();
  const tile=(id:string)=>ui.container.querySelector(`[data-tile="${id}"]`)!;
  await pointer(tile('a'),'pointerdown');await pointer(window as unknown as Element,'pointerup');
  await pointer(tile('b'),'pointerdown',{shiftKey:true});
  assert.deepEqual(picked.at(-1),['a','b']);
  assert.ok(tile('a').classList.contains('sel')&&tile('b').classList.contains('sel')&&!tile('c').classList.contains('sel'));
  const bar=ui.container.querySelector('.board-selbar')!;
  assert.match(bar.textContent!,/2 cards selected/);
  assert.ok(button(bar,'Group in a section'));assert.ok(button(bar,'Start a video from this selection'));
  for(const icon of bar.querySelectorAll('.btn.icon-only'))assert.ok(icon.getAttribute('aria-label')&&icon.hasAttribute('data-tooltip'));
  await key(tile('b'),'Escape');
  assert.deepEqual(picked.at(-1),[]);
  assert.equal(ui.container.querySelector('.board-selbar'),null);
  await pointer(tile('a'),'pointerdown');await pointer(window as unknown as Element,'pointerup');
  await pointer(tile('c'),'pointerdown',{shiftKey:true});
  await key(tile('c'),'Delete');
  assert.equal(ui.container.querySelectorAll('[data-tile]').length,1,'both go at once');
  assert.ok(toasts(ui.container).some(text=>text?.startsWith('Removed 2 cards from the board')));
  await act(async()=>button(document.body,'Undo').click());
  assert.equal(ui.container.querySelectorAll('[data-tile]').length,3,'and come back with one Undo');
  assert.equal(server.calls.filter(call=>call.method==='DELETE').length,0,'nothing was sent');
 }finally{await ui.close();server.restore();}
});

test('arrow keys move every selected card, and the place is saved a moment later',async()=>{
 const tiles=[note('a','Alpha',60,60),note('b','Beta',400,60)];
 const server=fakeServer(tiles);
 const ui=await mount();
 try{
  await flush();await flush();
  const tile=(id:string)=>ui.container.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
  await pointer(tile('a'),'pointerdown');await pointer(window as unknown as Element,'pointerup');
  await pointer(tile('b'),'pointerdown',{shiftKey:true});
  await key(tile('b'),'ArrowRight',{shiftKey:true});
  assert.deepEqual([tile('a').style.left,tile('b').style.left],['100px','440px']);
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,450));});
  assert.deepEqual(server.calls.filter(call=>call.method==='PATCH').map(call=>[call.path,call.body]),[['/channel/research/a',{pos:{x:100,y:60,w:280}}],['/channel/research/b',{pos:{x:440,y:60,w:280}}]]);
 }finally{await ui.close();server.restore();}
});

test('a connection by keyboard: C on one card, Enter on another; a line is focusable, Delete removes it with Undo',async()=>{
 const tiles=[note('a','Alpha',60,60),note('b','Beta',500,60)];
 const server=fakeServer(tiles,{links:[{id:'l_1',from:'a',to:'b',label:'because'}],frames:[]});
 const ui=await mount();
 try{
  await flush();await flush();
  const line=ui.container.querySelector('.blink')!;
  assert.match(line.getAttribute('aria-label')!,/Connection from Alpha to Beta: because/);
  assert.equal(ui.container.querySelector('.blink-label')!.textContent,'because');
  await act(async()=>(line as unknown as HTMLElement).focus());
  await key(line,'Delete');
  assert.equal(server.calls.some(call=>call.method==='DELETE'&&call.path==='/channel/board/links/l_1'),false,'delete waits for Undo');
  await flush();
  assert.equal(ui.container.querySelector('.blink'),null);
  assert.ok(toasts(ui.container).some(text=>text?.startsWith('Removed the connection')));
  await act(async()=>button(document.body,'Undo').click());await flush();
  assert.equal(server.calls.some(call=>call.method==='DELETE'&&call.path==='/channel/board/links/l_1'),false,'Undo cancels the delete');
  assert.ok(ui.container.querySelector('.blink'),'Undo restores the original connection');

  const tile=(id:string)=>ui.container.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
  await key(tile('b'),'c');
  assert.ok(tile('b').classList.contains('connect-from'));
  await key(tile('a'),'Enter');await flush();
  assert.deepEqual(server.calls.filter(call=>call.method==='POST').at(-1),{method:'POST',path:'/channel/board/links',body:{from:'b',to:'a'}});
  // The connect handle of every card is an icon button with a name and a tooltip.
  const handle=tile('a').querySelector('.connect-handle .btn')!;
  assert.equal(handle.getAttribute('aria-label'),'Connect to another card (C)');assert.ok(handle.hasAttribute('data-tooltip'));
 }finally{await ui.close();server.restore();}
});

test('Group in a section draws a frame around the selection; a frame selected offers Start a video from this section',async()=>{
 const tiles=[note('a','Alpha',60,60),note('b','Beta',400,60)];
 const server=fakeServer(tiles);
 const ui=await mount();
 try{
  await flush();await flush();
  const tile=(id:string)=>ui.container.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
  await pointer(tile('a'),'pointerdown');await pointer(window as unknown as Element,'pointerup');
  await pointer(tile('b'),'pointerdown',{shiftKey:true});
  await act(async()=>button(ui.container.querySelector('.board-selbar')!,'Group in a section').click());await flush();
  const made=server.calls.find(call=>call.path==='/channel/board/frames')!;
  assert.deepEqual(made.body,{title:'Section',x:32,y:0,w:676,h:388},'drawn around both cards, with room for its name');
  const name=ui.container.querySelector<HTMLInputElement>('.bframe-name')!;
  assert.ok(name,'its name opens to type');
  name.value='Receipts';
  await act(async()=>{name.blur();});
  assert.deepEqual(server.calls.find(call=>call.method==='PATCH'&&call.path==='/channel/board/frames/f_new')?.body,{title:'Receipts'});
  const bar=ui.container.querySelector('.board-selbar')!;
  assert.match(bar.textContent!,/Section “Receipts” · 2 cards/);
  await act(async()=>button(bar,'Start a video from this section').click());await flush();
  assert.deepEqual(server.calls.find(call=>call.path==='/channel/research/start-video')?.body,{tileIds:['a','b'],frameId:'f_new'});
  assert.ok(toasts(ui.container).some(text=>text?.startsWith('Started “Started” with 2 cards')));
 }finally{await ui.close();server.restore();}
});

test('a card for one of your ideas shows its stage and why, and opens its drawer on the Board',async()=>{
 const mine:ResearchTile={id:'m',kind:'mine',title:'Receipts with Claude',meta:{videoId:'v_idea'},createdAt:at,pos:{x:60,y:60}};
 const gone:ResearchTile={id:'g',kind:'mine',title:'Deleted one',meta:{videoId:'v_gone'},createdAt:at,pos:{x:400,y:60}};
 const server=fakeServer([mine,gone]);
 const ui=await mount();
 try{
  await flush();await flush();await flush();
  const card=ui.container.querySelector('[data-tile="m"]')!;
  assert.match(card.textContent!,/Your idea/);assert.match(card.textContent!,/People hate receipts\./);
  assert.match(ui.container.querySelector('[data-tile="g"]')!.textContent!,/no longer in this channel/);
  await act(async()=>button(card,'Open idea').click());await flush();
  assert.ok(document.querySelector('[role=dialog]')?.textContent?.includes('Receipts with Claude'),'the idea drawer');
 }finally{await ui.close();server.restore();}
});

test('Command-A selects every card; arrows from the board move them together and Escape clears',async()=>{
 const server=fakeServer([note('a','Alpha',0,60),note('b','Beta',400,60)]),ui=await mount();
 try{
  await flush();await flush();const root=ui.container.querySelector<HTMLElement>('.board-wrap')!;
  await key(root,'a',{metaKey:true});assert.equal(ui.container.querySelectorAll('.tile.sel').length,2);
  await key(root,'ArrowLeft');await flush();
  assert.equal(ui.container.querySelector<HTMLElement>('[data-tile="b"]')!.style.left,'400px','the group stops together at the left edge');
  await key(root,'ArrowRight',{shiftKey:true});await flush();
  assert.equal(ui.container.querySelector<HTMLElement>('[data-tile="a"]')!.style.left,'40px');
  assert.equal(ui.container.querySelector<HTMLElement>('[data-tile="b"]')!.style.left,'440px');
  await key(root,'Escape');assert.equal(ui.container.querySelectorAll('.tile.sel').length,0);
 }finally{await ui.close();server.restore();}
});

test('the section tool draws a persisted region on empty canvas; Escape leaves the tool',async()=>{
 const server=fakeServer([]),ui=await mount();
 try{
  await flush();await flush();const root=ui.container.querySelector<HTMLElement>('.board-wrap')!,surface=ui.container.querySelector<HTMLElement>('.canvas-scroll')!;
  await key(root,'s');assert.ok(surface.classList.contains('section-ready'));
  await pointer(surface,'pointerdown',{clientX:100,clientY:100});
  await pointer(window as unknown as Element,'pointermove',{clientX:500,clientY:400});
  await pointer(window as unknown as Element,'pointerup',{clientX:500,clientY:400});await flush();
  assert.deepEqual(server.calls.find(call=>call.path==='/channel/board/frames'&&call.method==='POST')?.body,{title:'Section',x:100,y:100,w:400,h:300});
  assert.ok(ui.container.querySelector('.bframe-name'));assert.ok(!surface.classList.contains('section-ready'));
  await key(root,'s');await key(root,'Escape');assert.ok(!surface.classList.contains('section-ready'));
 }finally{await ui.close();server.restore();}
});

test('a cancelled section gesture leaves no persisted section',async()=>{
 const server=fakeServer([]),ui=await mount();
 try{
  await flush();await flush();const root=ui.container.querySelector<HTMLElement>('.board-wrap')!,surface=ui.container.querySelector<HTMLElement>('.canvas-scroll')!;
  await key(root,'s');await pointer(surface,'pointerdown',{clientX:100,clientY:100});
  await pointer(window as unknown as Element,'pointermove',{clientX:500,clientY:400});
  await pointer(window as unknown as Element,'pointercancel',{clientX:500,clientY:400});await flush();
  assert.ok(!ui.container.querySelector('.bmarquee'));assert.ok(!server.calls.some(call=>call.method==='POST'&&call.path==='/channel/board/frames'));
 }finally{await ui.close();server.restore();}
});
