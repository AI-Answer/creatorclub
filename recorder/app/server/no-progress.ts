/** Activity extends the deadline; elapsed job time alone never ends useful work. */
export function noProgress(onTimeout:()=>void,timeoutMs=5*60000){
 let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const stop=()=>{closed=true;if(timer)clearTimeout(timer);};
 const pulse=()=>{if(closed)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{stop();onTimeout();},timeoutMs);timer.unref();};
 pulse();return {pulse,stop};
}
