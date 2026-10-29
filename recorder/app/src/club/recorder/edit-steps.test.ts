import test from 'node:test';
import assert from 'node:assert/strict';
import type {AutomationChange,AutomationJob} from '../../../shared/automation';
import type {ExportRecord} from '../../../shared/export-history';
import {cutSuggestion,exportFileName,formatCutDuration,latestVideoExport,removedSeconds} from './edit-steps';

const change=(start:number,end:number,category:AutomationChange['category']='silence',selected=true):AutomationChange=>({id:`${category}-${start}`,label:'Cut',reason:'Quiet',start,end,selected,category});
const job=(over:Partial<AutomationJob>):AutomationJob=>({id:'j1',projectId:'p1',kind:'auto-cut',status:'ready',progress:1,message:'',createdAt:'2026-10-29T10:00:00.000Z',updatedAt:'2026-10-29T10:00:00.000Z',automatic:false,applied:false,undone:false,...over});
const proposal=(changes:AutomationChange[])=>({summary:'',changes,warnings:[],baseRevision:'r',beforeDuration:600,afterDuration:400});

test('formatCutDuration reads like PLAN.md: 3m 12s, 45s, 2m',()=>{
 assert.equal(formatCutDuration(192),'3m 12s');
 assert.equal(formatCutDuration(191.6),'3m 12s');
 assert.equal(formatCutDuration(45.2),'45s');
 assert.equal(formatCutDuration(120),'2m');
 assert.equal(formatCutDuration(0),'0s');
 assert.equal(formatCutDuration(-3),'0s');
});

test('removedSeconds adds every proposed cut once, merging overlaps, including the ones not selected by default',()=>{
 assert.equal(removedSeconds({changes:[]}),0);
 assert.equal(removedSeconds({changes:[change(3,8)]}),5);
 assert.equal(removedSeconds({changes:[change(10,12),change(1,2),change(11,15,'repeat',false)]}),6,'1 + (10→15)');
 assert.equal(removedSeconds({changes:[change(1,4),change(2,3)]}),3,'a cut inside another counts once');
 assert.equal(removedSeconds({changes:[{...change(1,2),start:undefined}]}),0,'changes without a range are skipped');
});

test('cutSuggestion: the newest project-wide plan decides the card',()=>{
 assert.deepEqual(cutSuggestion([]),{state:'none'});
 assert.equal(cutSuggestion([job({status:'running'})]).state,'running');
 assert.equal(cutSuggestion([job({status:'queued'})]).state,'running');
 const ready=cutSuggestion([job({proposal:proposal([change(10,130),change(200,272,'repeat',false)])})]);
 assert.equal(ready.state,'ready');
 assert.equal(ready.state==='ready'&&ready.label,'Remove 3m 12s of pauses and repeats?');
 assert.equal(cutSuggestion([job({proposal:proposal([change(1,1.4)])})]).state,'done','under a second is not worth asking about');
 assert.equal(cutSuggestion([job({proposal:proposal([])})]).state,'done');
 assert.equal(cutSuggestion([job({status:'complete',applied:true,proposal:proposal([change(1,9)])})]).state,'done','applied: no card');
 assert.equal(cutSuggestion([job({status:'failed'})]).state,'done','a failed plan stays quiet');
 assert.deepEqual(cutSuggestion([job({sceneId:'s1',proposal:proposal([change(1,9)])}),job({id:'t',kind:'transcription',status:'running'})]),{state:'none'},'scene plans and transcriptions are not the suggestion');
 const newest=cutSuggestion([job({id:'old',createdAt:'2026-10-29T09:00:00.000Z',proposal:proposal([change(1,9)])}),job({id:'new',status:'running'})]);
 assert.equal(newest.state,'running');
});

const record=(over:Partial<ExportRecord>):ExportRecord=>({id:'e1',type:'export',status:'complete',progress:1,message:'',outputPath:'/x/exports/My video-e1.mp4',startedAt:'2026-10-29T10:00:00.000Z',completedAt:'2026-10-29T10:01:00.000Z',projectId:'p1',projectName:'My video',projectRevision:'r',snapshotCreatedAt:'',options:{format:'mp4'},updatedAt:'',revision:1,output:{status:'available'},recovery:{status:'available',runtimeChanged:false},...over});

test('latestVideoExport picks the newest finished MP4 whose file is still there',()=>{
 assert.equal(latestVideoExport([]),undefined);
 const picked=latestVideoExport([
  record({id:'old',completedAt:'2026-10-29T09:00:00.000Z'}),
  record({id:'new',completedAt:'2026-10-29T11:00:00.000Z'}),
  record({id:'running',status:'running',completedAt:undefined,startedAt:'2026-10-29T12:00:00.000Z'}),
  record({id:'gone',completedAt:'2026-10-29T12:00:00.000Z',output:{status:'missing'}}),
  record({id:'audio',completedAt:'2026-10-29T12:00:00.000Z',options:{format:'wav'}}),
 ]);
 assert.equal(picked?.id,'new');
 assert.equal(exportFileName(picked!),'My video-e1.mp4');
});
