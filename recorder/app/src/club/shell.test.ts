import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {default:ClubApp}=await import('./ClubApp');
const {Sidebar,inProduction,openIdeas}=await import('./Sidebar');
const {paletteOptions}=await import('./shell/Palette');
const {ScreenBoundary}=await import('./shell/ScreenBoundary');

const ws=(slug:string,name:string,handle=`@${slug}`)=>({slug,name,handle,channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'});
const video=(id:string,title:string,stage:Video['stage'],extra:Partial<Video>={}):Video=>({id,title,stage,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...extra});
const videos=[
 video('i1','Claude for receipts','ideas'),
 video('i2','Put off idea','ideas',{hidden:'later'}),
 video('p1','Hidden features in Claude Code','planning',{updatedAt:'2026-10-05T00:00:00.000Z'}),
 video('r1','Agents for small shops','recording',{updatedAt:'2026-10-07T00:00:00.000Z'}),
 video('d1','Already out','published',{youtubeUrl:'https://youtu.be/dQw4w9WgXcQ'}),
];
const signedIn={claude:{installed:true,version:'2',signedIn:true},codex:{installed:false,version:null,signedIn:false}};

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await flush();};
const hashTo=async(hash:string)=>{window.location.hash=hash;await act(async()=>{window.dispatchEvent(new Event('hashchange'));});await flush();};
const keyDown=async(target:EventTarget,key:string,init:KeyboardEventInit={})=>act(async()=>{target.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...init}));});
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});

type Server={videos:Video[];workspaces:ReturnType<typeof ws>[];current:string|null;welcomed:boolean};
const serve=(server:Server)=>(call:FakeCall):FakeReply=>{
 const {path,method}=call;
 if(path==='/ai/status')return {body:signedIn};
 if(path==='/workspaces'&&method==='GET')return {body:{current:server.current,workspaces:server.workspaces}};
 const current=path.match(/^\/workspaces\/(\w+)\/current$/);
 if(current){server.current=current[1];return {body:{current:current[1]}};}
 if(path==='/videos'&&method==='GET')return {body:server.current?server.videos:[]};
 if(path==='/videos'&&method==='POST'){const created=video('new1',(call.body as {title:string}).title,'ideas');server.videos=[...server.videos,created];return {status:201,body:created};}
 if(path==='/recent')return {body:[]};
 if(path==='/settings')return {body:{defaultAi:'claude',welcomed:server.welcomed}};
 const one=path.match(/^\/videos\/(\w+)$/);
 if(one)return {body:server.videos.find(v=>v.id===one[1])};
 if(/\/opened$/.test(path))return {status:204};
 if(/\/plan$/.test(path))return {body:{package:null,outline:null}};
 if(/\/research$/.test(path))return {body:[]};
};
const withApp=async(hash:string,run:(ui:Awaited<ReturnType<typeof mountUI>>,server:Server,calls:FakeCall[])=>Promise<void>,patch:Partial<Server>={})=>{
 FakeEventSource.install();
 const server:Server={videos,workspaces:[ws('samin','Samin Yasar'),ws('ana','Ana','')],current:'samin',welcomed:true,...patch};
 const fake=installFetch(serve(server));
 window.location.hash=hash;
 const ui=await mountUI(createElement(ClubApp));
 try{await flush();await run(ui,server,fake.calls);}finally{await ui.close();fake.restore();window.location.hash='';}
};
const navItems=(c:Element)=>[...c.querySelectorAll('.sidebar a.nav-item')].map(a=>a.querySelector('.label')!.textContent);

test('the sidebar lists the five places, then Settings, with counts for ideas and videos in production',async()=>{
 await withApp('#/overview',async ui=>{
  const c=ui.container;
  assert.deepEqual(navItems(c),['Overview','Ideas','Working now','Signals','Production','Settings']);
  assert.deepEqual([...c.querySelectorAll('.sidebar .nav-item')].map(a=>a.getAttribute('href')),['#/overview','#/ideas','#/trending','#/signals','#/production','#/settings',null,null]);
  const counts=Object.fromEntries([...c.querySelectorAll('.sidebar a.nav-item')].map(a=>[a.querySelector('.label')!.textContent,a.querySelector('.count')?.textContent]));
  assert.deepEqual(counts,{Overview:undefined,Ideas:'1',['Working now']:undefined,Signals:undefined,Production:'2',Settings:undefined});
  assert.equal(c.querySelector('.sidebar a[aria-current="page"]')!.textContent,'Overview');
  assert.deepEqual([...c.querySelectorAll('.sb-video .t')].map(t=>t.textContent),['Agents for small shops','Hidden features in Claude Code'],'in production, the video touched last first');
  assert.equal(c.querySelector('.sb-label')!.textContent,'In production');
  assert.match(c.querySelector('.channel-btn')!.textContent!,/Samin Yasar@samin/);
 });
});

test('the sidebar counts and orders from the videos it is given',()=>{
 assert.deepEqual(openIdeas(videos).map(v=>v.id),['i1']);
 assert.deepEqual(inProduction(videos).map(v=>v.id),['r1','p1']);
 assert.deepEqual(inProduction([]),[]);
});

test('Ideas, Working now and Signals open on the Empty placeholder with their title; nothing is made up',async()=>{
 for(const [hash,title,item] of [['#/overview','Overview','Overview'],['#/ideas','Ideas','Ideas'],['#/trending','Working now','Working now'],['#/signals','Signals','Signals']]){
  await withApp(hash,async ui=>{
   const c=ui.container;
   assert.equal(c.querySelector('main .empty h3')!.textContent,title,hash);
   assert.equal(c.querySelector('.sidebar a[aria-current="page"] .label')!.textContent,item);
  });
 }
});

test('the collapse button folds the sidebar to icons and back, and a new page forgets the choice',async()=>{
 await withApp('#/overview',async ui=>{
  const c=ui.container;
  assert.equal(c.querySelector('.sidebar.collapsed'),null);
  await press(c.querySelector('[aria-label="Collapse sidebar"]')!);
  assert.ok(c.querySelector('.sidebar.collapsed'));
  assert.equal(c.querySelector('.sidebar a[href="#/ideas"]')!.getAttribute('aria-label'),'Ideas','an icon with no label still has a name');
  await press(c.querySelector('[aria-label="Expand sidebar"]')!);
  assert.equal(c.querySelector('.sidebar.collapsed'),null);
  await press(c.querySelector('[aria-label="Collapse sidebar"]')!);
  await hashTo('#/ideas');
  assert.equal(c.querySelector('.sidebar.collapsed'),null,'going elsewhere opens it again');
 });
});

test('a video opens on the tab for its stage, the sidebar folds itself on Record and Edit, and the choice can be undone there',async()=>{
 await withApp('#/video/p1',async ui=>{
  const c=ui.container;
  assert.equal(window.location.hash,'#/video/p1/plan','planning opens on Plan');
  assert.equal(c.querySelector('.sidebar.collapsed'),null);
  assert.equal(c.querySelector('.sb-video.active .t')!.textContent,'Hidden features in Claude Code');
  await hashTo('#/video/r1');
  assert.equal(window.location.hash,'#/video/r1/record','recording opens on Record');
  assert.ok(c.querySelector('.sidebar.collapsed'),'and folds the sidebar');
  await press(c.querySelector('[aria-label="Expand sidebar"]')!);
  assert.equal(c.querySelector('.sidebar.collapsed'),null,'you can open it on Record');
  await hashTo('#/video/i1');
  assert.equal(window.location.hash,'#/video/i1/board','an idea opens on Board');
 });
});

test('the old board and onboarding links land on Production and the welcome screen',async()=>{
 await withApp('#/board',async ui=>{
  assert.equal(window.location.hash,'#/production');
  assert.equal(ui.container.querySelector('.sidebar a[aria-current="page"] .label')!.textContent,'Production');
  await hashTo('#/onboarding');
  assert.equal(window.location.hash,'#/welcome');
  assert.equal(ui.container.querySelector('.sidebar'),null,'first launch uses the whole window');
 });
});

test('switching channel tells the server, reloads the sidebar and goes to the overview',async()=>{
 await withApp('#/ideas',async (ui,server,calls)=>{
  const c=ui.container;
  await press(c.querySelector('.channel-btn')!);
  await press([...c.querySelectorAll('[role="menuitemradio"]')].find(i=>i.textContent!.trim()==='Ana')!);
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.path),['/workspaces/ana/current']);
  assert.equal(server.current,'ana');
  assert.equal(window.location.hash,'#/overview');
  assert.match(c.querySelector('.channel-btn')!.textContent!,/AnaStarting fresh/,'a channel with no handle says so');
  await press(c.querySelector('.channel-btn')!);
  await press([...c.querySelectorAll('[role="menuitem"]')].find(i=>i.textContent!.trim()==='Add a channel')!);
  assert.equal(window.location.hash,'#/welcome');
 });
});

test('Cmd+K opens search over pages and videos; typing filters, arrows and Enter open one, Escape closes',async()=>{
 await withApp('#/overview',async ui=>{
  const c=ui.container;
  assert.equal(c.querySelector('.palette'),null);
  await keyDown(window,'k',{metaKey:true});
  assert.ok(c.querySelector('.palette'));assert.equal(document.activeElement,c.querySelector('.palette input'));
  const options=()=>[...c.querySelectorAll('.palette .po')].map(o=>o.textContent);
  assert.ok(options().includes('New videoAction'));assert.ok(options().includes('Hidden features in Claude CodePlanning'));assert.ok(options().includes('Claude for receiptsIdeas'));
  await type(c.querySelector('.palette input')!,'hidden');
  assert.deepEqual(options(),['Hidden features in Claude CodePlanning']);
  await keyDown(c.querySelector('.palette input')!,'Enter');
  assert.equal(c.querySelector('.palette'),null);assert.equal(window.location.hash,'#/video/p1/plan');
  await keyDown(window,'k',{ctrlKey:true});
  await type(c.querySelector('.palette input')!,'zzz');
  assert.match(c.querySelector('.palette .po')!.textContent!,/Nothing matches "zzz"\. Try a word from the title\./);
  await keyDown(c.querySelector('.palette input')!,'Escape');
  assert.equal(c.querySelector('.palette'),null);
  await press(c.querySelector('.sb-search')!);
  assert.ok(c.querySelector('.palette'),'the Search button opens it too');
 });
});

test('search sends an idea to Ideas and any other video to the tab for its stage',()=>{
 const routes=Object.fromEntries(paletteOptions(videos,'').filter(option=>option.kind!=='Page'&&option.kind!=='Action').map(option=>[option.label,option.route]));
 assert.deepEqual(routes['Claude for receipts'],{name:'ideas',open:'i1'});
 assert.deepEqual(routes['Hidden features in Claude Code'],{name:'video',id:'p1',tab:'plan'});
 assert.deepEqual(routes['Agents for small shops'],{name:'video',id:'r1',tab:'record'});
 assert.deepEqual(routes['Already out'],{name:'video',id:'d1',tab:'publish'});
 assert.equal(paletteOptions(videos,'RECEIPTS').length,1,'search ignores case');
 assert.equal(paletteOptions(Array.from({length:60},(_,n)=>video(`v${n}`,`Video ${n}`,'ideas')),'video').length,40,'at most forty results');
});

test('New video: a link opens Break down in Ideas, a title creates a real video and opens its Board',async()=>{
 await withApp('#/overview',async (ui,server,calls)=>{
  const c=ui.container;
  await keyDown(window,'k',{metaKey:true});
  await type(c.querySelector('.palette input')!,'new video');
  await keyDown(c.querySelector('.palette input')!,'Enter');
  const dialog=()=>c.querySelector('[role="dialog"]');
  assert.match(dialog()!.textContent!,/New video/);
  assert.deepEqual([...dialog()!.querySelectorAll('.topt b')].map(b=>b.textContent),['Break down a video','Start from a title']);
  assert.equal((button(dialog()!,'Break down') as HTMLButtonElement).disabled,true,'nothing to break down yet');
  await type(dialog()!.querySelector('input')!,'not a link');
  await press(button(dialog()!,'Break down'));
  assert.match(c.querySelector('.cc-toast')!.textContent!,/That doesn't look like a video link\. Paste the full address\./);
  assert.ok(dialog(),'the dialog stays so the link can be fixed');
  await type(dialog()!.querySelector('input')!,'https://youtu.be/dQw4w9WgXcQ?si=x');
  await press(button(dialog()!,'Break down'));
  assert.equal(dialog(),null);assert.equal(window.location.hash,'#/ideas?bd=dQw4w9WgXcQ');
  assert.equal(calls.filter(call=>call.method==='POST'&&call.path==='/videos').length,0,'a link creates nothing by itself');

  await keyDown(window,'k',{metaKey:true});
  await type(c.querySelector('.palette input')!,'new video');
  await keyDown(c.querySelector('.palette input')!,'Enter');
  await press([...dialog()!.querySelectorAll('.topt')].find(o=>/Start from a title/.test(o.textContent!))!);
  await type(dialog()!.querySelector('input')!,'  Claude does my taxes  ');
  await press(button(dialog()!,'Add idea'));
  assert.deepEqual(calls.filter(call=>call.method==='POST'&&call.path==='/videos').map(call=>call.body),[{title:'Claude does my taxes'}]);
  assert.equal(dialog(),null);assert.equal(window.location.hash,'#/video/new1/board');
  assert.ok(server.videos.some(v=>v.id==='new1'));
 });
});

test('New video: a failed save says one sentence and keeps what was typed',async()=>{
 FakeEventSource.install();
 const server:Server={videos,workspaces:[ws('samin','Samin')],current:'samin',welcomed:true};
 const fake=installFetch(call=>call.path==='/videos'&&call.method==='POST'?{status:500,body:{error:"Couldn't save that."}}:serve(server)(call));
 window.location.hash='#/overview';
 const ui=await mountUI(createElement(ClubApp));
 try{
  await flush();const c=ui.container;
  await keyDown(window,'k',{metaKey:true});await type(c.querySelector('.palette input')!,'new video');await keyDown(c.querySelector('.palette input')!,'Enter');
  await press([...c.querySelectorAll('.topt')].find(o=>/Start from a title/.test(o.textContent!))!);
  await type(c.querySelector('[role="dialog"] input')!,'My video');
  await press(button(c.querySelector('[role="dialog"]')!,'Add idea'));
  assert.match(c.querySelector('.cc-toast')!.textContent!,/Couldn't save that\./);
  assert.equal((c.querySelector('[role="dialog"] input') as HTMLInputElement).value,'My video');
  assert.equal(window.location.hash,'#/overview');
 }finally{await ui.close();fake.restore();window.location.hash='';}
});

test('How it works opens the dialog from the sidebar',async()=>{
 await withApp('#/overview',async ui=>{
  const c=ui.container;
  assert.equal(c.querySelector('[role="dialog"]'),null);
  await press(c.querySelector('[aria-label="How CreatorClub works"]')!);
  assert.match(c.querySelector('[role="dialog"]')!.textContent!,/How CreatorClub works/);
  await press(button(c.querySelector('[role="dialog"]')!,'Start'));
  assert.equal(c.querySelector('[role="dialog"]'),null);
 });
});

test('a screen that fails to draw shows one sentence and Try again, never the error',async()=>{
 const error=console.error;const logged:unknown[]=[];console.error=(...args:unknown[])=>{logged.push(args);};
 let broken=true;
 const Screen=()=>{if(broken)throw new Error('secret internals');return createElement('p',null,'Fine now');};
 const ui=await mountUI(createElement(ScreenBoundary,null,createElement(Screen)));
 try{
  const c=ui.container;
  assert.match(c.textContent!,/This screen couldn't load\./);assert.doesNotMatch(c.textContent!,/secret internals/);
  assert.ok(logged.length>0,'the error goes to the console');
  broken=false;await press(button(c,'Try again'));
  assert.equal(c.textContent,'Fine now');
 }finally{console.error=error;await ui.close();}
});

test('the sidebar rail keeps every place reachable by name',async()=>{
 const ui=await mountUI(createElement(Sidebar,{route:{name:'production',view:'board'},collapsed:true,onToggle(){},onSearch(){},onHelp(){},onSwitched(){},onAdd(){},videos,epoch:0}));
 const fake=installFetch(()=>undefined);
 try{
  await flush();
  const rail=ui.container.querySelector('.sidebar.collapsed')!;
  assert.deepEqual([...rail.querySelectorAll('a.nav-item')].map(a=>a.getAttribute('aria-label')),['Overview','Ideas','Working now','Signals','Production','Settings']);
  assert.equal(rail.querySelector('a[aria-current="page"]')!.getAttribute('aria-label'),'Production');
 }finally{await ui.close();fake.restore();}
});
