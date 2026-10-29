import test from 'node:test';
import assert from 'node:assert/strict';
import type {TrendingEntry} from '../../shared/club';
import {addTopic,canContinue,canWriteVoice,freshReady,startingVideos,toggle,voiceFromDraft,WELCOME_QUESTIONS,WELCOME_STEPS} from './welcome';

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

test('Continue needs an AI on step 1, a channel or a filled-in fresh start on step 2, and nothing on step 3',()=>{
 const base={aiConnected:false,path:null,channelAdded:false,fresh:false} as const;
 assert.equal(canContinue(0,base),false);
 assert.equal(canContinue(0,{...base,aiConnected:true}),true);
 assert.equal(canContinue(1,base),false);
 assert.equal(canContinue(1,{...base,path:'channel'}),false);
 assert.equal(canContinue(1,{...base,path:'channel',channelAdded:true}),true);
 assert.equal(canContinue(1,{...base,path:'fresh'}),false);
 assert.equal(canContinue(1,{...base,path:'fresh',fresh:true}),true);
 assert.equal(canContinue(2,base),true);
 assert.equal(freshReady('Ana',['Claude'],['Creators']),true);
 for(const args of [['',['a'],['b']],['Ana',[],['b']],['Ana',['a'],[]]] as const)assert.equal(freshReady(args[0],args[1],args[2]),false);
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
