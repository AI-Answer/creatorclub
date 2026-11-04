import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {act,createElement} from 'react';
import {Window} from 'happy-dom';
import type {DesktopMediaPermissions,SceneForgeDesktopBridge} from './desktop';
registerHooks({resolve:(specifier,context,next)=>specifier.endsWith('.css')?{url:'data:text/javascript,',shortCircuit:true}:next(specifier,context)});

test('onboarding requests native camera/mic prompts, opens settings for screen and denied access, and updates after a grant',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 const saved=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 }
 let access:DesktopMediaPermissions={platform:'darwin',camera:'not-determined',microphone:'not-determined',screen:'denied',systemAudio:'unknown'};
 let changed:((next:DesktopMediaPermissions)=>void)|undefined;
 const requests:string[]=[],settings:string[]=[];let restarts=0;
 Object.assign(browser,{sceneForge:{platform:'darwin',appName:'Creator Compiler',getMediaPermissions:async()=>access,
  requestMediaPermission:async(kind:'camera'|'microphone')=>{requests.push(kind);access={...access,[kind]:'granted'};return {permission:kind,status:'granted',granted:true};},
  openPrivacySettings:async(kind:string)=>{settings.push(kind);if(kind==='screen')access={...access,screenRestartRequired:true};},
  onMediaPermissionsChanged:(callback:(next:DesktopMediaPermissions)=>void)=>{changed=callback;return()=>{changed=undefined;};},
  relaunch:async()=>{restarts++;},
 } satisfies Partial<SceneForgeDesktopBridge>});
 const {createRoot}=await import('react-dom/client'),{Onboarding}=await import('./Onboarding');
 const host=browser.document.createElement('div');browser.document.body.append(host);
 const root=createRoot(host as unknown as HTMLElement);
 const row=(name:string)=>host.querySelector(`section[aria-label="${name}"]`)!;
 const press=async(name:string)=>act(async()=>{(row(name).querySelector('button') as unknown as HTMLButtonElement).click();});
 try{
  await act(async()=>{root.render(createElement(Onboarding,{initialStep:1,onClose:()=>{},onRecord:()=>{},onImport:()=>{}}));});
  assert.ok(host.querySelector('[data-capture-setup]'));
  for(const name of ['Camera','Microphone']){assert.equal(row(name).querySelector('.setup-status')?.textContent,'Not set up');assert.equal(row(name).querySelector('button')?.textContent,'Allow');}
  await press('Camera');await press('Microphone');assert.deepEqual(requests,['camera','microphone']);assert.deepEqual(settings,[]);
  assert.equal(row('Camera').querySelector('.setup-status')?.textContent,'Allowed');
  await press('Screen recording');assert.deepEqual(settings,['screen']);
  access={...access,camera:'denied',microphone:'restricted',screen:'granted'};
  await act(async()=>changed?.(access));
  for(const name of ['Camera','Microphone']){assert.equal(row(name).querySelector('button')?.textContent,'Open settings');await press(name);}
  assert.deepEqual(requests,['camera','microphone']);assert.deepEqual(settings,['screen','camera','microphone']);
  assert.equal(row('Screen recording').querySelector('.setup-status')?.textContent,'Allowed');
  const restart=Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Restart Creator Compiler');assert.ok(restart,'restart remains available after screen becomes granted');
  await act(async()=>{(restart as unknown as HTMLButtonElement).click();});assert.equal(restarts,1);
 }finally{
  await act(async()=>root.unmount());assert.equal(changed,undefined);await browser.happyDOM.close();
  for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
 }
});
