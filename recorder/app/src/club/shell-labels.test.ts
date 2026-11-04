import test from 'node:test';
import assert from 'node:assert/strict';
import {shellOptions,FIND_IDEA,PLACES,GLOSSARY} from './shell/labels';

test('palette uses the two current places and keeps legacy names as search aliases',()=>{
 const pages=shellOptions([],'').filter(option=>option.kind==='Page');
 assert.equal(pages.find(option=>option.id==='page:home')?.label,'Video board');
 assert.equal(pages.find(option=>option.id==='page:discover')?.label,'Research');
 assert.ok(!pages.some(option=>['page:videos','page:research'].includes(option.id)));
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
