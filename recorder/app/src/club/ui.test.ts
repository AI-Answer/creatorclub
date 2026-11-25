import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
import {KIND_COLOR,takeKinds,trackKind} from './ui/kinds';
const {Avatar,DraftThumb,Dialog,Drawer,Ed,Empty,Icon,iconNames,Level,Menu,MultChip,SceneDots,SceneStatus,SourceIcon,StagePill,Thumb,ToastProvider,useToast,TOAST_MS}=await import('./ui');

const press=(element:Element)=>act(async()=>(element as HTMLElement).click());
const key=(target:EventTarget,name:string)=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true}));});
const mouseDown=(target:EventTarget)=>act(async()=>{target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));});
const pointerPress=(target:EventTarget)=>act(async()=>{for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])target.dispatchEvent(new (type.startsWith('pointer')?PointerEvent:MouseEvent)(type,{bubbles:true,cancelable:true,button:0,pointerType:'mouse'} as PointerEventInit));});
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('every icon name renders an svg',async()=>{
 const ui=await mountUI(createElement('div',null,...iconNames.map(name=>createElement(Icon,{key:name,name}))));
 try{
  const svgs=ui.container.querySelectorAll('svg');assert.equal(svgs.length,iconNames.length);
  for(const svg of svgs){assert.ok(svg.querySelector('path,circle,rect,line,polyline,polygon,ellipse'),'drawn');assert.equal(svg.getAttribute('aria-hidden'),'true');}
  assert.ok(iconNames.includes('production')&&iconNames.includes('home')&&iconNames.includes('help')&&iconNames.includes('companion'));
 }finally{await ui.close();}
});

test('the multiplier chip is coloured by band, says whose usual it is, and shows a grey dash when it is not known',async()=>{
 const ui=await mountUI(createElement('div',null,
  createElement(MultChip,{m:2.841,who:'Samin',label:true}),createElement(MultChip,{m:23.4,who:'you'}),createElement(MultChip,{m:60,onThumb:true}),
  createElement(MultChip,{m:null,who:'Ana',dash:true,label:true}),createElement(MultChip,{m:null}),createElement(MultChip,{m:0,dash:true}),
 ));
 try{
  const chips=[...ui.container.querySelectorAll('.chip')];
  assert.equal(chips.length,5,'unknown without dash shows nothing');
  assert.equal(chips[0].textContent,"2.84× vs Samin's usual");assert.ok(chips[0].classList.contains('b-blue'));assert.equal(chips[0].getAttribute('title'),"2.84× vs Samin's usual");
  assert.equal(chips[1].textContent,'23×');assert.ok(chips[1].classList.contains('b-orange'));assert.equal(chips[1].getAttribute('title'),'23× vs your usual');
  assert.ok(chips[2].classList.contains('b-red')&&chips[2].classList.contains('on-thumb'));assert.equal(chips[2].getAttribute('title'),'60× vs usual');
  assert.ok(chips[3].classList.contains('b-grey'));assert.match(chips[3].textContent!,/^— usual$/);assert.match(chips[3].getAttribute('title')!,/Ana's usual views aren't tracked yet/);
  assert.ok(chips[4].classList.contains('b-grey'));assert.equal(chips[4].textContent,'— ');
 }finally{await ui.close();}
});

test('Level, StagePill, Avatar, SourceIcon and Empty draw what the prototype draws',async()=>{
 const ui=await mountUI(createElement('div',null,
  createElement(Level,{label:'Demand',d:{level:'high',note:'Lots of searches'}}),createElement(Level,{label:'Gap'}),
  createElement(StagePill,{stage:'recording'}),createElement(Avatar,{name:'Samin Yasar',size:'lg',sq:true,color:'#123456'}),createElement(Avatar,{name:'Ana'}),
  createElement(SourceIcon,{source:'x'}),createElement(SourceIcon,{source:'reddit'}),
  createElement(Empty,{icon:'Lightbulb',title:'No ideas yet'},'Paste a link to start.'),
 ));
 try{
  const c=ui.container;
  const level=c.querySelector('.lvl')!;assert.ok(level.classList.contains('high'));assert.equal(level.getAttribute('title'),'Lots of searches');assert.equal(level.querySelectorAll('.bars i').length,3);assert.equal(c.querySelectorAll('.lvl').length,1,'no rating, no level');
  const pill=c.querySelector('.stage-pill')!;assert.ok(pill.classList.contains('stage-badge'));assert.ok(pill.querySelector('.col-dot.st-recording'));assert.equal(pill.textContent,'Recording');
  const avatars=c.querySelectorAll('.avatar');assert.equal(avatars[0].textContent,'SY');assert.ok(avatars[0].classList.contains('lg')&&avatars[0].classList.contains('sq'));assert.match((avatars[0] as HTMLElement).style.background,/^(#123456|rgb\(18, 52, 86\))$/);assert.equal(avatars[1].textContent,'AN');
  assert.equal(c.querySelector('.src-x')!.getAttribute('title'),'X');assert.equal(c.querySelector('.src-reddit')!.getAttribute('title'),'Reddit');
  const empty=c.querySelector('.empty')!;assert.equal(empty.querySelector('h3')!.textContent,'No ideas yet');assert.equal(empty.querySelector('p')!.textContent,'Paste a link to start.');assert.ok(empty.querySelector('.ic svg'));
 }finally{await ui.close();}
});

test('Thumb shows the YouTube picture and falls back to a draft thumbnail when it cannot load',async()=>{
 const ui=await mountUI(createElement('div',null,
  createElement(Thumb,{videoId:'abc123DEF45',text:'Title',seed:'v1',chip:createElement('i',{className:'the-chip'})}),
  createElement(Thumb,{text:'Draft words',seed:'v2'}),
  createElement(DraftThumb,{text:'Small',seed:'v3',small:true}),
 ));
 try{
  const [first,second]=ui.container.querySelectorAll('.thumb');
  const img=first.querySelector('img')!;assert.equal(img.getAttribute('src'),'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg');assert.ok(first.querySelector('.the-chip'));assert.equal(first.querySelector('.tthumb'),null);
  assert.equal(second.querySelector('img'),null);assert.equal(second.querySelector('.tt')!.textContent,'Draft words');
  assert.doesNotMatch((second.querySelector('.tthumb') as HTMLElement).style.background,/gradient/,'a plain card, never made-up art');
  await act(async()=>{img.dispatchEvent(new Event('error'));});
  assert.equal(first.querySelector('img'),null,'a broken picture becomes the draft');assert.equal(first.querySelector('.tt')!.textContent,'Title');
 }finally{await ui.close();}
});

test('scene dots follow the takes, and the scene status says the same words',async()=>{
 const scenes=[{takes:[{n:1,kept:true}],cut:2},{takes:[{n:1}]},{takes:[]}];
 const ui=await mountUI(createElement('div',null,createElement(SceneDots,{scenes}),createElement(SceneDots,{scenes:[]}),createElement(SceneDots,{scenes,pausesRemoved:true}),...scenes.map((scene,index)=>createElement(SceneStatus,{key:index,scene,pausesRemoved:index===0}))));
 try{
  const dots=ui.container.querySelectorAll('.dots');assert.equal(dots.length,2,'a video without scenes has no dots');
  assert.deepEqual([...dots[0].querySelectorAll('i')].map(i=>i.className),['kept','takes','none']);assert.equal(dots[0].getAttribute('title'),'1 of 3 scenes recorded');
  assert.deepEqual([...dots[1].querySelectorAll('i')].map(i=>i.className),['cut','takes','none']);
  assert.deepEqual([...ui.container.querySelectorAll('.sst')].map(s=>s.textContent),['Cut 2s','1 take','Not recorded']);
 }finally{await ui.close();}
});

test('Menu opens from its button, names its items by role, runs one and closes; Escape and a press outside close it too',async()=>{
 const ran:string[]=[];
 const ui=await mountUI(createElement('div',null,
  createElement('p',{id:'outside'},'Outside'),
  createElement(Menu,{label:'Channel',items:[{header:'Channels'},{label:'Samin',selected:true,fn:()=>ran.push('samin')},{label:'Ana',selected:false,fn:()=>ran.push('ana')},'-',{label:'Snap',check:true,fn:()=>ran.push('snap')},{label:'Delete',icon:'delete',danger:true,fn:()=>ran.push('delete')}],trigger:open=>createElement('button',{className:open?'on':undefined},'Open')}),
 ));
 try{
  const c=ui.container,open=button(c,'Open');
  assert.equal(open.getAttribute('aria-haspopup'),'menu');assert.equal(open.getAttribute('aria-expanded'),'false');
  assert.equal(c.querySelector('[role="menu"]'),null);
  await press(open);await tick();
  const menu=c.querySelector('[role="menu"]')!;
  assert.equal(open.getAttribute('aria-expanded'),'true');assert.equal(open.className,'on','the trigger is drawn with the open state');
  assert.equal(menu.getAttribute('aria-label'),'Channel');
  assert.equal(menu.querySelector('.hd')!.textContent,'Channels');assert.ok(menu.querySelector('.sep[role="separator"]'));
  const items=[...menu.querySelectorAll('[role^="menuitem"]')];
  assert.deepEqual(items.map(i=>i.getAttribute('role')),['menuitemradio','menuitemradio','menuitemcheckbox','menuitem']);
  assert.deepEqual(items.slice(0,3).map(i=>i.getAttribute('aria-checked')),['true','false','true']);
  assert.ok(items[0].querySelector('.menu-check svg'),'the chosen item has a tick');assert.equal(items[1].querySelector('.menu-check'),null);
  await press(items[1]);assert.deepEqual(ran,['ana']);assert.equal(c.querySelector('[role="menu"]'),null,'choosing closes it');
  await press(open);await tick();assert.ok(c.querySelector('[role="menu"]'));
  await key(document.activeElement!,'Escape');assert.equal(c.querySelector('[role="menu"]'),null,'Escape closes it');
  assert.equal(document.activeElement,open,'and gives focus back to the trigger');
  await press(open);await tick();
  await pointerPress(c.querySelector('#outside')!);assert.equal(c.querySelector('[role="menu"]'),null,'a press outside closes it');
  await press(open);await tick();
  await pointerPress(c.querySelector('[role="menu"] .hd')!);assert.ok(c.querySelector('[role="menu"]'),'a press inside does not');
 }finally{await ui.close();}
});

test('Menu keyboard: arrows and Home/End move through the items, typing finds one by name, Enter runs it, and focus goes back to the trigger',async()=>{
 const ran:string[]=[];
 const ui=await mountUI(createElement(Menu,{label:'Actions',items:[{label:'Rename',fn:()=>ran.push('rename')},{label:'Duplicate',fn:()=>ran.push('duplicate')},{label:'Archive',disabled:true,fn:()=>ran.push('archive')},{label:'Delete',fn:()=>ran.push('delete')}],trigger:()=>createElement('button',null,'Actions')}));
 try{
  const c=ui.container,trigger=button(c,'Actions');
  trigger.focus();await key(trigger,'ArrowDown');await tick();
  const focused=()=>document.activeElement?.textContent;
  assert.equal(focused(),'Rename','ArrowDown opens on the first item');
  await key(document.activeElement!,'ArrowDown');assert.equal(focused(),'Duplicate');
  await key(document.activeElement!,'End');assert.equal(focused(),'Delete');
  await key(document.activeElement!,'ArrowDown');assert.equal(focused(),'Rename','arrows wrap');
  await key(document.activeElement!,'ArrowUp');await key(document.activeElement!,'ArrowUp');assert.equal(focused(),'Archive','a disabled item stays reachable');
  assert.equal(document.activeElement!.getAttribute('aria-disabled'),'true');
  await key(document.activeElement!,'Enter');assert.deepEqual(ran,[],'but does not run');
  await key(document.activeElement!,'d');assert.equal(focused(),'Delete','typing jumps to the next item starting with it');
  await key(document.activeElement!,'Home');assert.equal(focused(),'Rename');
  await key(document.activeElement!,'Enter');await tick();
  assert.deepEqual(ran,['rename']);assert.equal(c.querySelector('[role="menu"]'),null);assert.equal(document.activeElement,trigger);
 }finally{await ui.close();}
});
test('Dialog closes on Escape, the scrim and Close; Drawer the same; neither draws when closed',async()=>{
 let closed=0;
 const ui=await mountUI(createElement(Dialog,{title:'New video',onClose:()=>closed++,footer:createElement('button',null,'Go')},createElement('input',{'aria-label':'Name'})));
 try{
  const c=ui.container;
  const dialog=c.querySelector('[role="dialog"]')!;
  assert.equal(dialog.getAttribute('aria-modal'),'true');assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent,'New video');
  assert.equal(c.querySelector('.df button')!.textContent,'Go');
  assert.equal(document.activeElement,dialog,'focus moves to the dialog without a control ring');
  await key(document,'Escape');assert.equal(closed,1);
  await pointerPress(c.querySelector('.scrim')!);assert.equal(closed,2);
  await press(dialog.querySelector('[aria-label="Close"]')!);assert.equal(closed,3);
  await ui.render(createElement(Dialog,{open:false,title:'Hidden',onClose:()=>closed++}));
  assert.equal(c.querySelector('[role="dialog"]'),null);
  await ui.render(createElement(Drawer,{header:createElement('b',null,'Idea'),footer:createElement('button',null,'Plan it'),onClose:()=>closed++},createElement('p',null,'Body')));
  assert.equal(c.querySelector('.drawer .dh b')!.textContent,'Idea');assert.equal(c.querySelector('.drawer .db')!.textContent,'Body');
  await key(document,'Escape');assert.equal(closed,4);
  await press(c.querySelector('.drawer [aria-label="Close"]')!);assert.equal(closed,5);
  await pointerPress(c.querySelector('.scrim')!);assert.equal(closed,6);
 }finally{await ui.close();}
});

test('Dialog gives focus back to what had it',async()=>{
 const Host=()=>{const [open,setOpen]=useState(false);return createElement('div',null,createElement('button',{onClick:()=>setOpen(true)},'Open'),createElement(Dialog,{open,title:'T',onClose:()=>setOpen(false)}));};
 const ui=await mountUI(createElement(Host));
 try{
  const opener=button(ui.container,'Open');opener.focus();await press(opener);
  assert.equal(document.activeElement,ui.container.querySelector('[role="dialog"]'));
  await key(document,'Escape');assert.equal(ui.container.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,opener);
 }finally{await ui.close();}
});

test('Ed saves on blur and on Enter, keeps line breaks when multiline, and Escape leaves it',async()=>{
 const saved:string[]=[],next:string[]=[];
 const ui=await mountUI(createElement('div',null,
  createElement(Ed,{value:'Old title',onChange:text=>saved.push(`single:${text}`),ph:'Title'}),
  createElement(Ed,{value:'',onChange:text=>saved.push(`multi:${text}`),multiline:true,ph:'Notes'}),
  createElement(Ed,{value:'Point',onChange:text=>saved.push(`point:${text}`),onEnter:()=>next.push('next'),ph:'Point'}),
 ));
 try{
  const [single,multi,point]=[...ui.container.querySelectorAll<HTMLElement>('.ed')];
  assert.equal(single.getAttribute('contenteditable'),'true');assert.equal(single.getAttribute('data-ph'),'Title');assert.equal(single.getAttribute('role'),'textbox');assert.equal(single.getAttribute('aria-label'),'Title');
  assert.equal(single.innerText,'Old title');
  single.focus();single.innerText='New title';
  await act(async()=>{single.blur();});assert.deepEqual(saved,['single:New title']);
  point.focus();await act(async()=>{point.blur();});assert.equal(saved.length,1,'text that did not change is not saved');
  single.focus();single.innerText='Entered';
  await key(single,'Enter');assert.deepEqual(saved.slice(1),['single:Entered'],'Enter saves');
  multi.focus();multi.innerText='Line one\nLine two';
  const enter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});await act(async()=>{multi.dispatchEvent(enter);});assert.equal(enter.defaultPrevented,false,'Enter makes a new line');
  await act(async()=>{multi.blur();});assert.match(saved.at(-1)!,/^multi:Line one\s*Line two$/);
  point.focus();point.innerText='Point two';await key(point,'Enter');assert.deepEqual(next,['next']);assert.equal(saved.at(-1),'point:Point two','onEnter saves first, then runs');
  single.focus();single.innerText='Esc';await key(single,'Escape');assert.equal(saved.at(-1),'single:Esc');
 }finally{await ui.close();}
});

test('toasts show a message, offer Undo or an action, and go away by themselves',async()=>{
 const log:string[]=[];
 const Trigger=()=>{const toast=useToast();return createElement('div',null,
  createElement('button',{onClick:()=>toast('Moved to Recording',{undo:()=>log.push('undo')})},'Move'),
  createElement('button',{onClick:()=>toast('Added to your ideas',{action:{label:'Open',fn:()=>log.push('open')}})},'Add'),
  createElement('button',{onClick:()=>toast('Saved')},'Save'));};
 const ui=await mountUI(createElement(ToastProvider,null,createElement(Trigger)));
 try{
  const c=ui.container;const toasts=()=>[...c.querySelectorAll('.cc-toast')].map(t=>t.textContent);
  assert.equal(c.querySelector('.cc-toasts')!.getAttribute('role'),'status');
  await press(button(c,'Move'));assert.deepEqual(toasts(),['Moved to RecordingUndo']);
  await press(button(c,'Undo'));assert.deepEqual(log,['undo']);assert.deepEqual(toasts(),[],'Undo runs and hides the toast');
  await press(button(c,'Add'));assert.deepEqual(toasts(),['Added to your ideasOpen']);await press(button(c,'Open'));assert.deepEqual(log,['undo','open']);assert.deepEqual(toasts(),[]);
  for(const _ of [1,2,3,4])await press(button(c,'Save'));
  assert.equal(toasts().length,3,'at most three at once');
  assert.ok(TOAST_MS.withButton>TOAST_MS.plain);
 }finally{await ui.close();}
});

test('a menu inside a card that lifts on hover is drawn in the club root, outside the card, and still runs its items',async()=>{
 const ran:string[]=[];
 const ui=await mountUI(createElement('div',{className:'club-root',id:'root'},
  createElement('div',{className:'card',id:'card',style:{transform:'translateY(-2px)',overflow:'hidden'}},
   createElement(Menu,{width:240,items:[{label:'Skip',fn:()=>ran.push('skip')}],trigger:()=>createElement('button',null,'Skip with a reason')}))));
 try{
  const c=ui.container;
  await press(button(c,'Skip with a reason'));await tick();
  const menu=c.querySelector<HTMLElement>('[role="menu"]')!;
  assert.ok(menu,'the menu opens');
  assert.equal(menu.closest('#card'),null,'it is not inside the card, whose transform would move a fixed menu');
  assert.equal(menu.parentElement!.id,'root');
  assert.equal(menu.getAttribute('popover'),'manual','it is drawn in the top layer, so no parent clips it');
  assert.equal(menu.style.position,'fixed');assert.equal(menu.style.minWidth,'240px');
  await press(button(menu,'Skip'));
  assert.deepEqual(ran,['skip'],'a press inside the menu is not a press outside it');
  assert.equal(c.querySelector('[role="menu"]'),null);
 }finally{await ui.close();}
});

test('a take chip names its kinds in the timeline order, with the timeline\'s colours',()=>{
 assert.deepEqual(takeKinds(['audio','camera','screen','screen']),['screen','camera','audio']);
 assert.deepEqual(takeKinds(['music','overlay']),['audio','graphics'],'music is audio and an overlay is graphics');
 assert.deepEqual(takeKinds([]),[]);
 assert.equal(trackKind('music'),'audio');
 assert.equal(KIND_COLOR[trackKind('camera')].color,'var(--kind-camera)','the same token the timeline paints with');
});

test('Task 14: a Menu with below scrolls inside the room under its button',async()=>{
 const ui=await mountUI(createElement(Menu,{below:true,items:Array.from({length:30},(_,i)=>({label:`Item ${i}`,fn(){}})),trigger:()=>createElement('button',null,'Open')}));
 try{
  await press(button(ui.container,'Open'));await tick();
  const menu=document.querySelector<HTMLElement>('[role=menu]')!;assert.equal(menu.style.maxHeight,'var(--available-height)');assert.equal(menu.style.overflowY,'auto');
 }finally{await ui.close();}
});
