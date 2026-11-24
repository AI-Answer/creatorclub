import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,type Caption,type Clip,type LayoutSegment,type Media,type Project} from '../shared/types';
import {bakeLayouts,baseLayout,chooseLayout,layoutGeometry,layoutsProblem,layoutTransform} from '../shared/layouts';
import {AUTO_LAYOUT_MIN,applyAutoLayout,autoLayoutProblem,planAutoLayout,sentences,type ScreenActivity} from '../shared/auto-layout';
import {applyEditAction,describeEditAction,editActionProblem} from './editing-actions';
import {moveEffects,resizeEffect} from './timeline-edit';
import {validateProject} from '../server/storage';

const media=(id:string,duration:number):Media=>({id,name:id,path:`/tmp/${id}.mov`,kind:'video',duration,width:1920,height:1080,hasAudio:true});
const clip=(id:string,track:Clip['track'],start:number,length:number,extra:Partial<Clip>={}):Clip=>({id,mediaId:track==='camera'?'cam':track==='audio'?'mic':'scr',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...extra});
/** One caption per sentence, its words spread evenly over [start, end]. */
const said=(id:string,start:number,end:number,text:string):Caption=>{
 const parts=text.split(' '),step=(end-start)/parts.length;
 return {id,start,end,text,words:parts.map((word,i)=>({text:word,start:start+i*step,end:start+(i+.8)*step}))};
};
/** A camera-and-screen take of `length` seconds with these sentences. */
function take(captions:Caption[],length=60,layouts?:LayoutSegment[]):Project{
 const p=createProject('Auto layout');p.media=[media('scr',length),media('cam',length),media('mic',length)];
 p.clips=[clip('screen','screen',0,length,{linkId:'take'}),clip('camera','camera',0,length,{linkId:'take'}),clip('mic','audio',0,length,{linkId:'take'})];
 p.scenes=[{id:'s1',name:'One',script:'',notes:'',start:0,duration:length}];p.captions=captions;if(layouts)p.layouts=layouts;return p;
}
/** Intro, a demo, plain talk with the screen, and the close. */
const tutorial=()=>take([
 said('a',.5,4.5,'Hey everyone, welcome back to the channel.'),
 said('b',5,9,'Today I want to talk about a tool I use every day.'),
 said('c',10,14,'Let me show you how the settings page works.'),
 said('d',14.5,19,'Click this button and you can see the new panel.'),
 said('e',19.5,24,'Scroll down to the bottom and paste the key.'),
 said('f',25,30,'That keeps the whole team on the same version.'),
 said('g',30.5,36,'It also saves the history for every change.'),
 said('h',37,42,'Most people skip this part of the setup.'),
 said('i',43,48,'Honestly I think this is the best part of it.'),
 said('j',49,54,'So that is the whole workflow from start to end.'),
 said('k',54.5,59,'Thanks for watching and subscribe for more.'),
]);
const plan=(p:Project,activity?:ScreenActivity)=>planAutoLayout(p,{screenActivity:activity}).map(s=>[+s.start.toFixed(2),+s.end.toFixed(2),s.preset]);
const covers=(p:Project,list:Array<{start:number;end:number}>)=>{
 const words=p.captions.flatMap(c=>c.words??[]);
 for(const s of list)for(const w of words)assert.ok(!(w.start<s.start-1e-6&&w.end>s.start+1e-6),`no word straddles the edge at ${s.start}`);
};

test('Screen only: the screen fills the frame and the camera is hidden in the preview and in the export, while its sound plays on',()=>{
 const p=take([],10,[{id:'l',start:2,duration:4,preset:'Screen only'}]),[screen,camera]=p.clips;
 const g=layoutGeometry('Screen only',p.canvas);
 assert.deepEqual(layoutTransform(p,screen,3),{...screen.transform,x:0,y:0,width:1,height:1});
 assert.equal(layoutTransform(p,camera,3).opacity,0,'the camera is hidden');
 assert.equal(g.camera.opacity,0);
 assert.equal(layoutTransform(p,camera,1).opacity,1,'outside the stretch it shows');
 const baked=structuredClone(p);bakeLayouts(baked);
 const pieces=baked.clips.filter(c=>c.track==='camera').map(c=>[c.start,c.transform.opacity,c.muted]);
 assert.deepEqual(pieces,[[0,1,false],[2,0,false],[6,1,false]],'the export hides the picture over the stretch and keeps the sound');
 assert.equal(layoutsProblem(p.layouts),null);
 assert.equal(layoutsProblem([{id:'x',start:0,duration:1,preset:'Screen only',auto:'yes'}]),'Invalid layout stretch');
 assert.equal(layoutsProblem([{id:'x',start:0,duration:1,preset:'Screen only',auto:true}]),null);
 // A camera at the picture-in-picture place is still in Picture in picture, not hidden.
 const pip=take([],10);Object.assign(pip.clips[1].transform,layoutGeometry('Picture in picture',pip.canvas).camera);
 assert.equal(baseLayout(pip),'Picture in picture');
 // Projects made before Screen only (and before Auto layout) still load unchanged.
 const old=take([],10,[{id:'o',start:0,duration:5,preset:'Side by side'}]);
 assert.doesNotThrow(()=>validateProject(structuredClone(old)));
 assert.equal(validateProject(structuredClone(old)).layouts![0].auto,undefined);
});

test('sentences break at full stops and long pauses, and a run-on sentence at a caption edge',()=>{
 const p=take([said('a',0,3,'One two three. Four five'),said('b',3,5,'six seven.'),said('c',8,10,'After a pause')]);
 assert.deepEqual(sentences(p).map(s=>s.text),['One two three.','Four five six seven.','After a pause']);
});

test('Auto layout: the opening and close are you full screen, the demo is the screen alone, and plain talk with the screen is both',()=>{
 const p=tutorial(),list=planAutoLayout(p);
 assert.deepEqual(list.map(s=>s.preset),['Full frame','Screen only','Creator','Full frame']);
 assert.equal(list[0].start,0);assert.equal(list.at(-1)!.end,60,'the plan covers the whole video');
 for(let i=1;i<list.length;i++)assert.equal(list[i].start,list[i-1].end,'no holes between stretches');
 for(const s of list)assert.ok(s.end-s.start>=AUTO_LAYOUT_MIN-1e-6,`${s.preset} is long enough not to flicker`);
 covers(p,list);
 const demo=list[1];assert.ok(demo.start>9&&demo.start<10&&demo.end>24&&demo.end<25,'the demo runs from "Let me show you" to the paste');
 assert.match(demo.reason,/walkthrough|screen|clicking/);
 assert.deepEqual(plan(p),plan(tutorial()),'the same project gives the same plan');
});

test('the screen activity decides where the words say nothing: a moving screen is shown alone, a still one hands over to you',()=>{
 const neutral=take(Array.from({length:10},(_,i)=>said(`s${i}`,i*6+.5,i*6+5.5,`This is part number ${i+1} of the plan.`)));
 assert.deepEqual(planAutoLayout(neutral).map(s=>s.preset),['Full frame','Creator','Full frame'],'by the words alone, the middle is both');
 const values=Array.from({length:61},(_,t)=>t>=18&&t<=36?.2:0);
 const moving=planAutoLayout(neutral,{screenActivity:{scr:{rate:1,values}}});
 const shown=moving.find(s=>s.preset==='Screen only');
 assert.ok(shown&&shown.start<18.5&&shown.end>35.5,'the busy screen is shown alone');
 assert.equal(shown!.reason,'the screen keeps changing');
 const still=planAutoLayout(neutral,{screenActivity:{scr:{rate:1,values:new Array(61).fill(0)}}});
 assert.deepEqual(still.map(s=>s.preset),['Full frame'],'a screen that never changes leaves you full screen');
 const busy=planAutoLayout(neutral,{screenActivity:{scr:{rate:1,values:new Array(61).fill(.3)}}});
 assert.deepEqual(busy,planAutoLayout(neutral),'a screen that moves all the time (a playing video) says nothing: the words decide');
 // Over a screen with a face or a video always moving a little, only clearly bigger changes count.
 const lively=planAutoLayout(neutral,{screenActivity:{scr:{rate:1,values:values.map(v=>v||.05)}}});
 const only=(list:typeof moving)=>list.filter(s=>s.preset==='Screen only').map(s=>[+s.start.toFixed(1),+s.end.toFixed(1)]);
 assert.deepEqual(only(lively),only(moving),'the busy stretch is still found');
 assert.ok(!lively.slice(1,-1).some(s=>s.preset==='Full frame'),'a screen that is not still is not called still');
 // Activity is read through the clip's source time: the same busy seconds, later in the source, move with the clip.
 const shifted=structuredClone(neutral);shifted.clips[0].sourceIn=10;shifted.clips[0].sourceOut=70;shifted.media[0].duration=70;
 const later=planAutoLayout(shifted,{screenActivity:{scr:{rate:1,values:Array.from({length:71},(_,t)=>t>=28&&t<=46?.2:0)}}});
 assert.deepEqual(later.map(s=>[s.preset,+s.start.toFixed(1)]),moving.map(s=>[s.preset,+s.start.toFixed(1)]));
});

test('a short cue does not flicker: a one-sentence demo between talking joins its neighbours',()=>{
 const p=take([
  said('a',.5,5,'Hey everyone, welcome back to the channel.'),
  said('b',6,12,'This is a long story about a product we built.'),
  said('c',12.3,13.8,'Click here.'),
  said('d',14,20,'And then the story keeps going for a while.'),
  said('e',21,27,'It went on like that for most of the year.'),
  said('f',28,34,'Thanks for watching and see you next time.'),
 ],35);
 const list=planAutoLayout(p);
 assert.ok(list.every(s=>s.end-s.start>=AUTO_LAYOUT_MIN-1e-6));
 assert.ok(!list.some(s=>s.preset==='Screen only'),'the 1.5 s click is not its own stretch');
});

test('stretches set by hand stay, the plan works around them, and running it again replaces only its own stretches',()=>{
 const p=tutorial();p.layouts=[{id:'mine',start:20,duration:10,preset:'Side by side'}];
 const first=applyAutoLayout(p,{},()=>`auto-${Math.random()}`);
 assert.ok(p.layouts.some(l=>l.id==='mine'&&l.preset==='Side by side'&&!l.auto),'the hand-set stretch stays');
 for(const s of first)assert.ok(s.end<=20+1e-6||s.start>=30-1e-6,'nothing planned over it');
 assert.equal(layoutsProblem(p.layouts),null);
 const autos=p.layouts.filter(l=>l.auto).length;
 applyAutoLayout(p);
 assert.equal(p.layouts.filter(l=>l.auto).length,autos,'a second run replaces the first');
 assert.equal(p.layouts.length,autos+1);
 // Changing an Auto layout stretch by hand (its preset, its place or its length) makes it the creator's own.
 const [a,b,c]=p.layouts.filter(l=>l.auto);
 chooseLayout(p,'Picture in picture',new Set([a.id]),0);
 moveEffects(p,new Set([b.id]),0);
 resizeEffect(p,c.id,'right',0);
 assert.deepEqual([a,b,c].map(l=>l.auto),[undefined,undefined,undefined]);
 applyAutoLayout(p);
 assert.ok(p.layouts.some(l=>l.id===a.id&&l.preset==='Picture in picture'),'a stretch changed by hand survives the next run');
 assert.equal(layoutsProblem(p.layouts),null);
});

test('the look\'s stage is left alone, and Auto layout says why it cannot run',()=>{
 const p=tutorial();p.clips[1]={...p.clips[1],sourceOut:20};p.clips.push(clip('tile','camera',20,40,{stage:true,sourceIn:20,sourceOut:60}));
 for(const s of planAutoLayout(p))assert.ok(s.end<=20+1e-6,'nothing planned over the stage');
 assert.equal(autoLayoutProblem(take([])),'There is no transcript yet, so Auto layout cannot tell talking from demoing.');
 const noScreen=tutorial();noScreen.clips=noScreen.clips.filter(c=>c.track!=='screen');
 assert.equal(autoLayoutProblem(noScreen),'Auto layout needs a screen recording to place.');
 const noCamera=tutorial();noCamera.clips=noCamera.clips.filter(c=>c.track!=='camera');
 assert.equal(autoLayoutProblem(noCamera),'Auto layout needs a camera clip to place.');
 const covered=tutorial();covered.layouts=[{id:'all',start:0,duration:60,preset:'Creator'}];
 assert.equal(autoLayoutProblem(covered),'Every part of the video already has a layout you set by hand.');
});

test('the auto_layout edit action applies the plan as one change and says what it did',()=>{
 const p=tutorial(),action={type:'auto_layout'} as const;
 assert.equal(editActionProblem(p,action),undefined);
 assert.match(describeEditAction(action),/screen alone while you demo/);
 const result=applyEditAction(p,action);
 assert.equal(result,'Auto layout: 1 screen-only stretch, 2 stretches of you full screen, 1 stretch with both');
 assert.deepEqual(p.layouts!.map(l=>[l.preset,l.auto]),[['Full frame',true],['Screen only',true],['Creator',true],['Full frame',true]]);
 assert.equal(layoutsProblem(p.layouts),null);
 assert.throws(()=>applyEditAction(take([]),action),/no transcript yet/);
});
