import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import {arrangeColumn} from '../../shared/club-board';
import {fakeScenes,installFetch,type FakeCall,type FakeReply} from './test-fakes';
import type {Route,VideosView} from './routes';
const {ToastProvider}=await import('./ui');
const {VideosScreen}=await import('./screens/VideosScreen');
const {default:ClubApp}=await import('./ClubApp');

const ws={slug:'maya',name:'Maya Lopez',handle:'',channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};
const mk=(id:string,over:Partial<Video>={}):Video=>({id,title:`Title ${id}`,stage:'ideas',order:0,createdAt:`2026-10-0${id.length}T00:00:00.000Z`,updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{ideas:'2026-10-01T00:00:00.000Z'},planning:{research:false,package:false,outline:false},...over});
const base=():Video[]=>[
 mk('a',{title:'Alpha',order:0}),mk('b',{title:'Bravo',order:1}),mk('c',{title:'Charlie',order:2,hidden:'later'}),mk('d',{title:'Delta',order:3,hidden:'skipped'}),
 mk('p',{title:'Planned',stage:'planning',stageDates:{planning:'2026-10-05T12:00:00.000Z'}}),
 mk('r',{title:'Recorded',stage:'recording',recorderProjectId:'proj1',publishDate:'2026-10-31',stageDates:{recording:'2026-10-07T12:00:00.000Z'}}),
 mk('x',{title:'Live',stage:'published',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ',publishedAt:'2026-10-14',views:12400}),
];
const projects=[{id:'proj1',name:'n',updatedAt:'',duration:0,mediaCount:0,sceneCount:5,takeCount:3,recordedSceneCount:2,thumbnailMediaId:'media1'}];

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const settle=async()=>{await flush();await flush();};
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await settle();};
const text=(el:Element|null)=>(el?.textContent??'').replace(/\s+/g,' ').trim();
const card=(c:Element,title:string)=>[...c.querySelectorAll<HTMLElement>('[data-card]')].find(el=>text(el).includes(title))!;
const column=(c:Element,stage:string)=>c.querySelector<HTMLElement>(`[data-column="${stage}"]`)!;
const cardIds=(el:Element)=>[...el.querySelectorAll('[data-card]')].map(card=>card.getAttribute('data-card-id'));
const dnd=(type:string,y=0)=>Object.assign(new Event(type,{bubbles:true,cancelable:true}),{dataTransfer:{effectAllowed:'',dropEffect:'',setData(){}},clientY:y});
const drag=async(el:Element,type:string,y?:number)=>act(async()=>{el.dispatchEvent(dnd(type,y));});
const dragTo=async(source:Element,target:Element,y=10_000)=>{await drag(source,'dragstart');await drag(target,'dragover',y);await drag(target,'drop',y);await drag(source,'dragend');await settle();};
const toasts=(c:Element)=>[...c.querySelectorAll('.cc-toast')].map(text);

type Server={videos:Video[];welcomed:boolean;failMove:boolean;failLoad:boolean;outlines:Record<string,number>;unreadable?:string[];holdScenes?:Promise<void>};
function serve(server:Server){
 const scenesReply=():FakeReply=>({body:fakeScenes(server.videos,{projects,outlines:server.outlines,unreadable:server.unreadable})});
 return (call:FakeCall):FakeReply|Promise<FakeReply>=>{
  const {path,method}=call;
  if(path==='/workspaces'&&method==='GET')return {body:{current:'maya',workspaces:[ws]}};
  if(path==='/videos'&&method==='GET')return server.failLoad?{status:500,body:{error:"Couldn't load your videos."}}:{body:server.videos};
  if(path==='/videos'&&method==='POST'){const body=call.body as {title:string;stage:Video['stage']};const made=mk(`added${server.videos.length}`,body);server.videos.push(made);return {status:201,body:made};}
  if(path==='/recent')return {body:[]};
  if(path==='/settings'&&method==='GET')return {body:{defaultAi:'claude',welcomed:server.welcomed}};
  if(path==='/settings/welcomed')return {body:{welcomed:true}};
  if(path==='/ai/status')return {body:{claude:{installed:true,version:'2',signedIn:true},codex:{installed:false,version:null,signedIn:false}}};
  if(path==='/breakdowns'&&method==='GET')return {body:[]};
  if(path==='/videos/scenes')return server.holdScenes?server.holdScenes.then(scenesReply):scenesReply();
  const move=path.match(/^\/videos\/(\w+)\/move$/);
  if(move){
   if(server.failMove)return {status:500,body:{error:"Couldn't save that."}};
   const body=call.body as {stage:Video['stage'];beforeId:string|null;stageDates?:Video['stageDates']},column=arrangeColumn(server.videos,move[1],body.stage,body.beforeId);
   server.videos=server.videos.map(v=>column.includes(v.id)?{...v,order:column.indexOf(v.id),...(v.id===move[1]&&{stage:body.stage,stageDates:body.stageDates??{...v.stageDates,[body.stage]:'2026-10-29T00:00:00.000Z'}})}:v);
   return {body:server.videos.find(v=>v.id===move[1])};
  }
  const put=path.match(/^\/videos\/(\w+)$/);
  if(put&&method==='PUT'){
   const patch=call.body as {publishDate?:string|null};
   server.videos=server.videos.map(v=>{if(v.id!==put[1])return v;const {publishDate:_old,...rest}=v;return patch.publishDate?{...rest,publishDate:patch.publishDate}:rest;});
   return {body:server.videos.find(v=>v.id===put[1])};
  }
 };
}
const withBoard=async(server:Partial<Server>,view:VideosView,run:(ui:Awaited<ReturnType<typeof mountUI>>,calls:FakeCall[],routes:Route[],state:Server,opened:{count:number})=>Promise<void>)=>{
 const state:Server={videos:base(),welcomed:true,failMove:false,failLoad:false,outlines:{p:3},...server},fake=installFetch(serve(state));
 const routes:Route[]=[],opened={count:0};
 const ui=await mountUI(createElement(ToastProvider,null,createElement(VideosScreen,{route:{name:'videos',view},navigate:route=>routes.push(route),onNewVideo:()=>{opened.count++;}})));
 try{await settle();await run(ui,fake.calls,routes,state,opened);}finally{await ui.close();fake.restore();}
};

test('Board: six flat lanes, compact cards, counts, no idea subgroups, and direct video opening',async()=>{
 await withBoard({},'board',async(ui,calls,routes,_,opened)=>{
  const c=ui.container;
  assert.equal(c.querySelectorAll('[data-column]').length,6);
  assert.equal(c.querySelector('.igroup-h'),null);
  assert.deepEqual(cardIds(column(c,'ideas')),['a','b','c','d']);
  assert.equal(text(card(c,'Planned').querySelector('.na')).includes('scenes'),false,'board metadata stays focused on identity and time');
  assert.equal(card(c,'Recorded').querySelector('[aria-label="Recording"]')?.getAttribute('role'),'img','every card has its stage identity');
  assert.match(card(c,'Live').querySelector('img')!.getAttribute('src')!,/^\/api\/club\/videos\/x\/cover/);
  assert.equal(calls.filter(call=>call.method!=='GET').length,0);
  await press(button(c,'New video'));assert.equal(opened.count,1);
  await press(card(c,'Recorded'));await press(card(c,'Alpha'));
  assert.deepEqual(routes,[{name:'video',id:'r'},{name:'video',id:'a'}]);
 });
});

test('Board: all ideas are visible without subgroup headings or Show all',async()=>{
 const videos=Array.from({length:8},(_,i)=>mk(`i${i}`,{title:`Idea ${i}`,order:i}));
 await withBoard({videos},'board',async ui=>{
  assert.equal(cardIds(column(ui.container,'ideas')).length,8);
  assert.equal(ui.container.querySelector('.igroup-h,.igroup-more'),null);
 });
});

test('Board: dragging a card to another column moves it at once, saves it and offers Undo',async()=>{
 await withBoard({},'board',async(ui,calls)=>{
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'recording'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>[call.path,call.body]),[['/videos/a/move',{stage:'recording',beforeId:null}]]);
  assert.ok(column(c,'recording').querySelector('[data-card-id="a"]'),'the card is in Recording');
  assert.equal(column(c,'ideas').querySelector('[data-card-id="a"]'),null);
  assert.equal(text(column(c,'recording').querySelector('.col-h .n')),'2');
  assert.deepEqual(toasts(c),['Moved to RecordingUndo']);
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').slice(-1).map(call=>call.body),[{stage:'ideas',beforeId:'b',stageDates:{ideas:'2026-10-01T00:00:00.000Z'}}],'back to the stage, place and dates it had');
  assert.deepEqual(cardIds(column(c,'ideas')),['a','b','c','d'],'Undo puts it back where it was');
  assert.equal(column(c,'recording').querySelector('[data-card-id="a"]'),null);
 });
});

test('Board: a card can go to Recording without a recording project; the video page guards it',async()=>{
 await withBoard({},'board',async(ui,calls)=>{
  const c=ui.container;
  await dragTo(card(c,'Planned'),column(c,'recording'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.path),['/videos/p/move']);
  assert.ok(column(c,'recording').querySelector('[data-card-id="p"]'));
 });
});

test('Board: dropping above another card places it before that card; dropping where it already is does nothing; Ideas support the same insertion gap',async()=>{
 const videos=[mk('a',{title:'Alpha',order:0}),mk('p1',{title:'Plan one',stage:'planning',order:0}),mk('p2',{title:'Plan two',stage:'planning',order:1})];
 await withBoard({videos},'board',async(ui,calls)=>{
  const c=ui.container;
  for(const el of c.querySelectorAll<HTMLElement>('[data-column="planning"] [data-card]'))el.getBoundingClientRect=()=>({top:el.dataset.cardId==='p1'?0:100,height:40} as DOMRect);
  await drag(card(c,'Plan two'),'dragstart');await drag(column(c,'planning'),'dragover',5);
  assert.equal(c.querySelectorAll('[data-drop-line]').length,1,'a line shows where it will land');
  assert.equal(column(c,'planning').querySelector('[data-drop-line]')!.nextElementSibling!.querySelector('[data-card]')!.getAttribute('data-card-id'),'p1');
  await drag(column(c,'planning'),'drop',5);await drag(card(c,'Plan two'),'dragend');await settle();
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.body),[{stage:'planning',beforeId:'p1'}]);
  assert.deepEqual(toasts(c),['Moved in PlanningUndo']);
  assert.deepEqual(cardIds(column(c,'planning')),['p2','p1']);
  assert.equal(c.querySelectorAll('[data-drop-line]').length,0,'the line goes when the drop is done');
  const writes=()=>calls.filter(call=>call.method!=='GET').length,before=writes();
  await dragTo(card(c,'Plan one'),column(c,'planning'),10_000);
  assert.equal(writes(),before,'dropping a card in its own place saves nothing');
  await drag(card(c,'Plan one'),'dragstart');await drag(column(c,'ideas'),'dragover',5);
  assert.equal(c.querySelectorAll('[data-drop-line]').length,1,'Ideas show an insertion gap too');assert.ok(column(c,'ideas').classList.contains('over'));
  await drag(column(c,'ideas'),'drop',5);await drag(card(c,'Plan one'),'dragend');await settle();
  assert.deepEqual(calls.filter(call=>call.method==='POST').slice(-1).map(call=>call.body),[{stage:'ideas',beforeId:null}]);
  assert.ok(column(c,'ideas').querySelector('[data-card-id="p1"]'),'back among the ideas');
  const now=writes();
  for(const el of column(c,'ideas').querySelectorAll<HTMLElement>('[data-card]'))el.getBoundingClientRect=()=>({top:20,height:40} as DOMRect);
  await dragTo(card(c,'Plan one'),column(c,'ideas'),0);
  assert.equal(writes(),now+1,'ideas can be reordered within the column');
  assert.deepEqual(cardIds(column(c,'ideas')),['p1','a']);
 });
});

test('Board: a move that cannot be saved puts the card back and says so in one sentence',async()=>{
 await withBoard({failMove:true},'board',async ui=>{
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'editing'));
  assert.ok(column(c,'ideas').querySelector('[data-card-id="a"]'));assert.equal(column(c,'editing').querySelector('[data-card]'),null);
  assert.deepEqual(toasts(c),["Couldn't save that."]);
 });
});

test('Board: a saved move reconciles once and the next drag uses its saved order',async()=>{
 await withBoard({},'board',async(ui,calls)=>{
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'planning'));
  assert.equal(calls.filter(call=>call.path==='/videos'&&call.method==='GET').length,2,'moving reconciles once after the save');
  await dragTo(card(c,'Bravo'),column(c,'planning'));
  assert.deepEqual(cardIds(column(c,'planning')),['p','a','b']);
 });
});

test('Table: video, stage, scenes recorded, publish date and views; a heading sorts and a row opens the video',async()=>{
 await withBoard({},'table',async(ui,_calls,routes)=>{
  const c=ui.container;
  assert.deepEqual([...c.querySelectorAll('th')].map(text),['Video','Stage ↓','Scenes recorded','Publish date','Views']);
  const rows=()=>[...c.querySelectorAll('tbody tr')].map(tr=>[text(tr.querySelector('td .row > span')),...[...tr.children].slice(1).map(td=>text(td))]);
  assert.deepEqual(rows().map(row=>row[0]),['Live','Recorded','Planned','Alpha','Bravo'],'furthest along first; Later and Skipped are not listed');
  assert.deepEqual(rows().find(row=>row[0]==='Recorded'),['Recorded','Recording','2 of 5','Oct 31 · planned','—']);
  assert.deepEqual(rows().find(row=>row[0]==='Live'),['Live','Published','None yet','Oct 14','12K']);
  assert.deepEqual(rows().find(row=>row[0]==='Planned'),['Planned','Planning','None yet','Not scheduled','—']);
  await press([...c.querySelectorAll('th')].find(th=>/Video/.test(th.textContent||''))!);
  assert.deepEqual(rows().map(row=>row[0]),['Alpha','Bravo','Live','Planned','Recorded']);
  assert.equal(c.querySelector('th[aria-sort="ascending"]')!.textContent,'Video ↑');
  await press(c.querySelector('th[aria-sort="ascending"]')!);
  assert.deepEqual(rows().map(row=>row[0]),['Recorded','Planned','Live','Bravo','Alpha']);
  await press([...c.querySelectorAll('th')].find(th=>/Views/.test(th.textContent||''))!);
  assert.equal(rows()[0][0],'Live','most views first');
  await press(c.querySelector('tbody tr')!);
  assert.deepEqual(routes,[{name:'video',id:'x',tab:'publish'}]);
 });
});

test('Table: with no videos it says so',async()=>{
 await withBoard({videos:[]},'table',async ui=>{assert.match(text(ui.container.querySelector('.empty')),/No videos yet/);});
});

const dayOf=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

test('Calendar: only publish dates enter the grid; undated videos stay above it, overflow opens, and drag/Undo keep dates honest',async()=>{
 const now=new Date(),today=dayOf(now);
 const noon=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12).toISOString();
 const videos=[
  mk('a',{title:'Alpha',stage:'planning',publishDate:today,stageDates:{planning:'2026-01-02T12:00:00.000Z'}}),
  mk('b',{title:'Bravo',stage:'recording',stageDates:{recording:noon}}),
  mk('g',{title:'Gamma',stage:'editing',stageDates:{}}),
  mk('i',{title:'Idea',stage:'ideas',stageDates:{ideas:noon}}),
  mk('x',{title:'Live',stage:'published',publishedAt:today}),
 ];
 await withBoard({videos},'calendar',async(ui,calls,routes)=>{
  const c=ui.container;
  const cell=(day:string)=>c.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  const chips=(day:string)=>[...cell(day).querySelectorAll('.ev .calendar-title')].map(text);
  assert.deepEqual(chips(today),['Alpha']);
  assert.equal(text(cell(today).querySelector('.calendar-more')),'+1 more');
  await press(button(cell(today),'+1 more'));
  const overflow=c.querySelector('[role="dialog"]')!;
  assert.deepEqual([...overflow.querySelectorAll('.calendar-title')].map(text),['Alpha','Live']);
  assert.equal(overflow.querySelector('[title="Live · Published"]')!.getAttribute('draggable'),'false');
  await press(overflow.querySelector('[aria-label="Close"]')!);
  assert.ok(cell(today).classList.contains('today'));
  assert.equal(text(c.querySelector('h2.sec')),new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(now));
  const undated=c.querySelector('[aria-label="Unscheduled"]')!;
  assert.deepEqual([...undated.querySelectorAll('.calendar-title')].map(text),['Bravo','Gamma','Idea']);
  await press(undated.querySelector('[aria-label="Set publish date for Gamma"]')!);
  assert.ok(c.querySelector('.calendar-date-popover input[type=date]'));
  assert.deepEqual(routes,[],'the whole chip opens a date picker without navigating');
  await act(async()=>{c.querySelector('.calendar-date-popover')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  assert.equal(c.querySelector('.calendar-date-popover'),null);

  const other=[...c.querySelectorAll<HTMLElement>('[data-day]')].find(el=>el.dataset.day!==today&&el.dataset.day!.slice(0,7)===today.slice(0,7))!;
  const chip=(title:string)=>[...c.querySelectorAll<HTMLElement>('.ev')].find(el=>text(el.querySelector('.calendar-title'))===title)!;
  await dragTo(chip('Bravo'),other);
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>[call.path,call.body]),[['/videos/b',{publishDate:other.dataset.day}]]);
  assert.ok(chips(other.dataset.day!).includes('Bravo'),'on its new day');
  assert.match(toasts(c)[0],/^Planned for [A-Z][a-z]{2} \d+Undo$/);
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT').slice(-1).map(call=>call.body),[{publishDate:null}]);
  assert.equal(chips(today).includes('Bravo'),false,'Undo never substitutes a stage date');
  assert.ok(c.querySelector('[aria-label="Unscheduled"] [aria-label="Set publish date for Bravo"]'));

  await press(c.querySelector('[aria-label="Next month"]')!);
  assert.notEqual(text(c.querySelector('h2.sec')),new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(now));
  await press(button(c,'Today'));
  assert.equal(text(c.querySelector('h2.sec')),new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(now));
  await press(c.querySelector('[aria-label="Previous month"]')!);await press(button(c,'Today'));
  assert.equal(chips(today).includes('Idea'),false,'an idea with no publish day is not on the calendar');
 });
});

test('the view switch goes to the table and the calendar',async()=>{
 await withBoard({},'board',async(ui,_calls,routes)=>{
  const c=ui.container;
  await press([...c.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='Table')!);
  await press([...c.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='Calendar')!);
  assert.deepEqual(routes,[{name:'videos',view:'table'},{name:'videos',view:'calendar'}]);
 });
});

test('a board that cannot load says one sentence with Try again',async()=>{
 await withBoard({failLoad:true},'board',async(ui,_calls,_routes,state)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('[role="alert"] p')),"Couldn't load your videos.");
  state.failLoad=false;
  await press(button(c,'Try again'));
  assert.equal(c.querySelector('[role="alert"]'),null);assert.ok(card(c,'Alpha'));
 });
});

test('an existing install is not sent to Welcome or shown the how-it-works dialog; for everyone else Help opens that dialog and closing it saves nothing',async()=>{
 window.location.hash='';
 const state:Server={videos:base(),welcomed:false,failMove:false,failLoad:false,outlines:{}};
 const fake=installFetch(serve(state));
 const ui=await mountUI(createElement(ClubApp));
 try{
  await settle();
  assert.equal(window.location.hash,'#/home');
  assert.equal(ui.container.querySelector('[role="dialog"]'),null);
 }finally{await ui.close();fake.restore();window.location.hash='';}
 window.location.hash='';
 state.welcomed=true;
 const again=installFetch(serve(state));
 const second=await mountUI(createElement(ClubApp));
 try{
  await settle();
  const dialog=()=>second.container.querySelector('[role="dialog"]');
  assert.equal(dialog(),null,'no dialog on its own');
  await press(second.container.querySelector('.tabstrip [aria-label="Help"]')!);
  await press(second.container.querySelector('.help-pop .help-card')!);
  assert.match(text(dialog()),/How Creator Compiler works/);
  await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
  assert.equal(dialog(),null);
  assert.equal(again.calls.filter(call=>call.path==='/settings/welcomed').length,0);
 }finally{await second.close();again.restore();window.location.hash='';}
});

test('Videos in the app: an old Production link lands on Videos, the views switch, New video opens its dialog',async()=>{
 window.location.hash='#/production/table';
 const state:Server={videos:base(),welcomed:true,failMove:false,failLoad:false,outlines:{}};
 const fake=installFetch(serve(state));
 const ui=await mountUI(createElement(ClubApp));
 try{
  await settle();
  assert.equal(window.location.hash,'#/videos/table','the old link is rewritten');
  assert.equal(text(ui.container.querySelector('h1')),'Video board');
  assert.equal(ui.container.querySelector('[role="tab"][aria-selected="true"]')!.textContent,'Table');
  await press([...ui.container.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='Board')!);
  assert.equal(window.location.hash,'#/videos');
  assert.ok(ui.container.querySelector('.kanban'));
  await press(button(ui.container.querySelector('.page-head')!,'New video'));
  assert.ok(ui.container.querySelector('[role="dialog"]'),'New video opens its dialog');
 }finally{await ui.close();fake.restore();window.location.hash='';}
});

test('Board: loading scene progress never adds a redundant card metadata row',async()=>{
 const videos=[mk('p',{title:'Planned',stage:'planning'})];
 let release=()=>{};const hold=new Promise<void>(resolve=>{release=resolve;});
 await withBoard({videos,outlines:{p:3},holdScenes:hold},'board',async ui=>{
  assert.equal(ui.container.querySelector('.dots'),null);
  release();await settle();
  assert.equal(text(card(ui.container,'Planned').querySelector('.na')).includes('scenes'),false,'scene progress remains in the table');
  assert.equal(ui.container.querySelectorAll('.dots i').length,0,'the compact card uses a fraction instead of duplicating progress dots');
 });
});

test('Board: Move to on a card is a button you can reach with the keyboard; it moves the video like a drag, with Undo',async()=>{
 await withBoard({},'board',async(ui,calls)=>{
  const c=ui.container;
  const trigger=c.querySelector<HTMLButtonElement>('button[aria-label="Move Planned to…"]')!;
  assert.ok(trigger&&trigger.tabIndex>=0&&trigger.tagName==='BUTTON');
  assert.equal(trigger.closest('[data-card]'),null,'it is not inside the card, so pressing it does not open the video');
  await press(trigger);
  const menu=c.querySelector('.menu')!;
  assert.deepEqual([...menu.querySelectorAll('.hd,button')].map(text),['Move to','Ideas','Planning','Recording','Editing','Publishing','Published','Add to Channel board']);
  assert.equal(menu.querySelector('[aria-checked="true"]')!.textContent,'Planning','the stage it is in is marked');
  await press([...menu.querySelectorAll('button')].find(b=>text(b)==='Planning')!);
  assert.equal(calls.filter(call=>call.method==='POST').length,0,'its own stage does nothing');
  await press(trigger);
  await press([...c.querySelectorAll('.menu button')].find(b=>text(b)==='Recording')!);
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>[call.path,call.body]),[['/videos/p/move',{stage:'recording',beforeId:null}]]);
  assert.ok(column(c,'recording').querySelector('[data-card-id="p"]'));
  assert.deepEqual(toasts(c),['Moved to RecordingUndo']);
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.deepEqual(cardIds(column(c,'planning')),['p']);
  assert.equal(c.querySelector('.menu'),null,'the menu closes after a choice');
 });
 await withBoard({failMove:true},'board',async ui=>{
  const c=ui.container;
  await press(c.querySelector('button[aria-label="Move Planned to…"]')!);
  await press([...c.querySelectorAll('.menu button')].find(b=>text(b)==='Editing')!);
  assert.deepEqual(toasts(c),["Couldn't save that."]);assert.ok(column(c,'planning').querySelector('[data-card-id="p"]'));
 });
});

test('Calendar: a video with no day opens a date field from its Unscheduled row; choosing a day plans it, with Undo',async()=>{
 const videos=[mk('g',{title:'Gamma',stage:'editing',stageDates:{}}),mk('h',{title:'Hotel',stage:'planning',stageDates:{}})];
 await withBoard({videos},'calendar',async(ui,calls)=>{
  const c=ui.container;
  const field=(title:string)=>c.querySelector<HTMLInputElement>(`input[type="date"][aria-label="Set publish date for ${title}"]`)!;
  assert.equal(c.querySelector('input[type=date]'),null,'date inputs are hidden until requested');
  await press(c.querySelector('button[aria-label="Set publish date for Gamma"]')!);
  assert.ok(field('Gamma'));assert.equal(field('Gamma').tabIndex>=0,true);
  const day=dayOf(new Date(new Date().getFullYear(),new Date().getMonth(),15,12));
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field('Gamma'),day);field('Gamma').dispatchEvent(new Event('input',{bubbles:true}));});await settle();
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>[call.path,call.body]),[['/videos/g',{publishDate:day}]]);
  assert.ok([...c.querySelector(`[data-day="${day}"]`)!.querySelectorAll('.ev .calendar-title')].some(el=>text(el)==='Gamma'),'on that day');
  assert.equal(field('Gamma'),null,'the picker closes after choosing');assert.ok(c.querySelector('button[aria-label="Set publish date for Hotel"]'));
  assert.match(toasts(c)[0],/^Planned for [A-Z][a-z]{2} \d+Undo$/);
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT').slice(-1).map(call=>call.body),[{publishDate:null}]);
  assert.ok(c.querySelector('button[aria-label="Set publish date for Gamma"]'),'back in the list');
 });
});

test('Board: menu and drag allow jumps to any stage without prerequisites',async()=>{
 await withBoard({},'board',async(ui,calls)=>{
  const c=ui.container;
  assert.equal(calls.some(call=>call.path==='/videos/move-facts'),false);
  await act(async()=>window.dispatchEvent(new Event('club:videos-changed')));await settle();
  assert.equal(calls.some(call=>call.path==='/videos/move-facts'),false);
  await press(c.querySelector('button[aria-label="Move Recorded to…"]')!);
  await press([...c.querySelectorAll('.menu button')].find(b=>text(b)==='Published')!);
  assert.ok(column(c,'published').querySelector('[data-card-id="r"]'));
  await dragTo(card(c,'Alpha'),column(c,'publishing'));
  assert.ok(column(c,'publishing').querySelector('[data-card-id="a"]'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>[call.path,(call.body as {stage:string}).stage]),[['/videos/r/move','published'],['/videos/a/move','publishing']]);
 });
});

test('Board: when the server refuses a move it did not know about, the card goes back and its sentence shows',async()=>{
 await withBoard({},'board',async(ui,_calls,_routes,state)=>{
  state.failMove=true;
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'published'));
  assert.deepEqual(toasts(c),["Couldn't save that."]);
  assert.ok(column(c,'ideas').querySelector('[data-card-id="a"]'));
 });
});


test('Board: each lane adds a titled video directly to that stage',async()=>{
 await withBoard({videos:[]},'board',async(ui,calls)=>{
  const c=ui.container;
  for(const stage of ['ideas','planning','recording','editing','publishing','published']){
   const lane=column(c,stage);
   await press(lane.querySelector('.lane-plus')!);
   const input=lane.querySelector('input')!;
   await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,`New ${stage}`);input.dispatchEvent(new Event('input',{bubbles:true}));});
   await act(async()=>{lane.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await settle();
   assert.equal(lane.querySelector('form'),null);
   assert.ok(text(lane).includes(`New ${stage}`));
  }
  assert.deepEqual(calls.filter(call=>call.path==='/videos'&&call.method==='POST').map(call=>call.body),['ideas','planning','recording','editing','publishing','published'].map(stage=>({title:`New ${stage}`,stage})));
 });
});

test('Board: a missing thumbnail disappears, leaving the compact title and metadata',async()=>{
 await withBoard({},'board',async ui=>{
  const video=card(ui.container,'Alpha');const image=video.querySelector('img')!;
  await act(async()=>image.dispatchEvent(new Event('error')));
  assert.equal(video.querySelector('img'),null);
  assert.equal(text(video.querySelector('.tt')),'Alpha');
  assert.ok(text(video.querySelector('.na')));
 });
});

test('Table always shows Views and missing cover images leave no placeholder',async()=>{
 await withBoard({videos:[mk('a',{title:'Alpha',stage:'planning'})]},'table',async ui=>{
  assert.ok([...ui.container.querySelectorAll('th')].some(th=>text(th)==='Views'));
  const image=ui.container.querySelector('tbody img')!;
  assert.ok(image.hasAttribute('hidden'),'no tile while an optional cover is loading');
  await act(async()=>image.dispatchEvent(new Event('error')));
  assert.equal(ui.container.querySelector('tbody img,.video-table-thumb'),null);
 });
});
