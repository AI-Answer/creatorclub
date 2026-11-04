'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');

/** Use the outer app, never a nested Electron Helper.app. No guessed installed path. */
function resolveAppBundle(executable){
 if(typeof executable!=='string'||!path.isAbsolute(executable))throw new Error('The running app executable must have an absolute path.');
 const match=path.normalize(executable).match(/^(.*?\.app)(?:\/|$)/i);
 if(!match)throw new Error('The running executable is not inside a macOS app bundle.');
 return match[1];
}
function permissionHelperOptions(workArea,preload){
 const width=Math.min(360,workArea.width),height=156;
 return {width,height,x:Math.round(workArea.x+(workArea.width-width)/2),y:Math.round(workArea.y+workArea.height-height-28),
  frame:false,transparent:true,roundedCorners:true,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,
  alwaysOnTop:true,skipTaskbar:true,show:false,type:'panel',hasShadow:true,title:'Capture access',
  webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}};
}
function createPermissionHelper({app,BrowserWindow,ipcMain,screen,shell,nativeImage,getStatus,onGranted,appName='Creator Compiler',setInterval:every=setInterval,clearInterval:cancel=clearInterval}){
 const page=pathToFileURL(path.join(__dirname,'permission-helper.html')).href;
 const bundle=resolveAppBundle(app.getPath('exe')),icon=path.join(__dirname,'../assets/creator-compiler-512.png');
 let popup=null,timer=null,permission=null,disposed=false,cursorIcon=null;
 // The 512px app icon would follow the cursor at full size; drag a 64px copy.
 const dragIcon=()=>cursorIcon??=nativeImage.createFromPath(icon).resize({width:64,height:64});
 function close(){if(timer!==null){cancel(timer);timer=null;}const window=popup;popup=null;permission=null;if(window&&!window.isDestroyed())window.destroy();}
 function verify(event){if(!popup||popup.isDestroyed()||event.sender!==popup.webContents||event.senderFrame!==popup.webContents.mainFrame||event.senderFrame.url!==page)throw new Error('Untrusted permission helper.');}
 const handlers={
  'permission-helper-read':event=>{verify(event);return {appName,development:!app.isPackaged,bundleName:path.basename(bundle),icon:nativeImage.createFromPath(icon).toDataURL()};},
  'permission-helper-reveal':event=>{verify(event);shell.showItemInFolder(bundle);},
  'permission-helper-close':event=>{verify(event);close();},
 };
 for(const [name,handler] of Object.entries(handlers))ipcMain.handle(name,handler);
 // startDrag must originate in the helper's own user-initiated drag event.
 const drag=event=>{try{verify(event);event.sender.startDrag({file:bundle,icon:dragIcon()});}catch(error){console.error('Capture access drag failed:',error.message);}};
 ipcMain.on('permission-helper-drag',drag);
 // A frameless panel ignores CSS drag regions on macOS, so the helper moves itself by the pointer's movement.
 const move=(event,dx,dy)=>{try{verify(event);if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>4000||Math.abs(dy)>4000)return;const [x,y]=popup.getPosition();popup.setPosition(Math.round(x+dx),Math.round(y+dy));}catch{}};
 ipcMain.on('permission-helper-move',move);
 async function open(kind){
  if(disposed)throw new Error('Capture access helper is closed.');
  if(!['camera','microphone','screen'].includes(kind))throw new Error('Unknown capture permission.');
  close();permission=kind;
  // System Settings normally opens on the display containing the pointer; never assume the primary display.
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const window=new BrowserWindow(permissionHelperOptions(area,path.join(__dirname,'permission-helper-preload.cjs')));popup=window;
  window.setAlwaysOnTop(true,'floating');
  window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.once('closed',()=>{if(popup===window){popup=null;permission=null;if(timer!==null){cancel(timer);timer=null;}}});
  try{await window.loadURL(page);}catch(error){if(popup===window)close();throw error;}
  if(popup!==window||window.isDestroyed())return;
  window.showInactive();
  timer=every(()=>{
   if(popup!==window||permission!==kind)return;
   if(getStatus(kind)==='granted'){close();onGranted(kind);}
  },1000);
 }
 return {open,close,dispose(){disposed=true;close();for(const name of Object.keys(handlers))ipcMain.removeHandler(name);ipcMain.removeListener('permission-helper-drag',drag);ipcMain.removeListener('permission-helper-move',move);}};
}
module.exports={resolveAppBundle,permissionHelperOptions,createPermissionHelper};
