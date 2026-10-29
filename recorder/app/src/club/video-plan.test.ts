import test from 'node:test';
import assert from 'node:assert/strict';
import {changedSceneLine,clockTime,linkHost,movesForward,nextPlanStep,openPlanStep,stageReached,tileFromText} from './video-plan';

test('a Continue only moves the card forward',()=>{
 assert.equal(movesForward('ideas','planning'),true);
 assert.equal(movesForward('planning','recording'),true);
 assert.equal(movesForward('editing','recording'),false,'a card dragged further along stays');
 assert.equal(movesForward('recording','recording'),false);
});

test('a stage is reached once the card is at or past it',()=>{
 assert.equal(stageReached('recording','recording'),true);assert.equal(stageReached('publishing','recording'),true);
 assert.equal(stageReached('planning','recording'),false);assert.equal(stageReached('ideas','planning'),false);
});

test('Plan opens on the first step not done (Research is the Board now), and the steps follow each other',()=>{
 assert.equal(openPlanStep({research:false,package:false,outline:false}),'package');
 assert.equal(openPlanStep({research:true,package:false,outline:false}),'package');
 assert.equal(openPlanStep({research:true,package:true,outline:false}),'outline');
 assert.equal(openPlanStep({research:true,package:true,outline:true}),'outline');
 assert.equal(openPlanStep({research:false,package:true,outline:true}),'outline');
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
