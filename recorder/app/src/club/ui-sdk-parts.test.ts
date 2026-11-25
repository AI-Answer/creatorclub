import {mountUI,button,chooseOption} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import type {Video,Workspace} from '../../shared/club';
const {Dialog,Select,Tabs}=await import('./ui');
const {ChannelMenu}=await import('./shell/ChannelMenu');
const {Palette}=await import('./shell/Palette');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const key=(name:string,init:KeyboardEventInit={})=>act(async()=>{(document.activeElement??document.body).dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...init}));});
const focused=()=>document.activeElement;

test('Tabs: one tab stop, arrows and Home/End select and focus, and the selected tab is the only one in the order',async()=>{
 const chosen:string[]=[];
 const Host=()=>{const [view,setView]=useState<'board'|'table'|'calendar'>('board');return createElement(Tabs,{label:'View',value:view,onChange:(next:'board'|'table'|'calendar')=>{chosen.push(next);setView(next);},tabs:[{id:'board',label:'Board'},{id:'table',label:'Table'},{id:'calendar',label:'Calendar'}]});};
 const ui=await mountUI(createElement(Host));
 try{
  const c=ui.container,list=c.querySelector('[role=tablist]')!,tabs=()=>[...c.querySelectorAll<HTMLElement>('[role=tab]')];
  assert.equal(list.getAttribute('aria-label'),'View');assert.ok(list.classList.contains('seg'),'it keeps the segmented look');
  assert.deepEqual(tabs().map(tab=>tab.getAttribute('tabindex')),['0','-1','-1']);
  assert.deepEqual(tabs().map(tab=>tab.getAttribute('aria-selected')),['true','false','false']);
  tabs()[0].focus();
  await key('ArrowRight');assert.equal(focused()?.textContent,'Table');assert.deepEqual(chosen,['table']);
  assert.deepEqual(tabs().map(tab=>tab.getAttribute('tabindex')),['-1','0','-1']);assert.ok(tabs()[1].classList.contains('on'));
  await key('End');assert.equal(focused()?.textContent,'Calendar');
  await key('ArrowRight');assert.equal(focused()?.textContent,'Board','arrows wrap');
  await key('ArrowLeft');await key('Home');assert.deepEqual(chosen,['table','calendar','board','calendar','board']);
 }finally{await ui.close();}
});

test('Select: named by its label, opens from the keyboard, arrows and Enter choose, Escape keeps the value, and focus returns to it',async()=>{
 const chosen:string[]=[];
 const Host=()=>{const [value,setValue]=useState('30');return createElement('div',{className:'club-root'},createElement(Select,{label:'Frame rate',value,onChange:(next:string)=>{chosen.push(next);setValue(next);},options:[{value:'24',label:'24 fps'},{value:'30',label:'30 fps'},{value:'60',label:'60 fps'}]}));};
 const ui=await mountUI(createElement(Host));
 try{
  const c=ui.container,trigger=c.querySelector<HTMLElement>('[data-slot=select-trigger]')!;
  assert.equal(trigger.getAttribute('aria-label'),'Frame rate');assert.equal(trigger.getAttribute('aria-haspopup'),'listbox');assert.equal(trigger.textContent,'30 fps');
  const open=()=>c.querySelector('[role=listbox]:not([hidden])');
  trigger.focus();await key('ArrowDown');await flush();
  const list=open()!;
  assert.ok(list,'ArrowDown opens the list');assert.ok(list.parentElement===c.firstElementChild,'drawn in the club root');
  assert.equal(c.querySelector('[role=option][aria-selected=true]')?.textContent,'30 fps');
  await key('ArrowDown');await key('Enter');await flush();
  assert.deepEqual(chosen,['60']);assert.ok(!open(),'Enter closes the list');assert.ok(focused()===trigger,'focus is back on the trigger');assert.equal(trigger.textContent,'60 fps');
  await key('ArrowDown');await flush();await key('ArrowUp');await key('Escape');await flush();
  assert.deepEqual(chosen,['60'],'Escape chooses nothing');assert.ok(!open());assert.ok(focused()===trigger);
  await chooseOption(c,'Frame rate','24 fps');assert.deepEqual(chosen,['60','24']);
 }finally{await ui.close();}
});

test('the channel switcher: radio rows with the current channel checked, arrows move, Enter switches, Escape returns focus',async()=>{
 const ws=(slug:string,name:string):Workspace=>({slug,name,handle:`@${slug}`,channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'} as unknown as Workspace);
 const workspaces=[ws('samin','Samin Yasar'),ws('ana','Ana')],picked:string[]=[];let added=0;
 const ui=await mountUI(createElement('div',{className:'club-root'},createElement(ChannelMenu,{channels:{workspaces},current:workspaces[0],onChoose:slug=>picked.push(slug),onAdd:()=>added++,trigger:createElement('button',{type:'button','aria-label':'Switch channel'},'Samin Yasar')})));
 try{
  const c=ui.container,trigger=button(c,'Samin Yasar');
  assert.equal(trigger.getAttribute('aria-haspopup'),'menu');
  trigger.focus();await key('ArrowDown');await flush();
  const menu=c.querySelector('[role=menu]')!;
  assert.equal(menu.getAttribute('aria-label'),'Channels');
  assert.deepEqual([...menu.querySelectorAll('[role=menuitemradio]')].map(item=>[item.textContent,item.getAttribute('aria-checked')]),[['SYSamin Yasar','true'],['ANAna','false']]);
  assert.equal(focused()?.textContent,'SYSamin Yasar','ArrowDown opens on the first row');
  await key('ArrowDown');assert.equal(focused()?.textContent,'ANAna');
  await key('ArrowDown');assert.equal(focused()?.textContent,'Add a channel');
  await key('Escape');assert.ok(!c.querySelector('[role=menu]'));assert.ok(focused()===trigger);
  await key('ArrowDown');await flush();await key('a');assert.equal(focused()?.textContent,'ANAna','typing a name jumps to it');
  await key('Enter');await flush();
  assert.deepEqual(picked,['ana']);assert.ok(!c.querySelector('[role=menu]'));assert.ok(focused()===trigger);
  await key('ArrowUp');await flush();assert.equal(focused()?.textContent,'Add a channel','ArrowUp opens on the last row');
  await key('Enter');await flush();assert.equal(added,1);
 }finally{await ui.close();}
});

test('Dialog: named by its title and description, focus stays inside while it is open, and closing gives focus back to the opener',async()=>{
 const Host=()=>{const [open,setOpen]=useState(false);return createElement('div',null,createElement('button',{onClick:()=>setOpen(true)},'Delete video'),
  createElement(Dialog,{open,title:'Delete this video?',description:'You can undo it for a few seconds.',onClose:()=>setOpen(false),footer:createElement('button',{onClick:()=>setOpen(false)},'Cancel')}));};
 const ui=await mountUI(createElement(Host));
 try{
  const opener=button(ui.container,'Delete video');opener.focus();await act(async()=>opener.click());await flush();
  const dialog=document.querySelector<HTMLElement>('[role=dialog]')!;
  assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent,'Delete this video?');
  assert.equal(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent,'You can undo it for a few seconds.');
  assert.ok(focused()===dialog,'the panel takes focus, not its first button');
  await act(async()=>opener.focus());await flush();
  assert.ok(dialog.contains(focused()),'focus cannot leave the modal for the page behind it');
  await act(async()=>button(dialog,'Cancel').focus());
  await act(async()=>(focused() as HTMLElement).click());await flush();
  assert.ok(!document.querySelector('[role=dialog]'));assert.ok(focused()===opener);
 }finally{await ui.close();}
});

test('the ⌘K palette: a named dialog with a combobox over a listbox, arrows highlight without leaving the field, Enter opens',async()=>{
 const video=(id:string,title:string):Video=>({id,title,stage:'planning',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:`2026-10-0${id.length}T00:00:00.000Z`,stageDates:{},planning:{research:false,package:false,outline:false}} as Video);
 const opened:unknown[]=[];let closed=0;
 const ui=await mountUI(createElement('div',{className:'club-root'},createElement(Palette,{videos:[video('a','Alpha'),video('bb','Bravo')],onClose:()=>closed++,onOpen:route=>opened.push(route),onNewVideo(){},onHelp(){}})));
 try{
  await flush();
  const dialog=document.querySelector('[role=dialog]')!,input=dialog.querySelector('input')!;
  assert.equal(dialog.getAttribute('aria-label'),'Search');assert.equal(dialog.getAttribute('aria-modal'),'true');
  assert.equal(input.getAttribute('role'),'combobox');assert.ok(focused()===input,'focus starts in the field');
  assert.equal(document.getElementById(input.getAttribute('aria-controls')!)?.getAttribute('role'),'listbox');
  const highlighted=()=>document.getElementById(input.getAttribute('aria-activedescendant')??'')?.querySelector('.po-label')?.textContent;
  assert.equal(highlighted(),'New video','the first result is ready for Enter');
  await key('ArrowDown');assert.equal(highlighted(),'Add a channel');assert.ok(focused()===input,'the highlight moves, focus stays');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'alpha');input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(highlighted(),'Alpha','typing highlights the best match');
  await key('Enter');await flush();
  assert.deepEqual(opened,[{name:'video',id:'a',tab:'idea'}]);assert.equal(closed,1);
 }finally{await ui.close();}
});
