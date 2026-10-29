import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement,useState} from 'react';
const {Avatar,DraftThumb,Dialog,Drawer,Ed,Empty,Icon,iconNames,Level,Menu,MultChip,SceneDots,SceneStatus,SourceIcon,StagePill,Thumb,ToastProvider,useToast,TOAST_MS}=await import('./ui');

const press=(element:Element)=>act(async()=>(element as HTMLElement).click());
const key=(target:EventTarget,name:string)=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true}));});
const mouseDown=(target:EventTarget)=>act(async()=>{target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));});
const tick=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

test('every icon name renders an svg',async()=>{
 const ui=await mountUI(createElement('div',null,...iconNames.map(name=>createElement(Icon,{key:name,name}))));
 try{
  const svgs=ui.container.querySelectorAll('svg');assert.equal(svgs.length,iconNames.length);
  for(const svg of svgs){assert.ok(svg.querySelector('path,circle,rect,line,polyline,polygon,ellipse'),'drawn');assert.equal(svg.getAttribute('aria-hidden'),'true');}
  assert.ok(iconNames.includes('SquareKanban')&&iconNames.includes('House')&&iconNames.includes('CircleHelp'));
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
  const pill=c.querySelector('.stage-pill')!;assert.ok(pill.classList.contains('st-recording'));assert.equal(pill.textContent,'Recording');
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
  assert.match((second.querySelector('.tthumb') as HTMLElement).style.background,/linear-gradient/);
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

test('Menu opens under its button, runs an item and closes; Escape and a press outside close it too',async()=>{
 const ran:string[]=[];
 const ui=await mountUI(createElement('div',null,
  createElement('p',{id:'outside'},'Outside'),
  createElement(Menu,{items:[{header:'Channels'},{label:'Samin',check:true,fn:()=>ran.push('samin')},{label:'Ana',check:false,fn:()=>ran.push('ana')},'-',{label:'Delete',icon:'Trash2',danger:true,fn:()=>ran.push('delete')}],button:(toggle,open)=>createElement('button',{onClick:toggle,'aria-expanded':open},'Open')}),
 ));
 try{
  const c=ui.container;
  assert.equal(c.querySelector('[role="menu"]'),null);
  await press(button(c,'Open'));await tick();
  const menu=c.querySelector('[role="menu"]')!;
  assert.equal(menu.querySelector('.hd')!.textContent,'Channels');assert.ok(menu.querySelector('.sep'));
  const items=[...menu.querySelectorAll('[role^="menuitem"]')];
  assert.deepEqual(items.map(i=>i.getAttribute('role')),['menuitemradio','menuitemradio','menuitem']);assert.deepEqual(items.slice(0,2).map(i=>i.getAttribute('aria-checked')),['true','false']);
  assert.ok(items[0].querySelector('svg'),'the checked item has a tick');
  await press(items[1]);assert.deepEqual(ran,['ana']);assert.equal(c.querySelector('[role="menu"]'),null,'choosing closes it');
  await press(button(c,'Open'));await tick();assert.ok(c.querySelector('[role="menu"]'));
  await key(document,'Escape');assert.equal(c.querySelector('[role="menu"]'),null,'Escape closes it');
  await press(button(c,'Open'));await tick();
  await mouseDown(c.querySelector('#outside')!);assert.equal(c.querySelector('[role="menu"]'),null,'a press outside closes it');
  await press(button(c,'Open'));await tick();
  await mouseDown(c.querySelector('[role="menu"]')!);assert.ok(c.querySelector('[role="menu"]'),'a press inside does not');
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
  assert.equal(document.activeElement,dialog,'focus moves into the dialog');
  await key(document,'Escape');assert.equal(closed,1);
  await press(c.querySelector('.scrim')!);assert.equal(closed,2);
  await press(dialog.querySelector('[aria-label="Close"]')!);assert.equal(closed,3);
  await ui.render(createElement(Dialog,{open:false,title:'Hidden',onClose:()=>closed++}));
  assert.equal(c.querySelector('[role="dialog"]'),null);
  await ui.render(createElement(Drawer,{header:createElement('b',null,'Idea'),footer:createElement('button',null,'Plan it'),onClose:()=>closed++},createElement('p',null,'Body')));
  assert.equal(c.querySelector('.drawer .dh b')!.textContent,'Idea');assert.equal(c.querySelector('.drawer .db')!.textContent,'Body');
  await key(document,'Escape');assert.equal(closed,4);
  await press(c.querySelector('.drawer [aria-label="Close"]')!);assert.equal(closed,5);
  await press(c.querySelector('.scrim')!);assert.equal(closed,6);
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

test('the menu opens from the button\'s edge with fixed placement, so a parent that clips cannot cut it off',async()=>{
 const ui=await mountUI(createElement('div',{style:{overflow:'hidden',width:60}},createElement(Menu,{width:240,items:[{label:'Ana',fn(){}}],button:toggle=>createElement('button',{onClick:toggle},'Open')})));
 const box={left:10,right:50,top:20,bottom:50,width:40,height:30,x:10,y:20,toJSON(){return {};}};
 const original=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=()=>box as DOMRect;
 try{
  await press(button(ui.container,'Open'));
  const menu=ui.container.querySelector<HTMLElement>('[role="menu"]')!;
  assert.equal(menu.style.position,'fixed');assert.equal(menu.style.top,'56px');assert.equal(menu.style.left,'10px');assert.equal(menu.style.minWidth,'240px');
  await act(async()=>{window.dispatchEvent(new Event('resize'));});assert.equal(ui.container.querySelector('[role="menu"]'),null,'a resize closes it');
 }finally{Element.prototype.getBoundingClientRect=original;await ui.close();}
});

test('a menu that would run off the bottom of the window opens upward from its button',async()=>{
 const ui=await mountUI(createElement(Menu,{items:[{label:'Ana',fn(){}}],button:toggle=>createElement('button',{onClick:toggle},'Open')}));
 const rect=(top:number,bottom:number,height:number)=>({left:10,right:50,top,bottom,width:40,height,x:10,y:top,toJSON(){return {};}}) as DOMRect;
 const original=Element.prototype.getBoundingClientRect;
 Element.prototype.getBoundingClientRect=function(this:Element){return this.getAttribute('role')==='menu'?rect(0,0,200):rect(window.innerHeight-40,window.innerHeight-10,30);};
 try{
  await press(button(ui.container,'Open'));
  const menu=ui.container.querySelector<HTMLElement>('[role="menu"]')!;
  assert.equal(menu.style.top,'');assert.equal(menu.style.bottom,'46px');
 }finally{Element.prototype.getBoundingClientRect=original;await ui.close();}
});

test('a menu inside a card that lifts on hover is drawn in the club root, outside the card, and still runs its items',async()=>{
 const ran:string[]=[];
 const ui=await mountUI(createElement('div',{className:'club-root',id:'root'},
  createElement('div',{className:'card',id:'card',style:{transform:'translateY(-2px)'}},
   createElement(Menu,{items:[{label:'Skip',fn:()=>ran.push('skip')}],button:(toggle)=>createElement('button',{onClick:toggle},'Skip with a reason')}))));
 try{
  const c=ui.container;
  await press(button(c,'Skip with a reason'));await tick();
  const menu=c.querySelector('[role="menu"]')!;
  assert.ok(menu,'the menu opens');
  assert.equal(menu.closest('#card'),null,'it is not inside the card, whose transform would move a fixed menu');
  assert.equal(menu.parentElement!.id,'root');
  await press(button(menu,'Skip'));
  assert.deepEqual(ran,['skip'],'a press inside the menu is not a press outside it');
  assert.equal(c.querySelector('[role="menu"]'),null);
 }finally{await ui.close();}
});

test('an open menu closes when the page scrolls, and Tab from its button moves focus to its first item',async()=>{
 const ui=await mountUI(createElement('div',{className:'club-root'},
  createElement(Menu,{items:[{label:'First',fn(){}},{label:'Second',fn(){}}],button:(toggle)=>createElement('button',{onClick:toggle},'Open')})));
 try{
  const c=ui.container;
  await press(button(c,'Open'));await tick();
  assert.ok(c.querySelector('[role="menu"]'));
  await act(async()=>{button(c,'Open').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));});
  assert.equal(document.activeElement?.textContent,'First');
  await act(async()=>{window.dispatchEvent(new Event('scroll'));});
  assert.equal(c.querySelector('[role="menu"]'),null);
 }finally{await ui.close();}
});
