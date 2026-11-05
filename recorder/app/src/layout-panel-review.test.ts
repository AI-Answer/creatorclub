import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultTransform,defaultEffects,type Project} from '../shared/types';
import {bakeLayouts,layoutTransform,layoutsProblem} from '../shared/layouts';
import {applyProjectChange} from './project-draft';
import {createPlayhead} from './playhead';
const {Inspector}=await import('./Inspector');
function fixture(){const p=createProject('Layout');p.clips=[{id:'camera',mediaId:'m',name:'camera',track:'camera',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];p.layouts=[0,3,6].map((start,i)=>({id:`l${i}`,start,duration:3,preset:'Picture in picture'}));return p;}
function harness(p:Project,selected:string|null,selectedIds:Set<string>){
 const state={project:p},playhead=createPlayhead(7);
 const element=()=>createElement(Inspector,{project:state.project,panel:'Layout',selected,selectedIds,playhead,change:(fn:(p:Project)=>void)=>{state.project=applyProjectChange(state.project,fn);},select:()=>{},onImport:()=>{},onAI:()=>{},club:true});
 return {state,element};
}
/** Layout tiles have no text in Borumi's form; they are found by their preset name. */
const tile=(container:Element,preset:string)=>{const found=container.querySelector<HTMLButtonElement>(`button[aria-label="${preset}"]`);if(!found)throw Error(`Layout tile not found: ${preset}`);return found;};
/** Sets a range input the way a person drags it: the value, then an input event that React reads. */
const setRange=async(container:Element,label:string,value:number)=>act(async()=>{const input=container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));});

test('P2 Inspector applies a preset to every selected layout even when primary selection is a clip',async()=>{
 const {state,element}=harness(fixture(),'camera',new Set(['camera','l0','l1'])),ui=await mountUI(element());
 try{await act(async()=>tile(ui.container,'Side by side').click());assert.deepEqual(state.project.layouts!.map(l=>l.preset),['Side by side','Side by side','Picture in picture']);}finally{await ui.close();}
});
test('P2 the Border radius slider sets the corners of the active layout in preview and export',async()=>{
 const {state,element}=harness(fixture(),'l2',new Set(['l2'])),ui=await mountUI(element());
 try{for(const px of [0,60]){
  await setRange(ui.container,'Border radius',px);await ui.render(element());
  const p=state.project,t=layoutTransform(p,p.clips[0],7);
  assert.equal(t.borderRadius,px,`${px}px in preview`);
  const baked=structuredClone(p);bakeLayouts(baked);assert.equal(baked.clips.find(c=>c.start===6)!.transform.borderRadius,px,`${px}px export`);
  assert.equal(layoutsProblem(p.layouts),null);assert.equal(layoutTransform(p,p.clips[0],4).borderRadius,28,'unselected stretch keeps its corners');
 }}finally{await ui.close();}
});
