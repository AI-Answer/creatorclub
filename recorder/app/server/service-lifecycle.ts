const requests=new Set<Promise<unknown>>();
/** Keep handlers tracked after a client disconnects; their writes may still be settling. */
export function trackRequest<T>(work:()=>Promise<T>|T):Promise<T>{
 const pending=Promise.resolve().then(work);requests.add(pending);void pending.finally(()=>requests.delete(pending)).catch(()=>{});return pending;
}
export const inFlightRequests=()=>requests.size;
export async function waitForRequests(timeoutMs=30000){
 let timer:ReturnType<typeof setTimeout>|undefined;
 const drain=async()=>{while(requests.size)await Promise.allSettled([...requests]);return true;};
 try{return await Promise.race([drain(),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);}finally{if(timer)clearTimeout(timer);}
}
/** An uncaught exception cannot leave the service alive with orphaned promises or locks. */
export function fatalException(error:unknown,shutdown:()=>Promise<unknown>,exit:(code:number)=>unknown=process.exit,timeoutMs=5000){
 console.error('Uncaught server exception',error);const deadline=setTimeout(()=>exit(1),timeoutMs);
 void Promise.resolve().then(shutdown).catch(error=>console.error('Fatal shutdown failed',error)).finally(()=>{clearTimeout(deadline);exit(1);});
}
