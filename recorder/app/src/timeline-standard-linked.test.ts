import {mountUI} from './test-dom';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {clipDuration,createProject,defaultEffects,defaultTransform,type Clip,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {createPlayhead} from './playhead';
import {EditHistory} from './edit-history';
import {linkedIds,rowItems,rowsOverlap,splitLinked,timelineGaps} from './timeline-edit';
const {Timeline}=await import('./Timeline');
// happy-dom has no layout; give the real timeline a viewport so virtualization and edge scrolling have physical bounds.
const clientWidth=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientWidth'),bounds=HTMLElement.prototype.getBoundingClientRect;
Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get(){return 1000;}});
HTMLElement.prototype.getBoundingClientRect=function(){return this.classList.contains('timeline-scroll')||this.classList.contains('timeline-content')?{x:0,y:0,left:0,top:0,right:1000,bottom:600,width:1000,height:600,toJSON(){}}:bounds.call(this);};
after(()=>{if(clientWidth)Object.defineProperty(HTMLElement.prototype,'clientWidth',clientWidth);else delete (HTMLElement.prototype as unknown as Record<string,unknown>).clientWidth;HTMLElement.prototype.getBoundingClientRect=bounds;});
const clip=(id:string,track:Clip['track'],start:number,length:number,linkId:string):Clip=>({id,mediaId:'source',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),linkId,recordingTakeId:linkId});
function project(){
 const p=createProject('Linked gesture');p.settings.snap=false;p.scenes=[];
 p.media=[{id:'source',path:'/fixture/source.mov',name:'Source',kind:'video',duration:30,width:1920,height:1080,hasAudio:true}];
 p.clips=(['screen','camera','audio'] as const).flatMap(track=>[clip(track,track,0,10,'take'),clip('next-'+track,track,10,4,'next')]);
 p.captions=[{id:'speech',start:1,end:9,text:'one two three',words:[{text:'one',start:1,end:2},{text:'two',start:4.5,end:5},{text:'three',start:7,end:8}]}];
 return p;
}
const pointer=(type:string,x:number,target:EventTarget=window,extra:Record<string,unknown>={})=>target.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,cancelable:true,button:0,buttons:1,clientX:x,clientY:100,pointerId:1,...extra}));
function harness(p:Project){
 const history=new EditHistory<Project>(),state={project:p,changes:0,selected:[] as string[]};
 const element=()=>createElement(Timeline,{project:state.project,playhead:createPlayhead(0),zoom:50,selected:null,selectedIds:new Set<string>(),onSelect:()=>{},onSelectMany:ids=>{state.selected=ids;},onSeek:()=>{},change:fn=>{history.record(state.project,()=>80);state.project=applyProjectChange(state.project,fn);state.changes++;},onDropMedia:()=>{},tool:'select',scrubbing:false,onSplit:()=>{},onZoom:()=>{},selectedRange:null,onRange:()=>{},showWaveforms:false});
 return {state,history,element};
}
function intact(p:Project){
 assert.equal(rowsOverlap(rowItems(p).filter(i=>p.clips.some(c=>c.id===i.id))),false,'no clips overlap their row');
 assert.deepEqual(timelineGaps(p.clips),[],'drag introduces no black gap');
 for(const c of p.clips){const group=p.clips.filter(o=>linkedIds(p.clips,[c.id]).has(o.id));assert.equal(group.length,3);assert.ok(group.every(o=>Math.abs(o.start-c.start)<1e-8),'all three tracks move by the same delta');}
 for(const caption of p.captions){const owner=p.clips.find(c=>c.track==='audio'&&caption.start>=c.start-1e-8&&caption.end<=c.start+clipDuration(c)+1e-8);assert.ok(owner,`caption ${caption.text} belongs to an audio piece`);for(const word of caption.words??[])assert.ok(word.start>=owner!.start&&word.end<=owner!.start+clipDuration(owner!));}
}
test('standalone timeline: split a take, drag any right piece backwards and forwards, keep links/captions and one undo per gesture',async()=>{
 const p=project();splitLinked(p,4,new Set(['audio']));
 const right=p.clips.find(c=>c.track==='audio'&&c.start===4)!,{state,history,element}=harness(p),ui=await mountUI(element());
 try{
  await act(async()=>{pointer('pointerdown',250,ui.container.querySelector(`[data-clip-id="${right.id}"]`)!);pointer('pointermove',50);});
  assert.ok(ui.container.querySelector('[data-insert-time="0"]'),'insert point is visible');
  assert.ok(ui.container.querySelectorAll('.clip-drag-preview').length>=6,'linked pieces and displaced neighbours preview together');
  assert.equal(state.changes,0,'preview does not create history');
  await act(async()=>{pointer('pointerup',50);});
  assert.equal(state.changes,1);assert.equal(history.past.length,1);intact(state.project);
  assert.equal(state.project.clips.find(c=>c.id===right.id)!.start,0);assert.equal(state.selected.length,3);
  const back=state.project;await ui.render(element());
  await act(async()=>{pointer('pointerdown',30,ui.container.querySelector(`[data-clip-id="${right.id}"]`)!);pointer('pointermove',680);pointer('pointerup',680);});
  assert.equal(state.changes,2);assert.equal(history.past.length,2);intact(state.project);
  assert.ok(state.project.clips.find(c=>c.id===right.id)!.start>0,'right piece reordered forward');
  assert.equal(history.undo(state.project),back,'one undo restores the entire previous gesture');
 }finally{await ui.close();}
});
test('standalone timeline: Escape captures the key and cancels a linked drag without a change',async()=>{
 const p=project();splitLinked(p,4,new Set());const right=p.clips.find(c=>c.track==='camera'&&c.start===4)!;
 const {state,history,element}=harness(p),ui=await mountUI(element());let escaped=0;const editor=(event:KeyboardEvent)=>{if(event.key==='Escape')escaped++;};window.addEventListener('keydown',editor);
 try{
  await act(async()=>{pointer('pointerdown',250,ui.container.querySelector(`[data-clip-id="${right.id}"]`)!);pointer('pointermove',50);});
  assert.ok(ui.container.querySelector('.clip-drag-preview'));
  await act(async()=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));pointer('pointerup',50);});
  assert.equal(escaped,0);assert.equal(state.changes,0);assert.equal(history.past.length,0);assert.equal(state.project,p);assert.equal(ui.container.querySelector('.clip-drag-preview'),null);
 }finally{window.removeEventListener('keydown',editor);await ui.close();}
});
test('standalone timeline: edge trim ripples all three tracks once and clamps at the shared source bound',async()=>{
 const p=project();p.media.push({...p.media[0],id:'short-camera',duration:11});p.clips.find(c=>c.id==='camera')!.mediaId='short-camera';
 const {state,history,element}=harness(p),ui=await mountUI(element());
 try{
  await act(async()=>{pointer('pointerdown',500,ui.container.querySelector('[data-clip-id="camera"] .trim-handle.right')!);pointer('pointermove',400);});
  assert.equal(state.changes,0);
  await act(async()=>{pointer('pointerup',400);});
  assert.equal(state.changes,1);assert.equal(history.past.length,1);intact(state.project);
  assert.deepEqual(state.project.clips.filter(c=>c.linkId==='take').map(c=>clipDuration(c)),[8,8,8]);
  assert.ok(state.project.clips.filter(c=>c.linkId==='next').every(c=>c.start===8));
  await ui.render(element());
  await act(async()=>{pointer('pointerdown',400,ui.container.querySelector('[data-clip-id="camera"] .trim-handle.right')!);pointer('pointermove',800);pointer('pointerup',800);});
  assert.equal(state.changes,2);assert.equal(history.past.length,2);intact(state.project);
  assert.deepEqual(state.project.clips.filter(c=>c.linkId==='take').map(c=>clipDuration(c)),[11,11,11],'shortest source bounds the entire take');
  assert.ok(state.project.clips.filter(c=>c.linkId==='next').every(c=>c.start===11));
 }finally{await ui.close();}
});
