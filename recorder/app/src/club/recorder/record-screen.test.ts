import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Project} from '../../../shared/types';
import {createProject} from '../../../shared/types';
import {defaultRecordingSettings,loadRecordingPreferences,saveRecordingPreferences} from '../../recording-presets';
const {Recording}=await import('../../Recording');
const {Foot}=await import('../workspace/Frame');

// The scene menu places itself inside the window.
Object.assign(globalThis,{innerWidth:1440,innerHeight:900});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const click=(element:Element)=>act(async()=>{element.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
const SCRIPT_ONE='First scene words that must only be read in the teleprompter.';

/** A recording with three scenes, each with a script, and the club's own Record screen on it. */
function threeScenes():Project{
 const project=createProject('Hidden features');
 project.scenes[0].name='Opening';project.scenes[0].script=SCRIPT_ONE;
 project.scenes.push({id:'s2',name:'Level 1',script:'Second scene words.',notes:'',start:0,duration:0},{id:'s3',name:'Level 2',script:'Third scene words.',notes:'',start:0,duration:0});
 return project;
}
const off={camera:false,microphone:false,screen:false,systemAudio:false};
async function mountRecord(project:Project,extra:Record<string,unknown>={},selection:typeof off=off){
 localStorage.clear();
 saveRecordingPreferences({...loadRecordingPreferences(),current:{...defaultRecordingSettings(),selection}});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input)==='/api/club/disk'?Response.json({freeBytes:500*1024**3,low:false}):Response.json([]);
 Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})},configurable:true});
 const errors:string[]=[];
 const props={project,change:()=>{},onRecorded:()=>{},onError:(message:string)=>errors.push(message),club:true,...extra};
 const ui=await mountUI(createElement(Recording,props));
 await flush();await flush();
 return {ui,errors,props,close:async()=>{await ui.close();globalThis.fetch=originalFetch;}};
}
const selectedScene=(root:Element)=>root.querySelector('.rsc-scene.is-selected')?.getAttribute('data-scene-id');

test('Record is Borumi\'s two columns: the sources on the left, then a card per scene with its script and its own Record',async()=>{
 const {ui,close}=await mountRecord(threeScenes(),{onAutoCut:()=>{},onVisualize:()=>{}});
 try{
  const c=ui.container,left=c.querySelector('.club-record-left')!;
  assert.ok(left.querySelector('aside[aria-label="Recording sources"]'),'the source rows are always shown, as in Borumi');
  assert.ok(left.textContent?.includes('3-second countdown'),'with the countdown option under them');
  assert.ok(c.querySelector('.recording-presets'),'Recording presets are there (in the header when there is one)');
  const cards=[...c.querySelectorAll('.rsc-scene')];
  assert.equal(cards.length,3,'one card per scene');
  assert.equal(cards[0].querySelector('.rsc-script')?.textContent,SCRIPT_ONE,'each card shows its script');
  assert.equal(cards.filter(card=>card.querySelector('.rsc-record-button')).length,3,'a scene without a take has its own Record');
  assert.equal(c.querySelectorAll('.rsc-add-between').length,3,'Add scene after each card (the CSS shows only the last, as in Borumi)');
  assert.equal(c.querySelector('.rsc-quick-actions'),null,'no SceneForge quick actions on the cards');
 }finally{await close();}
});

test('a scene\'s Record selects that scene and says what to choose when no source is on',async()=>{
 const {ui,errors,close}=await mountRecord(threeScenes());
 try{
  const c=ui.container,first=c.querySelector('.rsc-scene')!;
  assert.equal(selectedScene(c),first.getAttribute('data-scene-id'),'the first scene without a take is selected without a click');
  await click(first.querySelector('.rsc-record-button')!);
  assert.deepEqual(errors,['Choose at least one recording source.']);
 }finally{await close();}
});

test('a scene\'s gear menu has Record new, Record over, Import, Add scene after and Delete; Import asks for that scene',async()=>{
 const imported:string[]=[];
 const {ui,close}=await mountRecord(threeScenes(),{onImport:(id:string)=>imported.push(id)});
 try{
  const c=ui.container,card=c.querySelector('.rsc-scene')!;
  await click(card.querySelector('.rsc-gear')!);
  const items=[...c.querySelectorAll('[role=menu] [role=menuitem]')].map(item=>item.textContent?.trim());
  for(const item of ['Record new…','Record over…','Import media from file…','Add scene after','Delete scene'])assert.ok(items.includes(item),item);
  await click([...c.querySelectorAll('[role=menuitem]')].find(item=>item.textContent?.trim()==='Import media from file…')!);
  assert.deepEqual(imported,[card.getAttribute('data-scene-id')]);
 }finally{await close();}
});

test('a scene the strip picks is selected once, and the scene the recorder reports back is not taken as a pick, so the two never chase each other',async()=>{
 const reported:string[]=[];
 const project=threeScenes();
 const {ui,props,close}=await mountRecord(project,{onSceneChange:(id:string)=>reported.push(id),selectNonce:0});
 try{
  const c=ui.container;
  assert.equal(selectedScene(c),project.scenes[0].id,'opens on the first scene without a take');
  // The page echoes the reported scene back as the strip's scene, with the same nonce: nothing moves.
  await ui.render(createElement(Recording,{...props,selectSceneId:project.scenes[1].id,selectNonce:0}));
  await flush();
  assert.equal(selectedScene(c),project.scenes[0].id,'an echo with no new pick changes nothing');
  // A pick in the strip carries a new nonce.
  await ui.render(createElement(Recording,{...props,selectSceneId:project.scenes[2].id,selectNonce:1}));
  await flush();
  assert.equal(selectedScene(c),project.scenes[2].id,'a new pick selects that scene');
  await flush();await flush();
  assert.equal(selectedScene(c),project.scenes[2].id,'and it stays selected');
  assert.deepEqual(reported,[project.scenes[0].id,project.scenes[2].id],'each change is reported once');
 }finally{await close();}
});

test('the scene a page opens on (chosen in Plan) is selected when Record opens',async()=>{
 const project=threeScenes();
 const {ui,close}=await mountRecord(project,{selectSceneId:project.scenes[1].id,selectNonce:0});
 try{
  assert.equal(selectedScene(ui.container),project.scenes[1].id);
 }finally{await close();}
});

test('the bottom bar is Borumi\'s step bar: Back to the previous step, the five steps, and Continue',async()=>{
 const calls:string[]=[];
 const video={id:'v1',title:'Hidden features',stage:'recording'} as unknown as Parameters<typeof Foot>[0]['video'];
 const ui=await mountUI(createElement(Foot,{video,tab:'record',facts:{stage:'recording',hasRecording:true},onTab:tab=>calls.push(`tab:${tab}`),onLocked(){},
  next:{label:'Continue to edit',run:()=>calls.push('next'),disabled:false,primary:true}}));
 try{
  assert.deepEqual([...ui.container.querySelectorAll('.ws-step')].map(step=>step.textContent),['Board','Plan','Record','Edit','Publish']);
  assert.equal(ui.container.querySelector('.ws-step.on')?.textContent,'Record');
  await click(button(ui.container,'Back to Plan'));
  await click(button(ui.container,'Continue to edit'));
  assert.deepEqual(calls,['tab:plan','next']);
  await ui.render(createElement(Foot,{video,tab:'board',facts:{stage:'recording',hasRecording:true},onTab(){},onLocked(){}}));
  assert.equal(ui.container.querySelector('.ws-back'),null,'the first step has no Back');
  assert.equal(ui.container.querySelector('.ws-foot .r button'),null,'no Continue without a next step');
 }finally{await ui.close();}
});
