import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {mountUI,button} from '../../test-dom';
import {createProject,defaultEffects,defaultTransform} from '../../../shared/types';
import {usedRows,timelineStamp} from '../../TimelineClub';
const {VideoPreview}=await import('../../Recording');
import {MicLevel} from './MicLevel';
import {MeterAudio} from '../../recording-meter';

const footage=()=>{const p=createProject();p.scenes[0]={...p.scenes[0],name:'Opening',script:'Planned words',duration:8};p.clips=[{id:'clip',mediaId:'media',name:'Opening',track:'screen',start:0,sourceIn:0,sourceOut:8,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];return p;};

test('planned scene text has a Script lane; real captions replace it without relabeling stored captions',()=>{
 const p=footage();assert.ok(usedRows(p).some(r=>r.name==='Script'));assert.equal(usedRows(p).some(r=>r.name==='Captions'),false);
 p.captions=[{id:'caption',start:0,end:8,text:'Spoken words'}];
 assert.ok(usedRows(p).some(r=>r.name==='Captions'));assert.equal(usedRows(p).some(r=>r.name==='Script'),false);
 assert.equal(p.captions[0].text,'Spoken words');
 assert.deepEqual([0,8,60,68.9].map(timelineStamp),['00:00','00:08','01:00','01:08']);
});

test('camera permission, idle and starting states have distinct actions and no idle spinner',async()=>{
 const props={source:{status:'off' as const,stream:null,error:'',key:''},label:'Camera',onEnable(){}};
 const ui=await mountUI(createElement(VideoPreview,{...props,permissionMissing:true}));
 try{
  assert.ok(button(ui.container,'Allow camera access'));assert.equal(ui.container.querySelector('.spin'),null);
  await ui.render(createElement(VideoPreview,props));
  assert.ok(button(ui.container,'Start preview'));assert.equal(ui.container.querySelector('.spin'),null);
  await ui.render(createElement(VideoPreview,{...props,source:{...props.source,status:'loading'}}));
  assert.ok(ui.container.textContent?.includes('Starting the camera…'));assert.ok(ui.container.querySelector('.spin'));
 }finally{await ui.close();}
});

test('the mic is Borumi\'s 40px wave of its last 100 levels, with no start button',async()=>{
 const ui=await mountUI(createElement(MicLevel,{stream:null,audio:new MeterAudio(),live:true,background:false,onLevel(){}}));
 try{
  assert.ok(ui.container.querySelector('.rec-mic-wave[role=meter][aria-label="Microphone level"] canvas'));assert.equal(ui.container.querySelector('button'),null);
  const css=(await import('node:fs')).readFileSync(new URL('../borumi-record.css',import.meta.url),'utf8');assert.match(css,/\.rec-mic-wave \{[^}]*height: 40px;/);
 }finally{await ui.close();}
});

test('words lane text clears 4.5:1 and its edge clears 3:1 against the timeline canvas in each theme',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../ui/tokens.css',import.meta.url),'utf8');
 const luminance=(hex:string)=>hex.slice(1).match(/../g)!.map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a:string,b:string)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (values[1]+.05)/(values[0]+.05);};
 for(const block of css.split('.club-root:where(').slice(0,2)){
  const token=(name:string)=>block.match(new RegExp(`--cc-${name}:\\s*(#[a-fA-F0-9]{6});`))![1];
  assert.ok(contrast(token('script-text'),token('script-fill'))>=4.5);
  assert.ok(contrast(token('script-edge'),token('bg'))>=3);
 }
});
