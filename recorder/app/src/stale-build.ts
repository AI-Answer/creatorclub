/*
 * A newer build replaced the app's code while this window was open (an update, or a rebuild in development): the code already running
 * asks for files that are gone, and a screen fails to load. The window then reloads once, onto the new build. It does not reload again
 * within a minute, so a real outage never turns into a reload loop.
 */
export const STALE_KEY='cc.reloadedForNewBuild';
const STALE=/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

export const isStaleBuild=(error:unknown)=>STALE.test(String((error as {message?:unknown})?.message??error));

export function reloadForNewBuild(now=Date.now(),storage:Pick<Storage,'getItem'|'setItem'>|undefined=globalThis.sessionStorage,reload=()=>globalThis.location.reload()):boolean{
 try{
  const last=Number(storage?.getItem(STALE_KEY)||0);
  if(now-last<60_000)return false;
  storage?.setItem(STALE_KEY,String(now));
 }catch{/* no storage: reload anyway, once per this call */}
 reload();
 return true;
}
