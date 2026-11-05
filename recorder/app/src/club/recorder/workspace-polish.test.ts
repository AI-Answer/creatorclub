import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {readFileSync} from 'node:fs';
import type {Video} from '../../../shared/club';
const {Foot,Header}=await import('../workspace/Frame');
import {continueFor,showHeaderStage,tabDone,workspaceShortcut} from '../workspace/rules';
import {shortcutDefinitions} from '../../shortcuts';

const video:Video={id:'demo',title:'A test video',stage:'recording',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
const facts={stage:'recording' as const,hasRecording:false,scenes:[]};
const press=(target:EventTarget,key:string,extra:KeyboardEventInit={})=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key,metaKey:true,bubbles:true,cancelable:true,...extra}));});

test('step keys map to Idea, Record, Edit and Publish without colliding with native and editor shortcuts',()=>{
 assert.deepEqual(['1','2','3','4'].map(key=>workspaceShortcut({key,metaKey:true})),['idea','record','edit','publish']);
 for(const key of ['1','2','3','4','Enter']){
  assert.equal(workspaceShortcut({key,metaKey:true,shiftKey:true}),undefined);
  assert.equal(workspaceShortcut({key,metaKey:true,isComposing:true}),undefined);
  assert.equal(workspaceShortcut({key,metaKey:true,repeat:true}),undefined);
  assert.equal(workspaceShortcut({key}),undefined);
 }
 assert.equal(workspaceShortcut({key:'Enter',ctrlKey:true}),'continue');
 assert.equal(shortcutDefinitions.some(d=>d.bindings.some(b=>['1','2','3','4'].includes(b.key??'')&&b.modifiers.includes('Mod'))),false);
 assert.ok(shortcutDefinitions.find(d=>d.id==='createSceneAtCursor')?.editable==='script','script Cmd+Enter must stay in the script');
});

test('Continue is disabled with an accessible reason, shortcuts respect fields and dialogs, and enabled Continue runs once',async()=>{
 const seen:string[]=[];
 let ran=0;
 const rule=continueFor('record',facts)!;
 const props={video,tab:'record' as const,facts,onTab:(tab:string)=>seen.push(tab),next:{...rule,run:()=>ran++}};
 const ui=await mountUI(createElement(Foot,props));
 try{
  const next=button(ui.container,'Continue to editing');
  assert.equal(next.disabled,true);assert.equal(next.classList.contains('primary'),false);
  assert.equal(document.getElementById(next.getAttribute('aria-describedby')!)?.textContent,'Record a scene first');
  await press(document.body,'Enter');assert.equal(ran,0);
  for(const key of ['1','3','4'])await press(document.body,key);
  assert.deepEqual(seen,['idea','edit','publish']);
  const field=document.createElement('textarea');ui.container.append(field);
  await press(field,'1');await press(field,'Enter');assert.equal(seen.length,3);assert.equal(ran,0);field.remove();
  const dialog=document.createElement('div');dialog.setAttribute('role','dialog');ui.container.append(dialog);
  await press(document.body,'1');assert.equal(seen.length,3);dialog.remove();
  const done={...facts,allRecorded:true};
  await ui.render(createElement(Foot,{...props,facts:done,next:{...continueFor('record',done)!,run:()=>ran++}}));
  assert.equal(button(ui.container,'Continue to editing').disabled,false);
  assert.equal(button(ui.container,'Continue to editing').classList.contains('primary'),true);
  await press(document.body,'Enter');assert.equal(ran,1);
 }finally{await ui.close();}
});

test('the header has no stage on any step; completed steps keep their icons with a separate check badge',async()=>{
 for(const [stage,tab,shown] of [['ideas','idea',false],['planning','idea',false],['recording','record',false],['editing','edit',false],['publishing','publish',false],['editing','idea',false],['published','publish',false]] as const)assert.equal(showHeaderStage(stage,tab),shown);
 assert.equal(tabDone('edit',{stage:'publishing'}),false,'dragging a card is not evidence of an exported edit');
 const ui=await mountUI(createElement(Header,{video,tab:'record',onTitle(){},onStage(){},onDelete(){}}));
 try{
  assert.equal(ui.container.querySelector('.ws-stage'),null);
  await ui.render(createElement(Header,{video,tab:'idea',onTitle(){},onStage(){},onDelete(){}}));
  assert.equal(ui.container.querySelector('.ws-stage'),null);
  await ui.render(createElement(Foot,{video,tab:'edit',facts:{...facts,allRecorded:true},onTab(){}}));
  assert.equal(ui.container.querySelector('.ws-step.done')?.getAttribute('aria-description'),'Done');
  await ui.render(createElement(Foot,{video,tab:'record',facts:{...facts,allRecorded:true,scenes:[{takes:[]}]},onTab(){}}));
  assert.ok(ui.container.querySelector('.ws-step.on .well .ws-step-check'));
  assert.equal(ui.container.querySelectorAll('.ws-step.on .well svg').length,2);
  assert.notEqual(ui.container.querySelector('.ws-step.on .well>svg')?.innerHTML,ui.container.querySelector('.ws-step.done .well>svg')?.innerHTML,'each step keeps its own icon');
 }finally{await ui.close();}
});

test('timeline ruler text meets 4.5:1 in both themes using the actual surface and text tokens',()=>{
 const css=readFileSync(new URL('../../editing-club.css',import.meta.url),'utf8');
 assert.match(css,/\.club-ruler \.tick>b\{[^}]*color:var\(--cc-text-2\)/);
 const tokens=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
 const blocks=tokens.split('.club-root:where(');
 const lum=(rgb:number[])=>rgb.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
 const rgb=(text:string)=>text.startsWith('#')?text.slice(1).match(/../g)!.map(n=>parseInt(n,16)):text.match(/[\d.]+/g)!.map(Number);
 for(const block of blocks.slice(0,2)){
  const value=(name:string)=>block.match(new RegExp(`--cc-${name}:\\s*([^;]+)`))![1].trim();
  const bg=rgb(value('surface')),ink=rgb(value('text-2'));
  const fg=ink.length===4?ink.slice(0,3).map((n,i)=>n*ink[3]+bg[i]*(1-ink[3])):ink;
  const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
  assert.ok(ratio>=4.5,`ruler contrast ${ratio.toFixed(2)}:1`);
 }
});

test('auto-edit names its running action and percent, and Cancel stops the server job',async()=>{
 const {EditAutoSheet}=await import('./EditAutoSheet');
 const {createProject}=await import('../../../shared/types');
 const {installFetch}=await import('../test-fakes');
 const job={id:'pause-job',projectId:'demo',kind:'auto-cut' as const,status:'running' as const,progress:.42,message:'Analyzing audio',createdAt:'',updatedAt:'',automatic:false,applied:false,undone:false};
 const merged:unknown[]=[];
 const server=installFetch(call=>call.path==='/api/automation/pause-job'&&call.method==='DELETE'?{body:{...job,status:'cancelled'}}:undefined);
 const ui=await mountUI(createElement(EditAutoSheet,{project:createProject(),jobs:[job],merge:j=>merged.push(j),reload:async()=>{},flush:async()=>undefined,change(){},refresh:async()=>{},onPreview(){},onClose(){},notify(){},onMakeCaptions:async()=>{}}));
 try{
  assert.ok(ui.container.querySelector('[role=status]')?.textContent?.includes('Finding pauses · 42%'));
  assert.equal(ui.container.querySelector('progress')?.getAttribute('value'),'0.42');
  await act(async()=>button(ui.container,'Cancel').click());
  assert.deepEqual(merged,[{...job,status:'cancelled'}]);
 }finally{await ui.close();server.restore();}
});

test('empty Edit points back to recording, while a kept scene points to export',()=>{
 assert.equal(continueFor('edit',facts)?.reason,'Record a scene or import media first');
 assert.equal(continueFor('edit',{...facts,allRecorded:true})?.reason,'Export the video first');
 assert.equal(continueFor('edit',{...facts,exported:true})?.primary,true);
});
