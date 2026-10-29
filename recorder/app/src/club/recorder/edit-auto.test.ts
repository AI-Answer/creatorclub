import test from 'node:test';
import assert from 'node:assert/strict';
import type {AutomationJob} from '../../../shared/automation';
import {createProject,defaultEffects,defaultTransform,projectDuration,type Clip} from '../../../shared/types';
import {UNKNOWN_PLAN,clipsFingerprint,cutReview,fillerRanges,gapRanges,pauseRanges,planIsStale,rangesSeconds,withoutRanges} from './edit-auto';

const job=(changes:Array<{id:string;category:'silence'|'repeat';start:number;end:number}>):AutomationJob=>({id:'j',projectId:'p',kind:'auto-cut',status:'ready',progress:1,message:'',createdAt:'',updatedAt:'',automatic:false,applied:false,undone:false,
 proposal:{summary:'',warnings:[],baseRevision:'r',beforeDuration:0,afterDuration:0,changes:changes.map(c=>({...c,label:c.id,reason:'',selected:true}))}});
const clip=(id:string,start:number,length:number):Clip=>({id,mediaId:'m',name:id,track:'audio',start,sourceIn:0,sourceOut:length,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()});
const plan=job([{id:'a',category:'silence',start:2.16,end:2.74},{id:'b',category:'silence',start:10.16,end:12.84},{id:'r',category:'repeat',start:20,end:21}]);

test('pauses: the level sets the shortest gap removed and padding sets the breath kept on each side',()=>{
 assert.deepEqual(pauseRanges(plan,'tight',.16).map(r=>r.map(n=>+n.toFixed(2))),[[2.16,2.74],[10.16,12.84]]);
 assert.deepEqual(pauseRanges(plan,'balanced',.16).map(r=>r.map(n=>+n.toFixed(2))),[[10.16,12.84]],'a 1 s gap is the minimum at Balanced');
 assert.deepEqual(pauseRanges(plan,'gentle',.5).map(r=>r.map(n=>+n.toFixed(2))),[[10.5,12.5]]);
 assert.equal(pauseRanges(plan,'tight',.4).length,1,'a short gap with too little left after padding is skipped');
 assert.deepEqual(pauseRanges(undefined,'tight',.16),[]);
});

test('filler words come from word timings, repeats from the plan',()=>{
 const p=createProject();p.captions=[{id:'c',start:0,end:3,text:'Um so uh yes',words:[{text:'Um',start:0,end:.3},{text:'so',start:.3,end:.6},{text:'uh,',start:.6,end:.9},{text:'yes',start:1,end:1.4}]}];
 assert.deepEqual(fillerRanges(p,plan),[[0,.3],[.6,.9],[20,21]]);
});

test('gaps are the empty stretches between clips; removing ranges closes them on every track',()=>{
 const p=createProject();p.media=[{id:'m',name:'m',path:'/m.wav',kind:'audio',duration:100,width:0,height:0}];p.scenes=[];p.clips=[clip('a',0,5),clip('b',8,5),clip('c',20,5)];
 const gaps=gapRanges(p);assert.deepEqual(gaps,[[5,8],[13,20]]);assert.equal(rangesSeconds(gaps),10);
 const after=withoutRanges(p,gaps);assert.deepEqual(after.clips.map(c=>c.start),[0,5,10]);assert.equal(projectDuration(after),15);assert.deepEqual(p.clips.map(c=>c.start),[0,8,20],'the original is untouched');
 const review=cutReview(p,gaps,'Gap');assert.deepEqual(review.joins.map(j=>[j.originalStart,j.editedTime]),[[5,5],[13,10]]);assert.equal(review.before,p);
});

test('a plan is out of date only when the clips moved since it was made',()=>{
 const p=createProject();p.media=[{id:'m',name:'m',path:'/m.wav',kind:'audio',duration:100,width:0,height:0}];p.clips=[clip('a',0,5),clip('b',8,5)];
 const base=clipsFingerprint(p.clips);
 assert.equal(planIsStale(undefined,p),false,'not known yet');assert.equal(planIsStale(base,p),false);
 const saved={...p,updatedAt:'2030-01-01T00:00:00.000Z',captions:[{id:'c',start:0,end:1,text:'new captions'}],clips:p.clips.map(c=>({...c,effects:{...c.effects,normalize:true}}))};
 assert.equal(planIsStale(base,saved),false,'a transcription save, Normalize or an autosave stamp');
 assert.equal(planIsStale(base,{...p,clips:p.clips.map(c=>c.id==='b'?{...c,start:9}:c)}),true,'a moved clip');
 assert.equal(planIsStale(base,{...p,clips:[p.clips[0]]}),true,'a deleted clip');
 assert.deepEqual(pauseRanges(plan,'tight',.16,true),[]);assert.deepEqual(fillerRanges(p,plan,true),[]);
});

test('a plan whose timeline cannot be read is never applied: it counts as out of date',async()=>{
 const {planBase}=await import('./EditAutoSheet');const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new TypeError('offline');};
 try{const base=await planBase({...plan,id:'unreadable'});assert.equal(base,UNKNOWN_PLAN);const p=createProject();assert.equal(planIsStale(base,p),true);}
 finally{globalThis.fetch=original;}
});
