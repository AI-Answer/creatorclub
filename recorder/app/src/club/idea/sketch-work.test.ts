import test from 'node:test';
import assert from 'node:assert/strict';
import {seeSettled,seeStarted,seeValue,startWork} from './sketch-work';

test('a quick change shows on its part from the click until the new words land, one at a time', () => {
 let work=startWork(null,'logline','rewrite','Old logline');
 assert.equal(work?.phase,'working');
 assert.equal(startWork(work,'title','titles','T'),work,'a second change waits for the first');
 assert.equal(seeValue(work,'Old logline ')?.phase,'working','the same words are no change');
 work=seeSettled(work,{ok:true,choice:false});
 assert.equal(work?.phase,'settling','the reply came; its change is on its way');
 assert.equal(seeValue(work,'A sharper logline')?.phase,'changed');
});

test('options to pick from wait for the pick in the chat; a failed reply says so', () => {
 let work=seeSettled(startWork(null,'title','titles','My title'),{ok:true,choice:true});
 assert.equal(work?.phase,'choose');
 work=seeStarted(work);
 assert.equal(work?.phase,'working','the pick is being made');
 work=seeSettled(work,{ok:true,choice:false});
 assert.equal(work?.phase,'settling','the pick was answered');
 assert.equal(seeValue(work,'The picked title')?.phase,'changed');
 assert.equal(seeSettled(startWork(null,'logline','shorter','x'),{ok:false,choice:false})?.phase,'failed');
 assert.equal(seeSettled(seeSettled(startWork(null,'title','titles','x'),{ok:true,choice:true}),{ok:false,choice:false}),null,'a stopped pick just ends');
 assert.ok(startWork({part:'logline',tool:'rewrite',phase:'changed',before:''},'title','titles','x'),'a finished change does not hold the next one');
});
