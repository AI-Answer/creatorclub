import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject} from '../shared/types';
import {defaultRecordingSettings,loadRecordingPreferences,saveRecordingPreferences} from './recording-presets';
import type {SceneForgeDesktopBridge} from './desktop';
const {Recording}=await import('./Recording');

test('setup blocks recording shortcuts; explicitly recording without a screen gives an inline hint',async()=>{
 const originalFetch=globalThis.fetch,originalBridge=window.sceneForge;
 const errors:string[]=[];let lists=0;
 localStorage.clear();
 saveRecordingPreferences({...loadRecordingPreferences(),current:{...defaultRecordingSettings(),selection:{camera:false,microphone:false,screen:true,systemAudio:false}}});
 globalThis.fetch=async()=>Response.json([]);
 window.sceneForge={platform:'darwin',getMediaPermissions:async()=>({platform:'darwin',camera:'not-determined',microphone:'not-determined',screen:'denied',systemAudio:'unknown'}),
  startNativeRecording:async()=>{throw new Error('Recording must not start');},listCaptureSources:async()=>{lists++;return {sources:[],displays:[]};},chooseCaptureSource:async()=>null,
 } as unknown as SceneForgeDesktopBridge;
 const ui=await mountUI(createElement(Recording,{project:createProject('Setup'),change:()=>{},onRecorded:()=>{},onError:(message:string)=>errors.push(message)}));
 const setup=document.createElement('div');setup.dataset.captureSetup='';document.body.append(setup);
 const record=()=>act(async()=>{window.dispatchEvent(new CustomEvent('sceneforge-shortcut',{detail:{action:'record'}}));});
 try{
  await record();assert.deepEqual(errors,[]);assert.equal(lists,0);assert.equal(ui.container.querySelector('.recording-capture-notice'),null);
  setup.remove();await record();
  assert.deepEqual(errors,[]);assert.equal(lists,1);
  const notice=ui.container.querySelector('.recording-capture-notice');assert.equal(notice?.getAttribute('role'),'status');assert.match(notice?.textContent||'',/Choose a display, window, or region/);
 }finally{setup.remove();await ui.close();window.sceneForge=originalBridge;globalThis.fetch=originalFetch;}
});
