import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_STAGES} from '../../shared/club';
import {moveProblem,type MoveFacts} from '../../shared/club-move';

const nothing:MoveFacts={scenes:0,takes:0,exported:false,published:false};
test('all 36 manual stage transitions are allowed, even without production artifacts',()=>{
 for(const from of VIDEO_STAGES)for(const to of VIDEO_STAGES){
  assert.equal(moveProblem(from,to,nothing),null,`${from} → ${to}`);
 }
});
