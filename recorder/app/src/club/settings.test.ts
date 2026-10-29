import test from 'node:test';
import assert from 'node:assert/strict';
import {followedFromInput,followedLabel,parseList,withEntry,withFollowed} from './settings';

test('a followed channel is made from a handle or a channel link, and nothing else',()=>{
 assert.deepEqual(followedFromInput('@RileyBrown'),{name:'@RileyBrown',handle:'@RileyBrown'});
 assert.deepEqual(followedFromInput(' https://www.youtube.com/@RileyBrown/videos '),{name:'@RileyBrown',handle:'@RileyBrown',url:'https://www.youtube.com/@RileyBrown/videos'});
 assert.deepEqual(followedFromInput('youtube.com/channel/UCabcdefghijklmnopqrstuv'),{name:'youtube.com/channel/UCabcdefghijklmnopqrstuv',url:'youtube.com/channel/UCabcdefghijklmnopqrstuv'});
 for(const bad of ['','  ','two words'])assert.equal(followedFromInput(bad),null,bad);
});

test('a channel already followed is not added twice, however it was typed',()=>{
 const list=[{name:'Riley',handle:'@RileyBrown',url:'https://www.youtube.com/@RileyBrown'}];
 assert.deepEqual(withFollowed(list,'@rileybrown'),list);
 assert.deepEqual(withFollowed(list,''),list);
 assert.equal(withFollowed(list,'@NateHerk').length,2);
 assert.equal(followedLabel(list[0]),'@RileyBrown');
 assert.equal(followedLabel({name:'Some channel',url:'https://www.youtube.com/c/some'}),'Some channel');
});

test('lists of topics, accounts and subreddits are trimmed and kept free of repeats',()=>{
 assert.deepEqual(parseList(' Claude, ai agents ,,CLAUDE\nVibe coding'),['Claude','ai agents','Vibe coding']);
 assert.deepEqual(withEntry(['Claude'],'  claude '),['Claude']);
 assert.deepEqual(withEntry(['Claude'],'Woodworking'),['Claude','Woodworking']);
 assert.deepEqual(withEntry(['Claude'],'  '),['Claude']);
});
