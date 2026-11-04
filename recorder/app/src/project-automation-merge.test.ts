import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,defaultEffects,defaultTransform,type Project} from '../shared/types';
import {isCaptionOnlyUpdate,mergeCaptionUpdate} from './project-automation-merge';

function project():Project{
 const p=createProject('Caption merge');
 p.media=[{id:'mic',name:'Mic',path:'/tmp/mic.wav',kind:'audio',duration:10,width:0,height:0,hasAudio:true}];
 p.clips=[{id:'audio',mediaId:'mic',name:'Mic',track:'audio',start:0,sourceIn:0,sourceOut:10,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];
 p.captions=[{id:'old',start:1,end:3,text:'original',words:[{text:'original',start:1,end:3}]}];
 return p;
}

test('only caption and timestamp changes are eligible for automatic rebase',()=>{
 const before=project(),fresh=structuredClone(before);fresh.updatedAt='later';fresh.captions=[];
 assert.equal(isCaptionOnlyUpdate(before,fresh),true);
 fresh.canvas.padding++;
 assert.equal(isCaptionOnlyUpdate(before,fresh),false,'a real external edit cannot be mistaken for caption enrichment');
});

test('local text edits and deliberate caption deletion win over incoming generation',()=>{
 const before=project(),fresh=structuredClone(before),local=structuredClone(before);
 fresh.captions=[{id:'new',start:1,end:5,text:'generated added',words:[{text:'generated',start:1,end:3},{text:'added',start:4,end:5}]}];
 local.captions[0].text='my correction';local.captions[0].words![0].text='my correction';
 const merged=mergeCaptionUpdate(before,fresh,local);
 assert.deepEqual(merged.captions.map(c=>c.text),['my correction','added']);
 local.captions=[];
 assert.deepEqual(mergeCaptionUpdate(before,fresh,local).captions.map(c=>c.text),['added'],'automatic generation does not restore deliberately deleted words');
});

test('incoming captions map to moved and speed-trimmed source ranges, and never revive deleted source',()=>{
 const before=project();before.captions=[];
 const fresh=structuredClone(before);fresh.captions=[{id:'generated',start:1,end:9,text:'cut kept tail',words:[{text:'cut',start:1,end:2},{text:'kept',start:4,end:5},{text:'tail',start:8,end:9}]}];
 const local=structuredClone(before);Object.assign(local.clips[0],{start:20,sourceIn:3,sourceOut:7,speed:2});
 const merged=mergeCaptionUpdate(before,fresh,local);
 assert.deepEqual(merged.captions.flatMap(c=>c.words??[]).map(w=>[w.text,w.start,w.end]),[['kept',20.5,21]]);
 assert.deepEqual(merged.clips,local.clips);
 local.clips=[];assert.deepEqual(mergeCaptionUpdate(before,fresh,local).captions,[]);
});

test('locally split caption IDs do not count as text edits when source timing and words match',()=>{
 const before=project(),fresh=structuredClone(before),local=structuredClone(before);
 local.captions[0].id='split-generated-id';
 fresh.captions[0].text='corrected';fresh.captions[0].words![0].text='corrected';
 assert.equal(mergeCaptionUpdate(before,fresh,local).captions[0].text,'corrected');
});
