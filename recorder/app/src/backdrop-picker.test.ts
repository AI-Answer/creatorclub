import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultTransform,defaultEffects,type Media,type Project} from '../shared/types';
import {applyProjectChange} from './project-draft';
import {createPlayhead} from './playhead';
import {backdropFileProblem,personSegmentationAvailable} from './backdrop-picker';
const {Inspector}=await import('./Inspector');

const media=(id:string,kind:Media['kind']):Media=>({id,name:id+(kind==='image'?'.png':'.mp4'),path:'/tmp/'+id,kind,duration:3,width:16,height:9});
function fixture(){
 const p=createProject('Backdrop');
 p.media=[media('cam','video'),media('screen','video')];
 p.clips=[{id:'camera',mediaId:'cam',name:'camera',track:'camera',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()},
  {id:'screen',mediaId:'screen',name:'screen',track:'screen',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];
 return p;
}
function harness(p:Project){
 const state={project:p,notices:[] as string[]},playhead=createPlayhead(1);
 const element=()=>createElement(Inspector,{project:state.project,panel:'Layout',selected:'camera',selectedIds:new Set(['camera']),playhead,change:(fn:(p:Project)=>void)=>{state.project=applyProjectChange(state.project,fn);},select:()=>{},onImport:()=>{},onAI:()=>{},club:true,onNotice:(m:string)=>state.notices.push(m)});
 return {state,element};
}
const select=async(container:Element,label:string,value:string)=>act(async()=>{const el=container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);if(!el)throw Error(`No select ${label}`);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});
const toggle=(container:Element,label:string)=>{const el=container.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`);if(!el)throw Error(`No switch ${label}`);return el;};
const desktop=(bridge:Record<string,unknown>|undefined)=>Object.defineProperty(window,'sceneForge',{value:bridge,configurable:true,writable:true});

test('Remove background offers a Background picker, and each choice lands on the camera clip',async()=>{
 desktop({platform:'darwin',chooseMedia:async()=>['/Users/me/beach.png']});
 const realFetch=globalThis.fetch,requests:string[]=[];
 globalThis.fetch=(async(url:string,init?:{body?:string})=>{requests.push(`${url} ${init?.body??''}`);return new Response(JSON.stringify([media('beach','image')]),{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
 const {state,element}=harness(fixture()),ui=await mountUI(element());
 const fx=()=>state.project.clips[0].effects;
 try{
  assert.equal(ui.container.querySelector('select[aria-label="Background"]'),null,'no picker until the background is removed');
  await act(async()=>toggle(ui.container,'Remove background').click());await ui.render(element());
  assert.equal(fx().background,'remove');
  await select(ui.container,'Background','color');await ui.render(element());
  assert.equal(fx().backdrop?.kind,'color');
  assert.ok(ui.container.querySelector('[aria-label="Background color"]'),'a colour field appears');
  await select(ui.container,'Background','screen');await ui.render(element());
  assert.deepEqual(fx().backdrop,{kind:'screen'});
  // Picture imports a file through the usual media import and keeps it in the project.
  await select(ui.container,'Background','image');await ui.render(element());
  assert.deepEqual(fx().backdrop,{kind:'image',mediaId:'beach'});
  assert.ok(state.project.media.some(m=>m.id==='beach'));
  assert.match(requests[0],/\/api\/media\/import .*beach\.png/);
  assert.match(ui.container.textContent??'',/beach\.png/);
  await select(ui.container,'Background','blur');await ui.render(element());
  assert.equal(fx().background,'blur');assert.equal(toggle(ui.container,'Remove background').getAttribute('aria-checked'),'true','blur still counts as removing the background');
  // Another clip using a picture already: choosing Picture reuses it instead of asking for a file.
  await act(async()=>{state.project=applyProjectChange(state.project,d=>{d.clips[1].effects.backdrop={kind:'image',mediaId:'beach'};});});await ui.render(element());
  await select(ui.container,'Background','image');await ui.render(element());
  assert.deepEqual(fx().backdrop,{kind:'image',mediaId:'beach'});assert.equal(requests.length,1);
  // A wrong kind of file is refused with a plain message and changes nothing.
  await select(ui.container,'Background','video');await ui.render(element());
  assert.equal(fx().backdrop?.kind,'image');assert.match(state.notices.at(-1)??'',/beach\.png is a picture\. Choose a video/);
  await select(ui.container,'Background','none');await ui.render(element());
  assert.equal(fx().background,'remove');assert.equal(fx().backdrop,undefined);
  await act(async()=>toggle(ui.container,'Remove background').click());await ui.render(element());
  assert.equal(fx().background,'none');
 }finally{globalThis.fetch=realFetch;desktop(undefined);await ui.close();}
});

test('on Windows the background controls explain that macOS Vision is needed',async()=>{
 desktop({platform:'win32'});
 const {element}=harness(fixture()),ui=await mountUI(element());
 try{
  assert.match(ui.container.textContent??'',/uses macOS Vision/);
  assert.equal(toggle(ui.container,'Remove background').disabled,true);
  assert.equal(ui.container.querySelector('select[aria-label="Background"]'),null);
 }finally{desktop(undefined);await ui.close();}
 // A project made on a Mac can still switch it off there.
 desktop({platform:'win32'});
 const p=fixture();p.clips[0].effects.background='remove';
 const second=harness(p),ui2=await mountUI(second.element());
 try{assert.equal(toggle(ui2.container,'Remove background').disabled,false);}finally{desktop(undefined);await ui2.close();}
});

test('segmentation availability and file checks',()=>{
 assert.equal(personSegmentationAvailable('darwin'),true);
 assert.equal(personSegmentationAvailable('MacIntel'),true);
 assert.equal(personSegmentationAvailable('win32'),false);
 assert.equal(personSegmentationAvailable('Linux x86_64'),false);
 assert.equal(backdropFileProblem('image',{kind:'image',name:'a.png'}),undefined);
 assert.match(backdropFileProblem('image',{kind:'video',name:'a.mp4'})!,/a\.mp4 is a video\. Choose a picture/);
 assert.match(backdropFileProblem('video',{kind:'audio',name:'a.mp3'})!,/is audio/);
});
