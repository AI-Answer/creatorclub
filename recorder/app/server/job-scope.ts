import {AsyncLocalStorage} from 'node:async_hooks';
import type {ChildProcess} from 'node:child_process';
export type JobScope={signal:AbortSignal;children:Set<ChildProcess>;work?:Set<Promise<unknown>>};
const context=new AsyncLocalStorage<JobScope>();
export const currentJob=()=>context.getStore();
export const jobSignal=()=>currentJob()?.signal;
export function trackChild<T extends ChildProcess>(child:T){const scope=currentJob();if(!scope)return child;scope.children.add(child);const stop=()=>child.kill('SIGKILL');scope.signal.addEventListener('abort',stop,{once:true});if(scope.signal.aborted)stop();child.once('close',()=>{scope.children.delete(child);scope.signal.removeEventListener('abort',stop);});return child;}
/** Explicit signals only: undefined never inherits a request's cancellation. Zero disables the deadline. */
export async function jobStep<T>(work:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal,timeoutMs=180000,cancelGraceMs=10000):Promise<T>{
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=timeoutMs>0?setTimeout(()=>controller.abort(Error('Job step timed out.')),timeoutMs):undefined;timer?.unref();
 const parent=currentJob(),scope:JobScope={signal:controller.signal,children:parent?.children??new Set<ChildProcess>(),work:parent?(parent.work??=new Set()):new Set()};
 let grace:ReturnType<typeof setTimeout>|undefined;
 try{controller.signal.throwIfAborted();return await context.run(scope,()=>new Promise<T>((resolve,reject)=>{
  // Abort kills children immediately, but callers wait for cleanup before releasing ownership.
  // The bounded rejection does not remove the underlying work from the scope's drain.
  const stop=()=>{grace=setTimeout(()=>reject(controller.signal.reason),cancelGraceMs);grace.unref();};
  controller.signal.addEventListener('abort',stop,{once:true});
  const pending=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return work(controller.signal);});scope.work!.add(pending);
  void pending.then(value=>controller.signal.aborted?reject(controller.signal.reason):resolve(value),reject).finally(()=>{scope.work!.delete(pending);controller.signal.removeEventListener('abort',stop);if(grace)clearTimeout(grace);}).catch(()=>{});
 }));}
 finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);if(!controller.signal.aborted)controller.abort(Error('Job step finished.'));}
}
export const inJob=<T>(scope:JobScope,work:()=>Promise<T>)=>{scope.work??=new Set();return context.run(scope,work);};
/** A timed-out step may still be unwinding. Queue ownership lasts until its actual work settles. */
export async function waitForJobWork(scope:JobScope){while(scope.work?.size)await Promise.allSettled([...scope.work]);}

export const outsideJob=<T>(work:()=>T)=>context.exit(work);
