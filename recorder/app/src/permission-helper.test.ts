import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {Window as DOMWindow,type HTMLElement as DOMElement} from 'happy-dom';
import {fileURLToPath} from 'node:url';
import {capturePermissionProgress,permissionAction,permissionLabels} from './media-permissions';
const require=createRequire(import.meta.url);
const {resolveAppBundle,permissionHelperOptions,settingsHelperBounds,createPermissionHelper}=require('../desktop/permission-helper.cjs') as typeof import('../desktop/permission-helper.cjs');
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
 assert.equal(options.x,-936);assert.equal(options.y,700);assert.equal(options.width,360);assert.equal(options.height,172);
 assert.equal(options.frame,false);assert.equal(options.alwaysOnTop,true);assert.equal(options.type,'panel');assert.equal(options.transparent,true);assert.equal(options.roundedCorners,true);assert.equal(options.skipTaskbar,true);assert.equal(options.show,false);
 assert.equal(options.resizable,false);assert.equal(options.fullscreenable,false);
 assert.deepEqual(options.webPreferences,{preload:'/preload.cjs',contextIsolation:true,nodeIntegration:false,sandbox:true});
});
function harness(fails=false){
 const ipc=new EventEmitter() as EventEmitter&{handle(name:string,handler:Function):void;removeHandler(name:string):void};
 const handlers=new Map<string,Function>();ipc.handle=(name,fn)=>handlers.set(name,fn);ipc.removeHandler=name=>{handlers.delete(name);};
 const windows:any[]=[],dragged:any[]=[],revealed:string[]=[],granted:string[]=[],children:any[]=[],messages:any[]=[];let tick:(()=>void)|undefined,delayed:(()=>void)|undefined,clears=0,status='denied',restarts=0;
 const spawnProcess=(binary:string)=>{assert.equal(binary,path.join(root,'server-dist/sceneforge-settings-window'));if(fails)throw Error('missing');const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stdin:Object.assign(new EventEmitter(),{end:()=>{}}),killed:false,kill(){this.killed=true;}});children.push(child);return child;};
 class Window extends EventEmitter{
  dead=false;url='';shown=false;top:unknown;spaces:unknown;position=[100,200];
  webContents=Object.assign(new EventEmitter(),{mainFrame:{url:''},setWindowOpenHandler:()=>{},startDrag:(value:unknown)=>dragged.push(value),send:(...args:unknown[])=>messages.push(args)});
  constructor(readonly options:unknown){super();windows.push(this);}
  isDestroyed(){return this.dead;}destroy(){this.dead=true;this.emit('closed');}
  setAlwaysOnTop(...args:unknown[]){this.top=args;}setVisibleOnAllWorkspaces(...args:unknown[]){this.spaces=args;}
  async loadURL(url:string){this.url=url;this.webContents.mainFrame.url=url;}showInactive(){this.shown=true;}
  setBounds(value:any){this.position=[value.x,value.y];this.bounds=value;}bounds:any;getPosition(){return this.position;}setPosition(x:number,y:number){this.position=[x,y];}
 }
 const helper=createPermissionHelper({
  app:{getPath:()=>'/Applications/Creator Compiler.app/Contents/MacOS/Creator Compiler',isPackaged:true},BrowserWindow:Window,ipcMain:ipc,
  screen:{getCursorScreenPoint:()=>({x:-50,y:30}),getDisplayNearestPoint:()=>({workArea:{x:-1512,y:0,width:1512,height:940}})},
  shell:{showItemInFolder:(file:string)=>revealed.push(file)},nativeImage:{createFromPath:(file:string)=>({toDataURL:()=> 'data:image/png;base64,test',resize:(size:unknown)=>({file,size})})},
  spawnProcess,relaunch:()=>{restarts++;},setTimeout:(callback:()=>void,ms:number)=>{assert.equal(ms,1400);delayed=callback;return 2;},clearTimeout:()=>{delayed=undefined;},getStatus:()=>status,onGranted:(kind:string)=>granted.push(kind),setInterval:(callback:()=>void,ms:number)=>{assert.equal(ms,1000);tick=callback;return 1;},clearInterval:()=>{clears++;tick=undefined;},
 } as unknown as Parameters<typeof createPermissionHelper>[0]);
 const event=()=>({sender:windows.at(-1).webContents,senderFrame:windows.at(-1).webContents.mainFrame});
 return {helper,windows,ipc,handlers,event,dragged,revealed,granted,children,messages,delay:()=>delayed?.(),restarts:()=>restarts,tick:()=>tick?.(),grant:()=>{status='granted';},clears:()=>clears};
}
test('helper authenticates its frame, drags and reveals its app, detects grant and cleans up',async()=>{
 const h=harness();try{
  await h.helper.open('camera');const window=h.windows[0];
  assert.equal(window.shown,true);assert.deepEqual(window.top,[true,'floating']);assert.deepEqual(window.spaces,[true,{visibleOnFullScreen:true,skipTransformProcessType:true}]);
  assert.throws(()=>h.handlers.get('permission-helper-reveal')!({sender:{},senderFrame:{url:window.url}}),/Untrusted/);
  const frame=window.webContents.mainFrame;window.webContents.mainFrame={url:window.url};assert.throws(()=>h.handlers.get('permission-helper-read')!({sender:window.webContents,senderFrame:frame}),/Untrusted/);
  const info=h.handlers.get('permission-helper-read')!(h.event());assert.equal(info.kind,'camera');assert.equal(info.appName,'Creator Compiler');assert.equal(info.development,false);assert.match(info.icon,/^data:image\/png/);
  h.ipc.emit('permission-helper-drag',h.event());assert.equal(h.dragged[0].file,'/Applications/Creator Compiler.app');assert.deepEqual(h.dragged[0].icon,{file:path.join(root,'assets/creator-compiler-512.png'),size:{width:64,height:64}});
  h.ipc.emit('permission-helper-move',h.event(),12.4,-30);assert.deepEqual(window.position,[112,170]);
  h.ipc.emit('permission-helper-move',h.event(),Number.NaN,5);h.ipc.emit('permission-helper-move',{sender:{},senderFrame:{url:window.url}},50,50);assert.deepEqual(window.position,[112,170]);
  h.handlers.get('permission-helper-reveal')!(h.event());assert.deepEqual(h.revealed,['/Applications/Creator Compiler.app']);
  h.tick();assert.equal(window.dead,false);assert.deepEqual(h.granted,[]);
  h.grant();h.tick();assert.equal(window.dead,false);assert.deepEqual(h.granted,[]);assert.deepEqual(h.messages,[['permission-helper-granted',{kind:'camera'}]]);h.tick();assert.equal(h.clears(),1);h.delay();assert.equal(window.dead,true);assert.deepEqual(h.granted,['camera']);h.delay();assert.deepEqual(h.granted,['camera']);
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

test('settings placement pins to the right pane, clamps width, and preserves negative display coordinates',()=>{
 assert.deepEqual(settingsHelperBounds({found:true,x:100,y:50,width:1000,height:800}),{x:372,y:664,width:520,height:172});
 assert.deepEqual(settingsHelperBounds({found:true,x:-1512,y:-40,width:600,height:700}),{x:-1308,y:474,width:372,height:172});
 assert.deepEqual(settingsHelperBounds({found:true,x:0,y:0,width:400,height:600},180),{x:88,y:406,width:300,height:180});
 assert.equal(settingsHelperBounds({found:true,x:0,y:0,width:320,height:600}),null);
 for(const value of [{found:false},{found:true,x:NaN,y:0,width:700,height:600},{found:true,x:0,y:0,width:0,height:600}])assert.equal(settingsHelperBounds(value),null);
});
test('tracker follows Settings, falls back when absent, stops after manual movement, and dies on close',async()=>{
 const h=harness();try{
  await h.helper.open('screen');const window=h.windows[0],child=h.children[0];
  const bounds={found:true,x:80,y:40,width:900,height:700},line=JSON.stringify(bounds)+'\n';
  child.stdout.emit('data',line.slice(0,20));assert.equal(window.bounds,undefined);child.stdout.emit('data',line.slice(20));assert.deepEqual(window.bounds,settingsHelperBounds(bounds));
  child.stdout.emit('data','{"found":false}\n');assert.deepEqual(window.bounds,{x:-936,y:740,width:360,height:172});
  h.ipc.emit('permission-helper-move',h.event(),NaN,5);assert.equal(child.killed,false);
  h.ipc.emit('permission-helper-move',h.event(),10,20);assert.equal(child.killed,true);const position=[...window.position];
  child.stdout.emit('data',line);assert.deepEqual(window.position,position);
  await h.helper.open('microphone');assert.equal(h.children[1].killed,false);h.helper.close();assert.equal(h.children[1].killed,true);
  await h.helper.open('camera');h.helper.dispose();assert.equal(h.children[2].killed,true);
 }finally{h.helper.dispose();}
});
test('missing or failed tracker keeps the display fallback and permission polling',async()=>{
 const h=harness(true);try{await h.helper.open('microphone');h.grant();h.tick();h.delay();assert.deepEqual(h.granted,['microphone']);}finally{h.helper.dispose();}
 const live=harness();try{await live.helper.open('camera');live.children[0].emit('error',Error('failed'));assert.deepEqual(live.windows[0].bounds,{x:-936,y:740,width:360,height:172});assert.equal(live.children[0].killed,true);}finally{live.helper.dispose();}
});
test('screen celebration waits for Restart now or dismissal and only restarts after a grant',async()=>{
 const h=harness();try{
  await h.helper.open('screen');assert.throws(()=>h.handlers.get('permission-helper-relaunch')!(h.event()),/not been granted/);
  assert.equal(h.handlers.get('permission-helper-read')!(h.event()).kind,'screen');
  h.grant();h.tick();h.delay();assert.equal(h.windows[0].dead,false);assert.deepEqual(h.granted,[]);assert.deepEqual(h.messages,[['permission-helper-granted',{kind:'screen'}]]);
  h.handlers.get('permission-helper-relaunch')!(h.event());assert.equal(h.restarts(),1);assert.equal(h.windows[0].dead,true);assert.deepEqual(h.granted,['screen']);assert.equal(h.children[0].killed,true);
  await h.helper.open('screen');h.tick();h.handlers.get('permission-helper-close')!(h.event());assert.equal(h.restarts(),1);assert.deepEqual(h.granted,['screen','screen']);
 }finally{h.helper.dispose();}
});
test('closing during celebration cancels its delayed callback and never duplicates a grant',async()=>{
 const h=harness();try{await h.helper.open('camera');h.grant();h.tick();h.handlers.get('permission-helper-close')!(h.event());h.delay();assert.deepEqual(h.granted,['camera']);}finally{h.helper.dispose();}
});
test('capture progress advances in camera, microphone, screen order and only completes for three grants',()=>{
 assert.deepEqual(capturePermissionProgress(null),{current:'camera',allSet:false});
 assert.deepEqual(capturePermissionProgress({camera:'granted',screen:'granted'}),{current:'microphone',allSet:false});
 assert.deepEqual(capturePermissionProgress({camera:'granted',microphone:'granted',screen:'denied'}),{current:'screen',allSet:false});
 assert.deepEqual(capturePermissionProgress({camera:'granted',microphone:'granted',screen:'granted'}),{current:null,allSet:true});
 assert.deepEqual(capturePermissionProgress({camera:'restricted',microphone:'unsupported',screen:'granted'}),{current:'camera',allSet:false});
 assert.deepEqual(capturePermissionProgress({camera:'unsupported',microphone:'granted',screen:'granted'}),{current:null,allSet:true});
});

test('strip renderer names each exact list, drags the whole pill, and shows the grant and restart states',async()=>{
 const html=readFileSync(path.join(root,'desktop/permission-helper.html'),'utf8'),script=readFileSync(path.join(root,'desktop/permission-helper.js'),'utf8');
 for(const kind of ['camera','microphone','screen'] as const){
  const browser=new DOMWindow({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});let grant:((value:{kind:string})=>void)|undefined,dragged=0,restarted=0,closed=0,revealed=0;
  Object.assign(browser,{captureAccess:{read:async()=>({kind,appName:'Creator Compiler',icon:'data:image/png;base64,test',development:true,bundleName:'Electron.app'}),onGranted:(callback:typeof grant)=>{grant=callback;},drag:()=>{dragged++;},move:()=>{},reveal:async()=>{revealed++;},close:async()=>{closed++;},relaunch:async()=>{restarted++;}}});
  try{
   browser.document.write(html);runInNewContext(script,{window:browser,document:browser.document});await Promise.resolve();
   const get=(id:string)=>browser.document.getElementById(id) as DOMElement;
   assert.equal(get('instruction').textContent,kind==='screen'?'Drag into “Screen & System Audio Recording”, not the audio-only list.':`Drag into the ${kind==='camera'?'Camera':'Microphone'} list above, then switch it on.`);
   assert.match(get('development').textContent??'',/Electron.app/);assert.equal(get('development').hidden,false);
   get('pill').dispatchEvent(new browser.Event('dragstart',{cancelable:true}));assert.equal(dragged,1);get('finder').click();assert.equal(revealed,1);
   grant?.({kind});assert.equal(get('guide').hidden,true);assert.equal(get('celebration').hidden,false);assert.equal(get('restart').hidden,kind!=='screen');assert.equal(get('restart-note').textContent,'Restart Creator Compiler to use it');
   get('pill').dispatchEvent(new browser.Event('dragstart',{cancelable:true}));assert.equal(dragged,1);
   if(kind==='screen'){get('restart').click();assert.equal(restarted,1);}
   browser.document.dispatchEvent(new browser.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(closed,1);
  }finally{await browser.happyDOM.close();}
 }
});
