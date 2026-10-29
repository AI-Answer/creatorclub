import test from 'node:test';
import assert from 'node:assert/strict';
import type {Outline,Package} from '../../../shared/club';
import {packageDiff,EMPTY_PACKAGE,blankScene,chosenTitle,editPoint,hasEmptyPlace,insertScene,mergePackage,moveScene,packageIsEmpty,parseClock,removeScene,titleTooLong,totalSeconds,withServerScripts,wordCount} from './plan-logic';

const written:Package={demand:{level:'high',note:'new'},angle:'new angle',twist:'new twist',titles:['N1','N2','N3'],thumbnailText:'NEW',hook:{visual:'new v',spoken:'new s',text:'new t'}};

test('a package run fills only empty fields and keeps what was written',()=>{
 const earlier:Package={...EMPTY_PACKAGE,angle:'mine',titles:['Mine','',''],hook:{visual:'',spoken:'my line',text:''},gap:{level:'low',note:'mine'}};
 const merged=mergePackage(earlier,written);
 assert.deepEqual(merged.titles,['Mine','N2','N3']);
 assert.equal(merged.angle,'mine');assert.equal(merged.twist,'new twist');assert.equal(merged.thumbnailText,'NEW');
 assert.deepEqual(merged.hook,{visual:'new v',spoken:'my line',text:'new t'});
 assert.deepEqual(merged.demand,{level:'high',note:'new'},'an unjudged rating takes the run');
 assert.deepEqual(merged.gap,{level:'low',note:'mine'},'a judged rating stays');
 assert.equal('show' in merged,false);
 assert.equal(mergePackage(null,written),written);
});

test('writing a group again replaces that group whole and still fills the rest',()=>{
 const earlier:Package={...EMPTY_PACKAGE,angle:'mine',titles:['A','B','C'],hook:{visual:'v',spoken:'s',text:'t'}};
 const titles=mergePackage(earlier,written,'titles');
 assert.deepEqual(titles.titles,['N1','N2','N3']);assert.deepEqual(titles.hook,earlier.hook);assert.equal(titles.angle,'mine');
 const hook=mergePackage(earlier,written,'hook');
 assert.deepEqual(hook.hook,written.hook);assert.deepEqual(hook.titles,['A','B','C']);
});

test('empty places and an empty package',()=>{
 assert.equal(hasEmptyPlace(null,'titles'),true);
 assert.equal(hasEmptyPlace({...EMPTY_PACKAGE,titles:['a','b','c']},'titles'),false);
 assert.equal(hasEmptyPlace({...EMPTY_PACKAGE,titles:['a','b','c'],hook:{visual:'v',spoken:'s',text:' '}},'hook'),true);
 assert.equal(packageIsEmpty(EMPTY_PACKAGE),true);assert.equal(packageIsEmpty(null),true);
 assert.equal(packageIsEmpty({...EMPTY_PACKAGE,twist:'x'}),false);
});

test('title words and the chosen title',()=>{
 assert.equal(wordCount('  one two  three '),3);assert.equal(wordCount(''),0);
 assert.equal(titleTooLong('a b c d e f g'),false);assert.equal(titleTooLong('a b c d e f g h'),true);assert.equal(titleTooLong('x'.repeat(61)),true);
 assert.equal(chosenTitle(['A','B ',''],'B'),1);assert.equal(chosenTitle(['','',''],''),-1);assert.equal(chosenTitle(['A','B','C'],'Other'),-1);
});

test('reordering follows the prototype: the drop position is a place in the list as it is now',()=>{
 const list=['a','b','c','d'];
 assert.deepEqual(moveScene(list,0,2),['b','a','c','d']);
 assert.deepEqual(moveScene(list,2,0),['c','a','b','d']);
 assert.deepEqual(moveScene(list,0,4),['b','c','d','a']);
 assert.deepEqual(moveScene(list,1,1),list);assert.deepEqual(moveScene(list,1,2),list,'dropping on its own place changes nothing');
 // arrow keys: up is to-1, down is to+2
 assert.deepEqual(moveScene(list,2,1),['a','c','b','d']);assert.deepEqual(moveScene(list,1,3),['a','c','b','d']);
 assert.deepEqual(insertScene(list,1,'x'),['a','x','b','c','d']);assert.deepEqual(removeScene(list,3),['a','b','c']);
});

test('talking points: an emptied point goes away, the one being edited stays',()=>{
 assert.deepEqual(editPoint(['a','b','c'],1,''),['a','','c']);
 assert.deepEqual(editPoint(['a','','c'],2,'z'),['a','z'],'the other empty point is dropped when another is edited');
 assert.deepEqual(editPoint(['a','b'],0,'x'),['x','b']);
});

test('scene lengths: totals and typed clocks',()=>{
 assert.equal(totalSeconds([{seconds:60},{seconds:90}]),150);
 assert.equal(parseClock('2:30'),150);assert.equal(parseClock('0:45'),45);assert.equal(parseClock('2.5'),150);assert.equal(parseClock('1'),60);
 for(const bad of ['','abc','0','0:00','-1','1:2:3'])assert.equal(parseClock(bad),undefined,bad);
 assert.equal(blankScene().seconds,60);assert.notEqual(blankScene().id,blankScene().id);
});

test('script words from the server land on the outline being edited by scene id, and nothing else of it changes',()=>{
 const edited:Outline={scenes:[{id:'a',title:'Typed title',talkingPoints:['x'],show:'',seconds:30,script:'old'},{id:'b',title:'B',talkingPoints:[],show:'',seconds:30},{id:'new',title:'Unsaved',talkingPoints:[],show:'',seconds:30}]};
 const server:Outline={scenes:[{id:'a',title:'A',talkingPoints:[],show:'',seconds:30},{id:'b',title:'B',talkingPoints:[],show:'',seconds:30,script:'b words'}],scriptState:'partial'};
 const result=withServerScripts(edited,server);
 assert.equal(result.scenes[0].title,'Typed title');assert.equal('script' in result.scenes[0],false,'a scene the server says has no script loses it');
 assert.equal(result.scenes[1].script,'b words');assert.equal(result.scenes[2].script,undefined);
 assert.equal(result.scriptState,'partial');assert.equal(result.fullScript,undefined);
 const full=withServerScripts(result,{...server,scriptState:'full',fullScript:'# T'});
 assert.equal(full.fullScript,'# T');
 assert.equal('scriptState' in withServerScripts(full,{scenes:server.scenes}),false);
});

test('an edited description stays through a package run',()=>{
 const earlier:Package={...EMPTY_PACKAGE,description:'My description'};
 assert.equal(mergePackage(earlier,written).description,'My description');
 assert.equal('description' in mergePackage({...EMPTY_PACKAGE},written),false);
});

test('the package diff is only what changed, the hook field by field, and the whole package when the server has none',()=>{
 const server:Package={demand:{level:'high',note:'n'},angle:'a',twist:'t',titles:['1','2','3'],thumbnailText:'T',hook:{visual:'v',spoken:'s',text:'x'}};
 assert.deepEqual(packageDiff(server,{...server}),{});
 assert.deepEqual(packageDiff(server,{...server,angle:'new'}),{angle:'new'});
 assert.deepEqual(packageDiff(server,{...server,hook:{...server.hook,spoken:'edited'}}),{hook:{spoken:'edited'}});
 assert.deepEqual(packageDiff(server,{...server,titles:['1','two','3']}),{titles:['1','two','3']});
 assert.equal(packageDiff(null,server),server);
});
