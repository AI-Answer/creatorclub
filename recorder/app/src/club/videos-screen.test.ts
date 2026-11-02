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

type Server={videos:Video[];welcomed:boolean;failMove:boolean;failLoad:boolean;outlines:Record<string,number>;unreadable?:string[];holdScenes?:Promise<void>;facts?:Record<string,import('../../shared/club-move').MoveFacts>};
function serve(server:Server){
 const scenesReply=():FakeReply=>({body:fakeScenes(server.videos,{projects,outlines:server.outlines,unreadable:server.unreadable})});
 return (call:FakeCall):FakeReply|Promise<FakeReply>=>{
  const {path,method}=call;
  if(path==='/workspaces'&&method==='GET')return {body:{current:'maya',workspaces:[ws]}};
  if(path==='/videos'&&method==='GET')return server.failLoad?{status:500,body:{error:"Couldn't load your videos."}}:{body:server.videos};
  if(path==='/recent')return {body:[]};
  if(path==='/settings'&&method==='GET')return {body:{defaultAi:'claude',welcomed:server.welcomed}};
  if(path==='/settings/welcomed')return {body:{welcomed:true}};
  if(path==='/ai/status')return {body:{claude:{installed:true,version:'2',signedIn:true},codex:{installed:false,version:null,signedIn:false}}};
  if(path==='/breakdowns'&&method==='GET')return {body:[]};
  if(path==='/videos/scenes')return server.holdScenes?server.holdScenes.then(scenesReply):scenesReply();
  if(path==='/videos/move-facts')return server.facts?{body:server.facts}:undefined;
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

test('Board: six lanes with counts, Ideas first, cards with scene dots and the next action, and nothing that is put off',async()=>{
 await withBoard({},'board',async(ui,calls,routes,_state,opened)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Videos');
  assert.equal(text(c.querySelector('.lede')),'Every video from idea to published. Drag a card to move it.');
  assert.deepEqual([...c.querySelectorAll('[role="tab"]')].map(text),['Board','Table','Calendar']);
  assert.equal(c.querySelector('[role="tab"][aria-selected="true"]')!.textContent,'Board');
  assert.deepEqual([...c.querySelectorAll('.col')].map(col=>[col.getAttribute('aria-label'),text(col.querySelector('.col-h .n'))]),[['Ideas','2'],['Planning','1'],['Recording','1'],['Editing','0'],['Publishing','0'],['Published','1']]);
  assert.deepEqual(cardIds(column(c,'ideas')),['a','b'],'Later and Skipped are folded');
  assert.equal(text(column(c,'editing').querySelector('.col-empty')),'Recorded videos land here.');
  assert.equal(text(column(c,'published').querySelector('.col-empty')),'');
  const planned=card(c,'Planned');
  assert.equal(planned.querySelectorAll('.dots i').length,3,'one dot per scene of the outline');
  assert.match(text(planned),/0 of 3 scenesContinue to recording/);
  const recorded=card(c,'Recorded');
  assert.equal(recorded.querySelectorAll('.dots i.kept').length,2);
  assert.match(text(recorded),/2 of 5 scenesRecord scene 3Oct 31/);
  assert.match(text(card(c,'Alpha')),/Start planning/);
  assert.equal(card(c,'Alpha').querySelector('.dots'),null,'an idea has no scenes');
  assert.match(text(card(c,'Live')),/12K viewsOct 14/);
  assert.equal(card(c,'Live').querySelector('img')!.getAttribute('src'),'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  assert.match(card(c,'Recorded').querySelector('.thumb img')?.getAttribute('src')??'',/\/api\/club\/videos\/[^/]+\/cover$/,'a video in production shows its own picture or a frame of its recording');
  assert.equal(calls.filter(call=>call.method!=='GET').length,0,'looking changes nothing');
  assert.deepEqual(calls.filter(call=>/scenes|\/plan$|api\/projects/.test(call.path)).map(call=>call.path),['/videos/scenes'],'the scenes of every card come in one request');
  assert.equal(c.querySelectorAll('.btn.primary').length,1,'one primary button');
  await press(button(c,'New video'));assert.equal(opened.count,1);
  await press(recorded);await press(card(c,'Live'));await press(planned);
  assert.deepEqual(routes,[{name:'video',id:'r',tab:'record'},{name:'video',id:'x',tab:'publish'},{name:'video',id:'p',tab:'plan'}]);
  await press(card(c,'Alpha'));
  assert.equal(text(c.querySelector('.drawer h2')),'Alpha','an idea opens in its drawer, here');assert.equal(routes.length,3);
 });
});

test('Board: the Ideas lane shows every idea in its group, five at first, with Show all; nothing sends you elsewhere',async()=>{
 const ideas=Array.from({length:8},(_,i)=>mk(`i${i}`,{title:`Idea ${i}`,order:i}));
 await withBoard({videos:ideas},'board',async(ui,_calls,routes)=>{
  const c=ui.container;
  assert.equal(cardIds(column(c,'ideas')).length,5);assert.equal(text(column(c,'ideas').querySelector('.col-h .n')),'8');
  await press(button(column(c,'ideas'),'Show all 8'));
  assert.equal(cardIds(column(c,'ideas')).length,8);assert.deepEqual(routes,[]);
 });
 await withBoard({videos:ideas.slice(0,3)},'board',async ui=>{assert.equal([...ui.container.querySelectorAll('button')].some(b=>/Show all|View all/.test(b.textContent||'')),false);});
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
  assert.deepEqual(cardIds(column(c,'ideas')),['a','b'],'Undo puts it back where it was');
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

test('Board: dropping above another card places it before that card; dropping where it already is does nothing; Ideas take a card without a line',async()=>{
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
  assert.equal(c.querySelectorAll('[data-drop-line]').length,0,'Ideas are grouped, so no line between cards');assert.ok(column(c,'ideas').classList.contains('over'));
  await drag(column(c,'ideas'),'drop',5);await drag(card(c,'Plan one'),'dragend');await settle();
  assert.deepEqual(calls.filter(call=>call.method==='POST').slice(-1).map(call=>call.body),[{stage:'ideas',beforeId:null}]);
  assert.ok(column(c,'ideas').querySelector('[data-card-id="p1"]'),'back among the ideas');
  const now=writes();
  await dragTo(card(c,'Alpha'),column(c,'ideas'),10_000);
  assert.equal(writes(),now,'an idea dropped in Ideas stays where it is');
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

test('Board: after a drag the list from the server takes over, so a later drag starts from what was saved',async()=>{
 await withBoard({},'board',async(ui,calls)=>{
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'planning'));
  assert.equal(calls.filter(call=>call.path==='/videos'&&call.method==='GET').length,2,'the videos were read again after the save');
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
  assert.deepEqual(rows().find(row=>row[0]==='Live'),['Live','Published','—','Oct 14','12K']);
  assert.deepEqual(rows().find(row=>row[0]==='Planned'),['Planned','Planning','0 of 3','—','—']);
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

test('Calendar: a video sits on its publish day, else the day it entered its stage; videos with no day are listed, and a drop on a day plans it',async()=>{
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
  const chips=(day:string)=>[...cell(day).querySelectorAll('.ev .ellipsis')].map(text);
  assert.deepEqual(chips(today),['Alpha','Bravo','Live']);
  assert.ok(cell(today).classList.contains('today'));
  assert.equal(text(c.querySelector('h2.sec')),new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(now));
  assert.equal(cell(today).querySelector('.ev.st-recording')!.getAttribute('title'),'Bravo · Recording · Moved to Recording this day');
  assert.equal(text(c.querySelector('[aria-label="Not scheduled"]')),'Not scheduled: Gamma');
  await press(button(c.querySelector('[aria-label="Not scheduled"]')!,'Gamma'));
  assert.deepEqual(routes,[{name:'video',id:'g',tab:'publish'}],'it opens on the Publish tab, where the day is set');

  const other=[...c.querySelectorAll<HTMLElement>('[data-day]')].find(el=>el.dataset.day!==today&&el.dataset.day!.slice(0,7)===today.slice(0,7))!;
  const chip=(title:string)=>[...c.querySelectorAll<HTMLElement>('.ev')].find(el=>text(el.querySelector('.ellipsis'))===title)!;
  assert.equal(chip('Live').getAttribute('draggable'),'false','a published video is not planned on a day');
  await dragTo(chip('Bravo'),other);
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>[call.path,call.body]),[['/videos/b',{publishDate:other.dataset.day}]]);
  assert.ok(chips(other.dataset.day!).includes('Bravo'),'on its new day');
  assert.match(toasts(c)[0],/^Planned for [A-Z][a-z]{2} \d+Undo$/);
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT').slice(-1).map(call=>call.body),[{publishDate:null}]);
  assert.ok(chips(today).includes('Bravo'),'back on the day it entered Recording');

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
  await press(second.container.querySelector('.sidebar [aria-label="Help"]')!);
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
  assert.equal(text(ui.container.querySelector('h1')),'Videos');
  assert.equal(ui.container.querySelector('[role="tab"][aria-selected="true"]')!.textContent,'Table');
  await press([...ui.container.querySelectorAll('[role="tab"]')].find(tab=>tab.textContent==='Board')!);
  assert.equal(window.location.hash,'#/videos');
  assert.ok(ui.container.querySelector('.kanban'));
  await press(button(ui.container.querySelector('.page-head')!,'New video'));
  assert.ok(ui.container.querySelector('[role="dialog"]'),'New video opens its dialog');
 }finally{await ui.close();fake.restore();window.location.hash='';}
});

test('Board: scenes that are loading or could not be read say nothing about scenes; a known empty outline says so',async()=>{
 const videos=[mk('p',{title:'Planned',stage:'planning'}),mk('r',{title:'Recording one',stage:'recording'}),mk('e',{title:'Editing one',stage:'editing'})];
 // Could not be read.
 await withBoard({videos,unreadable:['p','r','e']},'board',async ui=>{
  const c=ui.container;
  assert.match(text(card(c,'Planned')),/Continue planning/);assert.match(text(card(c,'Recording one')),/Continue recording/);
  assert.equal(c.querySelectorAll('.dots').length,0,'no dots for scenes nobody knows');
  assert.equal(/scenes? from board|Continue to editing|0 of/.test(text(c.querySelector('.kanban'))),false);
 });
 // Still loading, then known.
 let release=()=>{};const hold=new Promise<void>(resolve=>{release=resolve;});
 await withBoard({videos,outlines:{p:3,r:2},holdScenes:hold},'board',async ui=>{
  const c=ui.container;
  assert.match(text(card(c,'Planned')),/Continue planning/);assert.match(text(card(c,'Recording one')),/Continue recording/);
  assert.equal(c.querySelectorAll('.dots').length,0);
  release();await settle();
  assert.match(text(card(c,'Planned')),/3 scenes?Continue to recording|0 of 3 scenesContinue to recording/);
  assert.match(text(card(c,'Recording one')),/0 of 2 scenesRecord scene 1/);
  assert.equal(c.querySelectorAll('.dots').length,2);
 });
 // Known to have no scenes.
 await withBoard({videos,outlines:{}},'board',async ui=>{
  const c=ui.container;
  assert.match(text(card(c,'Planned')),/Draft scenes from board/);assert.match(text(card(c,'Recording one')),/Draft scenes from board/);
  assert.equal(c.querySelectorAll('.dots').length,0,'no scenes, so no dots');
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
  assert.deepEqual([...menu.querySelectorAll('.hd,button')].map(text),['Move to','Ideas','Planning','Recording','Editing','Publishing','Published','Add to Research']);
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

test('Calendar: a video with no day has a date field in the Not scheduled list; choosing a day plans it, with Undo',async()=>{
 const videos=[mk('g',{title:'Gamma',stage:'editing',stageDates:{}}),mk('h',{title:'Hotel',stage:'planning',stageDates:{}})];
 await withBoard({videos},'calendar',async(ui,calls)=>{
  const c=ui.container;
  const field=(title:string)=>c.querySelector<HTMLInputElement>(`input[type="date"][aria-label="Set publish date for ${title}"]`)!;
  assert.ok(field('Gamma')&&field('Hotel'));assert.equal(field('Gamma').tabIndex>=0,true);
  const day=dayOf(new Date(new Date().getFullYear(),new Date().getMonth(),15,12));
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field('Gamma'),day);field('Gamma').dispatchEvent(new Event('input',{bubbles:true}));});await settle();
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>[call.path,call.body]),[['/videos/g',{publishDate:day}]]);
  assert.ok([...c.querySelector(`[data-day="${day}"]`)!.querySelectorAll('.ev .ellipsis')].some(el=>text(el)==='Gamma'),'on that day');
  assert.equal(field('Gamma'),null,'and out of the list');assert.ok(field('Hotel'));
  assert.match(toasts(c)[0],/^Planned for [A-Z][a-z]{2} \d+Undo$/);
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT').slice(-1).map(call=>call.body),[{publishDate:null}]);
  assert.ok(field('Gamma'),'back in the list');
 });
});

test('Board: a move the video is not ready for is refused by the menu and by a drag, with the one sentence the server would say, and nothing is sent',async()=>{
 const {MOVE_NEEDS_LINK,MOVE_NEEDS_EXPORT,MOVE_NEEDS_SCENES}=await import('../../shared/club-move');
 const none={scenes:0,takes:0,exported:false,published:false};
 const facts={a:none,b:none,p:{...none,scenes:3},r:{...none,scenes:5,takes:2},x:{...none,scenes:4,takes:4,exported:true,published:true}};
 await withBoard({facts},'board',async(ui,calls)=>{
  const c=ui.container;
  const moves=()=>calls.filter(call=>call.method==='POST'&&call.path.endsWith('/move'));
  await press(c.querySelector('button[aria-label="Move Recorded to…"]')!);
  await press([...c.querySelectorAll('.menu button')].find(b=>text(b)==='Published')!);
  assert.deepEqual(toasts(c),[MOVE_NEEDS_LINK]);
  assert.equal(c.querySelector('.cc-toast svg'),null,'a refusal has no check mark');
  assert.ok(column(c,'recording').querySelector('[data-card-id="r"]'),'the card stays');
  await dragTo(card(c,'Recorded'),column(c,'publishing'));
  assert.ok(toasts(c).includes(MOVE_NEEDS_EXPORT),'the drag asks the same rule');
  await dragTo(card(c,'Alpha'),column(c,'recording'));
  assert.ok(toasts(c).includes(MOVE_NEEDS_SCENES));
  assert.equal(moves().length,0,'nothing was sent');
  // Allowed: an idea to Planning, a planned video with scenes to Recording, and back from Recording.
  await dragTo(card(c,'Planned'),column(c,'recording'));
  await dragTo(card(c,'Recorded'),column(c,'planning'));
  assert.deepEqual(moves().map(call=>[call.path,(call.body as {stage:string}).stage]),[['/videos/p/move','recording'],['/videos/r/move','planning']]);
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
