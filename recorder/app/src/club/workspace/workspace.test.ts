import test from 'node:test';
import assert from 'node:assert/strict';
import {clockTime} from '../video-plan';
import {nextTab,previousTab,scenesLine,stageForContinue,tabDone,allScenesKept,continueIsPrimary,pickJumpsToPlan} from './rules';
import {canvasSize,clampZoom,dragTo,keyMove,moveBy,tileBox} from './board-layout';
import {historyOf,markUsed,noteText,undoRequest} from './chat';

test('the tabs follow each other, and Continue moves the card to the stage of the next tab only when that is further along',()=>{
 assert.equal(previousTab('board'),undefined);assert.equal(nextTab('publish'),undefined);
 assert.equal(nextTab('plan'),'record');assert.equal(previousTab('edit'),'record');
 assert.equal(stageForContinue('ideas','plan'),'planning');
 assert.equal(stageForContinue('planning','record'),'recording');
 assert.equal(stageForContinue('editing','record'),undefined,'a card dragged further along stays where it is');
 assert.equal(stageForContinue('recording','record'),undefined);
});

test('a tab is done when its job is: scenes for Board, kept takes for Record, an export for Edit, published for Publish',()=>{
 const kept=[{takes:[{id:'a',seconds:1,kept:true}]}],unkept=[{takes:[{id:'a',seconds:1,kept:false}]}];
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

test('Ask Claude: history is the last twelve turns, used items are marked once, and Undo restores the package or removes it',()=>{
 const msgs=Array.from({length:14},(_,i)=>({role:(i%2?'assistant':'user') as 'user'|'assistant',text:`m${i}`,items:[{kind:'hook' as const,text:'h'}]}));
 assert.equal(historyOf(msgs).length,12);assert.equal(historyOf(msgs)[0].text,'m2');
 assert.deepEqual(historyOf(msgs)[0],{role:'user',text:'m2'},'only role and text go back to the server');
 const marked=markUsed(markUsed(msgs,13,0),13,0);
 assert.deepEqual(marked[13].used,[0]);assert.equal(marked[12].used,undefined);
 const pkg={angle:'a',twist:'t',titles:['x','',''] as [string,string,string],thumbnailText:'',hook:{visual:'',spoken:'',text:''}};
 assert.deepEqual(undoRequest('v1',null),{method:'DELETE',path:'/videos/v1/package'});
 assert.deepEqual(undoRequest('v1',pkg),{method:'PUT',path:'/videos/v1/package',body:pkg});
});

test('a reply copied to the Board is its words, then each item on a line',()=>{
 assert.equal(noteText(' Three openings. ',[{text:'One'},{text:'Two'}]),'Three openings.\n• One\n• Two');
 assert.equal(noteText('Just words',[]),'Just words');
});

test('Continue is primary only when the tab is done and no other primary is waiting on the tab',()=>{
 assert.equal(continueIsPrimary(true,false),true);
 assert.equal(continueIsPrimary(true,true),false,'the tab has its own primary button');
 assert.equal(continueIsPrimary(false,false),false,'not done yet');
});

test('picking a scene jumps to Plan only from the Board; elsewhere it focuses the scene in place',()=>{
 assert.equal(pickJumpsToPlan('board'),true);
 for(const tab of ['plan','record','edit','publish'] as const)assert.equal(pickJumpsToPlan(tab),false,tab);
});

test('Breakdown on a YouTube tile sends the tile\'s own YouTube id, never the CreatorClub video id',async()=>{
 const {mountUI}=await import('../../test-dom');
 const {act,createElement}=await import('react');
 const {TileBody}=await import('./TileBody');
 const sent:string[]=[];
 const tile={id:'t1',kind:'video' as const,url:'https://www.youtube.com/watch?v=abcdefghijk',title:'A video',meta:{},createdAt:''};
 const props={tile,videoId:'v-1a2b3c',onRemove(){},onSaveText(){},onRetryRead(){},onBreakdown:(id:string)=>sent.push(id)};
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
