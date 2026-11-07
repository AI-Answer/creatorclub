import {mountUI,button} from './test-dom';
import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import {createProject,defaultEffects,defaultTransform} from '../shared/types';
import {createPlayhead} from './playhead';
import {hiddenRowsKey} from './timeline-presentation';
const {TimelineClub}=await import('./TimelineClub');
const pause=(ms:number)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
function fixture(){const p=createProject('Smooth');p.media=[{id:'m',name:'Video',path:'m',kind:'video',duration:1980,width:1920,height:1080,hasAudio:true}];p.clips=[{id:'c',mediaId:'m',name:'Video',track:'screen',start:0,sourceIn:0,sourceOut:1980,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];p.captions=[{id:'cap',start:0,end:4,text:'Claude just changed this.'}];return p;}
const noop=()=>{};
test('pinch paints immediately, commits once after idle, and keeps the pointer time fixed',async()=>{
 const p=fixture(),playhead=createPlayhead(2);let scales=0;const seeks:number[]=[];function Harness(){const [scale,setScale]=useState(8);return createElement(TimelineClub,{project:p,playhead,scale,onScale:s=>{scales++;setScale(s);},selectedIds:new Set<string>(),onSelectMany:noop,onSeek:t=>seeks.push(t),change:noop,onDropMedia:noop,tool:'select',onSplit:noop,follow:false,showWaveforms:false,onOpen:noop,autoFit:false});}
 const ui=await mountUI(createElement(Harness));try{
  const scroll=ui.container.querySelector<HTMLElement>('.timeline-scroll')!,surface=ui.container.querySelector<HTMLElement>('.timeline-zoom-surface')!;scroll.scrollLeft=400;
  const wheel=()=>{const e=new window.WheelEvent('wheel',{deltaY:-10,cancelable:true,bubbles:true});Object.defineProperties(e,{ctrlKey:{value:true},clientX:{value:200}});scroll.dispatchEvent(e);};
  await act(async()=>{wheel();wheel();wheel();});assert.equal(scales,0);const next=8*Math.exp(30*.035);assert.ok(Math.abs(scroll.scrollLeft-(75*next-200))<1e-6);assert.match(surface.style.transform,/scaleX/);
  await pause(180);assert.equal(scales,1);assert.equal(surface.style.transform,'');assert.ok(Math.abs(scroll.scrollLeft-(75*next-200))<1e-6);assert.equal(playhead.get(),2);assert.deepEqual(seeks,[]);
  await act(async()=>{wheel();});await act(async()=>{ui.container.querySelector('.club-ruler')!.dispatchEvent(new window.PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,clientX:200,pointerId:1}));});assert.equal(scales,2,'clicking during a pinch commits first');assert.ok(Math.abs(seeks[0]-75)<1e-6,'the click seeks the visible time');
 }finally{await ui.close();}
});
test('hover pin spans rows and previews the pointer frame without seeking; hiding captions survives remount',async()=>{
 const p=fixture(),before=JSON.stringify(p),playhead=createPlayhead(3),props={project:p,playhead,scale:20,onScale:noop,selectedIds:new Set<string>(),onSelectMany:noop,onSeek:noop,change:noop,onDropMedia:noop,tool:'select' as const,onSplit:noop,follow:false,showWaveforms:false,onOpen:noop,autoFit:false};
 let ui=await mountUI(createElement(TimelineClub,props));try{
  const row=ui.container.querySelector('.club-row')!;await act(async()=>{row.dispatchEvent(new window.PointerEvent('pointermove',{bubbles:true,clientX:120,buttons:0}));});await pause(25);
  const ghost=ui.container.querySelector<HTMLElement>('.club-hover-playhead')!;assert.equal(ghost.hidden,false);assert.equal(ghost.style.transform,'translateX(120px)');assert.equal(ghost.querySelector('b')?.textContent,'00:06');assert.equal((ghost.querySelector('.club-hover-frame') as HTMLElement).hidden,false);assert.equal(playhead.get(),3);
  await act(async()=>{button(ui.container,'Hide Captions row').click();});assert.equal(ui.container.querySelector('.row-captions'),null);assert.equal(button(ui.container,'Hidden rows (1)').textContent,'Hidden rows (1)');assert.equal(JSON.stringify(p),before);
  await ui.close();ui=await mountUI(createElement(TimelineClub,props));assert.equal(ui.container.querySelector('.row-captions'),null);
  await act(async()=>{button(ui.container,'Hidden rows (1)').click();});await act(async()=>{button(ui.container,'Captions').click();});assert.ok(ui.container.querySelector('.row-captions'));
 }finally{await ui.close();localStorage.removeItem(hiddenRowsKey(p.id));}
});
test('keyboard and slider scale changes ease for 140 ms, and a zoom-out refills newly visible captions before idle',async()=>{
 const p=fixture();p.captions.push({id:'far',start:1000,end:1004,text:'Newly revealed words'});const playhead=createPlayhead(10),props={project:p,playhead,scale:8,onScale:noop,selectedIds:new Set<string>(),onSelectMany:noop,onSeek:noop,change:noop,onDropMedia:noop,tool:'select' as const,onSplit:noop,follow:false,showWaveforms:false,onOpen:noop,autoFit:false};
 const ui=await mountUI(createElement(TimelineClub,props));try{
  const surface=ui.container.querySelector<HTMLElement>('.timeline-zoom-surface')!,scroll=ui.container.querySelector<HTMLElement>('.timeline-scroll')!;await ui.render(createElement(TimelineClub,{...props,scale:16}));assert.match(surface.style.transform,/scaleX/);assert.ok(Number(surface.style.transform.match(/scaleX\(([^)]+)\)/)?.[1])<1);await pause(190);assert.equal(surface.style.transform,'');
  assert.equal(ui.container.querySelector('[data-effect-id="far"]'),null);const e=new window.WheelEvent('wheel',{deltaY:200,bubbles:true,cancelable:true});Object.defineProperties(e,{ctrlKey:{value:true},clientX:{value:0}});
  Object.defineProperty(scroll,'clientWidth',{configurable:true,value:1000});await act(async()=>{scroll.dispatchEvent(e);});assert.ok(ui.container.querySelector('[data-effect-id="far"]'),'new content is revealed during the visual gesture, before the real scale commits');
 }finally{await ui.close();}
});

test('row eyes remain visible and scene headers retain tracking under the later Borumi stylesheet',async()=>{
 const style=document.createElement('style');style.textContent=readFileSync(new URL('./editing-club.css',import.meta.url),'utf8')+'\n'+readFileSync(new URL('./club/borumi.css',import.meta.url),'utf8');document.head.append(style);
 const p=fixture();p.scenes[0].duration=1980;p.scenes[0].name='1. Intro';const props={project:p,playhead:createPlayhead(),scale:8,onScale:noop,selectedIds:new Set<string>(),onSelectMany:noop,onSeek:noop,change:noop,onDropMedia:noop,tool:'select' as const,onSplit:noop,follow:false,showWaveforms:false,onOpen:noop,autoFit:false};
 const ui=await mountUI(createElement('div',{className:'club-root'},createElement('div',{className:'club-embed'},createElement('div',{className:'app-shell','data-mode':'Edit'},createElement('div',{className:'club-edit'},createElement(TimelineClub,props))))));
 try{assert.notEqual(getComputedStyle(ui.container.querySelector('.club-tl-heads')!).display,'none');assert.equal(ui.container.querySelector('.club-scene-tag')?.textContent,'01 INTRO');assert.ok(parseFloat(getComputedStyle(ui.container.querySelector('.club-scene-tag')!).letterSpacing)>0);assert.ok(button(ui.container,'Hide Captions row'));}finally{await ui.close();style.remove();}
});
