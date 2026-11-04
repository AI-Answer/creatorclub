import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {default:ClubApp}=await import('./ClubApp');
const {Sidebar,inProduction}=await import('./Sidebar');
const {openIdeas}=await import('./ideas');
const {searchOptions}=await import('./search');
const {TOOLTIP_DELAY_MS}=await import('./ui');
const {ScreenBoundary}=await import('./shell/ScreenBoundary');
const {VIDEOS_CHANGED,changesVideos,clubFetch}=await import('./api');

const ws=(slug:string,name:string,handle=`@${slug}`)=>({slug,name,handle,channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'});
const video=(id:string,title:string,stage:Video['stage'],extra:Partial<Video>={}):Video=>({id,title,stage,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...extra});
const videos=[
 video('i1','Claude for receipts','ideas'),
 video('i2','Put off idea','ideas',{hidden:'later'}),
 video('p1','Hidden features in Claude Code','planning',{updatedAt:'2026-10-05T00:00:00.000Z',number:7}),
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
 if(path==='/trending')return {body:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}};
 if(path==='/signals')return {body:{items:[],updatedAt:null,errors:[]}};
 if(path==='/breakdowns'&&method==='GET')return {body:[]};
 if(path==='/settings')return {body:{defaultAi:'claude',welcomed:server.welcomed,helpSeen:['board']}};
 const move=path.match(/^\/videos\/(\w+)\/move$/);
 if(move){server.videos=server.videos.map(v=>v.id===move[1]?{...v,stage:(call.body as {stage:Video['stage']}).stage}:v);return {body:server.videos.find(v=>v.id===move[1])};}
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
 window.location.hash=hash;localStorage.removeItem('cc.openVideoTabs');
 const ui=await mountUI(createElement(ClubApp));
 try{await flush();await run(ui,server,fake.calls);}finally{await ui.close();fake.restore();window.location.hash='';}
};
const navItems=(c:Element)=>[...c.querySelectorAll('.sidebar a.nav-item')].map(a=>a.querySelector('.label')!.textContent);

test('the Video board nav is the switcher, Search and two places (Video board with the videos in progress); Settings and Help sit in the tab strip',async()=>{
 await withApp('#/home',async ui=>{
  const c=ui.container,bar=c.querySelector('.sidebar')!;
  assert.deepEqual(navItems(c),['Video board','Research']);
  assert.deepEqual([...bar.querySelectorAll('a.nav-item')].map(a=>a.getAttribute('href')),['#/home','#/discover']);
  const counts=Object.fromEntries([...bar.querySelectorAll('a.nav-item')].map(a=>[a.querySelector('.label')!.textContent,a.querySelector('.count')?.textContent]));
  assert.deepEqual(counts,{'Video board':'2',Research:undefined},'only Video board has a number: the videos in progress');
  assert.equal(bar.querySelector('a[aria-current="page"]')!.textContent,'Video board2');
  const strip=c.querySelector('.tabstrip')!;
  assert.deepEqual([...strip.querySelectorAll('.ts-icon')].map(el=>[el.tagName,el.getAttribute('aria-label')]),[['BUTTON','Help'],['A','Settings']],'Help and Settings on the right of the tab strip, as in Borumi');
  const help=strip.querySelector('[aria-label="Help"]')!;
  await act(async()=>{help.dispatchEvent(new window.PointerEvent('pointerover',{bubbles:true}));});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,TOOLTIP_DELAY_MS+50));});
  assert.match(c.querySelector('[role="tooltip"]')?.textContent??'',/Help/,'each has a tooltip');
  assert.equal(bar.querySelectorAll('.sb-video, .sb-label').length,0,'no list of videos: Videos and Home have them');
  assert.equal(bar.querySelectorAll('.sb-search').length,1,'Search once');
  const labels=[...bar.querySelectorAll('a,button')].map(el=>el.getAttribute('aria-label')||el.querySelector('.label')?.textContent||el.textContent!.trim());
  assert.equal(new Set(labels).size,labels.length,`nothing twice: ${labels.join(', ')}`);
  assert.match(c.querySelector('.channel-btn')!.textContent!,/Samin Yasar@samin/);
 });
});

test('no place appears twice on a screen: Home, Discover and Videos link to no other place by its name',async()=>{
 for(const hash of ['#/home','#/discover','#/videos']){
  await withApp(hash,async ui=>{
   const main=ui.container.querySelector('main')!;
   const named=[...main.querySelectorAll('a,button')].map(el=>(el.textContent??'').trim()).filter(label=>/^(Open )?(Home|Discover|Videos|Settings|Production|Ideas|Working now|Signals|Overview)$/.test(label));
   assert.deepEqual(named,[],hash);
  });
 }
});

test('the sidebar counts and orders from the videos it is given',()=>{
 assert.deepEqual(openIdeas(videos).map(v=>v.id),['i1']);
 assert.deepEqual(inProduction(videos).map(v=>v.id),['r1','p1']);
 assert.deepEqual(inProduction([]),[]);
});

test('Home, Discover and Videos open their own screens, and every old link lands on the new one with the sidebar on the right place',async()=>{
 for(const [hash,title,item,canonical] of [['#/home','Video board','Video board','#/home'],['#/discover','Research','Research','#/discover'],['#/videos','Videos','Video board','#/videos'],
  ['#/overview','Video board','Video board','#/home'],['#/ideas?filter=later','Videos','Video board','#/videos?group=later'],['#/trending','Research','Research','#/discover?show=youtube'],
  ['#/signals','Research','Research','#/discover'],['#/production/calendar','Videos','Video board','#/videos/calendar']]){
  await withApp(hash,async ui=>{
   const c=ui.container;
   assert.equal(window.location.hash,canonical,hash);
   assert.match(c.querySelector('main h1')!.textContent!,new RegExp(`^${title}`),hash);
   assert.equal(c.querySelector('.sidebar a[aria-current="page"] .label')!.textContent,item);
  });
 }
});

test('the pinned tab is always Video board, video tabs show stage dots, and + starts a new video',async()=>{
 await withApp('#/home',async ui=>{
  const c=ui.container;
  for(const [hash,label] of [['#/home','Home'],['#/discover','Discover'],['#/videos','Videos'],['#/research','Research']]){
   await hashTo(hash);
   assert.equal(c.querySelector('.ts-tab.on.home .ts-label')!.textContent,'Video board',hash);
   assert.equal(c.querySelector('.ts-tab.home a')!.getAttribute('href'),'#/home');
   assert.ok(c.querySelector('.sidebar'),`${hash} shows the Home nav`);
  }
  await hashTo('#/video/p1');
  assert.equal(c.querySelector('.sidebar'),null,'a video has no Home nav');
  const home=c.querySelector<HTMLAnchorElement>('.ts-tab.home .ts-label')!;
  assert.equal(home.textContent,'Video board','the pinned tab keeps its name');
  assert.equal(c.querySelector('.ts-tab:not(.home) .ts-stage')!.getAttribute('aria-label'),'Planning');
  assert.equal(c.querySelector('.ts-tab:not(.home) .ts-id')?.textContent,'CC-7','the tab shows the video ID');
  assert.equal(home.getAttribute('href'),'#/home','and opens the video Kanban');
  assert.equal(c.querySelector('.ts-tab.home .ts-close'),null,'it cannot be closed');
  assert.equal(c.querySelector('.tabstrip .ts-tab.home'),c.querySelector('.ts-tabs')!.firstElementChild,'it comes first');
  await press(c.querySelector('.tabstrip button.ts-new[aria-label="New video"]')!);
  assert.ok(c.ownerDocument.querySelector('[role="dialog"]'),'+ opens New video');
 });
});

test('a video opens on the tab for its stage, and each video opened gets its own tab',async()=>{
 await withApp('#/video/p1',async ui=>{
  const c=ui.container;
  assert.equal(window.location.hash,'#/video/p1/idea','planning opens on Idea');
  await hashTo('#/video/r1');
  assert.equal(window.location.hash,'#/video/r1/record','recording opens on Record');
  assert.equal(c.querySelectorAll('.ts-tab:not(.home)').length,2,'both videos are open as tabs');
  await hashTo('#/video/i1');
  assert.equal(window.location.hash,'#/video/i1/idea','an idea opens on Idea');
  await press(c.querySelector('.ts-tab.on .ts-close')!);
  assert.match(window.location.hash,/^#\/video\/r1/,'closing the current tab opens its neighbour');
 });
});

test('the old board and onboarding links land on Videos and the welcome screen',async()=>{
 await withApp('#/board',async ui=>{
  assert.equal(window.location.hash,'#/videos');
  assert.equal(ui.container.querySelector('.sidebar a[aria-current="page"] .label')!.textContent,'Video board');
  await hashTo('#/onboarding');
  assert.equal(window.location.hash,'#/welcome');
  assert.equal(ui.container.querySelector('.sidebar'),null,'first launch uses the whole window');
 });
});

test('switching channel tells the server, reloads the sidebar and goes Home',async()=>{
 await withApp('#/videos',async (ui,server,calls)=>{
  const c=ui.container;
  await press(c.querySelector('.channel-btn')!);
  await press([...c.querySelectorAll('[role="menuitemradio"]')].find(i=>i.querySelector('.grow')?.textContent==='Ana')!);
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.path),['/workspaces/ana/current']);
  assert.equal(server.current,'ana');
  assert.equal(window.location.hash,'#/home');
  assert.match(c.querySelector('.channel-btn')!.textContent!,/AnaStarting fresh/,'a channel with no handle says so');
  await press(c.querySelector('.channel-btn')!);
  await press([...c.querySelectorAll('[role="menuitem"]')].find(i=>i.textContent!.trim()==='Add a channel')!);
  assert.equal(window.location.hash,'#/welcome','the channel menu and the empty screens open Welcome the same way');
  assert.match(c.textContent!,/Step 1 of 4/);
 });
});

test('Cmd+K opens search over actions, steps, places, settings and videos; typing filters, arrows and Enter open one, Escape closes',async()=>{
 await withApp('#/home',async ui=>{
  const c=ui.container;
  assert.equal(c.querySelector('.palette'),null);
  await keyDown(window,'k',{metaKey:true});
  assert.ok(c.querySelector('.palette'));assert.ok(document.activeElement===c.querySelector('.palette input'));
  const options=()=>[...c.querySelectorAll('.palette .po .po-label')].map(o=>o.textContent);
  const kinds=()=>[...c.querySelectorAll('.palette .po .k')].map(o=>o.textContent);
  assert.deepEqual(options().slice(0,3),['New video','Add a channel','Help']);
  assert.ok(options().includes('Record')&&options().includes('Publish'),'the steps are listed');
  assert.ok(kinds().includes('Settings'),'settings groups are listed');
  assert.ok(!options().includes('First launch setup'),'no first launch entry');
  assert.ok(options().includes('Hidden features in Claude Code'));assert.ok(options().includes('Claude for receipts'));
  await type(c.querySelector('.palette input')!,'hidden');
  assert.deepEqual(options(),['Hidden features in Claude Code']);
  await keyDown(c.querySelector('.palette input')!,'Enter');
  assert.equal(c.querySelector('.palette'),null);assert.equal(window.location.hash,'#/video/p1/idea');
  await keyDown(window,'k',{ctrlKey:true});
  await type(c.querySelector('.palette input')!,'zzz');
  assert.match(c.querySelector('.palette .po')!.textContent!,/Nothing matches "zzz"\. Try a step, a setting or a word from the title\./);
  await keyDown(c.querySelector('.palette input')!,'Escape');
  assert.equal(c.querySelector('.palette'),null);
  await press(c.querySelector('.ts-logo')!);
  await press([...c.querySelectorAll<HTMLElement>('.menu button')].find(item=>item.textContent==='Search')!);
  assert.ok(c.querySelector('.palette'),'Search in the app menu opens it too, on any tab');
 });
});

test('search finds steps, settings groups, actions and help words, and a step opens on the video that is open',async()=>{
 await withApp('#/video/r1/record',async ui=>{
  const c=ui.container;
  await keyDown(window,'k',{metaKey:true});
  const input=()=>c.querySelector('.palette input')!;
  const first=()=>c.querySelector('.palette .po')!;
  for(const [word,expected] of [['help','Help'],['record','Record'],['publish','Publish'],['scene','Scene'],['channel','Channel']] as const){
   await type(input(),word);
   const labels=[...c.querySelectorAll('.palette .po .po-label')].map(o=>o.textContent);
   assert.ok(labels.length>0,`"${word}" finds something`);
   assert.ok(labels.includes(expected),`"${word}" finds ${expected}: ${labels.join(', ')}`);
  }
  await type(input(),'publish');
  assert.equal(first().querySelector('.po-label')!.textContent,'Publish');
  assert.match(first().textContent!,/Open it on "Agents for small shops"/);
  await keyDown(input(),'Enter');
  assert.equal(window.location.hash,'#/video/r1/publish','the step opens on the open video');
  await keyDown(window,'k',{metaKey:true});
  await type(input(),'followed');
  await keyDown(input(),'Enter');
  assert.equal(window.location.hash,'#/settings/followed','a settings group opens that section');
  await keyDown(window,'k',{metaKey:true});
  await type(input(),'scene');
  const scene=[...c.querySelectorAll('.palette .po')].find(o=>o.querySelector('.po-label')!.textContent==='Scene')!;
  await press(scene);
  assert.equal(c.querySelector('.palette'),null);
  assert.match(c.querySelector('[role="dialog"]')!.textContent!,/How Creator Compiler works/,'a word of help opens Help');
  assert.ok(c.querySelector('[data-topic="term:Scene"].on'),'at that word');
 });
});

test('search opens an idea in its drawer on Videos and any other video on the tab for its stage',()=>{
 const routes=Object.fromEntries(searchOptions(videos,'').filter(option=>option.id.startsWith('video:')).map(option=>[option.label,'route' in option.target?option.target.route:undefined]));
 assert.deepEqual(routes['Claude for receipts'],{name:'videos',view:'board',open:'i1'});
 assert.deepEqual(routes['Hidden features in Claude Code'],{name:'video',id:'p1',tab:'idea'});
 assert.deepEqual(routes['Agents for small shops'],{name:'video',id:'r1',tab:'record'});
 assert.deepEqual(routes['Already out'],{name:'video',id:'d1',tab:'publish'});
 assert.equal(searchOptions(videos,'RECEIPTS').length,1,'search ignores case');
 assert.equal(searchOptions(Array.from({length:60},(_,n)=>video(`v${n}`,`Video ${n}`,'ideas')),'video').length,40,'at most forty results');
});

test('Tab stays inside the search and the New video dialog, and focus goes back to where it was when they close',async()=>{
 await withApp('#/home',async ui=>{
  const c=ui.container;
  const opener=c.querySelector<HTMLElement>('.sb-search')!;
  opener.focus();
  await press(opener);
  const palette=c.querySelector('.palette')!;
  assert.ok(palette.contains(document.activeElement));
  await keyDown(document.activeElement!,'Tab');
  assert.ok(palette.contains(document.activeElement),'Tab does not leave search');
  await keyDown(document.activeElement!,'Tab',{shiftKey:true});
  assert.ok(palette.contains(document.activeElement),'nor Shift Tab');
  await keyDown(c.querySelector('.palette input')!,'Escape');
  assert.ok(document.activeElement===opener,'focus is back on the button that opened it');
  await press(button(c,'New video'));
  const dialog=c.querySelector('[role="dialog"]')!;
  const items=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input')];
  items[items.length-1].focus();
  await keyDown(document.activeElement!,'Tab');
  assert.ok(document.activeElement===items[0],'Tab from the last control goes to the first');
  items[0].focus();
  await keyDown(document.activeElement!,'Tab',{shiftKey:true});
  assert.ok(document.activeElement===items[items.length-1],'Shift Tab from the first goes to the last');
  await press(dialog.querySelector('[aria-label="Close"]')!);
  assert.equal(c.querySelector('[role="dialog"]'),null);
 });
});

test('New video offers planning and quick recording; planning keeps its title flow and link breakdown',async()=>{
 await withApp('#/home',async (ui,server,calls)=>{
  const c=ui.container;
  await keyDown(window,'k',{metaKey:true});
  await type(c.querySelector('.palette input')!,'new video');
  await keyDown(c.querySelector('.palette input')!,'Enter');
  const dialog=()=>c.querySelector('[role="dialog"]:not(.drawer)');
  assert.match(dialog()!.textContent!,/How would you like to start/);
  assert.deepEqual([...dialog()!.querySelectorAll('.new-start-card b')].map(b=>b.textContent),['Plan out this video','Quick recording']);
  assert.ok(dialog()!.textContent!.includes('Recent videos'));
  await press(dialog()!.querySelector('[aria-label="Plan out this video"]')!);
  assert.equal(button(dialog()!,'Start planning').disabled,true);

  await type(dialog()!.querySelector('input')!,'  Claude does my taxes  ');
  await press(button(dialog()!,'Start planning'));
  assert.deepEqual(calls.filter(call=>call.method==='POST'&&call.path==='/videos').map(call=>call.body),[{title:'Claude does my taxes'}]);
  assert.deepEqual(calls.filter(call=>call.path==='/videos/new1/move').map(call=>call.body),[{stage:'planning'}],'the idea is moved to planning at once');
  assert.equal(dialog(),null);assert.equal(window.location.hash,'#/video/new1/idea','straight to its Idea page: no Add idea, no banner to press');
  assert.ok(server.videos.some(v=>v.id==='new1'));

  await hashTo('#/home');
  await keyDown(window,'k',{metaKey:true});
  await type(c.querySelector('.palette input')!,'new video');
  await keyDown(c.querySelector('.palette input')!,'Enter');
  await press(dialog()!.querySelector('.new-breakdown')!);
  assert.equal((button(dialog()!,'Break down') as HTMLButtonElement).disabled,true,'nothing to break down yet');
  await type(dialog()!.querySelector('input')!,'not a link');
  await press(button(dialog()!,'Break down'));
  assert.match(c.querySelector('.cc-toast')!.textContent!,/That doesn't look like a video link\. Paste the full address\./);
  assert.ok(dialog(),'the dialog stays so the link can be fixed');
  await type(dialog()!.querySelector('input')!,'https://youtu.be/dQw4w9WgXcQ?si=x');
  await press(button(dialog()!,'Break down'));
  assert.equal(dialog(),null);assert.equal(window.location.hash,'#/videos','Videos starts the breakdown and leaves the address');
  assert.ok(c.querySelector('.drawer .bd'),'in a drawer');
  assert.deepEqual(calls.filter(call=>call.method==='POST'&&call.path==='/breakdowns').map(call=>call.body),[{url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}]);
  assert.equal(calls.filter(call=>call.method==='POST'&&call.path==='/videos').length,1,'a link creates nothing by itself');

  await keyDown(window,'k',{metaKey:true});
  await type(c.querySelector('.palette input')!,'new video');
  await keyDown(c.querySelector('.palette input')!,'Enter');
  await press(dialog()!.querySelector('.new-breakdown')!);
  await type(dialog()!.querySelector('input')!,'https://www.instagram.com/reel/C8aBcD_eFgH/');
  await press(button(dialog()!,'Break down'));
  assert.deepEqual(calls.filter(call=>call.method==='POST'&&call.path==='/breakdowns').map(call=>call.body).at(-1),{url:'https://www.instagram.com/reel/C8aBcD_eFgH/'},'an Instagram link works too');
 });
});

test('New video: a failed save says one sentence and keeps what was typed; an idea that could not start planning is kept and offered on Videos',async()=>{
 FakeEventSource.install();
 const server:Server={videos,workspaces:[ws('samin','Samin')],current:'samin',welcomed:true};
 let failMove=false;
 const fake=installFetch(call=>call.path==='/videos'&&call.method==='POST'&&!failMove?{status:500,body:{error:"Couldn't save that."}}:call.path==='/videos/new1/move'?{status:500,body:{error:'No.'}}:serve(server)(call));
 window.location.hash='#/home';
 const ui=await mountUI(createElement(ClubApp));
 try{
  await flush();const c=ui.container;
  await keyDown(window,'k',{metaKey:true});await type(c.querySelector('.palette input')!,'new video');await keyDown(c.querySelector('.palette input')!,'Enter');
  await press(c.querySelector('[aria-label="Plan out this video"]')!);
  await type(c.querySelector('[role="dialog"] input')!,'My video');
  await press(button(c.querySelector('[role="dialog"]')!,'Start planning'));
  assert.match(c.querySelector('.cc-toast')!.textContent!,/Couldn't save that\./);
  assert.equal((c.querySelector('[role="dialog"] input') as HTMLInputElement).value,'My video');
  assert.equal(window.location.hash,'#/home');
  failMove=true;
  await press(button(c.querySelector('[role="dialog"]')!,'Start planning'));
  assert.match([...c.querySelectorAll('.cc-toast')].at(-1)!.textContent!,/Added to your ideas, but couldn't start planning it\./);
  assert.equal(window.location.hash,'#/videos?new=new1','the idea is on Videos, marked, so planning can be started from there');
 }finally{await ui.close();fake.restore();window.location.hash='';}
});

test('Help is a real help: the four steps, the words, where things live and the shortcuts, with the Postiz price once',async()=>{
 await withApp('#/home',async ui=>{
  const c=ui.container;
  assert.equal(c.querySelector('[role="dialog"]'),null);
  await press(c.querySelector('.tabstrip [aria-label="Help"]')!);
  assert.ok(c.querySelector('.help-pop'),'Help opens Borumi\'s popover first');
  await press(c.querySelector('.help-pop .help-card')!);
  const dialog=c.querySelector('[role="dialog"]')!;
  const help=dialog.textContent!;
  assert.match(help,/How Creator Compiler works/);
  assert.deepEqual([...dialog.querySelectorAll('.help-steps.four b')].map(b=>b.textContent),['Idea','Record','Edit','Publish'],'the same four names as the tabs of a video');
  for(const word of ['Scene','Take','Package','Board','Idea','Talking points'])assert.ok([...dialog.querySelectorAll('dt')].some(dt=>dt.textContent===word),`${word} is explained`);
  assert.match(help,/Where things live/);assert.match(help,/⌘K/);assert.match(help,/Keyboard shortcuts/);
  assert.equal((help.match(/\$29 a month/g)??[]).length,1,'the Postiz price once');
  assert.match(help,/Postiz is the paid service that uploads your video to YouTube for you/);
  assert.match(help,/Open this again with Help/);
  assert.ok(![...dialog.querySelectorAll('button')].some(b=>b.textContent==='Start'),'no Start button that starts nothing');
  assert.equal(dialog.querySelectorAll('button.primary').length,0);
  await keyDown(document,'Escape');
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

test('the Video board nav lists two places and marks the current one',async()=>{
 const ui=await mountUI(createElement(Sidebar,{route:{name:'videos',view:'board'},onSearch(){},onSwitched(){},onAdd(){},videos,epoch:0}));
 const fake=installFetch(()=>undefined);
 try{
  await flush();
  const nav=ui.container.querySelector('.sidebar')!;
  assert.deepEqual([...nav.querySelectorAll('a.nav-item .label')].map(label=>label.textContent),['Video board','Research']);
  assert.equal(nav.querySelector('a[aria-current="page"] .label')!.textContent,'Video board');
 }finally{await ui.close();fake.restore();}
});

test('which writes count as changing a video',()=>{
 const yes:Array<[string,string]>=[['POST','/videos'],['POST','/videos/v1/move'],['PUT','/videos/v1'],['DELETE','/videos/v1'],['POST','/videos/v1/recorder'],['POST','/videos/v1/research'],['DELETE','/videos/v1/research/t1'],['POST','/breakdowns/b1/concepts/2/add'],['POST','/videos?x=1'],['PUT','/videos/v1/package/x'],['DELETE','/videos/v1/package'],['POST','/videos/v1/package/text'],['PUT','/videos/v1']];
 for(const [method,path] of yes)assert.equal(changesVideos(method,path),true,`${method} ${path}`);
 const no:Array<[string|undefined,string]>=[['GET','/videos'],[undefined,'/videos'],['POST','/videos/v1/opened'],['PATCH','/videos/v1/research/t1'],['POST','/videos/v1/companion'],['POST','/breakdowns'],['POST','/workspaces/ana/current'],['PUT','/settings'],['DELETE','/jobs/j1'],['POST','/videosx'],['PUT','/videos/v1/package'],['PUT','/videos/v1/outline?x=1'],['PUT','/videos/v1/script'],['PUT','/videos/v1/script/scene/s1']];
 for(const [method,path] of no)assert.equal(changesVideos(method,path),false,`${method} ${path}`);
});

test('the sidebar count follows a change saved to a video, without leaving the page',async()=>{
 await withApp('#/videos',async (ui,_server,calls)=>{
  const c=ui.container;
  const count=(label:string)=>c.querySelector(`.sidebar a[href="#/${label}"] .count`)?.textContent;
  assert.equal(count('home'),'2');
  await act(async()=>{await clubFetch('/videos/i1/move',{body:{stage:'planning'}});});await flush();
  assert.equal(window.location.hash,'#/videos','the route did not change');
  assert.equal(count('home'),'3');
  const loads=calls.filter(call=>call.path==='/videos'&&call.method==='GET').length;
  await act(async()=>{await clubFetch('/videos');});await flush();
  assert.equal(calls.filter(call=>call.path==='/videos'&&call.method==='GET').length,loads+1,'reading videos does not reload the sidebar');
 });
});

test('a failed write does not announce a change',async()=>{
 FakeEventSource.install();
 const fake=installFetch(()=>({status:500,body:{error:'No.'}}));
 let heard=0;const listen=()=>{heard++;};window.addEventListener(VIDEOS_CHANGED,listen);
 try{await assert.rejects(clubFetch('/videos/v1/move',{body:{stage:'ideas'}}));assert.equal(heard,0);}finally{window.removeEventListener(VIDEOS_CHANGED,listen);fake.restore();}
});

test('on the desktop app the tab strip is the window\'s drag region on every screen, and the screen starts right under it',async()=>{
 const bridge=Object.getOwnPropertyDescriptor(window,'sceneForge');
 Object.assign(window,{sceneForge:{}});
 try{
  for(const hash of ['#/home','#/discover','#/videos','#/settings']){
   await withApp(hash,async ui=>{
    assert.ok(ui.container.querySelector('.club-root')!.classList.contains('club-desktop'));
    assert.ok(ui.container.querySelector('.tabstrip.club-drag'),`${hash}: the tab strip drags the window`);
    assert.equal(ui.container.querySelectorAll('.main-drag').length,0,`${hash}: no second drag strip`);
    assert.equal(ui.container.querySelector('.main-col')!.firstElementChild!.tagName,'MAIN');
   });
  }
 }finally{if(bridge)Object.defineProperty(window,'sceneForge',bridge);else delete (window as {sceneForge?:unknown}).sceneForge;}
});

test('with no channel every screen shows one friendly state whose one button opens Welcome at step 1, and nothing that needs a channel is fetched',async()=>{
 await withApp('#/home',async (ui,_server,calls)=>{
  const c=ui.container;
  assert.equal(c.querySelector('.empty-state h2, h2')!.textContent,'Add your channel or start fresh');
  assert.equal(c.querySelector('[role="alert"]'),null,'no red error');
  assert.equal(calls.some(call=>['/videos','/trending','/signals','/recent'].includes(call.path)),false,'no request that needs a channel');
  await hashTo('#/discover');
  assert.equal(c.querySelector('h2')!.textContent,'Add your channel or start fresh');
  assert.deepEqual([...c.querySelectorAll('button,a')].filter(el=>/add (your|a) channel/i.test(el.textContent!+el.getAttribute('aria-label'))).map(el=>el.textContent),['Add your channel'],'one control adds a channel, the sidebar only says there is none');
  assert.match(c.querySelector('.sidebar .channel-btn')!.textContent!,/No channel yet/);
  await press(button(c,'Add your channel'));
  assert.equal(window.location.hash,'#/welcome');
  assert.match(c.textContent!,/Step 1 of 4/);
 },{workspaces:[],current:null});
});

test('before the channels load the switcher shows a neutral skeleton, never the "Starting fresh" placeholder with a "?" avatar',async()=>{
 let release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 FakeEventSource.install();
 const inner=serve({videos,workspaces:[ws('samin','Samin Yasar')],current:'samin',welcomed:true});
 const fake=installFetch(async call=>{if(call.path==='/workspaces'&&call.method==='GET')await gate;return inner(call);});
 window.location.hash='#/videos';
 const ui=await mountUI(createElement(ClubApp));
 try{
  await flush();
  const button=ui.container.querySelector('.channel-btn');
  if(button){
   assert.ok(!button.textContent!.includes('Starting fresh'));
   assert.ok(!button.textContent!.includes('?'));
  }
  release();await flush();await flush();
  assert.match(ui.container.querySelector('.channel-btn')!.textContent!,/Samin Yasar@samin/);
 }finally{release();await ui.close();fake.restore();window.location.hash='';}
});
