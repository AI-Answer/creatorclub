import {mountUI} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {installFetch} from './test-fakes';
const {Companion}=await import('./workspace/Companion');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('on Edit the chat waits as its rail while a panel is open in a window up to 1600 px, and comes back when the panel closes',async()=>{
 localStorage.setItem('cc.companion.open','1');
 const original=window.matchMedia;
 Object.assign(window,{matchMedia:(query:string)=>({matches:query==='(max-width: 1599px)',media:query,addEventListener(){},removeEventListener(){}})});
 const fake=installFetch(call=>call.path.endsWith('/companion')?{body:{messages:[]}}:call.path==='/settings'?{body:{defaultAi:'claude'}}:undefined);
 const props=(roomy:boolean|number)=>({videoId:'v1',tab:'edit' as const,screen:'Edit',pkg:null,outline:null,onChanged(){},roomy});
 const ui=await mountUI(createElement(Companion,props(1599)));
 try{
  await flush();
  assert.equal(ui.container.querySelector('textarea'),null,'a panel is open: the picture gets the room, the chat is its rail');
  assert.ok(ui.container.querySelector('.cmp-rail'),'the rail reopens it');
  await ui.render(createElement(Companion,props(false)));await flush();
  assert.ok(ui.container.querySelector('textarea'),'the panel closed: the chat is back as it was');
 }finally{await ui.close();fake.restore();Object.assign(window,{matchMedia:original});localStorage.removeItem('cc.companion.open');}
});
