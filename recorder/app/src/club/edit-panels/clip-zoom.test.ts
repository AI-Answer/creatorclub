import test from 'node:test';
import assert from 'node:assert/strict';
import {mountUI,button} from '../../test-dom';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,NOISE_ON,noiseStrength,voiceLevel,type Clip,type Project} from '../../../shared/types';
import {applyProjectChange} from '../../project-draft';
import {createPlayhead} from '../../playhead';

const {ClubClipPanel,positionToSpeed,speedToPosition,dbToGain}=await import('../../ClubClipPanel');
const {ZoomPanel}=await import('../../ZoomPanel');

/** A take of four sources, as the recorder writes it: camera, microphone, system audio and screen, all linked. */
function fixture(){
 const p=createProject('Take');
 p.scenes=[{id:'scene',name:'Scene 2',script:'',notes:'',start:0,duration:12}];
 p.media=['camera','mic','system','screen'].map(id=>({id,name:id,path:`/tmp/${id}`,kind:id==='mic'||id==='system'?'audio' as const:'video' as const,duration:20,width:1920,height:1080,hasAudio:id==='mic'||id==='system'}));
 p.clips=([['camera','camera',undefined],['mic','audio','microphone'],['system','audio','system'],['screen','screen',undefined]] as const).map(([id,track,role])=>({
  id,mediaId:id,name:id,track,...(role?{audioRole:role}:{}),start:0,sourceIn:0,sourceOut:12,speed:1,gain:1,muted:false,linkId:'take',transform:defaultTransform(),effects:defaultEffects(),
 })) as Clip[];
 return p;
}

/** Sets a native control the way a person does, so React's change handlers run. */
async function setValue(el:HTMLInputElement|HTMLSelectElement,value:string,event:'input'|'change'){
 const proto=Object.getPrototypeOf(el);
 await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event(event,{bubbles:true}));});
}

test('Clip panel: Borumi groups, Enhance Voice, Remove Noise, Volume, Speed and the take sources all change real settings',async()=>{
 let p=fixture();
 const change=(fn:(d:Project)=>void)=>{p=applyProjectChange(p,fn);};
 const mic=()=>p.clips.find(c=>c.id==='mic')!,camera=()=>p.clips.find(c=>c.id==='camera')!;
 const view=()=>createElement(ClubClipPanel,{project:p,clip:mic(),change});
 const ui=await mountUI(view());
 const rerender=()=>ui.render(view());
 const field=(label:string)=>ui.container.querySelector<HTMLInputElement&HTMLSelectElement>(`[aria-label="${label}"]`)!;
 // The title holds its secondary value too, as Borumi's does: "Volume(6 dB)".
 const subOf=(title:string)=>[...ui.container.querySelectorAll<HTMLElement>('.br-sub')].find(s=>s.querySelector('.br-sub-title')?.textContent?.startsWith(title))!;
 try{
  assert.deepEqual([...ui.container.querySelectorAll('[data-clip-control-group]')].map(el=>el.getAttribute('data-clip-control-group')),['microphone','system','camera','timing','speed']);

  // Enhance Voice offers Borumi's three levels and shows the description of the one in use.
  assert.deepEqual([...field('Enhance Voice').querySelectorAll('option')].map(o=>o.textContent),['Disabled','Minimal','Extended']);
  assert.match(ui.container.textContent!,/Keep the original voice audio unchanged\./);
  await setValue(field('Enhance Voice'),'extended','change');await rerender();
  assert.equal(voiceLevel(mic().effects),'extended');assert.equal(mic().effects.normalize,true);
  assert.match(ui.container.textContent!,/Add level balancing, normalization, EQ, and noise reduction\./);

  // Remove Noise: the switch turns on at Borumi's 0.93, the strength slider sets any value, and 0 switches it off.
  await act(async()=>field('Remove Noise').click());await rerender();
  assert.equal(noiseStrength(mic().effects),NOISE_ON);assert.match(ui.container.textContent!,/\(93%\)/);
  await setValue(field('Remove Noise strength'),'0.5','input');await rerender();
  assert.equal(noiseStrength(mic().effects),.5);assert.match(ui.container.textContent!,/\(50%\)/);
  assert.match(ui.container.textContent!,/Off/);assert.match(ui.container.textContent!,/Max/);
  await setValue(field('Remove Noise strength'),'0','input');await rerender();
  assert.equal(mic().effects.denoise,false);assert.equal(field('Remove Noise strength'),null);

  // Volume is Borumi's -30..30 dB range, shown in brackets next to the title, and writes the gain.
  assert.equal(field('Volume').getAttribute('min'),'-30');assert.equal(field('Volume').getAttribute('max'),'30');
  await setValue(field('Volume'),'6','input');await rerender();
  assert.equal(mic().gain,dbToGain(6));assert.match(subOf('Volume').textContent!,/\(6 dB\)/);

  // Mute is still here, as CreatorClub's own control.
  await act(async()=>field('Mute').click());await rerender();
  assert.equal(mic().muted,true);

  // Camera: Mirror and Face Centering are switches, Background mode is a select, Color adjustments reset to their neutral values.
  await act(async()=>field('Mirror').click());await rerender();
  assert.equal(camera().effects.flipX,true);
  await act(async()=>field('Face Centering').click());await rerender();
  assert.equal(camera().effects.faceCenter,true);
  assert.deepEqual([...field('Background mode').querySelectorAll('option')].map(o=>o.textContent),['None','Blur','Remove']);
  await setValue(field('Background mode'),'blur','change');await rerender();
  assert.equal(camera().effects.background,'blur');
  await setValue(field('Exposure'),'.5','input');await rerender();
  assert.equal(camera().effects.brightness,.5);
  await act(async()=>subOf('Exposure').querySelector('button')!.click());await rerender();
  assert.equal(camera().effects.brightness,0);

  // Timing folds, and its fields are still the take-wide edits.
  const timing=ui.container.querySelector<HTMLButtonElement>('[data-clip-control-group="timing"] button')!;
  assert.equal(timing.getAttribute('aria-expanded'),'true');assert.ok(field('Trim in'));
  await act(async()=>timing.click());await rerender();
  assert.equal(timing.getAttribute('aria-expanded'),'false');assert.equal(ui.container.querySelector('[aria-label="Trim in"]'),null);
  await act(async()=>timing.click());await rerender();

  // Speed: Borumi's breakpoint slider (position 1.5 is 1.5x), the value in brackets, and Reset back to 1.
  await setValue(field('Speed'),'1.5','input');await rerender();
  assert.equal(mic().speed,1.5);assert.match(subOf('Speed').textContent!,/\(1\.5x\)/);
  await act(async()=>subOf('Speed').querySelector('button')!.click());await rerender();
  assert.equal(mic().speed,1);
 }finally{await ui.close();}
});

test('breakpoint speed slider: equal bands per breakpoint pair, snapped steps, and the export limits at both ends',()=>{
 assert.equal(speedToPosition(1),1);assert.equal(speedToPosition(.25),0);assert.equal(speedToPosition(16),3);assert.equal(speedToPosition(100),3);
 assert.equal(positionToSpeed(0),.25);assert.equal(positionToSpeed(3),16);assert.equal(positionToSpeed(1.5),1.5);
 assert.equal(positionToSpeed(speedToPosition(2.5)),2.5);
 // The band from 2x to 16x snaps to tenths, the bands below to hundredths.
 assert.equal(positionToSpeed(2.0357),2.5);assert.equal(positionToSpeed(1.2345),1.23);
});

test('Zoom panel: Screen Zoom and Camera Zoom add, edit, list and delete zooms of their own kind, and an add needs a clip of that kind under the playhead',async()=>{
 let p=fixture(),selected:string|null=null;
 const playhead=createPlayhead(3);
 const change=(fn:(d:Project)=>void)=>{p=applyProjectChange(p,fn);};
 const view=()=>createElement(ZoomPanel,{project:p,selected,playhead,change,select:(id:string)=>{selected=id;}});
 const ui=await mountUI(view());
 const rerender=()=>ui.render(view());
 try{
  assert.match(ui.container.textContent!,/Screen Zoom/);assert.match(ui.container.textContent!,/Camera Zoom/);
  assert.match(ui.container.textContent!,/No screen zoom is currently selected\./);
  await act(async()=>button(ui.container,'Add screen zoom').click());await rerender();
  assert.equal(p.zooms.length,1);assert.equal(p.zooms[0].target,'screen');assert.equal(p.zooms[0].start,3);assert.equal(selected,p.zooms[0].id);
  assert.match(ui.container.textContent!,/In this video/);assert.match(ui.container.textContent!,/Zoom on the screen/);

  // How close and How long edit the selected zoom.
  await act(async()=>button(ui.container,'Close').click());await rerender();
  assert.equal(p.zooms[0].scale,2);
  await act(async()=>button(ui.container,'5 s').click());await rerender();
  assert.equal(p.zooms[0].duration,5);

  // A camera zoom needs a camera clip under the playhead: at 3 s there is one, at 15 s there is not.
  assert.equal(button(ui.container,'Add camera zoom').disabled,false);
  await act(async()=>playhead.set(15));
  assert.equal(button(ui.container,'Add camera zoom').disabled,true);
  assert.match(ui.container.textContent!,/Move the playhead over a camera clip to add one\./);
  await act(async()=>playhead.set(3));

  await act(async()=>button(ui.container,'Delete zoom').click());await rerender();
  assert.equal(p.zooms.length,0);
  assert.equal(ui.container.textContent!.includes('In this video'),false);
 }finally{await ui.close();}
});
