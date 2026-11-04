import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_STAGES} from '../../shared/club';
import {autoCollapses,defaultTab,originLabel,parseRoute,routeHash,routePath,videoOrigin,videoTabs,type Route} from './routes';

test('every route survives a round trip through the hash',()=>{
 const routes:Route[]=[
  {name:'welcome'},{name:'welcome',step:2},{name:'settings',section:'followed'},{name:'settings',section:'ai'},{name:'home'},{name:'settings'},
  {name:'discover'},{name:'discover',show:'youtube'},{name:'discover',show:'followed'},{name:'discover',show:'x'},{name:'discover',show:'reddit'},
  {name:'videos',view:'board'},{name:'videos',view:'table'},{name:'videos',view:'calendar'},{name:'videos',view:'board',group:'later'},{name:'videos',view:'board',group:'skipped',open:'v-1'},
  {name:'videos',view:'board',new:'v-2'},{name:'videos',view:'board',bd:'dQw4w9WgXcQ'},{name:'videos',view:'table',group:'later',open:'a b&c',new:'n',bd:'x'},
  {name:'video',id:'v-1'},{name:'video',id:'a b/c'},...videoTabs.map(tab=>({name:'video',id:'v-1',tab}) as Route),
 ];
 for(const route of routes)assert.deepEqual(parseRoute(routeHash(route)),route,routeHash(route));
});

test('routes have the hashes the sidebar and the palette link to',()=>{
 const hashes:Array<[Route,string]>=[
  [{name:'welcome'},'#/welcome'],[{name:'home'},'#/home'],[{name:'discover'},'#/discover'],[{name:'discover',show:'fit'},'#/discover'],[{name:'discover',show:'x'},'#/discover?show=x'],
  [{name:'videos',view:'board'},'#/videos'],[{name:'videos',view:'table'},'#/videos/table'],[{name:'videos',view:'calendar'},'#/videos/calendar'],
  [{name:'video',id:'v-1',tab:'edit'},'#/video/v-1/edit'],[{name:'video',id:'a b'},'#/video/a%20b'],
  [{name:'videos',view:'board',group:'later',open:'v-1'},'#/videos?group=later&open=v-1'],[{name:'videos',view:'board',bd:'abc'},'#/videos?bd=abc'],
 ];
 for(const [route,hash] of hashes)assert.equal(routeHash(route),hash);
});

test('an empty hash, an unknown one or a malformed one is Home',()=>{
 for(const hash of ['','#','#/','#/nope','#/home/extra','#/overview/extra','#/settings/x','#/videos/gantt','#/videos/table/extra','#/production/gantt','#/discover/x','#/video','#/video/','#/video/v-1/plan/extra','#/video/%E0%A4%A/plan','#/welcome/x'])assert.deepEqual(parseRoute(hash),{name:'home'},hash);
 assert.deepEqual(parseRoute('#video/v-1/record'),{name:'video',id:'v-1',tab:'record'});
});

test('old links land on the new screens, with what they carried',()=>{
 const old:Array<[string,Route,string]>=[
  ['#/overview',{name:'home'},'#/home'],
  ['#/trending',{name:'discover',show:'youtube'},'#/discover?show=youtube'],
  ['#/signals',{name:'discover'},'#/discover'],
  ['#/ideas',{name:'videos',view:'board'},'#/videos'],
  ['#/ideas?filter=later',{name:'videos',view:'board',group:'later'},'#/videos?group=later'],
  ['#/ideas?filter=skipped&open=v-1',{name:'videos',view:'board',group:'skipped',open:'v-1'},'#/videos?group=skipped&open=v-1'],
  ['#/ideas?new=v-2',{name:'videos',view:'board',new:'v-2'},'#/videos?new=v-2'],
  ['#/ideas?bd=dQw4w9WgXcQ',{name:'videos',view:'board',bd:'dQw4w9WgXcQ'},'#/videos?bd=dQw4w9WgXcQ'],
  ['#/production',{name:'videos',view:'board'},'#/videos'],
  ['#/production/table',{name:'videos',view:'table'},'#/videos/table'],
  ['#/production/calendar',{name:'videos',view:'calendar'},'#/videos/calendar'],
  ['#/board',{name:'videos',view:'board'},'#/videos'],
  ['#/onboarding',{name:'welcome'},'#/welcome'],
 ];
 for(const [hash,route,canonical] of old){assert.deepEqual(parseRoute(hash),route,hash);assert.equal(routeHash(parseRoute(hash)),canonical,hash);}
 for(const step of ['idea','record','edit','publish'] as const)assert.deepEqual(parseRoute(`#/video/v-1/${step}`),{name:'video',id:'v-1',tab:step});
 // The old Board and Plan tabs are Idea, so an old link still opens the right page.
 for(const old of ['board','plan'])assert.deepEqual(parseRoute(`#/video/v-1/${old}`),{name:'video',id:'v-1',tab:'idea'});
 assert.deepEqual(parseRoute('#/video/v-1'),{name:'video',id:'v-1'},'a video without a tab opens on the tab for its stage');
});

test('Videos and Discover keep only the query they understand',()=>{
 assert.deepEqual(parseRoute('#/videos?group=later'),{name:'videos',view:'board',group:'later'});
 assert.deepEqual(parseRoute('#/videos?group=everything&open='),{name:'videos',view:'board'});
 assert.deepEqual(parseRoute('#/videos?filter=later'),{name:'videos',view:'board'},'filter is the old word, read only on #/ideas');
 assert.deepEqual(parseRoute('#/videos/calendar?open=v-1&new=v-2&bd=abc&other=1'),{name:'videos',view:'calendar',open:'v-1',new:'v-2',bd:'abc'});
 assert.deepEqual(parseRoute('#/discover?show=fit'),{name:'discover'});
 assert.deepEqual(parseRoute('#/discover?show=tiktok'),{name:'discover'});
 assert.deepEqual(parseRoute('#/home?filter=later'),{name:'home'});
});

test('a video opens on the tab for its stage',()=>{
 assert.deepEqual(VIDEO_STAGES.map(defaultTab),['idea','idea','record','edit','publish','publish']);
});

test('the sidebar folds on its own on every step of a video, and nowhere else',()=>{
 for(const tab of ['idea','record','edit','publish'] as const)assert.equal(autoCollapses({name:'video',id:'v',tab}),true,tab);
 assert.equal(autoCollapses({name:'video',id:'v'}),true);
 assert.equal(autoCollapses({name:'videos',view:'board'}),false);
});

test('the route path ignores the query, so opening an idea or picking a chip does not reset the page',()=>{
 assert.equal(routePath({name:'videos',view:'board',open:'v-1'}),'#/videos');assert.equal(routePath({name:'videos',view:'board'}),'#/videos');
 assert.equal(routePath({name:'discover',show:'x'}),'#/discover');assert.equal(routePath({name:'video',id:'v',tab:'idea'}),'#/video/v/idea');
});

test('a video goes back to the screen it was opened from, whatever tabs or videos it moved through',()=>{
 const ideas:Route={name:'videos',view:'board',group:'later'},overview:Route={name:'home'},one:Route={name:'video',id:'a',tab:'idea'},two:Route={name:'video',id:'a',tab:'record'},other:Route={name:'video',id:'b'};
 assert.deepEqual(videoOrigin(undefined,ideas,one),ideas,'opened from Videos');
 assert.deepEqual(videoOrigin(ideas,one,two),ideas,'a tab change keeps it');
 assert.deepEqual(videoOrigin(ideas,two,other),ideas,'so does another video from the sidebar');
 assert.deepEqual(videoOrigin(ideas,overview,one),overview,'a new visit from another screen replaces it');
 assert.deepEqual(videoOrigin(ideas,one,overview),ideas,'leaving does not change it');
 assert.equal(videoOrigin(undefined,{name:'welcome'},one),undefined,'first launch is not somewhere to go back to');
 assert.equal(originLabel(ideas),'Video board');assert.equal(originLabel({name:'discover'}),'Research');assert.equal(originLabel({name:'home'}),'Video board');assert.equal(originLabel(undefined),'Video board');
});

test('Welcome opens at a step and Settings at a section; an unknown step or section is ignored',()=>{
 assert.equal(routeHash({name:'welcome',step:2}),'#/welcome?step=2');
 assert.equal(routeHash({name:'settings',section:'followed'}),'#/settings/followed');
 assert.deepEqual(parseRoute('#/welcome?step=9'),{name:'welcome'});
 assert.deepEqual(parseRoute('#/welcome?step=x'),{name:'welcome'});
 assert.deepEqual(parseRoute('#/settings/channel'),{name:'settings',section:'channel'});
 assert.deepEqual(parseRoute('#/settings/nope'),{name:'home'});
});

test('a video link with an unknown tab opens the video on the tab for its stage',()=>{
 assert.deepEqual(parseRoute('#/video/v-1/film'),{name:'video',id:'v-1'});
});
