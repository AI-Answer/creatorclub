import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext,createContext,runInContext} from 'node:vm';
test('preload relays permissions without Onboarding, and sends actual recorder state to the close guard',async()=>{
 const listeners=new Map<string,Function>(),dom=new Map<string,Function>(),events:string[]=[],sent:any[]=[];
 runInNewContext(await readFile(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld(){}},ipcRenderer:{on:(name:string,fn:Function)=>listeners.set(name,fn),send:(...args:any[])=>sent.push(args)}}),process:{platform:'darwin',argv:[]},Event:class{constructor(public type:string){}},window:{addEventListener:(name:string,fn:Function)=>dom.set(name,fn),dispatchEvent:(event:{type:string})=>events.push(event.type)}});
 listeners.get('media-permissions-changed')!({},{});assert.deepEqual(events,['sceneforge-media-permissions']);listeners.get('media-service-ready')!({},{});assert.deepEqual(events,['sceneforge-media-permissions','sceneforge-media-service-ready']);dom.get('sceneforge-recording-state')!({detail:'paused'});assert.deepEqual(sent,[['recording-state','paused']]);
});
test('screen restart requirement comes from the launch grant and reads never latch it',async()=>{
 const main=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8'),source=main.slice(main.indexOf('function getMediaPermissions(){'),main.indexOf('function verifyDesktopSender('));
 const snapshot=(status:string)=>{const context=createContext({process:{platform:'darwin'},status,getNativeMediaStatus:()=>context.status});runInContext(source,context);return {context,read:()=>runInContext('getMediaPermissions()',context)};};
 const first=snapshot('denied');assert.equal(first.read().screenRestartRequired,false);first.context.status='granted';assert.equal(first.read().screenRestartRequired,true);first.context.status='denied';assert.equal(first.read().screenRestartRequired,false);
 const relaunched=snapshot('granted');assert.equal(relaunched.read().screenRestartRequired,false);
});
