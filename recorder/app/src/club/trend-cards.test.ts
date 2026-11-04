import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {TrendingEntry} from '../../shared/club';
import {installFetch} from './test-fakes';
const {TrendCard}=await import('./TrendCards');
const item:TrendingEntry={videoId:'abcdefghijk',title:'A long title that needs two lines on a compact card',channel:'A channel',channelId:'UCFeFVytEkT8kaqPCJZGFswg',kind:'creator',likes:100,comments:10,published:'2026-11-01',firstSeen:'2026-11-01',views:764000,vpd:202000,mult:3,ageDays:2,fit:true,reason:'Because you picked Claude',history:[]};

test('trend cards keep reason and actions separate, and Follow does not open the breakdown',async()=>{
 const opened:string[]=[];
 const fake=installFetch(call=>call.path==='/followed'?{body:[]}:undefined);
 const ui=await mountUI(createElement(TrendCard,{item,saved:false,onBreak:video=>opened.push(video.videoId)}));
 try{
  const card=ui.container.querySelector('.trend')!;
  assert.equal(card.querySelector('.reason .ellipsis')?.textContent,item.reason);
  assert.equal(card.querySelector('.reason')?.getAttribute('title'),item.reason);
  const actions=card.querySelector('.trend-actions')!;
  assert.ok(actions.contains(button(card,'Follow this channel')));
  assert.ok(actions.contains(button(card,'Break this down')));
  await act(async()=>button(card,'Follow this channel').click());
  assert.equal(opened.length,0);
  await act(async()=>button(card,'Break this down').click());
  assert.deepEqual(opened,[item.videoId]);
  await ui.render(createElement(TrendCard,{item:{...item,reason:null},saved:true,onBreak:video=>opened.push(video.videoId)}));
  assert.equal(card.querySelector('.reason')?.textContent,'');
  await act(async()=>button(card,'Open breakdown').click());
  assert.deepEqual(opened,[item.videoId,item.videoId]);
 }finally{await ui.close();fake.restore();}
});
