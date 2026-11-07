import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,StrictMode} from 'react';
import {projectRevision} from '../../api';
import {createProject,defaultTransform,defaultEffects,type Project} from '../../../shared/types';
const {ClubExport}=await import('./ClubExport');
const {EditSuggestion}=await import('./EditSuggestion');
const projectWithClips=()=>{const project=createProject();project.clips=[{id:'clip',name:'Clip',mediaId:'media',track:'screen',start:0,sourceIn:0,sourceOut:2,speed:1,gain:1,muted:false,transform:defaultTransform(),effects:defaultEffects()}];return project;};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
test('two export clicks before a render share one flush and one server start',async()=>{
 const original=globalThis.fetch,project=projectWithClips();let resolve!:(p:Project)=>void,flushes=0,starts=0;
 globalThis.fetch=async input=>{if(String(input).startsWith('/api/exports?'))return Response.json({jobs:[]});starts++;return Response.json({id:'export',status:'complete',output:{status:'available'},options:{format:'mp4'},projectRevision:'older',startedAt:'2026-01-01'});};
 const ui=await mountUI(createElement(ClubExport,{project,flush:()=>{flushes++;return new Promise<Project>(yes=>resolve=yes);}}));
 try{await act(async()=>{const target=button(ui.container,'Export');target.dispatchEvent(new MouseEvent('click',{bubbles:true}));target.dispatchEvent(new MouseEvent('click',{bubbles:true}));});assert.equal(flushes,1);await act(async()=>{resolve(project);await new Promise(yes=>setTimeout(yes,5));});assert.equal(starts,1);}finally{await ui.close();globalThis.fetch=original;}
});
test('a failed export started here shows its terminal state and a successful retry clears it',async()=>{
 const original=globalThis.fetch,project=projectWithClips();let starts=0;globalThis.fetch=async input=>String(input).startsWith('/api/exports?')?Response.json({jobs:[]}):Response.json(++starts===1?{id:'failed',status:'failed',options:{format:'mp4'},output:{status:'missing'},startedAt:'2026-01-01'}:{id:'retry',status:'complete',options:{format:'mp4'},output:{status:'available'},projectRevision:'older',startedAt:'2026-01-02'});
 const ui=await mountUI(createElement(ClubExport,{project,flush:async()=>project}));try{await act(async()=>button(ui.container,'Export').click());await flush();assert.ok(ui.container.querySelector('[role=alert]'));await act(async()=>button(ui.container,'Try again').click());await flush();assert.equal(ui.container.querySelector('[role=alert]'),null);assert.ok(button(ui.container,'Export'));}finally{await ui.close();globalThis.fetch=original;}
});
test('mount falls back to the latest available completed video despite newer cancelled, failed or missing exports',async()=>{
 const original=globalThis.fetch,project=projectWithClips(),revision=await projectRevision(project),exported:boolean[]=[];
 const jobs=[{id:'valid',status:'complete',options:{format:'mp4'},output:{status:'available'},outputPath:'/valid.mp4',projectRevision:revision,startedAt:'2026-01-01',completedAt:'2026-01-01'},...['cancelled','failed','complete'].map((status,i)=>({id:`new-${i}`,status,options:{format:'mp4'},output:{status:'missing'},startedAt:`2026-01-0${i+2}`}))];
 globalThis.fetch=async()=>Response.json({jobs});const ui=await mountUI(createElement(ClubExport,{project,flush:async()=>project,onExported:value=>exported.push(value)}));
 try{await flush();assert.equal(ui.container.querySelector('[role=alert]'),null);assert.match(ui.container.textContent??'',/Video exported/);assert.equal(exported.at(-1),true);}finally{await ui.close();globalThis.fetch=original;}
});
test('cancelling an export in this view returns to Export without a failure alert',async()=>{
 const original=globalThis.fetch,project=projectWithClips();globalThis.fetch=async(_input,options)=>Response.json(options?.method==='DELETE'?{id:'running',status:'cancelled',options:{format:'mp4'},output:{status:'missing'},projectId:project.id,startedAt:'2026-01-01',revision:2}:{jobs:[{id:'running',status:'running',options:{format:'mp4'},output:{status:'missing'},projectId:project.id,progress:.1,startedAt:'2026-01-01',revision:1}]});
 const ui=await mountUI(createElement(ClubExport,{project,flush:async()=>project}));try{await act(async()=>button(ui.container,'Cancel').click());await flush();assert.equal(ui.container.querySelector('[role=alert]'),null);assert.ok(button(ui.container,'Export'));}finally{await ui.close();globalThis.fetch=original;}
});
test('StrictMode initial cut planning creates one server job and publishes only to the live subscriber',async()=>{
 const original=globalThis.fetch,project=projectWithClips();let starts=0,merged=0;
 globalThis.fetch=async input=>{if(String(input).endsWith('/automation'))return Response.json({jobs:[]});starts++;return Response.json({id:'plan',kind:'auto-cut',status:'queued'});};
 const ui=await mountUI(createElement(StrictMode,null,createElement(EditSuggestion,{project,jobs:[],merge:()=>{merged++;},reload:async()=>{},flush:async()=>project,refresh:async()=>{},onReview:()=>{}})));
 try{await flush();assert.equal(starts,1);assert.equal(merged,1);}finally{await ui.close();globalThis.fetch=original;}
});

test('cancelling a new export restores the earlier completed export of the same edit',async()=>{
 const original=globalThis.fetch,project=projectWithClips(),revision=await projectRevision(project),exported:boolean[]=[];
 const done={id:'done',status:'complete',options:{format:'mp4'},output:{status:'available'},outputPath:'/done.mp4',projectId:project.id,projectRevision:revision,startedAt:'2026-01-01',completedAt:'2026-01-01'},running={...done,id:'new',status:'running',output:{status:'missing'},startedAt:'2026-01-02',progress:0,revision:1};
 globalThis.fetch=async(input,options)=>String(input).startsWith('/api/exports?')?Response.json({jobs:[done]}):options?.method==='DELETE'?Response.json({...running,status:'cancelled',revision:2}):Response.json(running);
 const ui=await mountUI(createElement(ClubExport,{project,flush:async()=>project,onExported:value=>exported.push(value)}));try{await flush();assert.equal(exported.at(-1),true);await act(async()=>button(ui.container,'Export').click());await flush();assert.ok(button(ui.container,'Cancel'));await act(async()=>button(ui.container,'Cancel').click());await flush();assert.equal(exported.at(-1),true);assert.match(ui.container.textContent??'',/Video exported/);}finally{await ui.close();globalThis.fetch=original;}
});
