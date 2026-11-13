/**
 * Self-update from the repository's GitHub Releases (electron-updater, configured by electron-builder.cjs `publish`).
 * An installed copy checks when it starts and every half hour, downloads a newer build in the background, and installs
 * it the next time the app quits. "Restart to Update" in the app menu installs it at once, unless a recording or an
 * export would be cut off. Nothing here restarts the app on its own: the creator may be in the middle of an edit.
 */

const CHECK_EVERY_MS=30*60_000;

/**
 * Where updating stands, for the app menu.
 * @typedef {{state:'idle'}|{state:'checking'}|{state:'current',checkedAt:number}|{state:'downloading',next:string}|{state:'ready',next:string}|{state:'failed',reason:string,checkedAt:number}} UpdateState
 */

/**
 * @param {{
 *  source:{autoDownload:boolean,autoInstallOnAppQuit:boolean,allowPrerelease:boolean,checkForUpdates():Promise<unknown>,quitAndInstall(isSilent?:boolean,isForceRunAfter?:boolean):void,on(event:string,listener:(...args:any[])=>void):unknown},
 *  every(ms:number,fn:()=>void):()=>void,
 *  log(message:string):void,
 *  onState?(state:UpdateState):void,
 *  now?():number,
 * }} options
 */
function startUpdater({source,every,log,onState,now=Date.now}){
 source.autoDownload=true;
 source.autoInstallOnAppQuit=true;
 source.allowPrerelease=false;
 let current=/** @type {UpdateState} */({state:'idle'}),downloaded=null;
 const set=next=>{current=next;onState?.(next);};
 const failed=reason=>{log(`update check failed: ${reason}`);if(downloaded===null)set({state:'failed',reason,checkedAt:now()});};
 source.on('checking-for-update',()=>{if(downloaded===null)set({state:'checking'});});
 source.on('update-available',info=>{if(downloaded===null)set({state:'downloading',next:String(info?.version??'')});});
 source.on('update-not-available',()=>{if(downloaded===null)set({state:'current',checkedAt:now()});});
 source.on('update-downloaded',info=>{downloaded=String(info?.version??'');log(`update ${downloaded} downloaded; it installs when the app quits`);set({state:'ready',next:downloaded});});
 source.on('error',error=>failed(error instanceof Error?error.message:String(error)));
 const check=()=>{
  // A downloaded build waits for the next quit; asking again would only download it a second time.
  if(downloaded!==null||current.state==='checking'||current.state==='downloading')return;
  source.checkForUpdates().catch(error=>failed(error instanceof Error?error.message:String(error)));
 };
 check();
 const stop=every(CHECK_EVERY_MS,check);
 return {
  check,
  state:()=>current,
  /** Quits and installs the downloaded build, then reopens the app. False when nothing is downloaded yet. */
  install(){
   if(downloaded===null)return false;
   log(`restarting into ${downloaded}`);
   source.quitAndInstall(false,true);
   return true;
  },
  stop,
 };
}

/** The app menu's update item for a state: its label, whether it can be clicked, and what a click does. */
function updateMenuItem(state){
 switch(state.state){
  case 'ready':return {label:`Restart to Update (${state.next})`,enabled:true,action:'install'};
  case 'downloading':return {label:`Downloading Update ${state.next}…`,enabled:false,action:null};
  case 'checking':return {label:'Checking for Updates…',enabled:false,action:null};
  default:return {label:'Check for Updates…',enabled:true,action:'check'};
 }
}

module.exports={CHECK_EVERY_MS,startUpdater,updateMenuItem};
