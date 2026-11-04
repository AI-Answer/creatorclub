import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../../shared/club';
import {installFetch} from '../test-fakes';
const {Board}=await import('./Board');

const video:Video={id:'v1',title:'Hidden features',stage:'ideas',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false}};
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const tipShown=(root:Element)=>(root.textContent??'').includes('How the board works');

test('the Board tip shows on the first visit and is saved when closed; the ? button opens it again without saving',async()=>{
 let seen=false;
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/research')return {body:[]};
  if(call.path==='/settings')return {body:{helpSeen:seen?['board']:[]}};
  if(call.path==='/settings/help/board'){seen=true;return {body:{helpSeen:['board']}};}
  if(call.path==='/videos')return {body:[]};
  return undefined;
 });
 const ui=await mountUI(createElement(Board,{video}));
 try{
  await flush();await flush();
  assert.ok(tipShown(ui.container),'the tip shows on the first visit');
  await act(async()=>button(ui.container,'Close').click());await flush();
  assert.ok(server.calls.some(call=>call.method==='POST'&&call.path==='/settings/help/board'),'closing the first visit saves it');
  assert.ok(!tipShown(ui.container),'the tip is gone');
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('button[aria-label="How the board works"]')!.click());await flush();
  assert.ok(tipShown(ui.container),'the ? button opens it again');
  const posts=server.calls.filter(call=>call.method==='POST'&&call.path==='/settings/help/board').length;
  await act(async()=>button(ui.container,'Close').click());await flush();
  assert.equal(server.calls.filter(call=>call.method==='POST'&&call.path==='/settings/help/board').length,posts,'reopening and closing saves nothing new');
 }finally{await ui.close();server.restore();}
});

test('an empty board shows Add to board with nothing over it; the minimap comes once there is a card to map',async()=>{
 let tiles:unknown[]=[];
 const server=installFetch(call=>{
  if(call.path==='/videos/v1/research')return {body:tiles};
  if(call.path==='/settings')return {body:{helpSeen:['board']}};
  if(call.path==='/videos')return {body:[]};
  return undefined;
 });
 const ui=await mountUI(createElement(Board,{video}));
 try{
  await flush();await flush();
  assert.ok(ui.container.querySelector('.board-empty'),'the empty board says what to do');
  assert.equal(ui.container.querySelector('.board-minimap'),null,'no minimap over it');
  tiles=[{id:'n1',kind:'note',text:'A note',meta:{},createdAt:'2026-10-01T00:00:00.000Z'}];
  await ui.render(createElement(Board,{video,refreshKey:1}));await flush();await flush();
  assert.equal(ui.container.querySelector('.board-empty'),null);
  assert.ok(ui.container.querySelector('.board-minimap'),'the minimap maps the cards');
 }finally{await ui.close();server.restore();}
});
