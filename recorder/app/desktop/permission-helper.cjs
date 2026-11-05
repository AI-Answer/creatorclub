'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');

/** Use the outer app, never a nested Electron Helper.app. No guessed installed path. */
function resolveAppBundle(executable){
 if(typeof executable!=='string'||!path.isAbsolute(executable))throw new Error('The running app executable must have an absolute path.');
 const match=path.normalize(executable).match(/^(.*?\.app)(?:\/|$)/i);
 if(!match)throw new Error('The running executable is not inside a macOS app bundle.');
 return match[1];
}
function permissionHelperOptions(workArea,preload){
 const width=Math.min(360,workArea.width),height=172;
 return {width,height,x:Math.round(workArea.x+(workArea.width-width)/2),y:Math.round(workArea.y+workArea.height-height-28),
  frame:false,transparent:true,roundedCorners:true,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,
  alwaysOnTop:true,skipTaskbar:true,show:false,type:'panel',hasShadow:true,title:'Capture access',
  webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}};
}
/** Settings bounds and Electron screen bounds both use global top-left coordinates. */
function settingsHelperBounds(window,height=172){
 if(!window?.found||!['x','y','width','height'].every(key=>Number.isFinite(window[key]))||window.width<=0||window.height<=0)return null;
 const offset=Math.min(260,window.width*.32)+12;
 return {x:Math.round(window.x+offset),y:Math.round(window.y+window.height-height-14),width:Math.round(Math.max(300,Math.min(520,window.width-offset-24))),height};
}
function createPermissionHelper({app,BrowserWindow,ipcMain,screen,shell,nativeImage,getStatus,onGranted,relaunch,appName='Creator Compiler',helperPath=path.resolve(__dirname,'../server-dist/sceneforge-settings-window'),spawnProcess=spawn,setInterval:every=setInterval,clearInterval:cancel=clearInterval,setTimeout:after=setTimeout,clearTimeout:cancelAfter=clearTimeout}){
 const page=pathToFileURL(path.join(__dirname,'permission-helper.html')).href;
 const bundle=resolveAppBundle(app.getPath('exe')),icon=path.join(__dirname,'../assets/creator-compiler-512.png');
 let popup=null,timer=null,permission=null,disposed=false,cursorIcon=null,child=null,following=false,celebrating=false,celebrationTimer=null;
 // The 512px app icon would follow the cursor at full size; drag a 64px copy.
 const dragIcon=()=>cursorIcon??=nativeImage.createFromPath(icon).resize({width:64,height:64});
 function stopPolling(){if(timer!==null){cancel(timer);timer=null;}}
 function stopFollowing(){following=false;const process=child;child=null;if(process){try{process.stdin.end();}catch{}try{process.kill();}catch{}}}
 function close(){stopPolling();stopFollowing();if(celebrationTimer!==null){cancelAfter(celebrationTimer);celebrationTimer=null;}const window=popup;popup=null;permission=null;celebrating=false;if(window&&!window.isDestroyed())window.destroy();}
 function finish(){const kind=celebrating?permission:null;close();if(kind)onGranted(kind);}
 function follow(window,fallback){
  following=true;let process;try{process=spawnProcess(helperPath,[],{stdio:['pipe','pipe','ignore']});}catch{following=false;return;}child=process;
  let buffer='';
  const fallbackPlacement=()=>{if(popup===window&&following&&!window.isDestroyed())window.setBounds(fallback);};
  const fail=()=>{if(child!==process)return;fallbackPlacement();stopFollowing();};
  process.on('error',fail);process.once('close',fail);process.stdin.on('error',fail);
  process.stdout.on('data',data=>{
   if(child!==process||popup!==window||!following||window.isDestroyed())return;
   buffer+=data.toString();if(buffer.length>65536){fail();return;}
   let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let info;try{info=JSON.parse(line);}catch{fail();return;}
    window.setBounds(settingsHelperBounds(info,fallback.height)||fallback);
   }
  });
 }
 function verify(event){if(!popup||popup.isDestroyed()||event.sender!==popup.webContents||event.senderFrame!==popup.webContents.mainFrame||event.senderFrame.url!==page)throw new Error('Untrusted permission helper.');}
 const handlers={
  'permission-helper-read':event=>{verify(event);return {kind:permission,appName,development:!app.isPackaged,bundleName:path.basename(bundle),icon:nativeImage.createFromPath(icon).toDataURL()};},
  'permission-helper-reveal':event=>{verify(event);shell.showItemInFolder(bundle);},
  'permission-helper-close':event=>{verify(event);finish();},
  'permission-helper-relaunch':event=>{verify(event);if(permission!=='screen'||!celebrating)throw new Error('Screen access has not been granted.');finish();relaunch?.();},
 };
 for(const [name,handler] of Object.entries(handlers))ipcMain.handle(name,handler);
 // startDrag must originate in the helper's own user-initiated drag event.
 const drag=event=>{try{verify(event);if(!celebrating)event.sender.startDrag({file:bundle,icon:dragIcon()});}catch(error){console.error('Capture access drag failed:',error.message);}};
 ipcMain.on('permission-helper-drag',drag);
 // A frameless panel ignores CSS drag regions on macOS, so the helper moves itself by the pointer's movement.
 const move=(event,dx,dy)=>{try{verify(event);if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>4000||Math.abs(dy)>4000)return;if(!dx&&!dy)return;stopFollowing();const [x,y]=popup.getPosition();popup.setPosition(Math.round(x+dx),Math.round(y+dy));}catch{}};
 ipcMain.on('permission-helper-move',move);
 async function open(kind){
  if(disposed)throw new Error('Capture access helper is closed.');
  if(!['camera','microphone','screen'].includes(kind))throw new Error('Unknown capture permission.');
  close();permission=kind;
  // System Settings normally opens on the display containing the pointer; never assume the primary display.
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const options=permissionHelperOptions(area,path.join(__dirname,'permission-helper-preload.cjs'));
  const window=new BrowserWindow(options);popup=window;
  window.setAlwaysOnTop(true,'floating');
  window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.once('closed',()=>{if(popup===window)finish();});
  try{await window.loadURL(page);}catch(error){if(popup===window)close();throw error;}
  if(popup!==window||window.isDestroyed())return;
  window.showInactive();follow(window,{x:options.x,y:options.y,width:options.width,height:options.height});
  timer=every(()=>{
   if(popup!==window||permission!==kind||celebrating)return;
   if(getStatus(kind)==='granted'){stopPolling();celebrating=true;window.webContents.send('permission-helper-granted',{kind});if(kind!=='screen')celebrationTimer=after(()=>{if(popup===window&&celebrating)finish();},1400);}
  },1000);
 }
 return {open,close,dispose(){disposed=true;close();for(const name of Object.keys(handlers))ipcMain.removeHandler(name);ipcMain.removeListener('permission-helper-drag',drag);ipcMain.removeListener('permission-helper-move',move);}};
}
module.exports={resolveAppBundle,permissionHelperOptions,settingsHelperBounds,createPermissionHelper};
