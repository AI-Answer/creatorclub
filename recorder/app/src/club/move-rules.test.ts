import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_STAGES,type VideoStage} from '../../shared/club';
import {MOVE_NEEDS_EXPORT,MOVE_NEEDS_LINK,MOVE_NEEDS_SCENES,MOVE_NEEDS_TAKE,moveProblem,type MoveFacts} from '../../shared/club-move';
import {knownMoveProblem} from './useProduction';

const nothing:MoveFacts={scenes:0,takes:0,exported:false,published:false};
const everything:MoveFacts={scenes:3,takes:3,exported:true,published:true};
/** What each stage needs to be moved into, from nothing. */
const NEEDS:Record<VideoStage,string|null>={ideas:null,planning:null,recording:MOVE_NEEDS_SCENES,editing:MOVE_NEEDS_TAKE,publishing:MOVE_NEEDS_EXPORT,published:MOVE_NEEDS_LINK};

test('every transition: back or in place is always allowed; forward needs what the target stage works on',()=>{
 for(const from of VIDEO_STAGES)for(const to of VIDEO_STAGES){
  const forward=VIDEO_STAGES.indexOf(to)>VIDEO_STAGES.indexOf(from);
  assert.equal(moveProblem(from,to,nothing),forward?NEEDS[to]:null,`${from} → ${to} with nothing`);
  assert.equal(moveProblem(from,to,everything),null,`${from} → ${to} with everything`);
 }
});

test('each fact opens its own stage and no other',()=>{
 assert.equal(moveProblem('planning','recording',{...nothing,scenes:2}),null);
 assert.equal(moveProblem('recording','editing',{...nothing,scenes:2}),MOVE_NEEDS_TAKE,'scenes alone are not something to edit');
 assert.equal(moveProblem('recording','editing',{...nothing,scenes:2,takes:1}),null,'one take, kept or not, is something to edit');
 assert.equal(moveProblem('editing','publishing',{...nothing,scenes:2,takes:2}),MOVE_NEEDS_EXPORT);
 assert.equal(moveProblem('editing','publishing',{...nothing,scenes:2,takes:2,exported:true}),null);
 assert.equal(moveProblem('publishing','published',{...nothing,scenes:2,takes:2,exported:true}),MOVE_NEEDS_LINK,'an export is not a YouTube video');
 assert.equal(moveProblem('ideas','published',{...nothing,published:true}),null,'a video with its link can be put back in Published');
});

test('every refusal is one plain sentence that names what is missing',()=>{
 for(const sentence of [MOVE_NEEDS_SCENES,MOVE_NEEDS_TAKE,MOVE_NEEDS_EXPORT,MOVE_NEEDS_LINK]){
  assert.equal(sentence.split('. ').length,1,sentence);
  assert.match(sentence,/^[A-Z].*\.$/);
  assert.doesNotMatch(sentence,/please|successfully|!|project/i);
 }
});

test('the board asks the same rule with what it knows, and leaves an unknown video to the server',()=>{
 const facts={v1:nothing};
 assert.equal(knownMoveProblem({id:'v1',stage:'ideas'},'published',facts),MOVE_NEEDS_LINK);
 assert.equal(knownMoveProblem({id:'v1',stage:'ideas'},'planning',facts),null);
 assert.equal(knownMoveProblem({id:'v2',stage:'ideas'},'published',facts),null,'not known yet: the server decides');
 assert.equal(knownMoveProblem(undefined,'published',facts),null);
});
