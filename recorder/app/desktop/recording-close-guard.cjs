const {RECORDING_STATUSES}=require('./recording-state.cjs');
function createRecordingCloseGuard({ask,stop,timeoutMs=60_000}){
 let status='idle',pending=null,savingAt=null,discarded=false,expired=false;const waiters=new Set();
 const active=()=>!discarded&&!['idle','ready'].includes(status);
 function update(next){if(!RECORDING_STATUSES.includes(next))return;if(next==='saving'&&status!=='saving')savingAt=Date.now();if(next!=='saving')savingAt=null;status=next;if(!active()){expired=false;for(const done of [...waiters])done();}}
 // Finishing the save dismisses an open question and continues quitting automatically.
 async function question(timedOut){const controller=new AbortController();let done;const finished=new Promise(resolve=>{done=()=>{resolve(true);controller.abort();};waiters.add(done);});try{return await Promise.race([Promise.resolve().then(()=>ask({status,timedOut},controller.signal)),finished]);}finally{waiters.delete(done);}}
 function attempt(){if(pending)return pending;if(!active())return Promise.resolve(true);pending=(async()=>{
  const timedOut=expired||savingAt!==null&&Date.now()-savingAt>=timeoutMs,wasSaving=status==='saving';
  const choice=await question(timedOut);if(!active())return true;if(choice==='discard'){discarded=true;return true;}if(!choice&&!wasSaving)return false;
  let delay=Math.max(0,timeoutMs-(savingAt===null?0:Date.now()-savingAt)),requested=false;
  while(active()){const complete=await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);waiters.delete(done);resolve(true);};waiters.add(done);timer=setTimeout(()=>{waiters.delete(done);resolve(false);},delay);if(!wasSaving&&!requested){requested=true;stop();}if(!active())done();});
  if(complete||!active())return true;
  expired=true;const later=await question(true);if(!active())return true;if(later==='discard'){discarded=true;return true;}delay=timeoutMs;
  }return true;
 })().finally(()=>{pending=null;});return pending;}
 return {update,active,attempt};
}
module.exports={createRecordingCloseGuard};
