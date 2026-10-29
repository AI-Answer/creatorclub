import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_STAGES} from '../../shared/club';
import {autoCollapses,defaultTab,parseRoute,routeHash,routePath,stepForTab,videoTabs,type Route} from './routes';
import {backLabel,continueLabel,nextStep,previousStep} from './video-steps';

test('every route survives a round trip through the hash',()=>{
 const routes:Route[]=[
  {name:'welcome'},{name:'overview'},{name:'trending'},{name:'signals'},{name:'settings'},
  {name:'ideas'},{name:'ideas',filter:'later'},{name:'ideas',filter:'skipped',open:'v-1'},{name:'ideas',new:'v-2'},{name:'ideas',bd:'dQw4w9WgXcQ'},{name:'ideas',filter:'later',open:'a b&c',new:'n',bd:'x'},
  {name:'production',view:'board'},{name:'production',view:'table'},{name:'production',view:'calendar'},
  {name:'video',id:'v-1'},{name:'video',id:'a b/c'},...videoTabs.map(tab=>({name:'video',id:'v-1',tab}) as Route),
 ];
 for(const route of routes)assert.deepEqual(parseRoute(routeHash(route)),route,routeHash(route));
});

test('routes have the hashes the sidebar and the palette link to',()=>{
 const hashes:Array<[Route,string]>=[
  [{name:'welcome'},'#/welcome'],[{name:'overview'},'#/overview'],[{name:'production',view:'board'},'#/production'],[{name:'production',view:'table'},'#/production/table'],[{name:'production',view:'calendar'},'#/production/calendar'],
  [{name:'video',id:'v-1',tab:'edit'},'#/video/v-1/edit'],[{name:'video',id:'a b'},'#/video/a%20b'],
  [{name:'ideas',filter:'later',open:'v-1'},'#/ideas?filter=later&open=v-1'],[{name:'ideas',bd:'abc'},'#/ideas?bd=abc'],[{name:'ideas'},'#/ideas'],
 ];
 for(const [route,hash] of hashes)assert.equal(routeHash(route),hash);
});

test('an empty hash, an unknown one or a malformed one is the overview',()=>{
 for(const hash of ['','#','#/','#/nope','#/overview/extra','#/settings/x','#/production/gantt','#/production/table/extra','#/video','#/video/','#/video/v-1/film','#/video/v-1/plan/extra','#/video/%E0%A4%A/plan','#/welcome/x'])assert.deepEqual(parseRoute(hash),{name:'overview'},hash);
 assert.deepEqual(parseRoute('#video/v-1/record'),{name:'video',id:'v-1',tab:'record'});
});

test('old links land on the new screens',()=>{
 assert.deepEqual(parseRoute('#/board'),{name:'production',view:'board'});
 assert.deepEqual(parseRoute('#/onboarding'),{name:'welcome'});
 for(const step of ['plan','record','edit','publish'] as const)assert.deepEqual(parseRoute(`#/video/v-1/${step}`),{name:'video',id:'v-1',tab:step});
 assert.deepEqual(parseRoute('#/video/v-1'),{name:'video',id:'v-1'},'a video without a tab opens on the tab for its stage');
});

test('ideas keep only the query they understand',()=>{
 assert.deepEqual(parseRoute('#/ideas?filter=later'),{name:'ideas',filter:'later'});
 assert.deepEqual(parseRoute('#/ideas?filter=everything&open='),{name:'ideas'});
 assert.deepEqual(parseRoute('#/ideas?open=v-1&new=v-2&bd=abc&other=1'),{name:'ideas',open:'v-1',new:'v-2',bd:'abc'});
 assert.deepEqual(parseRoute('#/overview?filter=later'),{name:'overview'});
});

test('a video opens on the tab for its stage',()=>{
 assert.deepEqual(VIDEO_STAGES.map(defaultTab),['board','plan','record','edit','publish','publish']);
});

test('the sidebar folds on its own on Record and Edit only',()=>{
 assert.equal(autoCollapses({name:'video',id:'v',tab:'record'}),true);
 assert.equal(autoCollapses({name:'video',id:'v',tab:'edit'}),true);
 for(const tab of ['board','plan','publish'] as const)assert.equal(autoCollapses({name:'video',id:'v',tab}),false,tab);
 assert.equal(autoCollapses({name:'video',id:'v'}),false);
 assert.equal(autoCollapses({name:'production',view:'board'}),false);
});

test('the route path ignores the query, so opening an idea does not reset the page',()=>{
 assert.equal(routePath({name:'ideas',open:'v-1'}),'#/ideas');assert.equal(routePath({name:'ideas'}),'#/ideas');assert.equal(routePath({name:'video',id:'v',tab:'plan'}),'#/video/v/plan');
});

test('until the new video page arrives, Board stands in as Plan',()=>{
 assert.deepEqual(videoTabs.map(stepForTab),['plan','plan','record','edit','publish']);
});

test('the bottom bar labels follow PLAN.md',()=>{
 assert.equal(backLabel('plan'),'Back to board');assert.equal(previousStep('plan'),'board');
 assert.equal(backLabel('record'),'Back to plan');assert.equal(continueLabel('record'),'Continue to editing');
 assert.equal(continueLabel('plan'),'Continue to recording');assert.equal(continueLabel('edit'),'Continue to publishing');
 assert.equal(backLabel('publish'),'Back to editing');assert.equal(continueLabel('publish'),undefined);assert.equal(nextStep('publish'),undefined);
});
