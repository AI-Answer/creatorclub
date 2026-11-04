import test from 'node:test';
import assert from 'node:assert/strict';
import type {TrendingEntry} from '../../shared/club';
import {addChannelBlock,addTopic,canContinue,reachableStep,canWriteVoice,freshReady,startingVideos,toggle,voiceFromDraft,WELCOME_QUESTIONS,WELCOME_STEPS} from './welcome';

const entry=(videoId:string,over:Partial<TrendingEntry>):TrendingEntry=>({videoId,title:videoId,channel:'c',kind:'followed',views:1000,likes:null,comments:null,published:'2026-10-01',ageDays:2,vpd:500,mult:2,fit:true,reason:'Because you picked Claude',...over} as TrendingEntry);

test('every step says why it is asked, and there are three optional voice questions',()=>{
 assert.equal(WELCOME_STEPS.length,4);
 for(const step of WELCOME_STEPS)assert.ok(step.title&&step.why.length>40);
 assert.equal(WELCOME_QUESTIONS.length,3);
 assert.ok(!JSON.stringify([WELCOME_STEPS,WELCOME_QUESTIONS]).match(/Samin|Codex|Borumi/));
});

test('picking and typing topics keeps order and never repeats one',()=>{
 assert.deepEqual(toggle(['a'],'b'),['a','b']);
 assert.deepEqual(toggle(['a','b'],'a'),['b']);
 assert.deepEqual(addTopic(['Claude'],' claude '),['Claude']);
 assert.deepEqual(addTopic(['Claude'],'Woodworking'),['Claude','Woodworking']);
 assert.deepEqual(addTopic(['Claude'],' '),['Claude']);
});

test('Continue works on step 1 unless no AI is signed in, needs a channel or a filled-in fresh start on step 2, and nothing on step 3',()=>{
 const base={ai:'connected',path:null,channelAdded:false,fresh:false} as const;
 assert.equal(canContinue(0,{...base,ai:'missing'}),true);
 for(const ai of ['connected','checking','unknown'] as const)assert.equal(canContinue(0,{...base,ai}),true,`${ai}: the check never holds you up`);
 assert.equal(canContinue(1,base),false);
 assert.equal(canContinue(1,{...base,path:'channel'}),false);
 assert.equal(canContinue(1,{...base,path:'channel',channelAdded:true}),true);
 assert.equal(canContinue(1,{...base,path:'fresh'}),false);
 assert.equal(canContinue(1,{...base,path:'fresh',fresh:true}),true);
 assert.equal(canContinue(2,base),true);
 assert.equal(freshReady('Ana',['Claude'],['Creators']),true);
 for(const args of [['',['a'],['b']],['Ana',[],['b']],['Ana',['a'],[]]] as const)assert.equal(freshReady(args[0],args[1],args[2]),false);
});

test('adding a channel waits for the AI only while it is being checked or missing, and a link to a later step opens the furthest one that is ready',()=>{
 assert.equal(addChannelBlock('checking'),'checking');
 assert.equal(addChannelBlock('missing'),'missing');
 for(const ai of ['connected','unknown'] as const)assert.equal(addChannelBlock(ai),null);
 const base={ai:'connected',path:null,channelAdded:false,fresh:false,channelMade:false} as const;
 assert.equal(reachableStep({...base,ai:'missing'}),1,'no AI: channel setup is reachable');
 assert.equal(reachableStep(base),1,'nothing chosen: step 2');
 assert.equal(reachableStep({...base,path:'fresh',fresh:true}),2,'a filled-in fresh start: step 3');
 assert.equal(reachableStep({...base,path:'channel',channelAdded:true,channelMade:true}),3,'a channel exists: step 4');
 assert.equal(reachableStep({...base,ai:'checking',path:'fresh',fresh:true}),2,'the check running is no reason to wait');
 assert.equal(reachableStep({...base,ai:'missing',passedConnect:true}),1,'a late "no AI" does not pull you out of step 2');
});

test('voice answers map onto the voice guide, leaving out blanks and "I don\'t know yet"',()=>{
 assert.deepEqual(voiceFromDraft({audience:' I teach AI ',voice:'Upbeat and fast',moves:''}),{audience:'I teach AI',voice:'Upbeat and fast'});
 assert.deepEqual(voiceFromDraft({voice:"I don't know yet"}),{});
 assert.equal(canWriteVoice({voice:'a'}),false);
 assert.equal(canWriteVoice({voice:'a',audience:'b'}),true);
});

test('the starting videos are the ones that fit, strongest outlier first, and none when nothing fits',()=>{
 const list=[entry('a',{mult:2,vpd:900}),entry('b',{mult:null,vpd:5000}),entry('c',{mult:6,vpd:10}),entry('d',{fit:false,reason:null,mult:90}),entry('e',{mult:2,vpd:100})];
 assert.deepEqual(startingVideos(list).map(item=>item.videoId),['c','a','e','b']);
 assert.equal(startingVideos(list,2).length,2);
 assert.deepEqual(startingVideos([entry('x',{fit:false,reason:null})]),[]);
 assert.deepEqual(startingVideos([]),[]);
});
