import './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {getAppearance,initializeAppearance,setAppearance} from './appearance';

test('appearance starts light and preserves every stored choice',()=>{
 const original=(globalThis as {matchMedia?:unknown}).matchMedia;
 Object.assign(globalThis,{matchMedia:()=>({matches:true,addEventListener(){}})});
 try{
  localStorage.clear();
  assert.equal(getAppearance(),'light');
  initializeAppearance();assert.equal(document.documentElement.dataset.theme,'light');
  setAppearance('system');assert.equal(getAppearance(),'system');assert.equal(document.documentElement.dataset.theme,'dark');
  setAppearance('dark');assert.equal(getAppearance(),'dark');
  setAppearance('light');assert.equal(getAppearance(),'light');assert.equal(document.documentElement.dataset.theme,'light');
 }finally{localStorage.clear();Object.assign(globalThis,{matchMedia:original});}
});
