import test from 'node:test';
import assert from 'node:assert/strict';
import {clockTime} from '../video-plan';
import {takesWaiting,TAKE_NOT_ADDED,nextTab,previousTab,scenesLine,stageForContinue,tabDone,allScenesKept,continueIsPrimary,tabLock,tabState,continueFor} from './rules';
import {canvasSize,clampZoom,dragTo,keyMove,moveBy,tileBox} from './board-layout';

test('the tabs follow each other, and Continue moves the card to the stage of the next tab only when that is further along',()=>{
 assert.equal(previousTab('idea'),undefined);assert.equal(nextTab('publish'),undefined);
 assert.equal(nextTab('idea'),'record');assert.equal(previousTab('edit'),'record');
 assert.equal(stageForContinue('ideas','idea'),'planning');
 assert.equal(stageForContinue('planning','record'),'recording');
 assert.equal(stageForContinue('editing','record'),undefined,'a card dragged further along stays where it is');
 assert.equal(stageForContinue('recording','record'),undefined);
});

test('a tab is done when its job is: scenes for Idea, kept takes for Record, an export for Edit, published for Publish',()=>{
 const kept=[{takes:[{id:'a',seconds:1,kept:true,retained:false}]}],unkept=[{takes:[{id:'a',seconds:1,kept:false,retained:false}]}];
 assert.equal(tabDone('idea',{stage:'ideas'}),false);
 assert.equal(tabDone('idea',{stage:'planning'}),false,'no outline yet');
 assert.equal(tabDone('idea',{stage:'planning',scenes:kept}),true,'the outline is the job of Idea');
 assert.equal(tabDone('record',{stage:'recording',scenes:[...kept,...unkept]}),false);
 assert.equal(tabDone('record',{stage:'recording',scenes:kept}),true);
 assert.equal(tabDone('record',{stage:'recording',scenes:[],allRecorded:true}),true,'the recorder says so before the scenes are read again');
 assert.equal(tabDone('record',{stage:'recording'}),false,'unknown scenes are not done');
 assert.equal(tabDone('edit',{stage:'editing'}),false);assert.equal(tabDone('edit',{stage:'editing',exported:true}),true);
 assert.equal(tabDone('publish',{stage:'publishing'}),false);assert.equal(tabDone('publish',{stage:'published'}),true);
 assert.equal(allScenesKept(undefined),false);assert.equal(allScenesKept([]),false,'a video with no scenes has recorded nothing');
});

test('the scene line says how many scenes and how long, in clock time',()=>{
 assert.equal(scenesLine([{seconds:60},{seconds:150}],clockTime),'2 scenes · 3:30');
 assert.equal(scenesLine([{seconds:45}],clockTime),'1 scene · 0:45');
});

test('the Board places tiles from their saved place, and keeps the canvas big enough to reach every one',()=>{
 assert.deepEqual(tileBox({kind:'note',pos:{x:10,y:20,w:300}}),{x:10,y:20,w:300});
 assert.deepEqual(tileBox({kind:'breakdown'}),{x:0,y:0,w:320},'a tile with no place yet starts at the corner with its default width');
 assert.deepEqual(canvasSize([]),{width:2600,height:1700});
 assert.deepEqual(canvasSize([{id:'a',kind:'note',pos:{x:3000,y:100}}]),{width:3000+280+240,height:1700});
});

test('a drag moves a tile by the pointer distance at this zoom, never above or left of the canvas',()=>{
 assert.deepEqual(dragTo({x:100,y:100},50,-20,1),{x:150,y:80});
 assert.deepEqual(dragTo({x:100,y:100},50,-20,0.5),{x:200,y:60});
 assert.deepEqual(dragTo({x:10,y:10},-500,-500,1),{x:0,y:0});
});

test('arrow keys move a focused tile a step, Shift a bigger step, and other keys nothing',()=>{
 assert.deepEqual(keyMove('ArrowLeft',false),{dx:-10,dy:0});
 assert.deepEqual(keyMove('ArrowDown',true),{dx:0,dy:40});
 assert.equal(keyMove('Enter',false),undefined);
 assert.deepEqual(moveBy({x:5,y:5},{dx:-10,dy:0}),{x:0,y:5});
 assert.equal(clampZoom(1.23),1.23);assert.equal(clampZoom(0.001),0.02);assert.equal(clampZoom(3),2);
});

test('Continue is primary only when the tab is done and no other primary is waiting on the tab',()=>{
 assert.equal(continueIsPrimary(true,false),true);
 assert.equal(continueIsPrimary(true,true),false,'the tab has its own primary button');
 assert.equal(continueIsPrimary(false,false),false,'not done yet');
});

test('Breakdown on a YouTube tile sends the tile\'s own YouTube id, never the Creator Compiler video id',async()=>{
 const {mountUI}=await import('../../test-dom');
 const {act,createElement}=await import('react');
 const {TileBody}=await import('./TileBody');
 const sent:string[]=[];
 const tile={id:'t1',kind:'video' as const,url:'https://www.youtube.com/watch?v=abcdefghijk',title:'A video',meta:{},createdAt:''};
 const props={tile,videoId:'v-1a2b3c',onRemove(){},onOpen(){},onRetryRead(){},onBreakdown:(id:string)=>sent.push(id)};
 const ui=await mountUI(createElement(TileBody,props));
 try{
  await act(async()=>[...ui.container.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Break down')!.click());
  assert.deepEqual(sent,['abcdefghijk']);
  await ui.render(createElement(TileBody,{...props,tile:{...tile,url:'https://example.com/not-youtube'}}));
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Break down'),false,'a tile with no YouTube id has nothing to break down');
 }finally{await ui.close();}
});

test('a new tile takes the free place nearest the middle of the view, never above or left of the canvas, and clear of the tiles there',async()=>{
 const {nearestFree}=await import('./board-layout');
 assert.deepEqual(nearestFree([],280,{x:1000,y:800}),{x:860,y:610},'the middle of the view when it is free');
 const taken=[{x:860,y:610,w:280}];
 const next=nearestFree(taken,280,{x:1000,y:800});
 assert.notDeepEqual(next,{x:860,y:610});
 assert.ok(next.x+280+24<=860||next.x>=860+280+24||next.y+380+24<=610||next.y>=610+380+24,'it does not sit on the tile that is there');
 assert.ok(Math.hypot(next.x-860,next.y-610)<500,'and it is close to the middle');
 assert.deepEqual(nearestFree([],280,{x:0,y:0}),{x:0,y:0},'the canvas has no negative places');
});

test('a recorded take that is neither on the timeline nor set aside is waiting; a kept or retained one is not',()=>{
 const scene=(title:string,...takes:Array<[boolean,boolean]>)=>({title,takes:takes.map(([kept,retained])=>({kept,retained}))});
 assert.deepEqual(takesWaiting([scene('Opening',[false,false]),scene('Level 1',[true,false]),scene('Level 2',[false,true]),scene('Level 3')]),['Opening']);
 assert.deepEqual(takesWaiting([scene('Opening',[true,false],[false,false])]),[],'a scene with a take on the timeline is not waiting');
 assert.deepEqual(takesWaiting(undefined),[]);
 assert.match(TAKE_NOT_ADDED,/timeline/);
});

const take=(kept:boolean)=>({id:'t',seconds:1,kept,retained:false});
const noScenes={stage:'planning' as const,scenes:[],hasRecording:false};
const planned={stage:'planning' as const,scenes:[{takes:[]},{takes:[]}],hasRecording:false};
const started={stage:'recording' as const,scenes:[{takes:[take(true)]},{takes:[]}],hasRecording:true};

test('no step is locked: every one opens, and one with nothing to work on yet says what to do there',()=>{
 for(const tab of ['idea','record','edit','publish'] as const)for(const facts of [noScenes,planned,started,{stage:'editing' as const,hasRecording:true}])assert.equal(tabLock(tab,facts),undefined,`${tab} opens`);
});

test('the step bar shows each step as done, current, next or open, and none as locked',()=>{
 assert.deepEqual((['idea','record','edit','publish'] as const).map(key=>tabState(key,'idea',noScenes)),['current','next','open','open']);
 assert.deepEqual((['idea','record','edit','publish'] as const).map(key=>tabState(key,'idea',planned)),['current','next','open','open']);
 assert.deepEqual((['idea','record','edit','publish'] as const).map(key=>tabState(key,'record',started)),['done','current','next','open'],'a take on the timeline is not a finished edit: Edit is ticked only once it is exported');
});

test('one Continue rule: it names the next step, says what is still missing, and is primary only when this step is done and has no primary of its own',()=>{
 assert.deepEqual(continueFor('idea',noScenes),{label:'Continue to recording',disabled:false,primary:false},'recording without a plan is allowed');
 assert.deepEqual(continueFor('idea',planned),{label:'Continue to recording',disabled:false,primary:true});
 assert.deepEqual(continueFor('idea',planned,{busy:true}),{label:'Continue to recording',disabled:true,reason:'Still writing',primary:false});
 {const next=continueFor('record',planned,{ownPrimary:true})!;assert.deepEqual([next.label,next.disabled,next.primary],['Continue to editing',false,false],'Edit opens even before a take; Continue is never the push forward then');assert.match(next.reason!,/recorded yet/);}
 assert.deepEqual(continueFor('record',started),{label:'Continue to editing',disabled:false,reason:"1 scene isn't recorded yet",primary:false},'scenes left to record: the Record button stays the primary, and Continue says what is missing');
 assert.deepEqual(continueFor('record',{...started,allRecorded:true}),{label:'Continue to editing',disabled:false,primary:true});
 assert.deepEqual(continueFor('edit',started),{label:'Continue to publishing',disabled:false,reason:"1 scene isn't recorded yet",primary:false},'Publish can open, but never as the push forward while scenes are missing');
 assert.deepEqual(continueFor('edit',{...started,exported:true}),{label:'Continue to publishing',disabled:false,reason:"1 scene isn't recorded yet",primary:false});
 assert.deepEqual(continueFor('edit',{...started,allRecorded:true,exported:true}),{label:'Continue to publishing',disabled:false,primary:true},'everything recorded and exported: Publish is the one next step');
 assert.equal(continueFor('publish',started),undefined,'the last step has no Continue');
 assert.deepEqual(continueFor('record',{stage:'recording',hasRecording:true}),{label:'Continue to editing',disabled:false,primary:false},'scenes not known yet: it waits, with nothing to explain');
});
