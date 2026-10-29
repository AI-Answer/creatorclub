import test from 'node:test';
import assert from 'node:assert/strict';
import type {Outline,Package,Video,VideoScene} from '../../../shared/club';
import {clockTime} from '../video-plan';
import {outlineSceneFor,buildDescription,pausesRemoved,promptScene,recorderSceneFor,sceneRunSeconds,shortLink,videoSeconds} from './record-logic';

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

test('the description is the hook, the angle and chapters starting at 0:00',()=>{
 const text=buildDescription(pkg,[scene('a',60),scene('b',45,[{seconds:70,kept:true}],10),scene('c',30)],clockTime);
 assert.equal(text,'You never opened this.\n\nThe angle.\n\nChapters\n0:00 Scene a\n1:00 Scene b\n2:00 Scene c');
 assert.equal(buildDescription(null,[],clockTime),'');
 assert.equal(buildDescription(pkg,undefined,clockTime),'You never opened this.\n\nThe angle.');
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
