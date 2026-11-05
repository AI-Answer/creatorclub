/** Poll only while visible; refresh once on return to catch changes made while away. */
export function visibleInterval(callback:()=>unknown,ms:number,immediate=false):()=>void{
 let timer:ReturnType<typeof setInterval>|undefined;
 const visible=()=>{
  clearInterval(timer);timer=undefined;
  if(document.hidden)return;
  callback();timer=setInterval(()=>{if(!document.hidden)callback();},ms);
 };
 if(!document.hidden){if(immediate)callback();timer=setInterval(()=>{if(!document.hidden)callback();},ms);}
 document.addEventListener('visibilitychange',visible);
 return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
}
