import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute,routeHash,type Route} from './routes';
import {backLabel,continueLabel,nextStep,previousStep} from './video-steps';

test('every route survives a round trip through the hash',()=>{
 const routes:Route[]=[{name:'board'},{name:'settings'},{name:'onboarding'},{name:'video',id:'v-1',step:'plan'},{name:'video',id:'a b/c',step:'publish'}];
 for(const route of routes)assert.deepEqual(parseRoute(routeHash(route)),route);
 assert.equal(routeHash({name:'video',id:'v-1',step:'edit'}),'#/video/v-1/edit');
});

test('unknown or malformed hashes fall back to the board',()=>{
 for(const hash of ['','#','#/','#/nope','#/board/extra','#/video','#/video/v-1/film','#/video/v-1/plan/extra','#/video/%E0%A4%A/plan'])assert.deepEqual(parseRoute(hash),{name:'board'},hash);
 assert.deepEqual(parseRoute('#/video/v-1'),{name:'video',id:'v-1',step:'plan'});
 assert.deepEqual(parseRoute('#video/v-1/record'),{name:'video',id:'v-1',step:'record'});
});

test('the bottom bar labels follow PLAN.md',()=>{
 assert.equal(backLabel('plan'),'Back to board');assert.equal(previousStep('plan'),'board');
 assert.equal(backLabel('record'),'Back to plan');assert.equal(continueLabel('record'),'Continue to editing');
 assert.equal(continueLabel('plan'),'Continue to recording');assert.equal(continueLabel('edit'),'Continue to publishing');
 assert.equal(backLabel('publish'),'Back to editing');assert.equal(continueLabel('publish'),undefined);assert.equal(nextStep('publish'),undefined);
});
