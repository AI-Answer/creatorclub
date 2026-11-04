import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {BoardFiles,ResearchTile,Video} from '../../../shared/club';
import {FakeEventSource,installFetch} from '../test-fakes';
import {folderLabel,importMessage,isDocFile,mergeTiles,noteTitle} from './board-files';
const {Board}=await import('./Board');
const {ToastProvider}=await import('../ui');

const video:Video={id:'v1',title:'Hidden features',stage:'ideas',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false}};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const note=(id:string,text:string,path:string,extra:Partial<ResearchTile>={}):ResearchTile=>({id,kind:'note',title:text.split('\n')[0].replace(/^#+\s*/,''),text,meta:{},createdAt:'2026-10-01T00:00:00.000Z',pos:{x:60,y:60,w:280},doc:{root:'video',path,hash:`h-${id}`},...extra});
const files:BoardFiles={folder:{path:'/Users/me/Documents/Creator Compiler/samin/videos/hidden-features',display:'~/Documents/Creator Compiler/samin/videos/hidden-features',hidden:0},notes:null};

function board(tiles:ResearchTile[],extra:(call:{method:string;path:string;body:unknown})=>{status?:number;body?:unknown}|undefined=()=>undefined){
 return installFetch(call=>{
  const custom=extra(call);if(custom)return custom;
  if(call.path==='/videos/v1/research'&&call.method==='GET')return {body:tiles};
  if(call.path==='/settings')return {body:{helpSeen:['board']}};
  if(call.path==='/videos/v1/board/files')return {body:files};
  if(call.path==='/videos')return {body:[]};
  return undefined;
 });
}
const mount=()=>mountUI(createElement(ToastProvider,null,createElement(Board,{video})));

test('the pure helpers: titles, file kinds, the import message, the folder line, and a refresh that keeps places waiting to be saved',()=>{
 assert.equal(noteTitle(note('a','# Hooks\n\nbody','notes/hooks.md')),'Hooks');
 assert.equal(noteTitle({...note('a','','notes/hooks.md'),title:''}),'hooks.md');
 assert.ok(isDocFile({name:'A.MD'})&&isDocFile({name:'x.txt'})&&isDocFile({name:'x.markdown'})&&!isDocFile({name:'x.pdf'})&&!isDocFile({name:'md'}));
 assert.equal(importMessage(1,[]),'Added the note to the board');
 assert.equal(importMessage(3,[]),'Added 3 notes to the board');
 assert.equal(importMessage(2,[{name:'a.pdf',reason:'Only Markdown and text files can be dropped here.'}]),'Added 2 notes to the board. a.pdf: Only Markdown and text files can be dropped here.');
 assert.equal(importMessage(0,[{name:'a.pdf',reason:'Nope.'}]),'a.pdf: Nope.');
 assert.equal(importMessage(1,[{name:'a',reason:'x'},{name:'b',reason:'y'}]),'Added the note to the board. 2 files were left out.');
 assert.equal(folderLabel({display:'~/a/b'}),'~/a/b');
 assert.equal(folderLabel({display:'~/Documents/Creator Compiler/samin/videos/hidden-features'}),'…/samin/videos/hidden-features');
 const merged=mergeTiles([note('a','x','n/a.md'),note('b','y','n/b.md')],new Map([['a',{x:900,y:800}]]));
 assert.deepEqual([merged[0].pos,merged[1].pos],[{x:900,y:800,w:280},{x:60,y:60,w:280}]);
});

test('an empty board explains itself at full size with the one Add menu for every kind of tile; each icon-only button has a name and a tooltip',async()=>{
 const server=board([]);
 const ui=await mount();
 try{
  await flush();await flush();
  const toolbar=ui.container.querySelector('.btoolbar')!;
  // While the board is empty, Add lives in the empty state (outside the zoomed canvas), not twice.
  assert.deepEqual([...toolbar.querySelectorAll('button')].map(item=>item.getAttribute('aria-label')||item.textContent?.trim()),['Zoom out','Zoom in','Fit the whole board']);
  const empty=ui.container.querySelector('.board-empty')!;
  assert.match(empty.textContent!,/This video's board/);assert.equal(empty.closest('.canvas'),null,'not scaled with the canvas');
  await act(async()=>button(empty,'Add to board').click());
  const items=[...document.querySelectorAll('[role=menuitem]')].map(item=>item.textContent);
  assert.deepEqual(items,['Note','Link','Image or Markdown file','Notes folder']);
  for(const icon of ui.container.querySelectorAll('.btn.icon-only')){
   assert.ok(icon.getAttribute('aria-label'),'a name');assert.ok(icon.hasAttribute('data-tooltip'),'an IconButton: its tooltip shows the same name');
  }
  assert.equal(server.calls.filter(call=>call.method==='POST').length,0);
 }finally{await ui.close();}
});

test('Add, Note puts a sticky note on the board to type in right away; left empty, it goes again',async()=>{
 let made=false,removed=false;
 const created=note('t9','','notes/note.md',{title:'note.md',text:''});
 const server=board([],call=>{
  if(call.method==='POST'&&call.path==='/videos/v1/research'){made=true;return {status:201,body:created};}
  if(call.method==='DELETE'&&call.path==='/videos/v1/research/t9'){removed=true;return {status:204};}
  if(call.path==='/videos/v1/research'&&call.method==='GET')return {body:made&&!removed?[created]:[]};
  return undefined;
 });
 const ui=await mount();
 try{
  await flush();await flush();
  await act(async()=>button(ui.container.querySelector('.board-empty')!,'Add to board').click());
  await act(async()=>(document.querySelector('[role=menuitem]') as HTMLButtonElement).click());
  await flush();await flush();
  assert.deepEqual(server.calls.find(call=>call.method==='POST')?.body,{kind:'note',text:''});
  const area=ui.container.querySelector<HTMLElement>('.tile.note [contenteditable=true]')!;
  assert.ok(area,'the note is on the board, ready to type in');
  assert.equal(document.activeElement,area,'and has the cursor');
  assert.equal(document.querySelector('[role=dialog]'),null,'no panel is needed to write');
  await act(async()=>{area.blur();});await flush();await flush();
  assert.equal(removed,true,'a note left empty is taken off the board');
 }finally{await ui.close();}
});

test('a note card is a sticky note holding its text, opens the full editor from its button, and a missing file says so',async()=>{
 const tiles=[note('t1','# Hooks\n\n- one\n- [x] two','notes/hooks.md'),note('t2','','gone.md',{doc:{root:'video',path:'gone.md',missing:true}}),note('t3','# From the vault','idea.md',{doc:{root:'folder',path:'idea.md',hash:'hv'}})];
 board(tiles);
 const ui=await mount();
 try{
  await flush();await flush();
  const cards=[...ui.container.querySelectorAll('.tile.note')];
  assert.equal(cards.length,3);
  assert.equal(cards[0].querySelector('.outliner-title')?.textContent,'Hooks');
  assert.equal(cards[0].querySelectorAll('.outliner-bullet').length,2);
  assert.match(cards[1].textContent!,/not in its folder any more/);
  assert.match(cards[2].textContent!,/Note from your Notes folder/);
  assert.ok(cards.every(card=>card.querySelector('[aria-label="Remove from the board"]')?.hasAttribute('data-tooltip')),'named, with a tooltip');
  await act(async()=>cards[0].querySelector<HTMLElement>('button[aria-label="Open in the full editor"]')!.click());await flush();
  assert.equal(document.querySelector('[role=dialog]')?.getAttribute('aria-label'),'Note: Hooks');
  assert.equal(document.querySelector('.cc-outliner h1')?.textContent,'Hooks');
 }finally{await ui.close();}
});

test('the video\'s folder opens in Finder from the board; its path is never shown as text',async()=>{
 board([]);
 const revealed:string[]=[];
 (window as unknown as {sceneForge?:unknown}).sceneForge={reveal:async(path:string)=>{revealed.push(path);}};
 const ui=await mount();
 try{
  await flush();await flush();
  const button=ui.container.querySelector<HTMLButtonElement>('button.board-folder')!;
  assert.equal(button.textContent,'Show files in Finder');
  await act(async()=>button.click());await flush();
  assert.deepEqual(revealed,[files.folder.path]);
 }finally{await ui.close();delete (window as unknown as {sceneForge?:unknown}).sceneForge;}
});

test('dropping files on the board: Markdown and text become notes, the rest is named and left out',async()=>{
 const dropped:ResearchTile=note('t5','# Dropped','notes/dropped.md');
 let importCalls=0;
 board([],call=>{
  if(call.method==='POST'&&call.path==='/videos/v1/board/import'){importCalls++;return {status:201,body:{tiles:[dropped],skipped:[]}};}
  return undefined;
 });
 const ui=await mount();
 try{
  await flush();await flush();
  const drop=(...names:string[])=>act(async()=>{
   const wrap=ui.container.querySelector('.board-wrap')!;
   const event=new Event('drop',{bubbles:true,cancelable:true}) as Event&{dataTransfer:unknown};
   const list=names.map(name=>new File(['x'],name));
   event.dataTransfer={files:list,getData:()=>''};
   wrap.dispatchEvent(event);
  });
  await drop('Dropped.md');await flush();await flush();
  assert.equal(importCalls,1,'the file was sent');
  assert.ok([...ui.container.querySelectorAll('.tile.note')].some(card=>card.textContent?.includes('Dropped')),'and its card shows');
  assert.match(document.querySelector('.cc-toast')!.textContent!,/Added the note to the board/);
  await drop('report.pdf');await flush();
  assert.equal(importCalls,1,'a PDF is not sent');
  assert.ok([...document.querySelectorAll('.cc-toast')].some(toast=>toast.textContent==='Drop an image, a Markdown file, or paste a link.'));
  await drop('Second.md','report.pdf');await flush();await flush();
  assert.equal(importCalls,2,'only the Markdown file is sent');
  assert.ok([...document.querySelectorAll('.cc-toast')].some(toast=>/Added the note to the board\. report\.pdf: Only Markdown and text files/.test(toast.textContent??'')));
 }finally{await ui.close();}
});

test('the Notes folder: the dialog lists its files, pins one to the board, and says why a folder was refused',async()=>{
 let folder:BoardFiles['notes']=null;
 const listing=():BoardFiles=>({...files,notes:folder});
 const pinned=note('t7','# Vault idea','idea.md',{doc:{root:'folder',path:'idea.md',hash:'hv'}});
 const server=board([],call=>{
  if(call.path==='/videos/v1/board/files')return {body:listing()};
  if(call.method==='PUT'&&call.path==='/board/notes-folder'){
   const path=(call.body as {path:string|null}).path;
   if(path==='/nope')return {status:400,body:{error:"That folder doesn't exist on this computer."}};
   folder=path?{path,display:path,files:[{path:'idea.md',title:'Vault idea',bytes:20,modified:'2026-10-29T10:00:00.000Z',pinned:false}]}:null;
   return {body:{path}};
  }
  if(call.method==='POST'&&call.path==='/videos/v1/board/pin')return {status:201,body:pinned};
  return undefined;
 });
 const ui=await mount();
 try{
  await flush();await flush();
  await act(async()=>button(ui.container.querySelector('.board-empty')!,'Add to board').click());
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(item=>item.textContent==='Notes folder')!.click());
  await flush();
  const dialog=document.querySelector('[role=dialog]')!;
  assert.equal(dialog.getAttribute('aria-labelledby')!==null,true);
  const input=dialog.querySelector<HTMLInputElement>('[aria-label="Folder path"]')!;
  const write=(value:string)=>act(async()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  await write('/nope');
  await act(async()=>button(dialog,'Use folder').click());await flush();
  assert.equal(dialog.querySelector('[role=alert]')?.textContent,"That folder doesn't exist on this computer.");
  await write('/Users/me/vault');
  await act(async()=>button(dialog,'Use folder').click());await flush();await flush();
  assert.deepEqual(server.calls.filter(call=>call.method==='PUT').map(call=>call.body),[{path:'/nope'},{path:'/Users/me/vault'}]);
  const row=dialog.querySelector('.notes-list li')!;
  assert.match(row.textContent!,/Vault idea/);
  await act(async()=>button(row,'Pin').click());await flush();await flush();
  assert.deepEqual(server.calls.find(call=>call.path==='/videos/v1/board/pin')?.body,{path:'idea.md'});
  assert.ok([...ui.container.querySelectorAll('.tile.note')].some(card=>card.textContent?.includes('Vault idea')),'the pinned file is a card');
 }finally{await ui.close();}
});

test('the board reads itself again when the server says a file changed, keeping a card that is being moved where it is',async()=>{
 FakeEventSource.install();
 let listed=[note('t1','# One','notes/one.md')];
 board([],call=>call.path==='/videos/v1/research'&&call.method==='GET'?{body:listed}:undefined);
 const ui=await mount();
 try{
  await flush();await flush();
  const source=FakeEventSource.all.find(item=>item.url==='/api/club/videos/v1/board/events')!;
  assert.ok(source,'the board listens for news about its files');
  assert.equal(ui.container.querySelectorAll('.tile.note').length,1);
  listed=[...listed,note('t2','# Two, written by an agent','two.md',{pos:{x:400,y:60,w:280}})];
  source.emit('files',{});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,250));});await flush();
  assert.deepEqual([...ui.container.querySelectorAll<HTMLElement>('.tile.note .outliner-title')].map(item=>item.textContent),['One','Two, written by an agent']);
 }finally{await ui.close();delete (globalThis as {EventSource?:unknown}).EventSource;}
});

test('a card from another Notes folder says so; Show hidden files brings cards back',async()=>{
 const opened:string[]=[];
 const original=window.open;
 window.open=((url:string)=>{opened.push(url);return null;}) as typeof window.open;
 let hidden=2,shown=0;
 const tiles=[note('t1','See [the docs](https://example.com/docs) and [local](/etc/passwd)','notes/links.md'),note('t2','','idea.md',{doc:{root:'folder',path:'idea.md',folder:'/Users/me/old-vault',missing:true}})];
 board(tiles,call=>{
  if(call.path==='/videos/v1/board/files')return {body:{...files,folder:{...files.folder,hidden}}};
  if(call.method==='POST'&&call.path==='/videos/v1/board/hidden/show'){shown++;hidden=0;return {body:{shown:2}};}
  return undefined;
 });
 const ui=await mount();
 try{
  await flush();await flush();
  const other=ui.container.querySelectorAll('.tile.note')[1];
  assert.match(other.textContent!,/not the current one/);assert.match(other.textContent!,/\/Users\/me\/old-vault/);
  await act(async()=>button(ui.container.querySelector('.btoolbar')!,'Add to board').click());
  const item=[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(entry=>entry.textContent==='Show hidden files (2)')!;
  assert.ok(item,'the menu offers the hidden files');
  await act(async()=>item.click());await flush();
  assert.equal(shown,1);
  await act(async()=>button(ui.container.querySelector('.btoolbar')!,'Add to board').click());
  assert.equal([...document.querySelectorAll('[role=menuitem]')].some(entry=>/Show hidden/.test(entry.textContent??'')),false,'and stops offering them once shown');
 }finally{window.open=original;await ui.close();}
});

test('a failed save and a refused Notes folder are warnings, not errors: amber with an icon, never red',async()=>{
 const css=(await import('node:fs')).readFileSync(new URL('../club.css',import.meta.url),'utf8');
 // Amber's text shade (--cc-warn-text), dark enough to read on a light surface.
 assert.match(css,/\.club-root \.warn-text \{ color: var\(--cc-warn-text\); \}/);
 const panel=(await import('node:fs')).readFileSync(new URL('./NotePanel.tsx',import.meta.url),'utf8');
 const folder=(await import('node:fs')).readFileSync(new URL('./NotesFolder.tsx',import.meta.url),'utf8');
 for(const source of [panel,folder])assert.doesNotMatch(source,/--cc-rec|danger-text/);
 const sheet=(await import('node:fs')).readFileSync(new URL('../ui/Sheet.tsx',import.meta.url),'utf8');
 assert.match(sheet,/<IconButton icon="close" label="Close"/,'the close button is an IconButton: named, with a tooltip');
});
