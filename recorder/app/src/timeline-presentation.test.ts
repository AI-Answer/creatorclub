import './test-dom';
import test from 'node:test';import assert from 'node:assert/strict';
import {clipCaptionBands,hiddenRowsKey,readHiddenRows,saveHiddenRows,sceneLabel} from './timeline-presentation';
import {createProject,defaultEffects,defaultTransform} from '../shared/types';
test('Borumi scene names keep zero-padded indices, remove authored numbering and collapse at small widths',()=>{
 assert.equal(sceneLabel(0,'1. Intro',180),'01 INTRO');assert.equal(sceneLabel(1,'02. Why this matters',180),'02 WHY THIS MATTERS');assert.equal(sceneLabel(0,'Scene 1',90),'SCENE 1');assert.equal(sceneLabel(9,'A name',40),'10');assert.equal(sceneLabel(0,'Tiny',12),'');
});
test('plain caption sentences fill narration clips, duplicate passes are ignored, and timed words survive',()=>{
 const p=createProject('Bands');p.media=[{id:'m',name:'m',kind:'video',path:'m',duration:30,width:1920,height:1080,hasAudio:true}];
 p.clips=[{id:'c',mediaId:'m',name:'c',track:'screen',start:5,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];
 p.captions=[{id:'outside',start:0,end:4,text:'Outside'},{id:'sentence',start:4,end:8,text:'Claude just changed this.'},{id:'duplicate',start:4,end:8,text:'Claude just changed this.'},{id:'shortDuplicate',start:5,end:6,text:'Claude'},{id:'words',start:9,end:11,text:'Before we begin',words:[{text:'Before',start:9,end:10},{text:'we begin',start:10,end:11}]},{id:'sound',start:12,end:14,text:'[BLANK_AUDIO]'}];
 const band=clipCaptionBands(p).get('c')!;assert.deepEqual(band.map(w=>w.text),['Claude just changed this.','Before','we begin']);assert.equal(band[0].start,5);assert.equal(band[0].plain,true);assert.equal(band[1].plain,undefined);
});
test('hidden rows are project-scoped, malformed storage and denied access are harmless',()=>{
 saveHiddenRows('a',['captions','role:audio']);assert.deepEqual(readHiddenRows('a'),['captions','role:audio']);assert.deepEqual(readHiddenRows('b'),[]);localStorage.setItem(hiddenRowsKey('b'),'{');assert.deepEqual(readHiddenRows('b'),[]);localStorage.setItem(hiddenRowsKey('b'),'[1,"captions"]');assert.deepEqual(readHiddenRows('b'),['captions']);
 const storage=globalThis.localStorage;Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw Error('Denied');}});try{assert.deepEqual(readHiddenRows('a'),[]);assert.doesNotThrow(()=>saveHiddenRows('a',['captions']));}finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:storage});storage.clear();}
});
