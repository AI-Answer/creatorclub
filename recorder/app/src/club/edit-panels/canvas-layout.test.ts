import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Project} from '../../../shared/types';
import {creatorShadow} from '../../../shared/camera-style';
import {layoutTransform} from '../../../shared/layouts';
import {applyProjectChange} from '../../project-draft';
import {createPlayhead} from '../../playhead';
import {BACKGROUND_SWATCHES} from '../../canvas-swatches';
const {Inspector}=await import('../../Inspector');

function harness(p:Project,panel:'Canvas'|'Layout',selectedIds=new Set<string>(),time=0){
 const state={project:p},playhead=createPlayhead(time);
 const element=()=>createElement(Inspector,{project:state.project,panel,selected:[...selectedIds][0]??null,selectedIds,playhead,change:(fn:(draft:Project)=>void)=>{state.project=applyProjectChange(state.project,fn);},select:()=>{},onImport:()=>{},onAI:()=>{},club:true});
 return {state,element};
}
const named=(container:Element,label:string)=>{const found=container.querySelector<HTMLElement>(`[aria-label="${label}"]`);if(!found)throw Error(`Not found: ${label}`);return found;};
const buttonText=(container:Element,text:string)=>{const found=[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);if(!found)throw Error(`Button not found: ${text}`);return found;};
const clickIn=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
/** Sets a range input the way a person drags it: the value, then an input event that React reads. */
const setRange=async(container:Element,label:string,value:number)=>act(async()=>{const input=container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));});
const setField=async(container:Element,label:string,value:string)=>act(async()=>{const input=container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const tileLabels=(container:Element)=>[...container.querySelectorAll<HTMLButtonElement>('.canvas-tile')].map(b=>b.getAttribute('aria-label'));

function layoutFixture(){
 const p=createProject('Layout');
 p.clips=[
  {id:'camera',mediaId:'m1',name:'Camera',track:'camera',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()},
  {id:'screen',mediaId:'m2',name:'Screen',track:'screen',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()},
 ];
 p.layouts=[{id:'l0',start:3,duration:3,preset:'Picture in picture'}];
 return p;
}

test('Canvas: Video Format shows three tiles, then all of Borumi\'s with Show more, and a preset sets the size',async()=>{
 const {state,element}=harness(createProject('Canvas'),'Canvas'),ui=await mountUI(element());
 try{
  assert.deepEqual(tileLabels(ui.container),['Landscape','Vertical','Square']);
  await clickIn(buttonText(ui.container,'Show more'));await ui.render(element());
  assert.deepEqual(tileLabels(ui.container),['Landscape','Vertical','Square','Portrait','Photo','Custom']);
  await clickIn(named(ui.container,'Portrait'));await ui.render(element());
  assert.equal([state.project.canvas.width,state.project.canvas.height].join('x'),'1080x1350');
  assert.equal(named(ui.container,'Portrait').getAttribute('aria-pressed'),'true');
  assert.equal(state.project.canvas.fps,30,'frame rate is kept');
 }finally{await ui.close();}
});

test('Canvas: a size that matches no preset is Custom, shows its width and height, and collapses with Custom first',async()=>{
 const p=createProject('Custom');p.canvas.width=1000;p.canvas.height=1000;
 const {state,element}=harness(p,'Canvas'),ui=await mountUI(element());
 try{
  assert.deepEqual(tileLabels(ui.container),['Custom','Landscape','Vertical']);
  assert.equal(named(ui.container,'Width').getAttribute('value'),'1000');
  await setField(ui.container,'Width',"1200");await ui.render(element());
  assert.equal(state.project.canvas.width,1200);
 }finally{await ui.close();}
});

test('Canvas: Background is a tab pair; Color sets the solid colour from Borumi\'s swatches, and Moving dots is the pattern',async()=>{
 const {state,element}=harness(createProject('Canvas'),'Canvas'),ui=await mountUI(element());
 try{
  assert.equal(buttonText(ui.container,'Moving dots').getAttribute('aria-selected'),'true','the default project has moving dots');
  assert.equal(BACKGROUND_SWATCHES.length,21);
  await clickIn(buttonText(ui.container,'Color'));await ui.render(element());
  assert.equal(state.project.canvas.backgroundPattern,undefined);
  await clickIn(named(ui.container,'Background #E91E63'));await ui.render(element());
  assert.equal(state.project.canvas.background,'#E91E63');
  await clickIn(buttonText(ui.container,'Moving dots'));await ui.render(element());
  assert.equal(state.project.canvas.backgroundPattern,'moving-dots');
 }finally{await ui.close();}
});

test('Canvas: Padding and Corner radius stay as sliders beneath the colours',async()=>{
 const {state,element}=harness(createProject('Canvas'),'Canvas'),ui=await mountUI(element());
 try{
  await setRange(ui.container,'Padding',96);await ui.render(element());
  await setRange(ui.container,'Corner radius',40);await ui.render(element());
  assert.equal(state.project.canvas.padding,96);assert.equal(state.project.canvas.radius,40);
 }finally{await ui.close();}
});

test('Layout: tiles are Borumi\'s five presets, the Project tab keeps only those in use, and a tile sets the stretch at the playhead',async()=>{
 const {state,element}=harness(layoutFixture(),'Layout',new Set(),4),ui=await mountUI(element());
 try{
  const presets=['Creator','Full frame','Picture in picture','Side by side','Camera spotlight'];
  for(const preset of presets)assert.ok(named(ui.container,preset).classList.contains('layout-tile'));
  assert.equal(named(ui.container,'Picture in picture').getAttribute('aria-pressed'),'true');
  await clickIn(buttonText(ui.container,'Project'));await ui.render(element());
  assert.deepEqual([...ui.container.querySelectorAll('.layout-tile')].map(b=>b.getAttribute('aria-label')),['Picture in picture']);
  await clickIn(buttonText(ui.container,'All'));await ui.render(element());
  await clickIn(named(ui.container,'Full frame'));await ui.render(element());
  assert.equal(state.project.layouts![0].preset,'Full frame');
 }finally{await ui.close();}
});

test('Layout: outside a stretch the Properties drawer sets the camera\'s place, shadow and background removal on the clip',async()=>{
 const {state,element}=harness(layoutFixture(),'Layout',new Set(['camera']),0),ui=await mountUI(element());
 try{
  assert.ok((ui.container.textContent??'').includes('Size & position'));
  await setRange(ui.container,'X',480);await ui.render(element());
  assert.equal(state.project.clips[0].transform.x,.25);
  await setRange(ui.container,'Border radius',24);await ui.render(element());
  assert.equal(state.project.clips[0].transform.borderRadius,24);
  await clickIn(named(ui.container,'Shadow'));await ui.render(element());
  assert.deepEqual(state.project.clips[0].transform.shadow,creatorShadow(state.project.canvas));
  await clickIn(named(ui.container,'Remove background'));await ui.render(element());
  assert.equal(state.project.clips[0].effects.background,'remove');
  assert.equal(ui.container.querySelectorAll('[aria-label="Face centering"]').length,1,'camera cards carry face centering');
 }finally{await ui.close();}
});

test('Layout: inside a stretch the preset sets the place, so Size & position is disabled, and the camera\'s corners still apply',async()=>{
 const {state,element}=harness(layoutFixture(),'Layout',new Set(['camera']),4),ui=await mountUI(element());
 try{
  assert.equal((named(ui.container,'X') as HTMLInputElement).disabled,true);
  assert.ok((ui.container.textContent??'').includes('A Layout stretch sets this clip\'s place'));
  await setRange(ui.container,'Border radius',30);await ui.render(element());
  const t=layoutTransform(state.project,state.project.clips[0],4);
  assert.equal(state.project.layouts![0].cameraCorner!>0,true);
  assert.equal(t.borderRadius,30);
 }finally{await ui.close();}
});
