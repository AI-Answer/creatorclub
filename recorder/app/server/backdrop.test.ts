import test from 'node:test';
import assert from 'node:assert/strict';
import {activeBackdrop,backdropChoice,backdropLoopTime,backdropMediaIds,isBackdrop,relinkBackdrops,screenAt,screenBehind,setBackdropChoice,DEFAULT_BACKDROP_COLOR} from '../shared/backdrop.ts';
import {defaultEffects,defaultTransform,type Clip,type Media} from '../shared/types.ts';
import {scenePlanningProject} from './automation-scope.ts';
import {createProject} from '../shared/types.ts';

const clip=(id:string,track:Clip['track'],start:number,length:number,more:Partial<Clip>={}):Clip=>({id,mediaId:id+'-media',name:id,track,start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects(),...more});
const media=(id:string,kind:Media['kind']):Media=>({id,name:id,path:'/tmp/'+id,kind,duration:4,width:16,height:9});

test('the Background picker writes each choice and reads it back',()=>{
 const fx=defaultEffects();
 assert.equal(backdropChoice(fx),'none');
 assert.ok(setBackdropChoice(fx,'color'));assert.deepEqual(fx.backdrop,{kind:'color',color:DEFAULT_BACKDROP_COLOR});assert.equal(fx.background,'remove');assert.equal(backdropChoice(fx),'color');
 setBackdropChoice(fx,'color',{color:'#AABBCC'});assert.deepEqual(fx.backdrop,{kind:'color',color:'#aabbcc'});
 setBackdropChoice(fx,'color',{color:'not a colour'});assert.equal(fx.backdrop?.kind==='color'&&fx.backdrop.color,DEFAULT_BACKDROP_COLOR);
 assert.equal(setBackdropChoice(fx,'image'),false,'a picture needs a file first');assert.equal(backdropChoice(fx),'color','nothing changes until one is chosen');
 assert.ok(setBackdropChoice(fx,'image',{mediaId:'pic'}));assert.deepEqual(fx.backdrop,{kind:'image',mediaId:'pic'});
 assert.ok(setBackdropChoice(fx,'image'),'choosing Picture again keeps the picture');assert.deepEqual(fx.backdrop,{kind:'image',mediaId:'pic'});
 assert.equal(setBackdropChoice(fx,'video'),false,'a picture is not reused as a video');
 assert.ok(setBackdropChoice(fx,'video',{mediaId:'clip'}));assert.equal(backdropChoice(fx),'video');
 assert.ok(setBackdropChoice(fx,'screen'));assert.deepEqual(fx.backdrop,{kind:'screen'});
 assert.ok(setBackdropChoice(fx,'blur'));assert.equal(fx.background,'blur');assert.equal(fx.backdrop,undefined);assert.equal(backdropChoice(fx),'blur');
 assert.ok(setBackdropChoice(fx,'none'));assert.equal(fx.background,'remove');assert.equal(fx.backdrop,undefined);assert.equal(backdropChoice(fx),'none');
});

test('a backdrop is drawn only with Remove background on and its media present',()=>{
 const c=clip('cam','camera',0,4,{effects:{...defaultEffects(),background:'remove',backdrop:{kind:'image',mediaId:'pic'}}});
 assert.deepEqual(activeBackdrop(c,[media('pic','image')]),{kind:'image',mediaId:'pic'});
 assert.equal(activeBackdrop(c,[]),undefined,'missing media');
 assert.equal(activeBackdrop(c,[media('pic','video')]),undefined,'wrong kind');
 assert.deepEqual(activeBackdrop(c),{kind:'image',mediaId:'pic'},'without a media list only the shape counts');
 c.effects.background='blur';assert.equal(activeBackdrop(c,[media('pic','image')]),undefined);
 c.effects.background=undefined;assert.equal(backdropChoice(c.effects),'none');
 assert.ok(isBackdrop({kind:'screen'}));assert.ok(!isBackdrop({kind:'color',color:'#fff'}));assert.ok(!isBackdrop(null));
});

test('backdrop media is kept, fingerprinted and relinked with the project',()=>{
 const p=createProject('Keep');
 p.media=[media('cam-media','video'),media('pic','image'),media('loop','video')];
 p.clips=[clip('cam','camera',0,4,{effects:{...defaultEffects(),background:'remove',backdrop:{kind:'image',mediaId:'pic'}}}),clip('cam2','camera',4,4,{mediaId:'cam-media',effects:{...defaultEffects(),background:'remove',backdrop:{kind:'video',mediaId:'loop'}}})];
 p.clips[0].mediaId='cam-media';
 assert.deepEqual(backdropMediaIds(p).sort(),['loop','pic']);
 p.scenes=[{id:'s',name:'S',script:'',notes:'',start:0,duration:8}];
 const planning=scenePlanningProject(p,{id:'s',name:'S',start:0,end:8});
 assert.deepEqual(planning.media.map(m=>m.id).sort(),['cam-media','loop','pic'],'a scene-only copy keeps the backdrop media its clips name');
 relinkBackdrops(p,'pic','pic-2');assert.deepEqual(p.clips[0].effects.backdrop,{kind:'image',mediaId:'pic-2'});
});

test('a looping backdrop continues across splits, and the preview and export agree on its frame',()=>{
 const whole=clip('cam','camera',10,6);
 assert.equal(backdropLoopTime(whole,10,4),0);
 assert.equal(backdropLoopTime(whole,13,4),3);
 assert.equal(backdropLoopTime(whole,15,4),1);
 assert.equal(backdropLoopTime(whole,9,4),0,'before the clip it waits on its first frame');
 assert.equal(backdropLoopTime(whole,12,0),0,'a zero-length video stays on its only frame');
 // The second half of a split remembers it began 3 s into the original clip.
 const second=clip('cam-b','camera',13,3,{sourceIn:3,sourceOut:6,effectTiming:{sourceIn:0,sourceOut:6}});
 assert.equal(backdropLoopTime(second,15,4),backdropLoopTime(whole,15,4));
});

test('the screen recording behind the camera follows the screen clips under it',()=>{
 const p={clips:[clip('a','screen',0,5),clip('b','screen',5,5,{sourceIn:2,sourceOut:7,speed:1}),clip('cam','camera',0,10),clip('fast','screen',12,2,{sourceIn:1,sourceOut:5,speed:2})]};
 const pieces=screenBehind(p,3,8);
 assert.deepEqual(pieces.map(x=>[x.clip.id,x.from,x.to,x.sourceStart]),[['a',3,5,3],['b',5,8,2]]);
 assert.deepEqual(screenBehind(p,12.5,20).map(x=>[x.clip.id,x.from,x.to,x.sourceStart]),[['fast',12.5,14,2]],'speed changes the source second');
 assert.equal(screenAt(p,4.9)?.id,'a');assert.equal(screenAt(p,5)?.id,'b');assert.equal(screenAt(p,11),undefined);
});

test('Borumi export names a camera backdrop and a canvas picture as the reasons it is blocked',async()=>{
 const {planNewBorumiProject}=await import('./borumi-new-project.ts');
 const p=createProject('Borumi');p.canvas={...p.canvas,backgroundPattern:undefined,padding:0,radius:0,background:'#000000'};
 p.media=[media('cam-media','video'),media('pic','image')];
 p.clips=[clip('cam','camera',0,3,{mediaId:'cam-media',effects:{...defaultEffects(),background:'remove',backdrop:{kind:'image',mediaId:'pic'}}})];
 const blockers=()=>[...planNewBorumiProject(p).blockers].join('\n');
 assert.match(blockers(),/background behind the cut-out camera/);
 p.clips[0].effects.backdrop=undefined;assert.match(blockers(),/background removal and blur/);
 p.clips[0].effects.background='none';p.canvas.backgroundMediaId='pic';
 assert.match(blockers(),/picture or video canvas background/);assert.doesNotMatch(blockers(),/zero canvas radius/);
});
