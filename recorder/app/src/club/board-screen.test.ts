import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Video} from '../../shared/club';
import {arrangeColumn} from '../../shared/club-board';
import {installFetch,type FakeCall,type FakeReply} from './test-fakes';
const {BoardScreen}=await import('./screens/BoardScreen');
const {default:ClubApp}=await import('./ClubApp');

const ws={slug:'samin',name:'Samin Yasar',handle:'@samin',channelUrl:'',topics:[],about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'};
const mk=(id:string,over:Partial<Video>={}):Video=>({id,title:`Title ${id}`,stage:'ideas',order:0,createdAt:`2026-10-0${id.length}T00:00:00.000Z`,updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{ideas:'2026-10-01T00:00:00.000Z'},planning:{research:false,package:false,outline:false},...over});
const base=():Video[]=>[
 mk('a',{title:'Alpha',order:0}),mk('b',{title:'Bravo',order:1}),mk('c',{title:'Charlie',order:2,hidden:'later'}),mk('d',{title:'Delta',order:3,hidden:'skipped'}),
 mk('p',{title:'Planned',stage:'planning',planning:{research:true,package:true,outline:false}}),
 mk('r',{title:'Recorded',stage:'recording',recorderProjectId:'proj1'}),
 mk('x',{title:'Live',stage:'published',youtubeUrl:'https://youtu.be/dQw4w9WgXcQ',publishedAt:'2026-10-14',views:12400,viewsCheckedAt:'2026-10-20T00:00:00.000Z'}),
];
const projects=[{id:'proj1',name:'n',updatedAt:'',duration:0,mediaCount:0,sceneCount:5,takeCount:3,recordedSceneCount:2,thumbnailMediaId:'media1'}];

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await flush();};
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const text=(el:Element)=>(el.textContent??'').replace(/\s+/g,' ');
const card=(c:Element,title:string)=>[...c.querySelectorAll<HTMLElement>('[data-card]')].find(el=>text(el).includes(title))!;
const column=(c:Element,stage:string)=>c.querySelector<HTMLElement>(`[data-column="${stage}"]`)!;
const dnd=(type:string,y=0)=>Object.assign(new Event(type,{bubbles:true,cancelable:true}),{dataTransfer:{effectAllowed:'',dropEffect:'',setData(){}},clientY:y});
const drag=async(el:Element,type:string,y?:number)=>act(async()=>{el.dispatchEvent(dnd(type,y));});
const dragTo=async(source:Element,target:Element,y=10_000)=>{await drag(source,'dragstart');await drag(target,'dragover',y);await drag(target,'drop',y);await drag(source,'dragend');await flush();};

type Server={videos:Video[];recent:string[];welcomed:boolean;failMove:boolean};
function serve(server:Server){
 return (call:FakeCall):FakeReply=>{
  const {path,method}=call;
  if(path==='/workspaces'&&method==='GET')return {body:{current:'samin',workspaces:[ws]}};
  if(path==='/videos'&&method==='GET')return {body:server.videos};
  if(path==='/recent')return {body:server.recent};
  if(path==='/api/projects')return {body:projects};
  if(path==='/settings'&&method==='GET')return {body:{defaultAi:'claude',welcomed:server.welcomed}};
  if(path==='/settings/welcomed')return {body:{welcomed:true}};
  if(path==='/ai/status')return {body:{claude:{installed:true,version:'2',signedIn:true},codex:{installed:false,version:null,signedIn:false}}};
  if(path==='/videos'&&method==='POST'){const created=mk('new',{title:(call.body as {title:string}).title,order:9});return {status:201,body:created};}
  const move=path.match(/^\/videos\/(\w+)\/move$/);
  if(move){if(server.failMove)return {status:500,body:{error:"Couldn't save that."}};const body=call.body as {stage:Video['stage'];beforeId:string|null},column=arrangeColumn(server.videos,move[1],body.stage,body.beforeId);
   server.videos=server.videos.map(v=>column.includes(v.id)?{...v,order:column.indexOf(v.id),...(v.id===move[1]&&{stage:body.stage})}:v);return {body:server.videos.find(v=>v.id===move[1])};}
  const put=path.match(/^\/videos\/(\w+)$/);
  if(put&&method==='PUT')return {body:{...server.videos.find(v=>v.id===put[1])!,...(call.body as object)}};
 };
}
const withBoard=async(server:Partial<Server>,run:(ui:Awaited<ReturnType<typeof mountUI>>,calls:FakeCall[],opened:string[])=>Promise<void>)=>{
 localStorage.clear();
 const state:Server={videos:base(),recent:['p','r'],welcomed:true,failMove:false,...server},fake=installFetch(serve(state));
 const opened:string[]=[];
 const ui=await mountUI(createElement(BoardScreen,{onOpenVideo:(id,step)=>opened.push(`${id}:${step}`)}));
 try{await flush();await run(ui,fake.calls,opened);}finally{await ui.close();fake.restore();}
};

test('the board shows the channel, six columns, cards with status lines, recent videos and the hidden toggles',async()=>{
 await withBoard({},async(ui,calls,opened)=>{
  const c=ui.container;
  assert.equal(c.querySelector('h1')!.textContent,'Samin Yasar');
  assert.deepEqual([...c.querySelectorAll('[role="tab"]')].map(t=>t.textContent),['Board','Table','Calendar']);
  assert.ok(button(c,'+ New video'));
  assert.deepEqual([...c.querySelectorAll('section[aria-label]:not([aria-label="Recent videos"]) h2')].map(h=>h.textContent),['Ideas','Planning','Recording','Editing','Publishing','Published']);
  assert.deepEqual([...column(c,'ideas').querySelectorAll('[data-card]')].map(el=>el.getAttribute('data-card-id')),['a','b'],'Later and Skipped are out of sight');
  assert.match(text(card(column(c,'planning'),'Planned')),/Planning · 2 of 3/);
  assert.match(text(card(column(c,'recording'),'Recorded')),/Recording · 2 of 5 scenes/);
  assert.equal(card(column(c,'recording'),'Recorded').querySelector('img')!.getAttribute('src'),'/api/media/media1/thumbnail');
  assert.equal(card(column(c,'published'),'Live').querySelector('img')!.getAttribute('src'),'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  assert.match(text(card(column(c,'published'),'Live')),/Published · Oct 14/);
  const recent=c.querySelector('section[aria-label="Recent videos"]')!;
  assert.deepEqual([...recent.querySelectorAll('[data-card]')].map(el=>el.getAttribute('data-card-id')),['p','r']);
  const link=c.querySelector<HTMLInputElement>('input[aria-label="Paste a YouTube or Instagram link"]')!;
  assert.equal(link.disabled,false);assert.equal(button(c,'Break down').disabled,true,'needs a link first');assert.match(text(c),/Or drop a video file here\./);
  const toggles=[...c.querySelectorAll('[aria-pressed]')];assert.deepEqual(toggles.map(t=>text(t)),['Later 1','Skipped 1']);
  await press(toggles[0]);
  assert.deepEqual([...column(c,'ideas').querySelectorAll('[data-card]')].map(el=>el.getAttribute('data-card-id')),['a','b','c']);
  assert.match(text(card(column(c,'ideas'),'Charlie')),/Later/);
  await press(toggles[0]);assert.equal(column(c,'ideas').querySelectorAll('[data-card]').length,2);
  await press(card(c,'Recorded'));assert.deepEqual(opened,['r:record']);
  assert.equal(calls.filter(call=>call.method!=='GET').length,0,'looking changes nothing');
 });
});

test('dragging a card to another column moves it at once, saves it and offers Undo for 6 seconds',async()=>{
 await withBoard({},async(ui,calls)=>{
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'recording'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>[call.path,call.body]),[['/videos/a/move',{stage:'recording',beforeId:null}]]);
  assert.ok(column(c,'recording').querySelector('[data-card-id="a"]'),'the card is in Recording');
  assert.equal(column(c,'ideas').querySelector('[data-card-id="a"]'),null);
  const toast=c.querySelector('[role="status"]')!;
  assert.equal(text(toast),'Moved to Recording · Undo');
  await press(button(toast,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').slice(-1).map(call=>call.body),[{stage:'ideas',beforeId:'b',stageDates:{ideas:'2026-10-01T00:00:00.000Z'}}]);
  assert.deepEqual([...column(c,'ideas').querySelectorAll('[data-card]')].map(el=>el.getAttribute('data-card-id')),['a','b'],'Undo puts it back where it was');
  assert.equal(text(c.querySelector('[role="status"]')!),'');
 });
});

test('dropping above another card places the card before it, and dropping where it already is does nothing',async()=>{
 await withBoard({},async(ui,calls)=>{
  const c=ui.container;
  for(const el of c.querySelectorAll<HTMLElement>('[data-column="ideas"] [data-card]'))el.getBoundingClientRect=()=>({top:el.dataset.cardId==='a'?0:100,height:40} as DOMRect);
  await dragTo(card(c,'Bravo'),column(c,'ideas'),5);
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.body),[{stage:'ideas',beforeId:'a'}]);
  assert.equal(text(c.querySelector('[role="status"]')!),'Moved in Ideas · Undo');
  assert.deepEqual([...column(c,'ideas').querySelectorAll('[data-card]')].map(el=>el.getAttribute('data-card-id')),['b','a']);
  const before=calls.length;
  await dragTo(card(c,'Alpha'),column(c,'ideas'),10_000);
  assert.equal(calls.length,before,'dropping a card in its own place saves nothing');
 });
});

test('a move that cannot be saved puts the card back and says so in one sentence',async()=>{
 await withBoard({failMove:true},async(ui)=>{
  const c=ui.container;
  await dragTo(card(c,'Alpha'),column(c,'editing'));
  assert.ok(column(c,'ideas').querySelector('[data-card-id="a"]'));assert.equal(column(c,'editing').querySelector('[data-card]'),null);
  assert.equal(text(c.querySelector('[role="status"]')!),"Couldn't save that.");
 });
});

test('Add idea and + New video create a video in Ideas',async()=>{
 await withBoard({},async(ui,calls)=>{
  const c=ui.container;
  assert.equal(c.querySelector('input[aria-label="Idea title"]'),null);
  await press(button(c,'+ New video'));
  const field=c.querySelector<HTMLInputElement>('input[aria-label="Idea title"]')!;assert.ok(field);
  assert.equal(button(c,'Add').disabled,true,'a title is needed');
  await type(field,'  A brand new idea ');
  await press(button(c,'Add'));
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>[call.path,call.body]),[['/videos',{title:'A brand new idea'}]]);
  assert.ok(card(column(c,'ideas'),'A brand new idea'));assert.equal(c.querySelector('input[aria-label="Idea title"]'),null,'the field closes');
  await press(button(c,'Add idea'));assert.ok(c.querySelector('input[aria-label="Idea title"]'));
  await press(button(c,'Cancel'));assert.equal(c.querySelector('input[aria-label="Idea title"]'),null);
 });
});

test('Table lists title, stage, scenes recorded, publish date and views; a row opens the video',async()=>{
 await withBoard({},async(ui,_calls,opened)=>{
  const c=ui.container;
  await press([...c.querySelectorAll('[role="tab"]')].find(t=>t.textContent==='Table')!);
  assert.deepEqual([...c.querySelectorAll('th')].map(th=>th.textContent),['Title','Stage','Scenes recorded','Publish date','Views']);
  const rows=[...c.querySelectorAll('tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent));
  assert.deepEqual(rows.find(r=>r[0]==='Recorded'),['Recorded','Recording','2 of 5','—','—']);
  assert.deepEqual(rows.find(r=>r[0]==='Live'),['Live','Published','—','Oct 14','12.4K']);
  assert.equal(rows.some(r=>r[0]==='Charlie'),false);
  await press(c.querySelector('tbody tr')!);assert.equal(opened.length,1);
  assert.equal(localStorage.getItem('creatorclub.boardView'),'table','the view is remembered');
 });
});

test('Calendar puts videos on their day and a drop on another day sets the publish date, with Undo',async()=>{
 const today=new Date();
 const key=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 await withBoard({videos:[mk('a',{title:'Alpha',stage:'planning',publishDate:key}),mk('b',{title:'Bravo',stage:'planning'})],recent:[]},async(ui,calls)=>{
  const c=ui.container;
  await press([...c.querySelectorAll('[role="tab"]')].find(t=>t.textContent==='Calendar')!);
  const cell=(day:string)=>c.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
  assert.ok(text(cell(key)).includes('Alpha'),'on its planned day');
  const chip=(title:string)=>[...c.querySelectorAll<HTMLElement>('button[draggable="true"]')].find(el=>el.textContent===title)!;
  const unscheduled=c.querySelector('[aria-label="Not scheduled"]')!;assert.ok(text(unscheduled).includes('Bravo')&&!text(unscheduled).includes('Alpha'));
  const other=[...c.querySelectorAll<HTMLElement>('[data-day]')].find(el=>el.dataset.day!==key&&el.dataset.day!.slice(0,7)===key.slice(0,7))!;
  await dragTo(chip('Bravo'),other);
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>[call.path,call.body]),[['/videos/b',{publishDate:other.dataset.day}]]);
  assert.ok(text(cell(other.dataset.day!)).includes('Bravo'));
  assert.match(text(c.querySelector('[role="status"]')!),/^Set to [A-Z][a-z]{2} \d+ · Undo$/);
  await press(button(c.querySelector('[role="status"]')!,'Undo'));
  assert.deepEqual(calls.filter(call=>call.method==='PUT').slice(-1).map(call=>call.body),[{publishDate:null}]);
  assert.ok(text(c.querySelector('[aria-label="Not scheduled"]')!).includes('Bravo'),'back in the list');
  await dragTo(chip('Alpha'),unscheduled);
  assert.deepEqual(calls.filter(call=>call.method==='PUT').slice(-1).map(call=>call.body),[{publishDate:null}],'dropping on the list clears the day');
  assert.ok(button(c,'Today'));
 });
});

test('a board that cannot load says one sentence with Try again',async()=>{
 const fake=installFetch(()=>undefined);
 const ui=await mountUI(createElement(BoardScreen,{onOpenVideo(){}}));
 try{await flush();assert.ok(ui.container.querySelector('[role="alert"]'));assert.ok(button(ui.container,'Try again'));}
 finally{await ui.close();fake.restore();}
});

test('the first-visit dialog opens once, Start saves that, and ? opens it again',async()=>{
 window.location.hash='';
 const state:Server={videos:base(),recent:[],welcomed:false,failMove:false};
 const fake=installFetch(call=>{
  if(call.path==='/workspaces'&&call.method==='GET')return {body:{current:'samin',workspaces:[ws]}};
  return serve(state)(call);
 });
 const ui=await mountUI(createElement(ClubApp));
 try{
  await flush();
  const dialog=()=>ui.container.querySelector('[role="dialog"]');
  assert.ok(dialog(),'a new visitor sees the dialog');
  assert.match(text(dialog()!),/How CreatorClub works/);
  assert.deepEqual([...dialog()!.querySelectorAll('.hs')].map(step=>[step.querySelector('b')!.textContent,step.querySelector('span')!.textContent]),[
   ['1 Find the idea',"Break down what's working. Keep the concept you'd make."],
   ['2 Plan it','Gather references on its board, package it, draft the scenes.'],
   ['3 Record, edit, publish','Talk through each scene, remove pauses, paste the YouTube link.'],
  ]);
  assert.equal(dialog()!.querySelectorAll('.hs svg').length,3,'an icon for each step');
  assert.equal(fake.calls.filter(call=>call.path==='/settings/welcomed').length,0,'not saved until it is closed');
  await press(button(dialog()!,'Start'));
  assert.equal(dialog(),null);
  assert.deepEqual(fake.calls.filter(call=>call.path==='/settings/welcomed').map(call=>call.method),['POST']);
  await press(ui.container.querySelector('[aria-label="How CreatorClub works"]')!);
  assert.ok(dialog(),'? opens it again');
  await press(button(dialog()!,'Start'));
  assert.equal(fake.calls.filter(call=>call.path==='/settings/welcomed').length,1,'only the first close is saved');
 }finally{await ui.close();fake.restore();window.location.hash='';}
});
