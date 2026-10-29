import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Project} from '../../../shared/types';
import {createProject} from '../../../shared/types';
import {defaultRecordingSettings,loadRecordingPreferences,saveRecordingPreferences} from '../../recording-presets';
import {recordLabel} from './RecordBar';
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
async function mountRecord(project:Project,extra:Record<string,unknown>={}){
 localStorage.clear();
 saveRecordingPreferences({...loadRecordingPreferences(),current:{...defaultRecordingSettings(),selection:{camera:false,microphone:false,screen:false,systemAudio:false}}});
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

test('the Record button names the scene, and says again once it has a take',()=>{
 assert.equal(recordLabel(2,false),'Record scene 2');
 assert.equal(recordLabel(1,true),'Record scene 1 again');
});

test('Record shows the readiness line, a Change control and one big Record button; the source rows are not shown until Change',async()=>{
 const {ui,close}=await mountRecord(threeScenes());
 try{
  const c=ui.container;
  assert.equal(c.querySelector('.club-readiness')?.textContent,'No source is on. Choose one under Change.','with every source off the line says what to do');
  assert.equal(c.querySelectorAll('.club-record-button').length,1,'one Record button');
  const sources=c.querySelector<HTMLElement>('.club-sources')!;
  assert.equal(sources.hidden,true,'the sources, presets and countdown sit in the sheet, closed at first');
  assert.ok(sources.querySelector('aside[aria-label="Recording sources"]'),'the source rows are in it');
  assert.ok(sources.querySelector('.recording-presets'),'and the presets');
  assert.ok(sources.textContent?.includes('3-second countdown'),'and the countdown option');
  assert.equal(c.querySelector('.recording-main > .recording-card-options'),null,'nothing of it is left beside the cards');
  const change=button(c,'Change');
  assert.equal(change.getAttribute('aria-expanded'),'false');
  await click(change);
  assert.equal(sources.hidden,false,'Change opens the sheet');
  assert.equal(change.getAttribute('aria-expanded'),'true');
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  assert.equal(sources.hidden,true,'Escape closes it');
  await click(change);
  await act(async()=>{document.dispatchEvent(new Event('pointerdown',{bubbles:true}));});
  assert.equal(sources.hidden,true,'and so does a press outside it');
 }finally{await close();}
});

test('the Record button is enabled for the selected scene, which is the first without a take, and says why when no source is on',async()=>{
 const {ui,errors,close}=await mountRecord(threeScenes());
 try{
  const c=ui.container,record=c.querySelector<HTMLButtonElement>('.club-record-button')!;
  assert.equal(record.disabled,false);
  assert.equal(record.textContent,'Record scene 1');
  assert.equal(selectedScene(c),c.querySelector('.rsc-scene')?.getAttribute('data-scene-id'),'the first scene is selected without a click');
  await click(record);
  assert.deepEqual(errors,['Choose at least one recording source.'],'it acts: with no source on it says what to choose');
 }finally{await close();}
});

test('scene cards are compact: number, title, status; no script, no Remove pauses or Style video, no per-scene Record, no reorder or rename',async()=>{
 const {ui,close}=await mountRecord(threeScenes(),{onAutoCut:()=>{},onVisualize:()=>{}});
 try{
  const c=ui.container,cards=[...c.querySelectorAll('.rsc-scene')];
  assert.equal(cards.length,3);
  assert.deepEqual(cards.map(card=>card.querySelector('.rsc-number')?.textContent),['1','2','3']);
  assert.deepEqual(cards.map(card=>card.querySelector('.rsc-scene-title')?.textContent),['Opening','Level 1','Level 2']);
  assert.deepEqual(cards.map(card=>card.querySelector('.rsc-status-text')?.textContent),['Not recorded','Not recorded','Not recorded']);
  assert.equal(c.textContent?.includes(SCRIPT_ONE),false,'the script is not on the cards: only the teleprompter shows it');
  assert.equal(c.querySelector('.rsc-script'),null);
  for(const gone of ['.rsc-quick-actions','.rsc-record-button','.rsc-record-tile','.rsc-import','.rsc-add-between','.rsc-scene-grip','.rsc-scene-name'])assert.equal(c.querySelector(gone),null,gone);
  assert.equal(c.textContent?.includes('Remove pauses')||c.textContent?.includes('Style video'),false);
  assert.equal(c.querySelectorAll('.rsc-scene-menu-anchor').length,1,'only the selected scene has a menu');
  assert.ok(c.querySelector('.rsc-scene.is-selected .rsc-scene-menu-anchor'));
  assert.equal(c.textContent?.includes('YOUR SCRIPT'),false,'nor is the script shown while recording');
 }finally{await close();}
});

test('the selected scene menu keeps Record over and Import; Import asks for that scene',async()=>{
 const imported:string[]=[];
 const {ui,close}=await mountRecord(threeScenes(),{onImport:(id:string)=>imported.push(id)});
 try{
  const c=ui.container,selected=c.querySelector('.rsc-scene.is-selected')!;
  await click(selected.querySelector('.rsc-gear')!);
  const items=[...c.querySelectorAll('[role=menu] [role=menuitem]')].map(item=>item.textContent?.trim());
  assert.deepEqual(items,['Record over…','Import media from file…']);
  assert.equal((c.querySelector('[role=menu] [role=menuitem]') as HTMLButtonElement).disabled,true,'Record over needs a take');
  await click([...c.querySelectorAll('[role=menuitem]')].find(item=>item.textContent?.trim()==='Import media from file…')!);
  assert.deepEqual(imported,[selectedScene(c)]);
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
  assert.equal(c.querySelector('.club-record-button')?.textContent,'Record scene 3');
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
  assert.equal(ui.container.querySelector('.club-record-button')?.textContent,'Record scene 2');
 }finally{await close();}
});

test('the bottom bar has Back and Continue only, with no second set of steps',async()=>{
 const calls:string[]=[];
 const ui=await mountUI(createElement(Foot,{tab:'record',backLabel:'Back to production',back:{name:'production',view:'board'},onTab:tab=>calls.push(tab),next:{label:'Continue to edit',run:()=>calls.push('next'),disabled:false,primary:true}}));
 try{
  assert.deepEqual([...ui.container.querySelectorAll('button,a')].map(el=>el.textContent?.trim()),['Back to plan','Continue to edit']);
  assert.equal(ui.container.querySelector('.steps'),null);
  await click(button(ui.container,'Back to plan'));await click(button(ui.container,'Continue to edit'));
  assert.deepEqual(calls,['plan','next']);
 }finally{await ui.close();}
});
