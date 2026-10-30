import test from 'node:test';
import assert from 'node:assert/strict';
import type {Outline,Package,Video,VideoScene} from '../../../shared/club';
import {readFileSync} from 'node:fs';
import {clockTime} from '../video-plan';
import {outlineSceneFor,buildDescription,timelineChapters,pausesRemoved,promptScene,recorderSceneFor,sceneRunSeconds,shortLink,videoSeconds} from './record-logic';

const scene=(id:string,seconds:number,takes:{seconds:number;kept:boolean}[]=[],cutSeconds?:number):VideoScene=>({id,title:`Scene ${id}`,seconds,takes:takes.map((take,i)=>({id:`${id}t${i}`,retained:false,...take})),status:'',...(cutSeconds?{cutSeconds}:{})});
const outline:Outline={scenes:['a','b','c'].map(id=>({id,title:`Scene ${id}`,talkingPoints:['x'],show:'',seconds:30}))};
const pkg:Package={angle:'The angle.',twist:'',titles:['','',''],thumbnailText:'',hook:{visual:'',spoken:'You never opened this.',text:''}};

test('a strip choice maps to the recording scene that Continue to recording pushed',()=>{
 const video:Pick<Video,'recorderScenes'>={recorderScenes:[{outlineId:'a',sceneId:'r1',text:'',changedAt:''},{outlineId:'b',sceneId:'r2',text:'',changedAt:''}]};
 assert.equal(recorderSceneFor(video,'b'),'r2');
 assert.equal(recorderSceneFor(video,'c'),undefined);
 assert.equal(recorderSceneFor(video,null),undefined);
 assert.equal(recorderSceneFor({},'a'),undefined);
});

test('the teleprompter shows the focused scene, else the first still to record, else the first',()=>{
 const scenes=[scene('a',30,[{seconds:20,kept:true}]),scene('b',30),scene('c',30)];
 assert.equal(promptScene(outline,scenes,'c')?.index,2);
 assert.equal(promptScene(outline,scenes,null)?.scene.id,'b');
 assert.equal(promptScene(outline,scenes,'gone')?.index,1);
 assert.equal(promptScene(outline,[scene('a',30,[{seconds:5,kept:true}])],null)?.index,0,'everything recorded');
 assert.equal(promptScene(outline,undefined,null)?.index,0);
 assert.equal(promptScene(null,scenes,null),undefined);
 assert.equal(promptScene({scenes:[]},scenes,null),undefined);
});

test('a scene runs as long as its kept take less the cut pauses, else as the outline says',()=>{
 assert.equal(sceneRunSeconds(scene('a',30)),30);
 assert.equal(sceneRunSeconds(scene('a',30,[{seconds:50,kept:false}])),30,'a take that is not kept does not count');
 assert.equal(sceneRunSeconds(scene('a',30,[{seconds:50,kept:true}])),50);
 assert.equal(sceneRunSeconds(scene('a',30,[{seconds:50,kept:true}],12)),38);
 assert.equal(videoSeconds([scene('a',30),scene('b',20,[{seconds:25,kept:true}])]),55);
 assert.equal(pausesRemoved([scene('a',30),scene('b',30,[],4)]),true);
 assert.equal(pausesRemoved([scene('a',30)]),false);
});

test('the description is the hook, the angle and chapters from the timeline, starting at 0:00',()=>{
 // Planned at 2:47 and 5:47 long, but the cut video is 32 seconds: the chapters follow the clips, not the plan.
 const list:VideoScene[]=[
  {id:'a',title:'Opening',seconds:167,takes:[{id:'ta',seconds:12,kept:true,retained:false}],status:'Kept take 1'},
  {id:'b',title:'Level 1',seconds:180,takes:[{id:'tb1',seconds:30,kept:false,retained:true},{id:'tb2',seconds:20,kept:true,retained:false}],status:'Kept take 2'},
  {id:'c',title:'Not recorded',seconds:60,takes:[],status:'Not recorded'},
  {id:'d',title:'Recorded, not kept',seconds:60,takes:[{id:'td',seconds:9,kept:false,retained:false}],status:'1 take'},
 ];
 const clips=[{start:0.4,recordingTakeId:'ta'},{start:0.4,recordingTakeId:'ta'},{start:12.3,recordingTakeId:'tb2'},{start:20,recordingTakeId:'tb2'},{start:3,recordingTakeId:undefined}];
 assert.deepEqual(timelineChapters(list,clips),[{title:'Opening',start:0},{title:'Level 1',start:12.3}]);
 assert.equal(buildDescription(pkg,list,clockTime,clips),'You never opened this.\n\nThe angle.\n\nChapters\n0:00 Opening\n0:12 Level 1');
 // Scenes moved on the timeline: the chapters follow the timeline's order.
 assert.deepEqual(timelineChapters(list,[{start:30,recordingTakeId:'ta'},{start:5,recordingTakeId:'tb2'}]).map(chapter=>chapter.title),['Level 1','Opening']);
 assert.equal(buildDescription(null,[],clockTime,[]),'');
 assert.equal(buildDescription(pkg,list,clockTime),'You never opened this.\n\nThe angle.','no timeline known, no chapters');
 assert.equal(buildDescription(pkg,undefined,clockTime,clips),'You never opened this.\n\nThe angle.');
});

test('a link is shown without its scheme',()=>{
 assert.equal(shortLink('https://www.youtube.com/watch?v=abc'),'youtube.com/watch?v=abc');
 assert.equal(shortLink('https://youtu.be/abc'),'youtu.be/abc');
});

test('the recorder\'s own scene maps back to the outline scene',()=>{
 const video:Pick<Video,'recorderScenes'>={recorderScenes:[{outlineId:'a',sceneId:'r1',text:'',changedAt:''},{outlineId:'b',sceneId:'r2',text:'',changedAt:''}]};
 assert.equal(outlineSceneFor(video,'r2'),'b');
 assert.equal(outlineSceneFor(video,'r9'),undefined);
 assert.equal(outlineSceneFor({},'r1'),undefined);
 for(const id of ['a','b'])assert.equal(outlineSceneFor(video,recorderSceneFor(video,id)!),id,'a round trip');
});

test('a description draft never carries text about the brief, however it got into the angle',()=>{
 const noisy:Package={...pkg,angle:'Viewers learn one thing. Brief was empty, so I chose title, viewer, format and proof myself. The format is a Shape 1 screen tutorial.'};
 const kept=[scene('a',60,[{seconds:60,kept:true}])],cut=[{start:0,recordingTakeId:'at0'}];
 const text=buildDescription(noisy,kept,clockTime,cut);
 assert.doesNotMatch(text,/Brief was/i);
 assert.equal(text,'You never opened this.\n\nViewers learn one thing.\n\nChapters\n0:00 Scene a');
 // Notes alone leave no angle: the draft is the hook and the chapters.
 assert.equal(buildDescription({...pkg,angle:'The brief is empty, so I picked the format.'},kept,clockTime,cut),'You never opened this.\n\nChapters\n0:00 Scene a');
 // An ordinary angle, even one that says "brief", is untouched.
 assert.equal(buildDescription({...pkg,angle:'A brief tour of three hidden settings.'},undefined,clockTime),'You never opened this.\n\nA brief tour of three hidden settings.');
});

test('the real package of "hidden-features" (angle with the planner\'s notes, no hook) gives a clean draft',()=>{
 const real=JSON.parse(readFileSync(new URL('./fixtures/hidden-features.package.json',import.meta.url),'utf8')) as Package;
 assert.match(real.angle,/Brief was empty/,'the sample still carries the notes, as the app stored them');
 const titles=['Why this matters','Level 1: one-click features','Level 2: a workflow that changes how you work','Level 3: set it up once, reuse it'];
 const scenes=titles.map((title,i)=>({...scene(`s${i}`,120,[{seconds:120,kept:true}]),title}));
 const text=buildDescription(real,scenes,clockTime,scenes.map((_,i)=>({start:i*120,recordingTakeId:`s${i}t0`})));
 assert.doesNotMatch(text,/Brief was/i);
 assert.doesNotMatch(text,/I chose|Shape 1|The format is|The proof is/);
 assert.equal(text,"By the end, the viewer knows how to find the features in their AI tool they've never used, and has tried three of them, from a one-click setting to a repeatable setup.\n\nChapters\n0:00 Why this matters\n2:00 Level 1: one-click features\n4:00 Level 2: a workflow that changes how you work\n6:00 Level 3: set it up once, reuse it");
});
