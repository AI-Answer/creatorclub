import test from 'node:test';
import assert from 'node:assert/strict';
import {recallEditView,rememberEditView} from './edit-session';

test('Task 14: Edit keeps zoom, playhead and selection per video for the session',()=>{
 assert.equal(recallEditView('a'),undefined);
 rememberEditView('a',{zoom:120,playhead:12.5,selectedIds:['x','y'],selected:'x'});rememberEditView('b',{zoom:40,playhead:1,selectedIds:[],selected:null});
 assert.deepEqual(recallEditView('a'),{zoom:120,playhead:12.5,selectedIds:['x','y'],selected:'x'});assert.equal(recallEditView('b')?.zoom,40);
 const view=recallEditView('a')!;view.selectedIds.push('z');assert.deepEqual(recallEditView('a')?.selectedIds,['x','y'],'a copy, not the stored view');
});
