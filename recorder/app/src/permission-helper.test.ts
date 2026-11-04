import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {permissionAction,permissionLabels} from './media-permissions';
const require=createRequire(import.meta.url);
const {resolveAppBundle,permissionHelperOptions,createPermissionHelper}=require('../desktop/permission-helper.cjs') as typeof import('../desktop/permission-helper.cjs');
const root=fileURLToPath(new URL('..',import.meta.url));

test('capture access buttons distinguish native prompts, settings, and completed rows',()=>{
 for(const kind of ['camera','microphone'] as const){
  assert.deepEqual(permissionAction(kind,'not-determined',true),{label:'Allow',action:'request'});
  for(const status of ['denied','restricted'] as const)assert.deepEqual(permissionAction(kind,status,true),{label:'Open settings',action:'settings'});
 }
 for(const status of ['not-determined','denied','restricted','unknown'] as const)assert.deepEqual(permissionAction('screen',status,true),{label:'Allow',action:'settings'});
 for(const kind of ['camera','microphone','screen'] as const){
  assert.deepEqual(permissionAction(kind,'granted',true),{label:'Allowed',action:'none'});
  assert.deepEqual(permissionAction(kind,'unsupported',true),{label:'Not available',action:'none'});
  assert.equal(permissionAction(kind,'unknown',false).action,'request');
 }
 assert.equal(permissionLabels['not-determined'],'Not set up');
});
test('drag resolves the running outer app, including nested helpers and Electron development',()=>{
 assert.equal(resolveAppBundle('/Applications/Creator Compiler.app/Contents/MacOS/Creator Compiler'),'/Applications/Creator Compiler.app');
 assert.equal(resolveAppBundle('/Volumes/My Disk/Creator Compiler.app/Contents/Frameworks/Creator Compiler Helper.app/Contents/MacOS/Helper'),'/Volumes/My Disk/Creator Compiler.app');
 assert.equal(resolveAppBundle('/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),'/repo/node_modules/electron/dist/Electron.app');
 assert.throws(()=>resolveAppBundle('/usr/local/bin/node'),/not inside/);
 assert.throws(()=>resolveAppBundle('Electron.app/Contents/MacOS/Electron'),/absolute/);
});
test('helper options stay within the target display and isolate the renderer',()=>{
 const options=permissionHelperOptions({x:-1512,y:-40,width:1512,height:940},'/preload.cjs');
 assert.equal(options.x,-936);assert.equal(options.y,716);assert.equal(options.width,360);assert.equal(options.height,156);
 assert.equal(options.frame,false);assert.equal(options.alwaysOnTop,true);assert.equal(options.type,'panel');assert.equal(options.transparent,true);assert.equal(options.roundedCorners,true);assert.equal(options.skipTaskbar,true);assert.equal(options.show,false);
 assert.equal(options.resizable,false);assert.equal(options.fullscreenable,false);
 assert.deepEqual(options.webPreferences,{preload:'/preload.cjs',contextIsolation:true,nodeIntegration:false,sandbox:true});
});
function harness(){
 const ipc=new EventEmitter() as EventEmitter&{handle(name:string,handler:Function):void;removeHandler(name:string):void};
 const handlers=new Map<string,Function>();ipc.handle=(name,fn)=>handlers.set(name,fn);ipc.removeHandler=name=>{handlers.delete(name);};
 const windows:any[]=[],dragged:any[]=[],revealed:string[]=[],granted:string[]=[];let tick:(()=>void)|undefined,clears=0,status='denied';
 class Window extends EventEmitter{
  dead=false;url='';shown=false;top:unknown;spaces:unknown;position=[100,200];
  webContents=Object.assign(new EventEmitter(),{mainFrame:{url:''},setWindowOpenHandler:()=>{},startDrag:(value:unknown)=>dragged.push(value)});
  constructor(readonly options:unknown){super();windows.push(this);}
  isDestroyed(){return this.dead;}destroy(){this.dead=true;this.emit('closed');}
  setAlwaysOnTop(...args:unknown[]){this.top=args;}setVisibleOnAllWorkspaces(...args:unknown[]){this.spaces=args;}
  async loadURL(url:string){this.url=url;this.webContents.mainFrame.url=url;}showInactive(){this.shown=true;}
  getPosition(){return this.position;}setPosition(x:number,y:number){this.position=[x,y];}
 }
 const helper=createPermissionHelper({
  app:{getPath:()=>'/Applications/Creator Compiler.app/Contents/MacOS/Creator Compiler',isPackaged:true},BrowserWindow:Window,ipcMain:ipc,
  screen:{getCursorScreenPoint:()=>({x:-50,y:30}),getDisplayNearestPoint:()=>({workArea:{x:-1512,y:0,width:1512,height:940}})},
  shell:{showItemInFolder:(file:string)=>revealed.push(file)},nativeImage:{createFromPath:(file:string)=>({toDataURL:()=> 'data:image/png;base64,test',resize:(size:unknown)=>({file,size})})},
  getStatus:()=>status,onGranted:(kind:string)=>granted.push(kind),setInterval:(callback:()=>void,ms:number)=>{assert.equal(ms,1000);tick=callback;return 1;},clearInterval:()=>{clears++;tick=undefined;},
 } as unknown as Parameters<typeof createPermissionHelper>[0]);
 const event=()=>({sender:windows.at(-1).webContents,senderFrame:windows.at(-1).webContents.mainFrame});
 return {helper,windows,ipc,handlers,event,dragged,revealed,granted,tick:()=>tick?.(),grant:()=>{status='granted';},clears:()=>clears};
}
test('helper authenticates its frame, drags and reveals its app, detects grant and cleans up',async()=>{
 const h=harness();try{
  await h.helper.open('screen');const window=h.windows[0];
  assert.equal(window.shown,true);assert.deepEqual(window.top,[true,'floating']);assert.deepEqual(window.spaces,[true,{visibleOnFullScreen:true,skipTransformProcessType:true}]);
  assert.throws(()=>h.handlers.get('permission-helper-reveal')!({sender:{},senderFrame:{url:window.url}}),/Untrusted/);
  const frame=window.webContents.mainFrame;window.webContents.mainFrame={url:window.url};assert.throws(()=>h.handlers.get('permission-helper-read')!({sender:window.webContents,senderFrame:frame}),/Untrusted/);
  const info=h.handlers.get('permission-helper-read')!(h.event());assert.equal(info.appName,'Creator Compiler');assert.equal(info.development,false);assert.match(info.icon,/^data:image\/png/);
  h.ipc.emit('permission-helper-drag',h.event());assert.equal(h.dragged[0].file,'/Applications/Creator Compiler.app');assert.deepEqual(h.dragged[0].icon,{file:path.join(root,'assets/creator-compiler-512.png'),size:{width:64,height:64}});
  h.ipc.emit('permission-helper-move',h.event(),12.4,-30);assert.deepEqual(window.position,[112,170]);
  h.ipc.emit('permission-helper-move',h.event(),Number.NaN,5);h.ipc.emit('permission-helper-move',{sender:{},senderFrame:{url:window.url}},50,50);assert.deepEqual(window.position,[112,170]);
  h.handlers.get('permission-helper-reveal')!(h.event());assert.deepEqual(h.revealed,['/Applications/Creator Compiler.app']);
  h.tick();assert.equal(window.dead,false);assert.deepEqual(h.granted,[]);
  h.grant();h.tick();assert.equal(window.dead,true);assert.deepEqual(h.granted,['screen']);assert.equal(h.clears(),1);h.tick();assert.deepEqual(h.granted,['screen']);
 }finally{h.helper.dispose();assert.equal(h.handlers.size,0);assert.equal(h.ipc.listenerCount('permission-helper-drag'),0);assert.equal(h.ipc.listenerCount('permission-helper-move'),0);}
});
test('switching permissions closes the old helper and dismissal stops polling',async()=>{
 const h=harness();try{
  await h.helper.open('camera');await h.helper.open('microphone');assert.equal(h.windows[0].dead,true);assert.equal(h.clears(),1);
  h.handlers.get('permission-helper-close')!(h.event());h.grant();h.tick();assert.deepEqual(h.granted,[]);assert.equal(h.clears(),2);
 }finally{h.helper.dispose();}
 await assert.rejects(h.helper.open('camera'),/closed/);
});
test('main and inherited mac signing retain runtime rights and enable camera and audio input',()=>{
 const config=require('../electron-builder.cjs');assert.equal(config.mac.hardenedRuntime,true);
 for(const file of [config.mac.entitlements,config.mac.entitlementsInherit]){
  assert.equal(typeof file,'string');
  const xml=readFileSync(path.join(root,file),'utf8');
  const entitlements=Object.fromEntries([...xml.matchAll(/<key>([^<]+)<\/key>\s*<(true|false)\s*\/>/g)].map(([,key,value])=>[key,value==='true']));
  for(const key of ['com.apple.security.cs.allow-jit','com.apple.security.cs.allow-unsigned-executable-memory','com.apple.security.cs.disable-library-validation','com.apple.security.device.camera','com.apple.security.device.audio-input'])assert.equal(entitlements[key],true,key);
 }
 assert.ok(config.mac.extendInfo.NSCameraUsageDescription);assert.ok(config.mac.extendInfo.NSMicrophoneUsageDescription);
 assert.ok(config.files.includes('assets/creator-compiler-512.png'));
});
