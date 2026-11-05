import test from 'node:test';
import assert from 'node:assert/strict';
import {shellOptions,FIND_IDEA,PLACES,GLOSSARY} from './shell/labels';

test('palette uses the two current places and keeps legacy names as search aliases',()=>{
 const pages=shellOptions([],'').filter(option=>option.kind==='Page');
 assert.equal(pages.find(option=>option.id==='page:home')?.label,'Video board');
 assert.equal(pages.find(option=>option.id==='page:discover')?.label,'Research');
 assert.ok(!pages.some(option=>option.id==='page:videos'));
 assert.equal(pages.find(option=>option.id==='page:research')?.label,'Channel board');
 assert.deepEqual(pages.find(option=>option.id==='page:research')?.target,{route:{name:'research'}});
 for(const query of ['research','discover']){
  const option=shellOptions([],query).find(option=>option.id==='page:discover')!;
  assert.equal(option.label,'Research');assert.deepEqual(option.target,{route:{name:'discover'}});
 }
 for(const query of ['video board','home'])assert.ok(shellOptions([],query).some(option=>option.id==='page:home'));
});

test('Help names Research as the feed and Video board as the pipeline',()=>{
 assert.equal(FIND_IDEA.name,'Research');
 assert.ok(PLACES.some(place=>place.name==='Video board'));
 assert.ok(PLACES.some(place=>place.name==='Research'&&place.where.includes('YouTube')));
 assert.doesNotMatch(JSON.stringify({PLACES,GLOSSARY}),/Discover|Home|channel's own board/);
});

test('palette uses one board name and exposes steps only for the open video',()=>{
 const video=(id:string,title:string)=>({id,title,stage:'planning' as const,order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}});
 const videos=[video('a','First video'),video('b','Another video')];
 assert.equal(shellOptions(videos,'').filter(option=>option.kind==='Step').length,0);
 const steps=shellOptions(videos,'','a').filter(option=>option.kind==='Step');
 assert.equal(steps.length,4);
 for(const step of steps)assert.ok('route' in step.target&&step.target.route.name==='video'&&step.target.route.id==='a');
 assert.equal(shellOptions(videos,'','missing').filter(option=>option.kind==='Step').length,0);
 assert.equal(shellOptions(videos,'').find(option=>option.id==='page:table')?.label,'Video board as a table');
 assert.equal(shellOptions(videos,'').find(option=>option.id==='page:calendar')?.label,'Video board as a calendar');
});
