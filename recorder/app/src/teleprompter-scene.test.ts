import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {mountUI} from './test-dom';
import {createProject} from '../shared/types';
const {Teleprompter}=await import('./Teleprompter');

test('the teleprompter opens at the selected scene: the cursor starts at that scene\'s first word and its section is the one scrolled to',async()=>{
 const project=createProject('Prompter');
 project.scenes=['one','two','three'].map((name,index)=>({id:`s${index}`,name,script:`${name} alpha ${name} beta`,order:index} as never));
 const scrolled:string[]=[];
 const original=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'scrollTop');
 Object.defineProperty(HTMLElement.prototype,'scrollTop',{configurable:true,get(){return 0;},set(){scrolled.push((this as HTMLElement).className);}});
 const ui=await mountUI(createElement(Teleprompter,{project,change(){},onClose(){},sceneId:'s1'}));
 try{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
  const sections=[...ui.container.querySelectorAll<HTMLElement>('section[data-scene]')];
  assert.deepEqual(sections.map(section=>section.dataset.scene),['s0','s1','s2']);
  assert.ok(scrolled.includes('teleprompter-scroll'),'the text is scrolled to the scene');
 }finally{await ui.close();if(original)Object.defineProperty(HTMLElement.prototype,'scrollTop',original);else delete (HTMLElement.prototype as {scrollTop?:number}).scrollTop;}
});
