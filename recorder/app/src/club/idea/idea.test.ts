import test from 'node:test';
import assert from 'node:assert/strict';
import type {Outline,Package,ResearchTile,Video} from '../../../shared/club';
import {choosePair,pairThumbs,thumbProblems,titleProblems,withThumb} from '../../../shared/package-rules';
import {mergePackage} from '../../../shared/package-merge';
import {cardText,emptyParts,pairChecks,proofCards,proofLine,sectionStatus,SECTIONS} from './idea-logic';

/*
 * The Idea page shows only the video's own data: the proof comes from the board's cards and their numbers, the checks are the rules
 * Claude is held to, and each title has its own thumbnail text.
 */

const tile=(id:string,multiplier?:number,kind:ResearchTile['kind']='video'):ResearchTile=>({id,kind,title:id,meta:multiplier===undefined?{}:{multiplier},createdAt:''});
const video:Video={id:'v1',title:'Seven hidden tricks',stage:'planning',order:0,createdAt:'',updatedAt:'',stageDates:{},planning:{research:false,package:false,outline:false}};
const pkg:Package={angle:'Show the tricks',twist:'',titles:['Claude Code features you missed','Seven hidden tricks',''],thumbnailText:'HIDDEN',hook:{visual:'',spoken:'',text:''}};

test('the proof is the board\'s own videos that have a ×-number, the highest first, and the line says what they show', ()=>{
 const cards=proofCards([tile('a',1.4),tile('note',undefined,'note'),tile('b',5.2),tile('c'),tile('d',3)]);
 assert.deepEqual(cards.map(card=>card.id),['b','d','a'],'a video without a number and a note are not proof');
 assert.deepEqual(proofLine(cards),{proven:true,text:"2 videos on your board got 3× or more their channel's usual views."});
 assert.deepEqual(proofLine([tile('a',1.4)]),{proven:false,text:"No video on your board got 3× its channel's usual views yet. The best got 1.4×."});
 assert.equal(proofLine([]).text,'No similar video on the board yet.');
});

test('a pair is checked against the rules Claude is held to, and says which one it breaks', ()=>{
 assert.deepEqual(pairChecks('Seven hidden tricks','HIDDEN TRICKS'),[{ok:true,text:'Follows the title and thumbnail rules.'}]);
 assert.deepEqual(pairChecks('Is this the best Claude Code feature?','WOW').map(check=>check.text),['The title is a question.','The thumbnail text has 1 word, and it needs 2 to 5.']);
 assert.deepEqual(pairChecks('A title','').map(check=>check.text),['No thumbnail text yet.']);
 assert.deepEqual(pairChecks('',''),[],'nothing to check before there is a title');
 assert.deepEqual(titleProblems('One two three four five six seven eight'),['has 8 words, and 7 is the most']);
 assert.deepEqual(thumbProblems('ONE COMMAND'),[]);
});

test('each title has its own thumbnail text; the package\'s thumbnail text is always the pair in use', ()=>{
 assert.deepEqual(pairThumbs(pkg,video.title),['','HIDDEN',''],'a package saved with one text keeps it on the pair in use');
 assert.deepEqual(pairThumbs(pkg,'Not one of them'),['HIDDEN','',''],'or on the first, when none is in use');
 const edited=withThumb(pkg,0,'YOU MISSED THESE',video.title);
 assert.deepEqual(edited.thumbs,['YOU MISSED THESE','HIDDEN','']);
 assert.equal(edited.thumbnailText,'HIDDEN','another pair\'s words leave the one in use alone');
 const used=choosePair(edited,'Claude Code features you missed',video.title);
 assert.equal(used.thumbnailText,'YOU MISSED THESE','using a pair brings its words');
 const merged=mergePackage({...pkg,thumbs:['A B','',''] as Package['thumbs']},{...pkg,thumbs:['X Y','C D','E F'] as Package['thumbs']});
 assert.deepEqual(merged.thumbs,['A B','C D','E F'],'a run fills only the empty pairs');
 assert.deepEqual(mergePackage({...pkg,thumbs:['A B','',''] as Package['thumbs']},{...pkg,thumbs:['X Y','C D','E F'] as Package['thumbs']},'thumbnail').thumbs,['X Y','C D','E F'],'writing them again replaces them');
});

test('each part says one line while closed, and the first part that is not there yet opens first', ()=>{
 const outline:Outline={scenes:[{title:'Opening',talkingPoints:[],show:'',seconds:60},{title:'Level 1',talkingPoints:[],show:'',seconds:90}]};
 const empty=Object.fromEntries(SECTIONS.map(key=>[key,sectionStatus(key,{video,pkg:null,outline:null})])) as Record<typeof SECTIONS[number],ReturnType<typeof sectionStatus>>;
 assert.deepEqual(Object.values(empty).map(status=>status.done),[false,false,false,false]);
 assert.deepEqual(sectionStatus('package',{video:{...video,title:'Mine'},pkg,outline:null}),{done:false,summary:'Pick one of your titles.'});
 assert.deepEqual(sectionStatus('package',{video,pkg,outline:null}),{done:true,summary:'Seven hidden tricks'});
 assert.deepEqual(sectionStatus('scenes',{video:{...video,targetSeconds:600},pkg,outline}),{done:true,summary:'2 scenes · 2:30 of 10:00'});
});

test('Fill writes what is still empty: the package while any part of it is, the scenes while there are none; a card dragged onto a scene adds its words', ()=>{
 assert.deepEqual(emptyParts(null,null),{package:true,scenes:true});
 const full:Package={...pkg,titles:['A one','B two','C three'],thumbs:['ONE TWO','',''],hook:{visual:'v',spoken:'s',text:'t'}};
 assert.deepEqual(emptyParts(full,{scenes:[{title:'x',talkingPoints:[],show:'',seconds:60}]}),{package:false,scenes:false});
 assert.equal(emptyParts({...full,hook:{...full.hook,spoken:''}},null).package,true,'a missing hook line is still empty');
 assert.equal(cardText({id:'n',kind:'note',text:'# My take\n\nMore below',meta:{},createdAt:''}),'My take','a note adds its first line');
 assert.equal(cardText({id:'v',kind:'video',title:'A real video',url:'https://youtu.be/x',meta:{},createdAt:''}),'A real video');
});

test('while a board video is still being read, the proof says so instead of asking for a video; one with no number says why', ()=>{
 const reading:ResearchTile={id:'r',kind:'video',url:'https://www.youtube.com/watch?v=abc',meta:{},createdAt:''};
 assert.deepEqual(proofLine([reading]),{proven:false,text:'Reading 1 reference video…'});
 const read:ResearchTile={...reading,title:'A video',meta:{views:1200}};
 assert.equal(proofLine([read]).text,"The video on your board has no number: its channel's usual views aren't known.");
 assert.equal(proofLine([read,tile('b',4)]).proven,true);
});

test('rewriting the titles rewrites whole pairs, so no new title keeps another title\'s words', ()=>{
 const earlier={...pkg,thumbs:['OLD ONE','OLD TWO',''] as Package['thumbs']};
 const written={...pkg,titles:['New one','New two','New three'] as Package['titles'],thumbs:['NEW ONE','NEW TWO','NEW THREE'] as Package['thumbs']};
 const merged=mergePackage(earlier,written,'titles');
 assert.deepEqual([merged.titles,merged.thumbs],[written.titles,written.thumbs]);
});
