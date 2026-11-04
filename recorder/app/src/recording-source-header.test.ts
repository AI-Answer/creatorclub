import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Window} from 'happy-dom';
import {RecordingSourceHeader} from './RecordingSourceHeader';

test('every source renders its gear inline after the device in the same header, without a gear row',async()=>{
 const browser=new Window();
 try{
  for(const label of ['Microphone','Camera','Screen','Computer audio']){
   browser.document.body.innerHTML=renderToStaticMarkup(h('section',{className:'capture-source'},h(RecordingSourceHeader,{
    label,toggle:h('button',{role:'switch','aria-label':label}),
    device:h('select',{'aria-label':`${label} device`},h('option',null,'Shure MV7')),
    settings:h('button',{'aria-label':`${label} settings`},'Settings'),
   })));
   const section=browser.document.querySelector('section')!,header=section.querySelector('header')!,gear=section.querySelector(`[aria-label="${label} settings"]`)!;
   assert.equal(section.children.length,1,'no row underneath the header');
   assert.equal(header.children[0].getAttribute('role'),'switch');assert.equal(header.children[1].textContent,label);
   assert.equal(gear.parentElement?.className,'capture-source-actions');assert.equal(gear.previousElementSibling?.tagName,'SELECT');
   assert.equal(gear.closest('header'),header);assert.equal(gear.parentElement?.lastElementChild,gear);
  }
 }finally{await browser.happyDOM.close();}
});
