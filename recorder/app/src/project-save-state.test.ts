import test from 'node:test';import assert from 'node:assert/strict';
import {createProject} from '../shared/types';
import {saveTransition,saveLabel,keepProjectRecovery,readProjectRecovery,clearProjectRecovery,type SavePhase} from './project-save-state';
test('save lifecycle has one conflict state and retry transitions',()=>{
 let phase:SavePhase='clean';for(const event of ['edit','save','fail','retry','save','saved'] as const)phase=saveTransition(phase,event);assert.equal(phase,'clean');
 phase=saveTransition(phase,'conflict');for(const event of ['edit','save','fail','saved','retry'] as const){phase=saveTransition(phase,event);assert.equal(phase,'conflicted');assert.match(saveLabel(phase),/Conflict/);}assert.equal(saveTransition(phase,'reset'),'clean');
});
test('recovery journal is independently recoverable until acknowledged',()=>{
 const original=globalThis.localStorage,values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
 try{const p=createProject('Unsaved');p.notes='not on server';assert.ok(keepProjectRecovery(p,'"base"'));assert.deepEqual(readProjectRecovery(p.id)?.project,p);clearProjectRecovery(p.id);assert.equal(readProjectRecovery(p.id),undefined);}
 finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:original});}
});

test('journals retain the base revision, isolate windows, expire after seven days and bound entries',()=>{
 const original=globalThis.localStorage,values=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
 try{const p=createProject('Recovery');keepProjectRecovery(p,'base','window-a');assert.equal(readProjectRecovery(p.id,'window-b'),undefined);assert.equal(readProjectRecovery(p.id,'window-a')?.baseRevision,'base');
  for(const [key,value] of values){const entry=JSON.parse(value);entry.writtenAt=Date.now()-8*24*60*60*1000;values.set(key,JSON.stringify(entry));}assert.equal(readProjectRecovery(p.id,'window-a'),undefined);
  keepProjectRecovery(p,'base','window-a');for(let i=0;i<8;i++)keepProjectRecovery(createProject(`Copy ${i}`),'base','window-a');assert.equal(values.size,4);
  const storage=globalThis.localStorage;storage.setItem=()=>{throw Error('quota');};assert.equal(keepProjectRecovery(p,'base','window-a'),false);
 }finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:original});}
});

test('a live owner is ignored, heartbeats renew ownership, and a stale or closed owner can be claimed by a new window',async()=>{
 const {heartbeatProjectRecovery,releaseProjectRecovery}=await import('./project-save-state'),original=globalThis.localStorage,now=Date.now;const values=new Map<string,string>();let clock=1_000_000;Date.now=()=>clock;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 try{const p=createProject('Crash recovery');assert.ok(keepProjectRecovery(p,'base','old'));assert.equal(readProjectRecovery(p.id,'new'),undefined);clock+=110_000;heartbeatProjectRecovery('old');clock+=110_000;assert.equal(readProjectRecovery(p.id,'new'),undefined);clock+=11_000;const recovered=readProjectRecovery(p.id,'new');assert.equal(recovered?.project.name,p.name);assert.equal(recovered?.instanceId,'new');assert.equal(readProjectRecovery(p.id,'third'),undefined);releaseProjectRecovery('new');assert.equal(readProjectRecovery(p.id,'third')?.baseRevision,'base');clearProjectRecovery(p.id,'third');assert.equal(values.size,0);}finally{Date.now=now;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:original});}
});
