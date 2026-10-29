import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Clip,type Media,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {createPlayhead} from './playhead';
const {TimelineClub,usedRows}=await import('./TimelineClub');

const media:Media={id:'m',name:'m',path:'/tmp/m.mov',kind:'video',duration:60,width:1920,height:1080,hasAudio:true};
const clip=(id:string,track:Clip['track'],start:number,length:number,take?:string):Clip=>({id,mediaId:'m',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...(take?{recordingTakeId:take}:{})});
function project(clips:Clip[]):Project{const p=createProject('Edit');p.media=[media];p.clips=clips;p.scenes=[];p.settings.snap=false;return p;}
const pointer=(type:string,x:number,target:EventTarget=window)=>target.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,cancelable:true,button:0,buttons:1,clientX:x,clientY:10,pointerId:1}));

function harness(p:Project){
 const state={project:p,changes:0};const playhead=createPlayhead(0);
 const element=(next:Project)=>createElement(TimelineClub,{project:next,playhead,scale:50,onScale:()=>{},selectedIds:new Set<string>(),onSelectMany:()=>{},onSeek:()=>{},change:fn=>{state.changes++;state.project=applyProjectChange(state.project,fn);},onDropMedia:()=>{},tool:'select',onSplit:()=>{},follow:true,showWaveforms:false,onOpen:()=>{}});
 return {state,element};
}

test('rows exist only when used: an empty video shows Screen and Audio, a camera-only take shows Camera and Audio',()=>{
 assert.deepEqual(usedRows(project([])).map(r=>r.name),['Screen','Audio']);
 const p=project([clip('c','camera',0,5,'t'),clip('a','audio',0,5,'t')]);p.captions=[{id:'x',start:0,end:1,text:'Hi'}];
 assert.deepEqual(usedRows(p).map(r=>[r.name,r.linked??false]),[['Camera',true],['Audio',true],['Captions',false]]);
});

test('a drag survives a background save or reload of the project and drops on the project as it is then',async()=>{
 const {state,element}=harness(project([clip('a','screen',2,4)]));
 const ui=await mountUI(element(state.project));
 try{
  const node=ui.container.querySelector('[data-clip-id="a"]')!;
  await act(async()=>{pointer('pointerdown',110,node);});
  await act(async()=>{pointer('pointermove',160);pointer('pointermove',210);});
  assert.ok(ui.container.querySelector('.clip-drag-preview'),'the clip is being dragged');
  // An autosave or a server reload replaces the project object and its arrays with equal copies.
  const saved:Project={...state.project,updatedAt:'2026-10-29T12:00:00.000Z',clips:state.project.clips.map(c=>({...c})),captions:[...state.project.captions]};
  state.project=saved;await ui.render(element(saved));
  assert.ok(ui.container.querySelector('.clip-drag-preview'),'the save did not cancel the drag');
  await act(async()=>{pointer('pointerup',210);});
  assert.equal(state.changes,1);assert.equal(state.project.clips[0].start,4,'moved by 100 px at 50 px/s');
 }finally{await ui.close();}
});

test('Escape cancels a drag; a linked take moves as one',async()=>{
 const {state,element}=harness(project([clip('s','screen',0,4,'t'),clip('c','camera',0,4,'t'),clip('o','screen',10,2)]));
 const ui=await mountUI(element(state.project));
 try{
  await act(async()=>{pointer('pointerdown',10,ui.container.querySelector('[data-clip-id="s"]')!);pointer('pointermove',60);});
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));});
  await act(async()=>{pointer('pointerup',60);});
  assert.equal(state.changes,0,'cancelled by the person');
  await act(async()=>{pointer('pointerdown',10,ui.container.querySelector('[data-clip-id="s"]')!);pointer('pointermove',60);pointer('pointerup',60);});
  assert.deepEqual(state.project.clips.map(c=>[c.id,c.start]),[['s',1],['c',1],['o',10]],'camera follows the screen');
 }finally{await ui.close();}
});
