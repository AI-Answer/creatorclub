import {mountUI,button} from './test-dom';
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
test('P2 Inspector applies a preset to every selected layout even when primary selection is a clip',async()=>{
 const {state,element}=harness(fixture(),'camera',new Set(['camera','l0','l1'])),ui=await mountUI(element());
 try{await act(async()=>button(ui.container,'Side by side').click());assert.deepEqual(state.project.layouts!.map(l=>l.preset),['Side by side','Side by side','Picture in picture']);}finally{await ui.close();}
});
test('P2 Square, Rounded and Circle affect the active layout in preview and export',async()=>{
 const {state,element}=harness(fixture(),'l2',new Set(['l2'])),ui=await mountUI(element());
 try{for(const [name,ratio] of [['Square',0],['Rounded',.12],['Circle',.5]] as const){
  await act(async()=>button(ui.container,name).click());await ui.render(element());
  const p=state.project,t=layoutTransform(p,p.clips[0],7),expected=Math.round(ratio*Math.min(t.width*p.canvas.width,t.height*p.canvas.height));
  assert.equal(t.borderRadius,expected,name);assert.equal(button(ui.container,name).getAttribute('aria-pressed'),'true');
  const baked=structuredClone(p);bakeLayouts(baked);assert.equal(baked.clips.find(c=>c.start===6)!.transform.borderRadius,expected,`${name} export`);
  assert.equal(layoutsProblem(p.layouts),null);assert.equal(layoutTransform(p,p.clips[0],4).borderRadius,28,'unselected stretch keeps its corners');
 }}finally{await ui.close();}
});
