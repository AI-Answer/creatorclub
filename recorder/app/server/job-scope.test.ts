import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {jobStep,trackChild,inJob,waitForJobWork,type JobScope} from './job-scope.js';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('a hung step times out and the next step runs',async()=>{const keepAlive=setInterval(()=>{},1000);try{await assert.rejects(jobStep(()=>new Promise(()=>{}),undefined,15,15),/timed out/);assert.equal(await jobStep(async()=>42,undefined,100),42);}finally{clearInterval(keepAlive);}});
test('cancel kills every child in the job and rejects a hung step',async()=>{
 const controller=new AbortController(),children=new Set<ReturnType<typeof spawn>>(),spawned:ReturnType<typeof spawn>[]=[];
 const work=inJob({signal:controller.signal,children},()=>jobStep(async()=>{for(let i=0;i<2;i++)spawned.push(trackChild(spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})));await Promise.all(spawned.map(child=>new Promise<void>(resolve=>child.once('close',()=>resolve()))));},controller.signal,0,15));
 while(spawned.length<2)await delay(2);assert.equal(children.size,2);const closed=Promise.all(spawned.map(child=>new Promise(resolve=>child.once('close',resolve))));controller.abort(Error('test cancellation'));await assert.rejects(work,/test cancellation/);await closed;assert.equal(children.size,0);
});
test('an already aborted step starts no work',async()=>{const controller=new AbortController();controller.abort(Error('already cancelled'));let starts=0;await assert.rejects(jobStep(async()=>++starts,controller.signal),/already cancelled/);assert.equal(starts,0);});

test('an undefined signal never inherits the request and outsideJob removes its context',async()=>{const {outsideJob,currentJob}=await import('./job-scope.js');const controller=new AbortController();controller.abort(Error('request finished'));await inJob({signal:controller.signal,children:new Set()},async()=>{assert.equal(await jobStep(async()=>42,undefined,100),42);outsideJob(()=>assert.equal(currentJob(),undefined));});});

test('abort waits for cleanup to settle, including a late successful result',async()=>{
 const controller=new AbortController();let release!:()=>void,finished=false;
 const work=jobStep(async()=>{await new Promise<void>(resolve=>release=resolve);finished=true;return 42;},controller.signal,0);
 await Promise.resolve();controller.abort(Error('cancelled'));let settled=false;const result=assert.rejects(work,/cancelled/).then(()=>{settled=true;});await delay(20);assert.equal(settled,false);assert.equal(finished,false);release();await result;assert.equal(finished,true);
});
test('bounded abort retains the actual work in its owning scope until it settles',async()=>{
 const controller=new AbortController(),scope:JobScope={signal:controller.signal,children:new Set()};let release!:()=>void;
 const pending=inJob(scope,()=>jobStep(()=>new Promise<void>(resolve=>release=resolve),controller.signal,0,10));await Promise.resolve();controller.abort(Error('cancelled'));const keepAlive=setInterval(()=>{},1000);
 try{await assert.rejects(pending,/cancelled/);assert.equal(scope.work?.size,1);let drained=false;const drain=waitForJobWork(scope).then(()=>{drained=true;});await delay(15);assert.equal(drained,false);release();await drain;assert.equal(scope.work?.size,0);}finally{clearInterval(keepAlive);}
});
