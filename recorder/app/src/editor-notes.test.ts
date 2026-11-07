import {mountUI,button} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import {createProject,type Project} from '../shared/types';
const {NotesPanel,copyNotes,noteTime,sortedNotes,fixNotesRequest}=await import('./NotesPanel');
const {MarkerNote}=await import('./MarkerNote');
import {ASK_CLAUDE,type AskRequest} from './club/workspace/ask-claude';
import {rememberEditView} from './edit-session';
import type {EditorBridge,EmbeddedRecorder} from './App';
const {default:App}=await import('./App');
type Note=NonNullable<Project['markers']>[number];
const notes:Note[]=[{id:'idea',time:65.4,name:'Add a diagram',tag:'idea'},{id:'keep',time:3,name:'Keep this',tag:'keep'},{id:'fix',time:12.3,name:'  Fix\n the sound  ',tag:'dislike'}];
const press=(target:EventTarget,key:string,extra:KeyboardEventInit={})=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));});
const type=async(area:HTMLTextAreaElement,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(area,value);area.dispatchEvent(new Event('input',{bubbles:true}));});

test('notes sort without mutating the project, format tenths and minute carries, and copy one MM:SS line per note',()=>{
 assert.deepEqual(sortedNotes(notes).map(note=>note.id),['keep','fix','idea']);assert.deepEqual(notes.map(note=>note.id),['idea','keep','fix']);
 assert.equal(noteTime(59.96),'01:00');assert.equal(noteTime(65.4),'01:05.4');assert.equal(noteTime(-1),'00:00');
 assert.equal(copyNotes(notes),'00:03 — [Keep as is] Keep this\n00:12 — [Needs fixing] Fix the sound\n01:05 — [Idea to add] Add a diagram');
 assert.equal(copyNotes([]),'');assert.equal(copyNotes([{id:'empty',time:0}]),'00:00 — [Note]');
 const request=fixNotesRequest(notes);assert.match(request,/propose edits as cards/);assert.match(request,/00:12\.3 — \[Needs fixing\] Fix the sound/);assert.match(request,/01:05\.4 — \[Idea to add\] Add a diagram/);assert.ok(!request.includes('Keep this'));
});

test('the note box focuses, saves typing, preserves multiline and IME input, and closes on Enter or Escape',async()=>{
 let closed=0,changed:unknown;const ui=await mountUI(createElement(MarkerNote,{time:'00:12.3',name:'',tag:'dislike',anchor:{left:400,top:400},onNudge:()=>{},onChange:patch=>{changed=patch;},onDelete:()=>{},onClose:()=>closed++}));
 try{
  const area=ui.container.querySelector('textarea')!;assert.equal(document.activeElement,area);
  await type(area,'Fix this');assert.deepEqual(changed,{name:'Fix this'});
  await press(area,'Enter',{shiftKey:true});await press(area,'Enter',{isComposing:true});assert.equal(closed,0);
  await press(area,'Enter');assert.equal(closed,1);await press(area,'Escape');assert.equal(closed,2);
  const select=ui.container.querySelector('select')!;await act(async()=>{select.value='idea';select.dispatchEvent(new Event('change',{bubbles:true}));});assert.deepEqual(changed,{tag:'idea'});
 }finally{await ui.close();}
});

test('the Notes panel seeks by timestamp and arrow keys, edits and deletes inline, filters tags, copies all notes and asks Claude for cards',async()=>{
 let sought=-1,copied='',request:AskRequest|undefined;const clipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{copied=text;}}});
 const hear=(event:Event)=>{request=(event as CustomEvent<AskRequest>).detail;request.accepted=true;};window.addEventListener(ASK_CLAUDE,hear);
 function Review(){const [current,setCurrent]=useState(notes);return createElement(NotesPanel,{notes:current,onSeek:time=>{sought=time;},onChange:(id,patch)=>setCurrent(list=>list.map(note=>note.id===id?{...note,...patch,tag:patch.tag===null?undefined:patch.tag??note.tag}:note)),onDelete:id=>setCurrent(list=>list.filter(note=>note.id!==id)),onClose:()=>{}});}
 const ui=await mountUI(createElement(Review));
 try{
  const panel=ui.container.querySelector('aside')!;assert.equal(document.activeElement,panel);assert.equal(ui.container.querySelector('.notes-count')?.textContent,'3');
  assert.deepEqual([...ui.container.querySelectorAll('.notes-time')].map(el=>el.textContent),['00:03','00:12.3','01:05.4']);
  await press(panel,'ArrowDown');assert.equal(sought,3);await press(document.activeElement!,'ArrowDown');assert.equal(sought,12.3);await press(document.activeElement!,'ArrowUp');assert.equal(sought,3);
  await act(async()=>button(ui.container,'01:05.4').click());assert.equal(sought,65.4);
  const area=ui.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note at 00:12.3"]')!;await type(area,'Better sound');await press(area,'ArrowUp');assert.equal(sought,65.4,'arrows inside text keep the caret');
  await act(async()=>button(ui.container,'Copy notes').click());assert.match(copied,/00:12 — \[Needs fixing\] Better sound/);assert.equal(copied.split('\n').length,3);assert.match(ui.container.textContent!,/Notes copied/);
  await act(async()=>button(ui.container,'Fix with Claude').click());assert.ok(request);assert.match(request.text,/Better sound/);assert.match(request.text,/Add a diagram/);assert.ok(!request.text.includes('Keep this'));
  const filter=ui.container.querySelector<HTMLSelectElement>('[aria-label="Filter notes by tag"]')!;await act(async()=>{filter.value='keep';filter.dispatchEvent(new Event('change',{bubbles:true}));});assert.equal(ui.container.querySelectorAll('.notes-row').length,1);
  await act(async()=>button(ui.container,'Copy notes').click());assert.equal(copied.split('\n').length,3,'copy includes every note even while filtered');
  await act(async()=>button(ui.container,'Delete note at 00:03').click());assert.equal(ui.container.querySelector('.notes-count')?.textContent,'2');assert.match(ui.container.textContent!,/No notes with this tag/);
 }finally{await ui.close();window.removeEventListener(ASK_CLAUDE,hear);if(clipboard)Object.defineProperty(navigator,'clipboard',clipboard);else Reflect.deleteProperty(navigator,'clipboard');}
});

test('empty notes explain N and disable copy and Claude; keep-only notes cannot request edits',async()=>{
 const props={onSeek:()=>{},onChange:()=>{},onDelete:()=>{},onClose:()=>{}},ui=await mountUI(createElement(NotesPanel,{...props,notes:[]}));
 try{assert.match(ui.container.textContent!,/Press N while watching to leave a note at that moment/);assert.ok(button(ui.container,'Copy notes').disabled);assert.ok(button(ui.container,'Fix with Claude').disabled);await ui.render(createElement(NotesPanel,{...props,notes:[notes[1]]}));assert.ok(button(ui.container,'Fix with Claude').disabled);}finally{await ui.close();}
});

test('Edit N stamps the playhead to tenths without pausing, typing stays local, M still adds a marker, and Notes opens from the rail',{timeout:15000},async()=>{
 const p=createProject('Watching notes');p.scenes[0].duration=120;rememberEditView(p.id,{zoom:55,playhead:12.34,selectedIds:[],selected:null});localStorage.clear();
 const originalFetch=globalThis.fetch,originalSource=globalThis.EventSource,originalFrame=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 // Advance frames explicitly: a real animation loop never settles inside React act.
 const frames=new Map<number,FrameRequestCallback>();let serial=0;globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial;};globalThis.cancelAnimationFrame=id=>{frames.delete(id);};
 let editor:EditorBridge|null=null,saved=p;
 class Source extends EventTarget{close(){}}Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url==='/api/projects')return Response.json([p]);if(url===`/api/projects/${p.id}`){if(init?.method==='PUT'){saved=JSON.parse(String(init.body));return Response.json({minimal:true,id:p.id,updatedAt:saved.updatedAt},{headers:{ETag:'"test"'}});}return Response.json(saved,{headers:{ETag:'"test"'}});}if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});if(url.includes('/automation')||url.endsWith('/agent-chat'))return Response.json({jobs:[]});return Response.json([]);};
 const ui=await mountUI(createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{projectId:p.id,mode:'Edit',onBack:()=>{},onEditor:next=>{editor=next;}}}));
 try{
  await act(async()=>button(ui.container,'Play').click());assert.ok(button(ui.container,'Pause'));
  await press(document.body,'n');const area=ui.container.querySelector<HTMLTextAreaElement>('.marker-note textarea')!;assert.ok(area);assert.equal(document.activeElement,area);assert.ok(button(ui.container,'Pause'),'adding a note keeps playback running');assert.match(ui.container.querySelector('.marker-note')!.textContent!,/00:12\.3/);
  await act(async()=>{for(const [id,frame] of [...frames]){frames.delete(id);frame(performance.now()+1500);}});assert.ok(editor!.context().playhead>13,'playback advances after N');assert.match(ui.container.querySelector('.marker-note')!.textContent!,/00:12\.3/,'the note keeps the moment N was pressed');
  await type(area,'Fix the opening');for(const key of ['n','m','s','Delete',' '])await press(area,key);assert.equal(ui.container.querySelectorAll('.club-marker').length,1);assert.ok(button(ui.container,'Pause'));
  await press(area,'Enter');assert.equal(ui.container.querySelector('.marker-note'),null);await act(async()=>{await editor!.flush();});assert.equal(saved.markers?.[0].time,12.3);assert.equal(saved.markers?.[0].name,'Fix the opening');assert.equal(saved.markers?.[0].tag,'dislike');
  await press(document.body,'m');assert.equal(ui.container.querySelectorAll('.club-marker').length,2);await press(ui.container.querySelector('.marker-note textarea')!,'Escape');assert.equal(ui.container.querySelector('.marker-note'),null);
  await act(async()=>button(ui.container,'Notes').click());assert.ok(ui.container.querySelector('.notes-panel'));assert.equal(ui.container.querySelector('.notes-count')?.textContent,'2');
  await press(ui.container.querySelector('.notes-panel')!,'n');assert.equal(ui.container.querySelectorAll('.club-marker').length,3,'N also works with the Notes list focused');await press(ui.container.querySelector('.marker-note textarea')!,'Enter');
  const snap=button(ui.container,'Snap to edges'),before=snap.getAttribute('aria-pressed');await press(document.body,'N',{shiftKey:true});assert.notEqual(snap.getAttribute('aria-pressed'),before);
  await act(async()=>button(ui.container,'Notes').click());assert.equal(ui.container.querySelector('.notes-panel'),null);
 }finally{await ui.close();globalThis.fetch=originalFetch;globalThis.EventSource=originalSource;globalThis.requestAnimationFrame=originalFrame;globalThis.cancelAnimationFrame=originalCancel;}
});
