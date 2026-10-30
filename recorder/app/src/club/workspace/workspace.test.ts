import test from 'node:test';
import assert from 'node:assert/strict';
import {clockTime} from '../video-plan';
import {takesWaiting,TAKE_NOT_ADDED,nextTab,previousTab,scenesLine,stageForContinue,tabDone,allScenesKept,continueIsPrimary,showsStrip,tabLock,tabState,continueFor,lockedLine,POSTIZ_LINE} from './rules';
import {canvasSize,clampZoom,dragTo,keyMove,moveBy,tileBox} from './board-layout';

test('the tabs follow each other, and Continue moves the card to the stage of the next tab only when that is further along',()=>{
 assert.equal(previousTab('board'),undefined);assert.equal(nextTab('publish'),undefined);
 assert.equal(nextTab('plan'),'record');assert.equal(previousTab('edit'),'record');
 assert.equal(stageForContinue('ideas','plan'),'planning');
 assert.equal(stageForContinue('planning','record'),'recording');
 assert.equal(stageForContinue('editing','record'),undefined,'a card dragged further along stays where it is');
 assert.equal(stageForContinue('recording','record'),undefined);
});

test('a tab is done when its job is: scenes for Board, kept takes for Record, an export for Edit, published for Publish',()=>{
 const kept=[{takes:[{id:'a',seconds:1,kept:true,retained:false}]}],unkept=[{takes:[{id:'a',seconds:1,kept:false,retained:false}]}];
 assert.equal(tabDone('board',{stage:'ideas'}),false);
 assert.equal(tabDone('board',{stage:'ideas',scenes:kept}),true);
 assert.equal(tabDone('plan',{stage:'planning'}),false,'no outline yet');
 assert.equal(tabDone('plan',{stage:'planning',scenes:kept}),true,'the outline is the job of Plan');
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
 assert.equal(clampZoom(1.23),1.23);assert.equal(clampZoom(0.1),0.5);assert.equal(clampZoom(3),1.5);
});

test('Continue is primary only when the tab is done and no other primary is waiting on the tab',()=>{
 assert.equal(continueIsPrimary(true,false),true);
 assert.equal(continueIsPrimary(true,true),false,'the tab has its own primary button');
 assert.equal(continueIsPrimary(false,false),false,'not done yet');
});

test('the scene chips show on Record only (on Edit the scenes are bands on the timeline)',()=>{
 assert.equal(showsStrip('record'),true);
 for(const tab of ['board','plan','edit','publish'] as const)assert.equal(showsStrip(tab),false,tab);
});

test('Breakdown on a YouTube tile sends the tile\'s own YouTube id, never the CreatorClub video id',async()=>{
 const {mountUI}=await import('../../test-dom');
 const {act,createElement}=await import('react');
 const {TileBody}=await import('./TileBody');
 const sent:string[]=[];
 const tile={id:'t1',kind:'video' as const,url:'https://www.youtube.com/watch?v=abcdefghijk',title:'A video',meta:{},createdAt:''};
 const props={tile,videoId:'v-1a2b3c',onRemove(){},onOpen(){},onRetryRead(){},onBreakdown:(id:string)=>sent.push(id)};
 const ui=await mountUI(createElement(TileBody,props));
 try{
  await act(async()=>[...ui.container.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Breakdown')!.click());
  assert.deepEqual(sent,['abcdefghijk']);
  await ui.render(createElement(TileBody,{...props,tile:{...tile,url:'https://example.com/not-youtube'}}));
  assert.equal([...ui.container.querySelectorAll('button')].some(b=>b.textContent?.trim()==='Breakdown'),false,'a tile with no YouTube id has nothing to break down');
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

test('a step is locked until what it needs exists, and says the first thing missing; nothing locks on a guess',()=>{
 for(const tab of ['board','plan'] as const)assert.equal(tabLock(tab,noScenes),undefined,`${tab} never locks`);
 assert.deepEqual(tabLock('record',noScenes),{reason:'Plan the scenes first',unlock:'plan'});
 assert.deepEqual(tabLock('edit',noScenes),{reason:'Plan the scenes first',unlock:'plan'},'the first thing missing, so the step it sends you to is open');
 assert.deepEqual(tabLock('publish',noScenes),{reason:'Plan the scenes first',unlock:'plan'});
 assert.equal(tabLock('record',planned),undefined,'scenes open Record (it can start the recording itself)');
 assert.deepEqual(tabLock('edit',planned),{reason:'Record a scene first',unlock:'record'});
 assert.deepEqual(tabLock('publish',planned),{reason:'Record a scene first',unlock:'record'});
 assert.deepEqual(tabLock('edit',{...planned,hasRecording:true}),{reason:'Record a scene first',unlock:'record'},'a recording project with no take is still nothing to edit');
 assert.equal(tabLock('edit',started),undefined);assert.equal(tabLock('publish',started),undefined);
 for(const tab of ['record','edit','publish'] as const)assert.equal(tabLock(tab,{...noScenes,hasRecording:true}),undefined,`a recording project keeps ${tab} open even when the scene list reads empty`);
 assert.equal(tabLock('edit',{stage:'editing',hasRecording:true}),undefined,'scenes not known yet: not locked');
 assert.equal(tabLock('publish',{...noScenes,stage:'published'}),undefined,'a published video locks nothing');
 for(const tab of ['record','edit','publish'] as const)for(const facts of [noScenes,planned]){const lock=tabLock(tab,facts);if(lock)assert.equal(tabLock(lock.unlock,facts),undefined,'the unlocking step is open');}
});

test('the step bar shows each step as done, current, next, locked or open',()=>{
 assert.deepEqual((['board','plan','record','edit','publish'] as const).map(key=>tabState(key,'plan',noScenes)),['open','current','locked','locked','locked']);
 assert.deepEqual((['board','plan','record','edit','publish'] as const).map(key=>tabState(key,'plan',planned)),['done','current','next','locked','locked']);
 assert.deepEqual((['board','plan','record','edit','publish'] as const).map(key=>tabState(key,'record',started)),['done','done','current','done','open'],'a scene is on the timeline, so Edit has something done');
});

test('one Continue rule: it names the next step, is disabled with the reason when that step is locked, and is primary only when this step is done and has no primary of its own',()=>{
 assert.deepEqual(continueFor('board',noScenes),{label:'Continue to planning',disabled:false,primary:false});
 assert.deepEqual(continueFor('plan',noScenes),{label:'Continue to recording',disabled:true,reason:'Draft the scenes first',primary:false},'on Plan the scenes are its own job');
 assert.deepEqual(continueFor('plan',planned),{label:'Continue to recording',disabled:false,primary:true});
 assert.deepEqual(continueFor('plan',planned,{busy:true}),{label:'Continue to recording',disabled:true,reason:'Claude is still writing',primary:false});
 assert.deepEqual(continueFor('record',planned,{ownPrimary:true}),{label:'Continue to editing',disabled:true,reason:'Record a scene first',primary:false});
 assert.deepEqual(continueFor('record',started),{label:'Continue to editing',disabled:false,primary:false},'scenes left to record: the Record button stays the primary');
 assert.deepEqual(continueFor('record',{...started,allRecorded:true}),{label:'Continue to editing',disabled:false,primary:true});
 assert.deepEqual(continueFor('edit',started),{label:'Continue to publishing',disabled:false,primary:true},'something is recorded: moving on to Publish is the one next step');
 assert.deepEqual(continueFor('edit',{...started,exported:true}),{label:'Continue to publishing',disabled:false,primary:true});
 assert.equal(continueFor('publish',started),undefined,'the last step has no Continue');
 assert.deepEqual(continueFor('record',{stage:'recording',hasRecording:true}),{label:'Continue to editing',disabled:true,primary:false},'scenes not known yet: it waits, with nothing to explain');
});

test('a locked step says why and what opens after it; a locked Publish also names the paid Postiz while it is not connected',()=>{
 const lock={reason:'Record a scene first',unlock:'record' as const};
 assert.equal(lockedLine('edit',lock),'Record a scene first. Edit opens after that.');
 assert.equal(lockedLine('publish',lock,{postizConnected:true}),'Record a scene first. Publish opens after that.');
 assert.equal(lockedLine('publish',lock,{postizConnected:false}),`Record a scene first. Publish opens after that. ${POSTIZ_LINE}`);
 assert.match(POSTIZ_LINE,/^Publishing uses Postiz, a paid service from \$29 a month: connect it in Settings\.$/);
});
