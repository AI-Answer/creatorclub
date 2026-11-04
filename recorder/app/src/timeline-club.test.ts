import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Clip,type Media,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {createPlayhead} from './playhead';
import {splitLinked} from './timeline-edit';
const {TimelineClub,usedRows}=await import('./TimelineClub');

const media:Media={id:'m',name:'m',path:'/tmp/m.mov',kind:'video',duration:60,width:1920,height:1080,hasAudio:true};
const clip=(id:string,track:Clip['track'],start:number,length:number,take?:string):Clip=>({id,mediaId:'m',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...(take?{recordingTakeId:take}:{})});
function project(clips:Clip[]):Project{const p=createProject('Edit');p.media=[media];p.clips=clips;p.scenes=[];p.settings.snap=false;return p;}
function takeFixture(){
 const p=project(['screen','camera','audio'].map(track=>clip(track,track as Clip['track'],0,12,'take')));
 p.media=p.clips.map(c=>({...media,duration:12,id:c.track,kind:c.track==='audio'?'audio':'video',waveform:c.track==='audio'?[0,.02,.4,.001,.15,0,.3,.05]:undefined}));
 for(const c of p.clips)c.mediaId=c.track;
 p.captions=[{id:'speech',start:0,end:12,text:'First words then more',words:[{text:'First',start:.2,end:1},{text:'words',start:1,end:2},{text:'then',start:7,end:8},{text:'more',start:8,end:9}]}];return p;
}
/** Drag previews render on the next animation frame. */
const frame=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,40));});
const pointer=(type:string,x:number,target:EventTarget=window,altKey=false)=>target.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,cancelable:true,button:0,buttons:1,clientX:x,clientY:10,pointerId:1,altKey}));
// Option explicitly permits a free move that keeps a gap; the default gesture reorders by insertion.
const optionPointer=(type:string,x:number,target:EventTarget=window)=>pointer(type,x,target,true);

function harness(p:Project){
 const state={project:p,changes:0,notices:[] as string[]};const playhead=createPlayhead(0);
 const element=(next:Project)=>createElement(TimelineClub,{project:next,playhead,scale:50,onScale:()=>{},selectedIds:new Set<string>(),onSelectMany:()=>{},onSeek:()=>{},change:fn=>{state.changes++;state.project=applyProjectChange(state.project,fn);},onDropMedia:()=>{},tool:'select',onSplit:()=>{},follow:true,showWaveforms:false,onOpen:()=>{},onNotice:(message:string)=>{state.notices.push(message);}});
 return {state,element};
}

test('rows exist only when used: linked camera and audio share one take row; manual captions keep their row',()=>{
 assert.deepEqual(usedRows(project([])).map(r=>r.name),['Screen','Audio']);
 const p=project([clip('c','camera',0,5,'t'),clip('a','audio',0,5,'t')]);p.captions=[{id:'x',start:0,end:1,text:'Hi'}];
 assert.deepEqual(usedRows(p).map(r=>[r.name,r.linked??false]),[['Linked takes',true],['Captions',false]]);
});

test('an Option-drag survives a background save or reload of the project and drops on the project as it is then',async()=>{
 // A camera clip holds the start of the video, so moving the screen clip opens no gap before the first clip.
 const {state,element}=harness(project([clip('b','camera',0,1),clip('a','screen',2,4)]));
 const ui=await mountUI(element(state.project));
 try{
  const node=ui.container.querySelector('[data-clip-id="a"]')!;
  await act(async()=>{optionPointer('pointerdown',110,node);});
  await act(async()=>{optionPointer('pointermove',160);optionPointer('pointermove',210);});await frame();
  assert.ok(ui.container.querySelector('.clip-drag-preview'),'the clip is being dragged');
  // An autosave or a server reload replaces the project object and its arrays with equal copies.
  const saved:Project={...state.project,updatedAt:'2026-10-29T12:00:00.000Z',clips:state.project.clips.map(c=>({...c})),captions:[...state.project.captions]};
  state.project=saved;await ui.render(element(saved));
  assert.ok(ui.container.querySelector('.clip-drag-preview'),'the save did not cancel the drag');
  await act(async()=>{optionPointer('pointerup',210);});
  assert.equal(state.changes,1);assert.equal(state.project.clips.find(c=>c.id==='a')!.start,4,'moved by 100 px at 50 px/s');
 }finally{await ui.close();}
});

test('Escape cancels an Option-drag; a linked take moves as one',async()=>{
 const {state,element}=harness(project([clip('o','camera',0,1),clip('s','screen',0,4,'t'),clip('c','camera',1,4,'t')]));
 const ui=await mountUI(element(state.project));
 try{
  await act(async()=>{optionPointer('pointerdown',10,ui.container.querySelector('[data-clip-id="s"]')!);optionPointer('pointermove',60);});
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));});
  await act(async()=>{optionPointer('pointerup',60);});
  assert.equal(state.changes,0,'cancelled by the person');
  await act(async()=>{optionPointer('pointerdown',10,ui.container.querySelector('[data-clip-id="s"]')!);optionPointer('pointermove',60);optionPointer('pointerup',60);});
  assert.deepEqual(state.project.clips.map(c=>[c.id,c.start]),[['o',0],['s',1],['c',2]],'camera follows the screen');
 }finally{await ui.close();}
});

test('Escape ends only the drag: the editor\'s own keys never see it',async()=>{
 const {state,element}=harness(project([clip('a','screen',2,4)]));const ui=await mountUI(element(state.project));let seen=0;const editor=(e:KeyboardEvent)=>{if(e.key==='Escape')seen++;};window.addEventListener('keydown',editor);
 try{
  await act(async()=>{pointer('pointerdown',110,ui.container.querySelector('[data-clip-id="a"]')!);pointer('pointermove',160);});await frame();
  await act(async()=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  assert.equal(seen,0,'a sheet behind the timeline stays open');assert.equal(ui.container.querySelector('.clip-drag-preview'),null);
  await act(async()=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});assert.equal(seen,1,'without a drag Escape reaches the editor');
 }finally{window.removeEventListener('keydown',editor);await ui.close();}
});

test('a drop on clips that changed during the drag applies nothing and says so',async()=>{
 const {state,element}=harness(project([clip('c','camera',0,1),clip('a','screen',2,4),clip('b','screen',8,4)]));const ui=await mountUI(element(state.project));
 try{
  await act(async()=>{optionPointer('pointerdown',110,ui.container.querySelector('[data-clip-id="a"]')!);optionPointer('pointermove',150);});await frame();
  // Another window (or Claude) moved clip a meanwhile.
  const remote:Project={...state.project,clips:state.project.clips.map(c=>c.id==='a'?{...c,start:0}:{...c})};state.project=remote;await ui.render(element(remote));
  await act(async()=>{optionPointer('pointerup',150);});
  assert.equal(state.changes,1,'one change call, which made no edit');assert.deepEqual(state.project.clips.map(c=>c.start),[0,0,8]);
  assert.deepEqual(state.notices,['The timeline changed during the drag, so nothing moved. Try again.']);
 }finally{await ui.close();}
});

test('Task 14: a press on the body moves a clip only past a 6 px dead zone; a click seeks; the only clip stays at 0',async()=>{
 const {state,element}=harness(project([clip('a','screen',0,4)]));let seeks=0;
 const ui=await mountUI(createElement(TimelineClub,{...element(state.project).props,onSeek:()=>{seeks++;}}));
 try{
  const node=ui.container.querySelector('[data-clip-id="a"]')!;
  await act(async()=>{pointer('pointerdown',100,node);pointer('pointermove',105);pointer('pointerup',105);});
  assert.equal(state.changes,0,'5 px is a click, not a move');assert.equal(seeks,1,'a click on the body seeks');
  await act(async()=>{pointer('pointerdown',100,node);pointer('pointermove',220);});await frame();await act(async()=>{pointer('pointerup',220);});
  assert.equal(state.project.clips[0].start,0,'a 120 px drag of the only clip leaves it at 0');
 }finally{await ui.close();}
});

test('Task 14: a transcript cut shows a mark on the timeline where it happened',async()=>{
 const {state,element}=harness(project([clip('a','screen',0,4)]));
 const ui=await mountUI(createElement(TimelineClub,{...element(state.project).props,cutMarks:[1.5]}));
 try{const mark=ui.container.querySelector<HTMLElement>('.club-cut-mark');assert.ok(mark,'a cut mark is drawn');assert.equal(mark!.style.left,'75px');}finally{await ui.close();}
});

test('linked sources render once with a sentence pill, paired thumbnails and dense microphone envelope; grouped dragging stays one edit',async()=>{
 const p=takeFixture();splitLinked(p,6,new Set(['audio']));const {state,element}=harness(p);
 const right=p.clips.find(c=>c.track==='audio'&&c.start===6)!;
 const ui=await mountUI(createElement(TimelineClub,{...element(p).props,scale:20,showWaveforms:true}));
 try{
  const clips=ui.container.querySelectorAll('.club-take');assert.equal(clips.length,2,'six sources become two take slices');
  const first=clips[0];assert.equal(first.querySelector('.club-caption-text')?.textContent,'First words');
  assert.equal(first.querySelectorAll('.club-source-thumb').length,2);assert.equal(first.querySelector('.club-wave')?.getAttribute('data-waveform-media'),'audio');
  assert.ok(first.querySelector('.club-wave path')!.getAttribute('d')!.length>300,'the envelope spans the body at pixel density');
  assert.equal(first.getAttribute('data-linked-clip-ids')?.split(' ').length,3);
  await act(async()=>{pointer('pointerdown',150,ui.container.querySelector(`[data-clip-id="${right.id}"]`)!);pointer('pointermove',10);pointer('pointerup',10);});
  assert.equal(state.changes,1);assert.deepEqual(state.project.clips.filter(c=>c.linkId===right.linkId).map(c=>c.start),[0,0,0]);
  await ui.render(createElement(TimelineClub,{...element(state.project).props,scale:150}));
  assert.ok(ui.container.querySelector('.club-caption-pill .club-word'),'zoomed-in words are positioned inside the same pill');
 }finally{await ui.close();}
});
