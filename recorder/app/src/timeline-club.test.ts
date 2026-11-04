import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Clip,type Media,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {createPlayhead} from './playhead';
import {splitLinked} from './timeline-edit';
import {newMotionBlock} from '../shared/motion/templates';
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
  {const d=first.querySelector('.club-wave path')!.getAttribute('d')!;assert.ok(d.startsWith('M')&&d.endsWith('Z')&&d.split('M').length===2,'one filled, mirrored shape, as Borumi draws it, not a row of spikes');assert.ok(d.length>60,'it follows the speech');}
  assert.equal(first.getAttribute('data-linked-clip-ids')?.split(' ').length,3);
  await act(async()=>{pointer('pointerdown',150,ui.container.querySelector(`[data-clip-id="${right.id}"]`)!);pointer('pointermove',10);pointer('pointerup',10);});
  assert.equal(state.changes,1);assert.deepEqual(state.project.clips.filter(c=>c.linkId===right.linkId).map(c=>c.start),[0,0,0]);
  await ui.render(createElement(TimelineClub,{...element(state.project).props,scale:150}));
  assert.ok(ui.container.querySelector('.club-caption-pill .club-word'),'zoomed-in words are positioned inside the same pill');
 }finally{await ui.close();}
});

test('Borumi\'s Layout row: a stretch is an orange block named for its arrangement; a click on the empty row makes one there and selects it',async()=>{
 const p=project(['screen','camera','audio'].map(track=>clip(track,track as Clip['track'],0,12,'take')));
 p.layouts=[{id:'side',start:0,duration:4,preset:'Side by side'}];p.zooms=[{id:'z',start:5,duration:2,scale:1.5,x:.5,y:.5,target:'screen',easing:'smooth'}];p.captions=[{id:'typed',start:1,end:2,text:'Hi'}];
 assert.deepEqual(usedRows(p).map(r=>r.name),['Linked takes','Layout','Zoom','Captions'],'in Borumi\'s order: the control rows under the footage, layout first');
 assert.equal(usedRows({...p,layouts:[]}).some(r=>r.name==='Layout'),false,'an empty Layout row is hidden, as in Borumi');
 const state={project:p,selected:[] as string[]};const playhead=createPlayhead(0);
 const element=(next:Project)=>createElement(TimelineClub,{project:next,playhead,scale:50,onScale:()=>{},selectedIds:new Set(state.selected),onSelectMany:(ids:string[])=>{state.selected=ids;},onSeek:()=>{},change:fn=>{state.project=applyProjectChange(state.project,fn);},onDropMedia:()=>{},tool:'select',onSplit:()=>{},follow:true,showWaveforms:false,onOpen:()=>{}});
 const ui=await mountUI(element(state.project));
 try{
  const block=ui.container.querySelector<HTMLElement>('.row-layouts [data-effect-id="side"]')!;
  assert.ok(block.classList.contains('is-layout'));assert.equal(block.textContent,'Side by side');assert.match(block.title,/^Layout: Side by side/);
  const row=ui.container.querySelector<HTMLElement>('.row-layouts')!,hover=(type:string,x:number,buttons=0)=>row.dispatchEvent(new (window as unknown as {PointerEvent:typeof PointerEvent}).PointerEvent(type,{bubbles:true,cancelable:true,button:0,buttons,clientX:x,clientY:10,pointerId:1}));
  await act(async()=>{hover('pointermove',400);});
  const ghost=ui.container.querySelector<HTMLElement>('.club-layout-ghost');assert.ok(ghost?.querySelector('svg'),'"+ Layout" follows the pointer over the empty row');assert.equal(ghost!.style.left,'400px');
  await act(async()=>{hover('pointermove',100);});assert.equal(ui.container.querySelector('.club-layout-ghost'),null,'nothing to add over a stretch');
  await act(async()=>{hover('pointerdown',400,1);});await act(async()=>{pointer('pointerup',400);});
  const made=state.project.layouts!.find(l=>l.id!=='side')!;
  // The view has no width under the test DOM, so the stretch takes the shortest a click makes (half a second); in the app, a tenth of the view.
  assert.deepEqual([made.start,made.duration,made.preset],[8,.5,'Full frame'],'where it was clicked, in the layout the clips have outside stretches');
  assert.deepEqual(state.selected,[made.id],'the new stretch is selected, so the Layout panel opens on it');
 }finally{await ui.close();}
});

test('P1 repeated layout resize previews plus Escape preserve the whole project and undo history',async()=>{
 const p=takeFixture();p.layouts=[{id:'l',start:2,duration:3,preset:'Creator'}];const before=structuredClone(p),{state,element}=harness(p);
 const {EditHistory}=await import('./edit-history');const history=new EditHistory<Project>();history.record(p,()=>80);const historyBefore=structuredClone(history.past);
 const ui=await mountUI(element(p));
 try{
  const edge=ui.container.querySelector('[data-effect-id="l"] .trim-handle.right')!;
  await act(async()=>{pointer('pointerdown',250,edge);pointer('pointermove',300);pointer('pointermove',325);});await frame();
  assert.deepEqual(state.project,before,'preview never mutates live state');
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));pointer('pointerup',325);});
  assert.deepEqual(state.project,before);assert.equal(state.changes,0);assert.deepEqual(history.past,historyBefore);
 }finally{await ui.close();}
});
test('P1 ripple trim previews plus Escape preserve layouts and motion',async()=>{
 const p=takeFixture();p.layouts=[{id:'l',start:1,duration:14,preset:'Creator'}];p.motion=[newMotionBlock('title-card',13,'m',{duration:2})];
 for(const m of p.media)m.duration=60;
 const before=structuredClone(p),{state,element}=harness(p),ui=await mountUI(element(p));
 try{
  const edge=ui.container.querySelector('[data-clip-id="audio"] .trim-handle.right')!;
  await act(async()=>{pointer('pointerdown',600,edge);pointer('pointermove',650);pointer('pointermove',700);});await frame();
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));pointer('pointerup',700);});
  assert.deepEqual(state.project,before);assert.equal(state.changes,0);
 }finally{await ui.close();}
});
test('P2 muted mic uses camera narration and every hidden caption word is rendered',async()=>{
 const p=takeFixture();p.clips.find(c=>c.track==='audio')!.muted=true;const {element}=harness(p),ui=await mountUI(element(p));
 try{
  assert.equal(ui.container.querySelector('.club-caption-text')?.textContent,'First words then more');
  assert.equal(ui.container.querySelector('.row-captions'),null,'all words are in the grouped take');
  // A higher-priority ungrouped source can own some words: keep their caption row if the grouped representative cannot render them.
  p.clips.push({...structuredClone(p.clips[2]),id:'other',muted:false,start:0,sourceOut:2,recordingTakeId:undefined,linkId:undefined});
  await ui.render(element({...p,clips:[...p.clips]}));
  const words=[...ui.container.querySelectorAll('.club-caption-text')].map(n=>n.textContent).join(' ');
  assert.ok(words.includes('First words')||ui.container.querySelector('.row-captions'));
 }finally{await ui.close();}
});

test('the timeline fits the whole video once its clips arrive, not while the project is still empty (Borumi opens on the whole video)',async()=>{
 const width=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'clientWidth');
 Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get:()=>800});
 const scales:number[]=[];const {state,element}=harness(project([]));
 const props=(p:Project)=>({...element(p).props,autoFit:true,onScale:(s:number)=>{scales.push(s);}});
 const ui=await mountUI(createElement(TimelineClub,props(state.project)));
 try{
  await frame();
  assert.deepEqual(scales,[],'nothing to fit yet');
  const loaded=project([clip('a','camera',0,40)]);
  await ui.render(createElement(TimelineClub,props(loaded)));await frame();
  assert.equal(scales.length,1,'it fits once the clips are there');
  assert.ok(scales[0]*40<=800,'the whole 40 s video is in view');
 }finally{await ui.close();if(width)Object.defineProperty(HTMLElement.prototype,'clientWidth',width);else delete (HTMLElement.prototype as {clientWidth?:number}).clientWidth;}
});
