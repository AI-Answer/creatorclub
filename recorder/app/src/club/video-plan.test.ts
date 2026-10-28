import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_STAGES} from '../../shared/club';
import {stepForStage} from './board';
import {changedSceneLine,clockTime,continueStage,doneSteps,linkHost,movesForward,nextPlanStep,openPlanStep,stageOfStep,tileFromText} from './video-plan';

test('stages and steps map both ways: Ideas opens Plan, Published opens Publish',()=>{
 assert.deepEqual(VIDEO_STAGES.map(stepForStage),['plan','plan','record','edit','publish','publish']);
 for(const [step,stage] of Object.entries(stageOfStep))assert.equal(stepForStage(stage),step,`${step} works in ${stage}`);
 assert.deepEqual(continueStage,{plan:'recording',record:'editing',edit:'publishing',publish:undefined});
});

test('a Continue only moves the card forward',()=>{
 assert.equal(movesForward('ideas','planning'),true);
 assert.equal(movesForward('planning','recording'),true);
 assert.equal(movesForward('editing','recording'),false,'a card dragged further along stays');
 assert.equal(movesForward('recording','recording'),false);
});

test('steps are ticked once the video has moved past their stage',()=>{
 assert.deepEqual(doneSteps({stage:'ideas'}),[]);
 assert.deepEqual(doneSteps({stage:'planning'}),[]);
 assert.deepEqual(doneSteps({stage:'recording'}),['plan']);
 assert.deepEqual(doneSteps({stage:'publishing'}),['plan','record','edit']);
 assert.deepEqual(doneSteps({stage:'published'}),['plan','record','edit','publish']);
});

test('Plan opens on the first step not done, and the steps follow each other',()=>{
 assert.equal(openPlanStep({research:false,package:false,outline:false}),'research');
 assert.equal(openPlanStep({research:true,package:false,outline:false}),'package');
 assert.equal(openPlanStep({research:true,package:true,outline:false}),'outline');
 assert.equal(openPlanStep({research:true,package:true,outline:true}),'outline');
 assert.equal(openPlanStep({research:false,package:true,outline:true}),'research');
 assert.equal(nextPlanStep('research'),'package');assert.equal(nextPlanStep('package'),'outline');assert.equal(nextPlanStep('outline'),undefined);
 assert.equal(changedSceneLine(3),'Your outline changed after you recorded scene 3.');
});

test('pasted text becomes a video, a link or text',()=>{
 assert.deepEqual(tileFromText(' https://youtu.be/dQw4w9WgXcQ '),{kind:'video',url:'https://youtu.be/dQw4w9WgXcQ'});
 assert.deepEqual(tileFromText('instagram.com/reel/abc123'),{kind:'video',url:'https://instagram.com/reel/abc123'});
 assert.deepEqual(tileFromText('https://docs.anthropic.com/en/docs'),{kind:'link',url:'https://docs.anthropic.com/en/docs'});
 assert.deepEqual(tileFromText('www.example.com/page'),{kind:'link',url:'https://www.example.com/page'});
 assert.deepEqual(tileFromText('Look at how fast this is https://x.com'),{kind:'text',text:'Look at how fast this is https://x.com'});
 assert.deepEqual(tileFromText('hello'),{kind:'text',text:'hello'});
 assert.equal(tileFromText('   '),undefined);
 assert.equal(linkHost('https://www.example.com/a'),'example.com');
 assert.equal(clockTime(0),'0:00');assert.equal(clockTime(125),'2:05');assert.equal(clockTime(3723),'1:02:03');
});
