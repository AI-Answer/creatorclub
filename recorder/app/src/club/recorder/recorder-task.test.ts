import test from 'node:test';
import assert from 'node:assert/strict';
import {RecorderTasks} from './recorder-task';
test('StrictMode cleanup and resubscription share a single in-flight plan',async()=>{
 const tasks=new RecorderTasks();let calls=0,resolve!:(value:string)=>void;const work=async(active:()=>boolean)=>{calls++;await new Promise<string>(yes=>resolve=yes);return active();};
 const first=tasks.acquire('project',work);first.release();const second=tasks.acquire('project',work);await Promise.resolve();assert.equal(calls,1);resolve('done');assert.equal(await second.promise,true);second.release();
});
test('a project abandoned before dispatch does not start its plan and another project is independent',async()=>{
 const tasks=new RecorderTasks();const first=tasks.acquire('old',async active=>active());first.release();const second=tasks.acquire('new',async active=>active());assert.equal(await first.promise,false);assert.equal(await second.promise,true);second.release();
});
