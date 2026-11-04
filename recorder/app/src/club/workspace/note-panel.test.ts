import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {ResearchTile} from '../../../shared/club';
import {SAVE_WAIT_MS,conflictLine,onFileChanged,rememberHash,savedLine,type NoteView} from './note-save';
const {NotePanel}=await import('./NotePanel');
const {ToastProvider}=await import('../ui');

const view=(over:Partial<NoteView>={}):NoteView=>({text:'mine',base:'h1',mine:['h0','h1'],dirty:false,saving:false,...over});

test('a file change is ignored when it is the panel\'s own save, taken in when nothing is unsaved, and held back when there is unsaved writing',()=>{
 assert.equal(onFileChanged(view(),{text:'mine',hash:'h1'}),'ignore','the same file text');
 assert.equal(onFileChanged(view(),{text:'older',hash:'h0'}),'ignore','an older save of its own coming back late');
 assert.equal(onFileChanged(view(),{text:'mine',hash:'zzz'}),'ignore','different hash, same text');
 assert.equal(onFileChanged(view(),{text:'agent text',hash:'h9'}),'adopt');
 assert.equal(onFileChanged(view({dirty:true}),{text:'agent text',hash:'h9'}),'keep');
 assert.equal(onFileChanged(view({saving:true}),{text:'agent text',hash:'h9'}),'keep');
 assert.equal(onFileChanged(view(),{text:'x',hash:undefined}),'ignore','a file with no hash (missing) is not taken in');
 assert.deepEqual(rememberHash(['a','b'],'c'),['a','b','c']);
 assert.deepEqual(rememberHash(['a','b'],'a'),['b','a']);
 assert.equal(rememberHash(Array.from({length:20},(_,i)=>String(i)),'new').length,8);
 assert.equal(savedLine('saved'),'Saved');assert.equal(savedLine('failed'),"Couldn't save");
 assert.match(conflictLine('notes/a (other version).md'),/Your version is saved, and the other one is kept as notes\/a \(other version\)\.md\./);
});

const tile=(text:string,hash='h1'):ResearchTile=>({id:'t1',kind:'note',title:'Plan',text,meta:{},createdAt:'2026-10-01T00:00:00.000Z',doc:{root:'video',path:'notes/plan.md',hash}});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const wait=(ms:number)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
const edit=(container:Element,text:string)=>act(async()=>{const page=container.ownerDocument.querySelector('.cc-outliner [contenteditable=true]')!;page.textContent=text;page.dispatchEvent(new Event('input',{bubbles:true}));});

test('writing in a note is saved a moment after you stop, with the hash it started from; closing saves what is waiting',async()=>{
 const saves:{text:string;base?:string}[]=[];
 let hash=1;
 const save=async(text:string,base?:string)=>{saves.push({text,base});hash++;return {tile:tile(text,`h${hash}`)};};
 const closed:boolean[]=[];
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NotePanel,{tile:tile('Plan'),save,onClose:(discard:boolean)=>closed.push(discard),onCopyPath:()=>{}})));
 try{
  await flush();
  const dialog=document.querySelector('[role=dialog]')!;
  assert.equal(dialog.getAttribute('aria-label'),'Note: Plan');
  assert.match(dialog.textContent!,/notes\/plan\.md/);
  assert.equal(document.querySelector('[role=status]')!.textContent,'Saved');
  await edit(ui.container,'Plan, one');await edit(ui.container,'Plan, one two');
  assert.equal(document.querySelector('[role=status]')!.textContent,'Unsaved');
  assert.equal(saves.length,0,'not while writing');
  await wait(SAVE_WAIT_MS+150);
  assert.deepEqual(saves,[{text:'Plan, one two',base:'h1'}],'one save, with the hash the text came from');
  assert.equal(document.querySelector('[role=status]')!.textContent,'Saved');
  await edit(ui.container,'Plan, three');
  await wait(SAVE_WAIT_MS+150);
  assert.equal(saves[1].base,'h2','the next save starts from the last saved text');
  // Leaving at once saves what is waiting, then closes.
  await edit(ui.container,'Plan, four');
  await act(async()=>{document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();});
  await flush();
  assert.equal(saves.at(-1)!.text,'Plan, four');
  assert.deepEqual(closed,[false]);
 }finally{await ui.close();}
});

test('a failed save keeps the writing, says so with Try again, and does not close; a note made just now and left empty asks to be discarded',async()=>{
 let fail=true;const saves:string[]=[];
 const save=async(text:string)=>{saves.push(text);if(fail)throw new Error('raw failure');return {tile:tile(text,'h2')};};
 const closed:boolean[]=[];
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NotePanel,{tile:tile(''),save,isNew:true,onClose:(discard:boolean)=>closed.push(discard),onCopyPath:()=>{}})));
 try{
  await flush();
  // Closing with nothing written: no save, and the Board is told to drop the new card.
  await act(async()=>{document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();});await flush();
  assert.deepEqual([saves.length,closed],[0,[true]]);
  await edit(ui.container,'precious words');
  await wait(SAVE_WAIT_MS+150);
  assert.equal(document.querySelector('[role=status]')!.textContent,"Couldn't save");
  const notice=document.querySelector('.md-notice.failed')!;
  assert.match(notice.textContent!,/Couldn't save this note\./);assert.doesNotMatch(notice.textContent!,/raw failure/,'raw errors never show');
  await act(async()=>{document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();});await flush();
  assert.deepEqual(closed,[true],'a note that could not be saved stays open');
  fail=false;
  await act(async()=>{[...notice.querySelectorAll('button')].find(button=>button.textContent==='Try again')!.click();});await flush();
  assert.equal(saves.at(-1),'precious words');
  assert.equal(document.querySelector('[role=status]')!.textContent,'Saved');
  assert.equal(document.querySelector('.md-notice'),null);
 }finally{await ui.close();}
});

test('a note changed in its file while it was written says so, and says where the other version is kept',async()=>{
 const save=async(text:string)=>({tile:tile(text,'h2'),conflict:{copy:'notes/plan (other version).md'}});
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NotePanel,{tile:tile('Plan'),save,onClose:()=>{},onCopyPath:()=>{}})));
 try{
  await flush();
  await edit(ui.container,'Plan, edited');
  await wait(SAVE_WAIT_MS+150);
  const notice=document.querySelector('.md-notice.conflict')!;
  assert.equal(notice.textContent,conflictLine('notes/plan (other version).md'));
  assert.ok(document.querySelector('.cc-toast')?.textContent?.includes('kept'),'and a toast says it too');
 }finally{await ui.close();}
});

test('the file changed by something else is taken into a note nobody is writing in, and kept out of one being written in',async()=>{
 const save=async(text:string)=>({tile:tile(text,'hs')});
 const make=(t:ResearchTile)=>createElement(ToastProvider,null,createElement(NotePanel,{tile:t,save,onClose:()=>{},onCopyPath:()=>{}}));
 const ui=await mountUI(make(tile('Plan')));
 try{
  await flush();
  await ui.render(make(tile('Plan and an agent line','h-agent')));
  await flush();
  assert.match(document.querySelector('.cc-outliner')!.textContent!,/an agent line/,'taken in');
  assert.match(document.querySelector('.md-notice')!.textContent!,/changed in its file/);
  await edit(ui.container,'my own writing');
  await ui.render(make(tile('Agent again','h-agent-2')));await flush();
  assert.match(document.querySelector('.cc-outliner')!.textContent!,/my own writing/,'unsaved writing is not overwritten');
  await wait(SAVE_WAIT_MS+150);
 }finally{await ui.close();}
});

test('a note whose file is missing or too large says so instead of showing an editor',async()=>{
 const missing={...tile(''),doc:{root:'video' as const,path:'notes/gone.md',missing:true}};
 const ui=await mountUI(createElement(ToastProvider,null,createElement(NotePanel,{tile:missing,save:async()=>({tile:missing}),onClose:()=>{},onCopyPath:()=>{}})));
 try{
  await flush();
  assert.equal(document.querySelector('.cc-outliner'),null);
  assert.match(document.querySelector('[role=dialog]')!.textContent!,/not in its folder any more/);
  await ui.render(createElement(ToastProvider,null,createElement(NotePanel,{tile:{...missing,doc:{root:'video',path:'notes/big.md',tooLarge:true}},save:async()=>({tile:missing}),onClose:()=>{},onCopyPath:()=>{}})));
  assert.match(document.querySelector('[role=dialog]')!.textContent!,/over 1 MB/);
 }finally{await ui.close();}
});
