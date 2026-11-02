import './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {getAppearance,initializeAppearance,setAppearance} from './appearance';

test('appearance follows the system until a choice is stored',()=>{
 const original=(globalThis as {matchMedia?:unknown}).matchMedia;
 Object.assign(globalThis,{matchMedia:()=>({matches:true,addEventListener(){}})});
 try{
  localStorage.clear();
  assert.equal(getAppearance(),'system');
  initializeAppearance();assert.equal(document.documentElement.dataset.theme,'dark');
  setAppearance('system');assert.equal(getAppearance(),'system');assert.equal(document.documentElement.dataset.theme,'dark');
  setAppearance('dark');assert.equal(getAppearance(),'dark');
  setAppearance('light');assert.equal(getAppearance(),'light');assert.equal(document.documentElement.dataset.theme,'light');
 }finally{localStorage.clear();Object.assign(globalThis,{matchMedia:original});}
});
