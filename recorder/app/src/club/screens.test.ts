import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Breakdown,BreakdownSummary,SignalEntry,TrendingEntry,Video,Workspace} from '../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from './test-fakes';
import type {Route} from './routes';
const {ToastProvider}=await import('./ui');
const {OverviewScreen}=await import('./screens/OverviewScreen');
const {IdeasScreen}=await import('./screens/IdeasScreen');
const {TrendingScreen}=await import('./screens/TrendingScreen');
const {SignalsScreen}=await import('./screens/SignalsScreen');

// ---------------------------------------------------------------- a scripted server

const VIDEO_URL='https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const base=(id:string,title:string,stage:Video['stage'],extra:Partial<Video>={}):Video=>({id,title,stage,order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{},planning:{research:false,package:false,outline:false},...extra});
const rated=(level:'high'|'mid'|'low',note:string)=>({level,note});
const trend=(videoId:string,title:string,extra:Partial<TrendingEntry>={}):TrendingEntry=>({videoId,title,channel:'Duncan Rogoff | AI',kind:'followed',views:120000,likes:4000,comments:300,published:'2026-10-24',ageDays:4,vpd:30000,mult:3.2,history:[],firstSeen:'2026-10-20',fit:true,reason:'Because you picked Claude',...extra});
const post=(id:string,text:string,extra:Partial<SignalEntry>={}):SignalEntry=>({id,source:'x',author:'Alex Finn',handle:'alexfinn',text,url:`https://x.com/alexfinn/status/${id}`,likes:1200,replies:80,media:null,createdAt:'2026-10-28T00:00:00.000Z',ageHours:5,fit:true,reason:'Because you picked Claude',flair:null,...extra});
const profile=(name:string,topics=['Claude'],audience:string[]=[],person:string|null=name):Workspace=>({slug:name.toLowerCase().replace(/\W+/g,'-'),name,...(person&&{person}),handle:'',channelUrl:'',topics,audience,about:'',cta:'',createdAt:'2026-01-01T00:00:00.000Z'});
const breakdown=(over:Partial<Breakdown>={}):Breakdown=>({
 id:'bd_aaaaaaaaaaaa',url:VIDEO_URL,platform:'youtube',createdAt:'2026-10-28T00:00:00.000Z',
 video:{title:'How I built it',channel:'Duncan Rogoff | AI',views:7_600_000,likes:140_000,comments:12_000,ageDays:3,thumbnail:'',multiplier:2.84},
 whyItWorked:{titlePackaging:'A bold claim.',hookSpeed:'Within ten seconds.',structure:['Claim','Demo','Payoff'],retention:'Open loops.',payoff:'A working thing.',short:['Clear claim','Fast demo']},
 reusableOutline:['Claim: the outcome','Demo: the how'],
 viewerQuestions:[{question:'Does it work on a free plan?',likes:90},{question:'What about Windows?',likes:0}],
 concepts:[1,2,3].map(n=>({title:`Concept ${n}`,angle:`You show angle ${n}`,twist:`Your twist ${n}`,hook:`Hook ${n}`,demand:rated('high','Asked in comments.'),gap:rated('mid','not checked'),show:rated('low','Needs setup.'),why:`Why ${n}`})),
 ...over,
});

type Server={
 videos:Video[];recent:string[];trending:{items:TrendingEntry[];updatedAt:string|null;followed:number};signals:{items:SignalEntry[];updatedAt:string|null;errors:string[]};
 breakdowns:BreakdownSummary[];saved:Record<string,Breakdown>;workspace:Workspace;projects:{id:string;sceneCount:number;recordedSceneCount:number}[];outlines:Record<string,number>;
 jobs:string[];
};
const server=(over:Partial<Server>={}):Server=>({
 videos:[],recent:[],trending:{items:[],updatedAt:null,followed:0},signals:{items:[],updatedAt:null,errors:[]},breakdowns:[],saved:{},workspace:profile('Maya Lopez'),projects:[],outlines:{},jobs:[],...over,
});
const serve=(s:Server)=>(call:FakeCall):FakeReply=>{
 const {path,method,body}=call;
 if(path==='/videos'&&method==='GET')return {body:s.videos};
 if(path==='/videos'&&method==='POST'){const created=base('new1',(body as {title:string}).title,'ideas');s.videos=[...s.videos,created];return {status:201,body:created};}
 if(path==='/recent')return {body:s.recent};
 if(path==='/workspaces')return {body:{current:s.workspace.slug,workspaces:[s.workspace]}};
 if(path==='/trending')return {body:s.trending};
 if(path==='/signals')return {body:s.signals};
 if(path==='/breakdowns'&&method==='GET')return {body:s.breakdowns};
 if(path==='/breakdowns'&&method==='POST'){s.jobs.push(`j${s.jobs.length+1}`);return {status:202,body:{id:`j${s.jobs.length}`,status:'running'}};}
 const saved=path.match(/^\/breakdowns\/(bd_\w+)$/);
 if(saved)return s.saved[saved[1]]?{body:s.saved[saved[1]]}:undefined;
 const add=path.match(/^\/breakdowns\/(bd_\w+)\/concepts\/(\d)\/add$/);
 if(add){
  const concept=(s.saved[add[1]]??breakdown()).concepts[Number(add[2])];
  const created=base(`added${add[2]}`,concept.title,'ideas',{source:{kind:'breakdown',breakdownId:add[1]}});
  s.videos=[...s.videos,created];return {status:201,body:created};
 }
 if(path==='/trending/refresh'||path==='/signals/refresh'){s.jobs.push(path);return {status:202,body:{id:`j${s.jobs.length}`,status:'running'}};}
 if(path==='/trending/idea'){const made=base('idea-t',(s.trending.items.find(i=>i.videoId===(body as {videoId:string}).videoId)!).title,'ideas');s.videos=[...s.videos,made];return {status:201,body:made};}
 if(path==='/signals/idea'){const made=base('idea-s','From a post','ideas');s.videos=[...s.videos,made];return {status:201,body:made};}
 const plan=path.match(/^\/videos\/(\w+)\/plan$/);
 if(plan)return {body:{package:null,outline:s.outlines[plan[1]]?{scenes:Array.from({length:s.outlines[plan[1]]},(_,i)=>({title:`S${i}`,talkingPoints:[],show:'',seconds:30}))}:null,running:{},ready:{}}};
 if(path==='/api/projects')return {body:s.projects};
 const move=path.match(/^\/videos\/(\w+)\/move$/);
 if(move){s.videos=s.videos.map(v=>v.id===move[1]?{...v,stage:(body as {stage:Video['stage']}).stage}:v);return {body:s.videos.find(v=>v.id===move[1])};}
 const one=path.match(/^\/videos\/(\w+)$/);
 if(one&&method==='PUT'){
  const patch=body as {hidden?:'later'|'skipped'|null;idea?:Record<string,unknown>;title?:string};
  s.videos=s.videos.map(v=>{
   if(v.id!==one[1])return v;
   const next:Video={...v};
   if(patch.title)next.title=patch.title;
   if('hidden' in patch){if(patch.hidden)next.hidden=patch.hidden;else delete next.hidden;}
   if(patch.idea){const idea:Record<string,unknown>={...next.idea};for(const [k,val] of Object.entries(patch.idea)){if(val===null)delete idea[k];else idea[k]=val;}next.idea=idea;}
   return next;
  });
  return {body:s.videos.find(v=>v.id===one[1])};
 }
 if(one&&method==='DELETE'){s.videos=s.videos.filter(v=>v.id!==one[1]);return {status:204};}
 if(call.method==='DELETE'&&path.startsWith('/jobs/'))return {body:{status:'cancelled'}};
};

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const settle=async()=>{await flush();await flush();};
const press=async(element:Element)=>{await act(async()=>(element as HTMLElement).click());await settle();};
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const choose=async(select:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select),'value')!.set!.call(select,value);select.dispatchEvent(new Event('change',{bubbles:true}));});
const emit=(kind:string,data?:unknown)=>act(async()=>{FakeEventSource.last().emit(kind,data);});
const text=(el:Element|null)=>(el?.textContent??'').replace(/\s+/g,' ').trim();
const texts=(c:Element,selector:string)=>[...c.querySelectorAll(selector)].map(text);
const toasts=(c:Element)=>texts(c,'.cc-toast');

type Ui=Awaited<ReturnType<typeof mountUI>>;
async function mount(screen:(navigate:(route:Route)=>void)=>ReturnType<typeof createElement>,s:Server,run:(ui:Ui,s:Server,calls:FakeCall[],routes:Route[])=>Promise<void>){
 FakeEventSource.install();
 const fake=installFetch(serve(s));
 const routes:Route[]=[];
 const navigate=(route:Route)=>{routes.push(route);};
 const ui=await mountUI(createElement(ToastProvider,null,screen(navigate)));
 try{await settle();await run(ui,s,fake.calls,routes);}finally{await ui.close();fake.restore();}
}
const writes=(calls:FakeCall[])=>calls.filter(c=>c.method!=='GET').map(c=>`${c.method} ${c.path}${c.body?` ${JSON.stringify(c.body)}`:''}`);

// ---------------------------------------------------------------- Ideas

const ideaVideos=()=>[
 base('i1','Claude for receipts','ideas',{createdAt:'2026-10-05T00:00:00.000Z',idea:{hook:'I let Claude do my receipts.',why:'People ask about it.',angle:'You show the setup.',twist:'Your own receipts.',demand:rated('high','Asked in comments'),gap:rated('mid','not checked'),show:rated('high','Easy'),sources:[{label:'Receipts with Claude',url:VIDEO_URL}]}}),
 base('i2','Held back idea','ideas',{hidden:'later',createdAt:'2026-10-04T00:00:00.000Z'}),
 base('i3','Not for me','ideas',{hidden:'skipped',idea:{dropReason:'Too generic'}}),
 base('p1','In planning','planning'),
];

test('Ideas lists the New ideas as rich cards, with counts for Later and Skipped and an outlier chip from Working now',async()=>{
 const s=server({videos:ideaVideos(),trending:{items:[trend('dQw4w9WgXcQ','Receipts with Claude')],updatedAt:'2026-10-28T00:00:00.000Z',followed:1}});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),s,async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Ideas');
  assert.deepEqual(texts(c,'.seg [role="tab"]'),['New 1','Later 1','Skipped 1']);
  const cards=c.querySelectorAll('.card.idea');assert.equal(cards.length,1);
  const card=cards[0];
  assert.equal(text(card.querySelector('.tt')),'Claude for receipts');
  assert.equal(text(card.querySelector('.hookq')),'I let Claude do my receipts.');
  assert.deepEqual([...card.querySelectorAll('.lvl')].map(l=>[l.className,text(l)]),[['lvl high','Demand'],['lvl mid','Gap'],['lvl high','Easy to show']]);
  assert.equal(text(card.querySelector('.src')),'Receipts with Claude');
  assert.equal(card.querySelector('.thumb img')!.getAttribute('src'),'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg','the picture of the video it came from');
  const chip=card.querySelector('.chip.mult')!;assert.equal(text(chip),'3.20×');assert.equal(chip.getAttribute('title'),"3.20× vs Duncan Rogoff's usual");
  assert.match(text(card.querySelector('.chip.solid')),/From Duncan Rogoff/);
  assert.deepEqual(texts(card,'.foot button'),['Start planning','Later','Skip']);

  await press(c.querySelectorAll('.seg [role="tab"]')[1]);
  assert.deepEqual(routes.at(-1),{name:'ideas',filter:'later'});
 });
 const later=server({videos:ideaVideos()});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',filter:'later'},navigate}),later,async ui=>{
  assert.deepEqual(texts(ui.container,'.card.idea .body .tt'),['Held back idea']);
  assert.deepEqual(texts(ui.container,'.card.idea .foot button'),['Restore']);
 });
 const skipped=server({videos:ideaVideos()});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',filter:'skipped'},navigate}),skipped,async ui=>{
  assert.equal(text(ui.container.querySelector('.card.idea .chip')),'Skipped · Too generic');
 });
});

test('Ideas empty states say what each list is for and offer the next step',async()=>{
 const items=[trend('dQw4w9WgXcQ','Receipts with Claude')];
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),server({trending:{items,updatedAt:null,followed:1}}),async ui=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'No ideas yet');
  assert.match(text(c.querySelector('.try')),/Try one that's working now:Duncan Rogoff/,'a video from Working now to try');
  assert.ok(button(c.querySelector('.empty')!,"Break down a video that's working"));
 });
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',filter:'later'},navigate}),server(),async ui=>{assert.equal(text(ui.container.querySelector('.empty h3')),'Nothing saved for later');});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',filter:'skipped'},navigate}),server(),async ui=>{assert.equal(text(ui.container.querySelector('.empty h3')),'Nothing skipped');});
});

test('Ideas actions: Later and Skip with a reason can be undone, Start planning moves it and opens its Board, Restore brings it back',async()=>{
 const s=server({videos:ideaVideos()});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),s,async (ui,state,calls,routes)=>{
  const c=ui.container;
  await press(button(c.querySelector('.card.idea')!,'Later'));
  assert.deepEqual(writes(calls),['PUT /videos/i1 {"hidden":"later"}']);
  assert.deepEqual(toasts(c),['Saved for laterUndo']);assert.equal(c.querySelectorAll('.card.idea').length,0,'it leaves New');
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"hidden":null}');assert.equal(c.querySelectorAll('.card.idea').length,1,'and comes back');

  await press(button(c.querySelector('.card.idea')!,'Skip'));
  assert.deepEqual(texts(c,'[role="menu"] .hd, [role="menu"] button'),['Why skip it?','Too generic','Not their style','Already covered',"Can't show it",'Bad timing']);
  await press(button(c.querySelector('[role="menu"]')!,'Bad timing'));
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"hidden":"skipped","idea":{"dropReason":"Bad timing"}}');
  assert.ok(toasts(c).some(t=>t==='Skipped · Bad timingUndo'));
  await press(button([...c.querySelectorAll('.cc-toast')].find(t=>/Bad timing/.test(t.textContent!))!,'Undo'));
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"hidden":null,"idea":{"dropReason":null}}');

  await press(button(c.querySelector('.card.idea')!,'Start planning'));
  assert.deepEqual(writes(calls).at(-1),'POST /videos/i1/move {"stage":"planning"}');
  assert.deepEqual(routes.at(-1),{name:'video',id:'i1',tab:'board'});assert.equal(state.videos.find(v=>v.id==='i1')!.stage,'planning');
 });
 const held=server({videos:ideaVideos()});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',filter:'skipped'},navigate}),held,async (ui,_s,calls)=>{
  await press(button(ui.container.querySelector('.card.idea')!,'Restore'));
  assert.equal(writes(calls).at(-1),'PUT /videos/i3 {"hidden":null,"idea":{"dropReason":null}}');
  assert.ok(toasts(ui.container).includes('Restored to New'));
 });
});

test('the idea drawer edits every note where it stands and deleting waits so it can be undone',async()=>{
 const s=server({videos:ideaVideos()});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),s,async (ui,state,calls)=>{
  const c=ui.container;
  await press(c.querySelector('.card.idea')!);
  const drawer=c.querySelector('.drawer')!;
  assert.ok(drawer);assert.equal(text(drawer.querySelector('.stage-pill')),'Ideas');
  assert.equal(text(drawer.querySelector('h2')),'Claude for receipts');
  const edit=async(el:HTMLElement,value:string)=>{el.focus();el.innerText=value;await act(async()=>{el.blur();});await settle();};
  await edit(drawer.querySelector('h2')!,'Claude files my receipts');
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"title":"Claude files my receipts"}');
  const hook=[...drawer.querySelectorAll<HTMLElement>('.hookq')][0];
  await edit(hook,'I filed a year of receipts in a minute.');
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"idea":{"hook":"I filed a year of receipts in a minute."}}');
  await edit(hook,'');
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"idea":{"hook":null}}','an emptied note is removed');
  assert.equal(state.videos.find(v=>v.id==='i1')!.idea!.hook,undefined);
  const demandNote=[...drawer.querySelectorAll<HTMLElement>('.dgs-row .ed')][0];
  await edit(demandNote,'Asked in 30 comments');
  assert.equal(writes(calls).at(-1),'PUT /videos/i1 {"idea":{"demand":{"level":"high","note":"Asked in 30 comments"}}}');
  const link=drawer.querySelector('a')!;assert.equal(link.getAttribute('href'),VIDEO_URL);assert.equal(link.getAttribute('rel'),'noopener noreferrer');

  const before=writes(calls).length;
  await press(button(drawer,'Delete'));
  assert.ok(c.querySelector('.drawer')===null,'the drawer closes');assert.equal(c.querySelectorAll('.card.idea').length,0,'the idea is gone at once');
  assert.equal(writes(calls).length,before,'but nothing is deleted on the server yet');
  assert.ok(toasts(c).includes('Idea deletedUndo'));
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.equal(c.querySelectorAll('.card.idea').length,1,'Undo brings it back');
  assert.equal(writes(calls).some(w=>w.startsWith('DELETE')),false);
 });
});

test('the drawer of an idea that is on hold offers Restore, and the open link in the address opens it',async()=>{
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',filter:'later',open:'i2'},navigate}),server({videos:ideaVideos()}),async (ui,_s,_calls,routes)=>{
  const drawer=ui.container.querySelector('.drawer')!;
  assert.equal(text(drawer.querySelector('h2')),'Held back idea');
  assert.deepEqual(texts(drawer,'.df button'),['Restore','Delete']);
  await press(drawer.querySelector('[aria-label="Close"]')!);
  assert.ok(ui.container.querySelector('.drawer')===null);assert.deepEqual(routes.at(-1),{name:'ideas',filter:'later'},'the open link leaves the address');
 });
});

test('a new idea is highlighted with the banner that opens it and starts planning',async()=>{
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',new:'i1'},navigate}),server({videos:ideaVideos()}),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.match(text(c.querySelector('.card[style*="accent-soft"]')),/"Claude for receipts" is in your ideas\.Next: open it and start planning\./);
  assert.match(c.querySelector('#idea-i1')!.getAttribute('style')!,/accent/);assert.equal(text(c.querySelector('#idea-i1 .chip.b-blue')),'New');
  assert.equal(c.querySelectorAll('.btn.primary').length,1,'one primary button on the page');
  await press(button(c,'Open it and start planning'));
  assert.equal(writes(calls).at(-1),'POST /videos/i1/move {"stage":"planning"}');assert.deepEqual(routes.at(-1),{name:'video',id:'i1',tab:'board'});
 });
});

test('Add idea creates a video from a working title and lands on Ideas with it highlighted',async()=>{
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),server(),async (ui,_s,calls,routes)=>{
  await press(button(ui.container,'Add idea'));
  const dialog=ui.container.querySelector('[role="dialog"]')!;
  assert.equal((button(dialog,'Add idea') as HTMLButtonElement).disabled,true);
  await type(dialog.querySelector('input')!,'  Claude does my taxes  ');
  await press(button(dialog,'Add idea'));
  assert.deepEqual(writes(calls),['POST /videos {"title":"Claude does my taxes"}']);
  assert.deepEqual(routes.at(-1),{name:'ideas',new:'new1'});assert.ok(ui.container.querySelector('[role="dialog"]')===null);
 });
});

test('Break down a pasted link: progress steps from the job, then why it worked, what viewers ask and three concepts; Add to my ideas lands on Ideas',async()=>{
 const s=server({videos:ideaVideos(),saved:{bd_aaaaaaaaaaaa:breakdown()}});
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),s,async (ui,state,calls,routes)=>{
  const c=ui.container;
  await type(c.querySelector('.breakbar input')!,'not a link');
  await press(button(c,'Break down'));
  assert.ok(toasts(c).includes("That doesn't look like a YouTube or Instagram link. Paste the full address."));
  assert.equal(writes(calls).length,0);

  await type(c.querySelector('.breakbar input')!,VIDEO_URL);
  await press(button(c,'Break down'));
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:VIDEO_URL})}`]);
  assert.deepEqual(texts(c,'.bd-step'),BREAKDOWN_LABELS);
  assert.deepEqual([...c.querySelectorAll('.bd-step')].map(step=>step.className),['bd-step on','bd-step','bd-step','bd-step']);
  await emit('progress',{message:'Reading the transcript…'});
  assert.deepEqual([...c.querySelectorAll('.bd-step')].map(step=>step.className),['bd-step done','bd-step on','bd-step','bd-step']);
  await emit('progress',{message:'Reading 214 comments…'});await emit('progress',{message:'Finding what made it work…'});
  assert.deepEqual([...c.querySelectorAll('.bd-step')].map(step=>step.className),['bd-step done','bd-step done','bd-step done','bd-step on']);
  assert.match(text(c.querySelectorAll('.bd-step')[2]),/Reading the comments · 214 comments/);
  await emit('done',breakdown());

  const bd=c.querySelector('.bd')!;
  assert.equal(text(bd.querySelector('.bd-head > .grow > div')),'How I built it');
  assert.deepEqual(texts(bd,'.bd-head .chip.outline'),['7.6M views','140K','12K','3 days ago']);
  assert.deepEqual(texts(bd,'.bd-head .chip.mult'),["2.84×","2.84× vs Duncan Rogoff's usual"].map(t=>t),'one number, always against that creator');
  assert.equal(new Set(texts(bd,'.bd-head .chip.mult').map(t=>t.split(' ')[0])).size,1);
  assert.deepEqual(texts(bd,'.bd-grid ol > li'),['Clear claim','Fast demo']);
  assert.deepEqual(texts(bd,'.q'),['Does it work on a free plan?90','What about Windows?']);
  assert.equal(text(bd.querySelector(':scope > h3')),'Concepts for you');
  assert.deepEqual(texts(bd,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
  assert.doesNotMatch(text(c),/Samin/);
  await press(button(bd,'Show the full breakdown'));
  assert.match(text(bd),/Title and packaging\. A bold claim\./);assert.match(text(bd),/Reusable outline\./);

  await press(button(bd.querySelectorAll('.concept')[1],'Add to my ideas'));
  assert.equal(writes(calls).at(-1),'POST /breakdowns/bd_aaaaaaaaaaaa/concepts/1/add');
  assert.deepEqual(routes.at(-1),{name:'ideas',new:'added1'});
  assert.equal(state.videos.some(v=>v.id==='added1'),true);
  assert.equal(text(c.querySelectorAll('.concept')[1].querySelector('button')),'In your ideas · Open','the card now opens the idea');
  await press(c.querySelectorAll('.concept')[1].querySelector('button')!);
  assert.deepEqual(routes.at(-1),{name:'ideas',new:'added1'});
  await press(button(c,'Close'));assert.ok(c.querySelector('.bd')===null);
 });
});
const BREAKDOWN_LABELS=['Reading the video','Reading the transcript','Reading the comments','Writing concepts'];

test('a breakdown that fails says one sentence with Try again, and a dropped video file runs it from the file',async()=>{
 const s=server();
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),s,async (ui,_s,calls)=>{
  const c=ui.container;
  await type(c.querySelector('.breakbar input')!,'https://www.instagram.com/reel/C8aBcD_eFgH/');
  await press(button(c,'Break down'));
  await emit('failed',{message:'Instagram blocked the download. Drop the video file here instead.'});
  assert.equal(text(c.querySelector('[role="alert"] p')),'Instagram blocked the download. Drop the video file here instead.');
  assert.match(text(c.querySelector('.bd')),/Drop a video file here/);
  await press(button(c,'Try again'));
  assert.equal(writes(calls).filter(w=>w.startsWith('POST /breakdowns')).length,2,'Try again asks again');
  await emit('failed',{message:'Instagram blocked the download. Drop the video file here instead.'});
  const sent:unknown[]=[];
  const inner=globalThis.fetch;
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input)==='/api/club/breakdowns'&&init?.body instanceof FormData)sent.push(init.body.get('file'));return inner(input,init);}) as typeof fetch;
  const drop=(file:File)=>act(async()=>{c.querySelector('.bd')!.dispatchEvent(Object.assign(new Event('drop',{bubbles:true,cancelable:true}),{dataTransfer:{types:['Files'],files:[file]}}));});
  await drop(new File(['x'],'notes.txt'));
  assert.equal(text(c.querySelector('[role="alert"] p')),'Drop a video file, like an mp4 or a mov.');
  await drop(new File(['x'],'reel.mp4',{type:'video/mp4'}));await settle();
  assert.equal((sent[0] as File).name,'reel.mp4');
  globalThis.fetch=inner;
 });
});

test('a link from New video opens Ideas, starts its breakdown once and leaves the address; an Instagram link works too',async()=>{
 const s=server();
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',bd:'dQw4w9WgXcQ'},navigate}),s,async (ui,_s,calls,routes)=>{
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:VIDEO_URL})}`]);
  assert.equal((ui.container.querySelector('.breakbar input') as HTMLInputElement).value,VIDEO_URL);
  assert.deepEqual(routes.at(-1),{name:'ideas'},'so a reload does not run it again');
 });
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas',bd:'https://www.instagram.com/reel/C8aBcD_eFgH/'},navigate}),server(),async (_ui,_s,calls)=>{
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:'https://www.instagram.com/reel/C8aBcD_eFgH/'})}`]);
 });
});

test('leaving a breakdown that is still running stops its job',async()=>{
 FakeEventSource.install();
 const fake=installFetch(serve(server()));
 const ui=await mountUI(createElement(ToastProvider,null,createElement(IdeasScreen,{route:{name:'ideas',bd:'dQw4w9WgXcQ'},navigate:()=>{}})));
 try{
  await settle();
  assert.deepEqual(writes(fake.calls),[`POST /breakdowns ${JSON.stringify({url:VIDEO_URL})}`]);
 }finally{await ui.close();}
 await settle();
 assert.ok(fake.calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j1'),'the job is cancelled when the screen goes');
 fake.restore();
});

test('leaving before the breakdown\'s job id arrives aborts the request and stops the job once its id comes',async()=>{
 FakeEventSource.install();
 let release=()=>{};const hold=new Promise<void>(resolve=>{release=resolve;});
 const inner=serve(server());
 const fake=installFetch(async call=>{if(call.path==='/breakdowns'&&call.method==='POST')await hold;return inner(call);});
 let signal:AbortSignal|null|undefined;
 const sent=globalThis.fetch;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{if(String(input)==='/api/club/breakdowns'&&init?.method==='POST')signal=init.signal;return sent(input,init);}) as typeof fetch;
 const ui=await mountUI(createElement(ToastProvider,null,createElement(IdeasScreen,{route:{name:'ideas',bd:'dQw4w9WgXcQ'},navigate:()=>{}})));
 try{
  await settle();
  assert.equal(signal?.aborted,false,'the request is under way');
  await ui.close();
  assert.equal(signal?.aborted,true,'leaving aborts it');
  assert.equal(fake.calls.filter(call=>call.method==='DELETE').length,0,'there is no job to stop yet');
  release();await settle();
  assert.deepEqual(fake.calls.filter(call=>call.method==='DELETE').map(call=>call.path),['/jobs/j1'],'the job that was started is stopped');
  assert.equal(FakeEventSource.all.length,0,'nothing follows it');
 }finally{release();globalThis.fetch=sent;fake.restore();}
});

// ---------------------------------------------------------------- Working now

const trendItems=()=>[
 trend('aaaaaaaaaaa','Claude Code in 20 minutes',{vpd:9000,views:50000,mult:6.4,firstSeen:'2026-10-28',ageDays:1,history:[{d:'2026-10-27',v:20000},{d:'2026-10-28',v:50000}]}),
 trend('bbbbbbbbbbb','Agents that run a shop',{kind:'creator',channel:'Metics Media',vpd:4000,views:900000,mult:null,reason:'Because you picked AI agents'}),
 trend('ccccccccccc','My cat learns to code',{vpd:99999,views:10,fit:false,reason:null,channel:'Cat Channel'}),
];
const trendServer=(over:Partial<Server>={})=>server({trending:{items:trendItems(),updatedAt:'2026-10-28T09:00:00.000Z',followed:3},workspace:profile('Maya Lopez',['Claude','AI agents'],['Complete beginners']),...over});
const cards=(c:Element)=>texts(c,'.card.trend .tt');

test('Working now: For you, Followed and All with counts, a chip legend, reasons, a dash when the usual is unknown, and Show everything',async()=>{
 await mount(navigate=>createElement(TrendingScreen,{navigate}),trendServer(),async ui=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Working now');
  assert.match(text(c.querySelector('.actions')),/Updated Oct 28 · 3 videos/);
  assert.deepEqual(texts(c,'.seg button'),['For you 2','Followed 2','All 3']);
  assert.deepEqual(cards(c),['Claude Code in 20 minutes','Agents that run a shop'],'ranked by views per day, off-topic left out');
  assert.match(text(c.querySelector('.legend')),/1–3×3–5×5–10×10–50×—Views compared with that channel's usual\. A dash means its usual isn't tracked yet\./);
  assert.equal(text(c.querySelector('.legend + .small')),'Matched to your topics: Claude, AI agents, Complete beginners.');
  const [first,second]=c.querySelectorAll('.card.trend');
  assert.equal(text(first.querySelector('.chip.mult')),'6.40×');assert.equal(first.querySelector('.chip.mult')!.getAttribute('title'),"6.40× vs Duncan Rogoff's usual");
  assert.ok(first.querySelector('.chip.mult')!.classList.contains('b-amber'));
  assert.equal(text(first.querySelector('.chip.solid.br')),'New');assert.ok(second.querySelector('.chip.solid.br')===null);
  assert.equal(text(first.querySelector('.reason')),'Because you picked Claude');
  assert.equal(text(second.querySelector('.chip.mult')),'—');assert.ok(second.querySelector('.chip.mult')!.classList.contains('b-grey'));assert.match(second.querySelector('.chip.mult')!.getAttribute('title')!,/Metics Media's usual views aren't tracked yet/);
  assert.equal(text(first.querySelector('.chip.outline')),'Followed');assert.ok(second.querySelector('.chip.outline')===null);
  assert.equal(first.querySelector('.thumb img')!.getAttribute('src'),'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg');
  assert.deepEqual(texts(first,'.stats span'),['50K','9K/day','1h ago'.replace('1h ago','1 day ago')]);
  assert.deepEqual(texts(first,'.foot .btn'),['Break down','']);assert.equal(first.querySelector('.foot .icon-only')!.getAttribute('aria-label'),'Make it an idea');

  await press(button(c,'Show everything (1 more, not about your topics)'));
  assert.deepEqual(cards(c),['My cat learns to code','Claude Code in 20 minutes','Agents that run a shop'],'All, sorted by views per day');
  assert.ok(c.querySelector('.card.trend')!.querySelector('.reason')===null,'no reason on a video that is not about your topics');
  await press([...c.querySelectorAll('.seg button')].find(b=>/^Followed/.test(b.textContent!))!);
  assert.deepEqual(cards(c),['My cat learns to code','Claude Code in 20 minutes']);
  assert.ok(c.querySelectorAll('.card.trend .reason').length===0,'Followed does not explain why');
 });
});

test('Working now sorts by views per day, total views or growth',async()=>{
 await mount(navigate=>createElement(TrendingScreen,{navigate}),trendServer(),async ui=>{
  const c=ui.container,select=c.querySelector('#sortby')!;
  assert.deepEqual([...select.querySelectorAll('option')].map(o=>o.textContent),['Views per day','Total views','Growth']);
  await choose(select,'views');assert.deepEqual(cards(c),['Agents that run a shop','Claude Code in 20 minutes']);
  await choose(select,'growth');assert.deepEqual(cards(c),['Claude Code in 20 minutes','Agents that run a shop'],'30,000 views gained in a day, against none known');
 });
});

test('Working now with nothing that matches says so and offers everything; with no channels followed it points to Settings',async()=>{
 const s=trendServer({trending:{items:[trend('ccccccccccc','My cat learns to code',{fit:false,reason:null})],updatedAt:'2026-10-28T09:00:00.000Z',followed:1}});
 await mount(navigate=>createElement(TrendingScreen,{navigate}),s,async ui=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'Nothing matches your topics this week');
  await press(button(c.querySelector('.empty')!,'Show everything'));
  assert.deepEqual(cards(c),['My cat learns to code']);
 });
 await mount(navigate=>createElement(TrendingScreen,{navigate}),server({trending:{items:[],updatedAt:null,followed:0}}),async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'No channels followed yet');
  assert.equal((button(c,'Refresh') as HTMLButtonElement).disabled,true,'nothing to read');
  assert.match(text(c.querySelector('.actions')),/Not refreshed yet/);
  await press(button(c,'Open Settings'));assert.deepEqual(routes.at(-1),{name:'settings'});
 });
});

test('Refresh on Working now runs the job with its progress, loads the list again and says what was found',async()=>{
 const s=trendServer();
 await mount(navigate=>createElement(TrendingScreen,{navigate}),s,async (ui,state,calls)=>{
  const c=ui.container;
  await press(button(c,'Refresh'));
  assert.equal(writes(calls).at(-1),'POST /trending/refresh');
  assert.equal((button(c,'Refresh') as HTMLButtonElement).disabled,true,'one refresh at a time');
  await emit('progress',{message:'Reading Duncan Rogoff…'});
  assert.match(text(c.querySelector('.actions')),/Reading Duncan Rogoff…/);
  state.trending={...state.trending,items:[...state.trending.items,trend('ddddddddddd','Brand new video')],updatedAt:'2026-10-29T08:00:00.000Z'};
  await emit('done',{videos:4,added:2,channels:3,failed:['Metics Media']});
  assert.match(text(c.querySelector('.actions')),/Updated Oct 29 · 4 videos/);
  assert.ok(cards(c).includes('Brand new video'));
  assert.ok(toasts(c).includes('2 new videos'));
  assert.equal(text(c.querySelector('.small.muted')),"Couldn't read Metics Media. Their earlier videos stay.");
  await press(button(c,'Refresh'));
  await emit('failed',{message:'Nothing could be read.'});
  assert.equal(text(c.querySelector('[role="alert"] p')),'Nothing could be read.');
  await press(button(c.querySelector('[role="alert"]')!,'Try again'));
  assert.equal(writes(calls).filter(w=>w==='POST /trending/refresh').length,3);
 });
});

test('Break down on a Working now video opens the drawer and runs the job; one already made opens at once',async()=>{
 const saved:BreakdownSummary={id:'bd_aaaaaaaaaaaa',url:'https://youtu.be/bbbbbbbbbbb',platform:'youtube',createdAt:'2026-10-27T00:00:00.000Z',title:'Agents',channel:'Metics Media'};
 const s=trendServer({breakdowns:[saved],saved:{bd_aaaaaaaaaaaa:breakdown({url:'https://youtu.be/bbbbbbbbbbb'})}});
 await mount(navigate=>createElement(TrendingScreen,{navigate}),s,async (ui,_s,calls,routes)=>{
  const c=ui.container;
  const [first,second]=c.querySelectorAll('.card.trend');
  assert.deepEqual([texts(first,'.foot .btn')[0],texts(second,'.foot .btn')[0]],['Break down','Open breakdown']);
  await press(button(first,'Break down'));
  const drawer=c.querySelector('.drawer')!;
  assert.match(text(drawer.querySelector('.dh')),/Breakdown\s*· Duncan Rogoff \| AI/);
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'})}`]);
  assert.equal(text(drawer.querySelector('.bd-head .grow > div')),'Claude Code in 20 minutes');
  await press(drawer.querySelector('[aria-label="Close"]')!);
  assert.ok(c.querySelector('.drawer')===null);
  assert.ok(calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j1'),'closing the drawer stops a breakdown that is running');

  const before=writes(calls).length;
  await press(button(second,'Open breakdown'));
  assert.equal(writes(calls).length,before,'nothing runs again');
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
  await press(button(c.querySelectorAll('.drawer .concept')[0],'Add to my ideas'));
  assert.deepEqual(routes.at(-1),{name:'ideas',new:'added0'});
 });
});

test('Turn a Working now video into an idea: added once, with a button to open it; a second press only says so',async()=>{
 await mount(navigate=>createElement(TrendingScreen,{navigate}),trendServer(),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  await press(c.querySelector('.card.trend .foot .icon-only')!);
  assert.equal(writes(calls).at(-1),'POST /trending/idea {"videoId":"aaaaaaaaaaa"}');
  assert.ok(toasts(c).includes('Added to your ideasOpen'));
  await press(button(c.querySelector('.cc-toast')!,'Open'));assert.deepEqual(routes.at(-1),{name:'ideas',new:'idea-t'});
 });
 const made=base('idea-t','Claude Code in 20 minutes','ideas',{idea:{sources:[{label:'Claude Code in 20 minutes (Duncan Rogoff | AI)',url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'}]}});
 await mount(navigate=>createElement(TrendingScreen,{navigate}),trendServer({videos:[made]}),async (ui,_s,calls,routes)=>{
  const first=ui.container.querySelector('.card.trend')!;
  const idea=first.querySelector('.foot .icon-only')!;
  assert.equal(idea.getAttribute('aria-label'),'In your ideas');
  await press(idea);
  assert.equal(writes(calls).length,0,'no second idea');assert.deepEqual(routes.at(-1),{name:'ideas',open:'idea-t'});
 });
});

// ---------------------------------------------------------------- Signals

const longText='A'.repeat(300);
const signalItems=()=>[
 post('1','Claude can now run your inbox',{likes:900,ageHours:5,flair:'News',media:{type:'image',url:'https://pbs.example.com/pic.jpg'}}),
 post('2','Which agent framework do you use?',{source:'reddit',author:'r/ClaudeAI',handle:'maya',likes:300,ageHours:30,reason:'Because you picked AI agents'}),
 post('3',longText,{source:'reddit',author:'r/ClaudeAI',handle:'bo',likes:100,ageHours:3,media:{type:'video',url:null}}),
 post('4','Resident Evil fan game released',{likes:2000,ageHours:2,fit:false,reason:null}),
];
const signalServer=(over:Partial<Server>={})=>server({signals:{items:signalItems(),updatedAt:'2026-10-28T09:00:00.000Z',errors:[]},workspace:profile('Maya Lopez',['Claude','AI agents']),...over});

test('Signals ranks posts for you with their numbers and media, filters by source, and hides the rest behind Show everything',async()=>{
 await mount(navigate=>createElement(SignalsScreen,{navigate}),signalServer(),async ui=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Signals');
  assert.match(text(c.querySelector('.actions')),/Updated Oct 28 · 4 posts/);
  assert.deepEqual(texts(c,'.seg:first-of-type button'),['All 3','X 1','Reddit 2']);
  assert.match(text(c.querySelector('.row .small')),/Matched to Claude, AI agents/);
  const posts=()=>texts(c,'.card.sig .text');
  assert.deepEqual(posts().map(t=>t.slice(0,18)),['Claude can now run','Which agent framew','AAAAAAAAAAAAAAAAAA'],'most liked first, the Resident Evil game left out');
  const first=c.querySelector('.card.sig')!;
  assert.equal(text(first.querySelector('.who .n')),'Alex Finn');assert.equal(text(first.querySelector('.who .h')),'@alexfinn · 5h');
  assert.equal(text(first.querySelector('.reason')),'Because you picked Claude');assert.equal(text(first.querySelector('.chip')),'News');
  assert.deepEqual(texts(first,'.stats > span'),['900','80']);
  assert.equal(first.querySelector('img.media')!.getAttribute('src'),'https://pbs.example.com/pic.jpg');
  const open=first.querySelector('a[aria-label="Open post"]')!;assert.equal(open.getAttribute('href'),'https://x.com/alexfinn/status/1');assert.equal(open.getAttribute('rel'),'noopener noreferrer');
  const reddit=c.querySelectorAll('.card.sig')[1];assert.equal(text(reddit.querySelector('.who .h')),'u/maya · 1d'.replace('1d','30h'));
  const long=c.querySelectorAll('.card.sig')[2];
  assert.equal(text(long.querySelector('.text')),`${'A'.repeat(250)}…Show more`,'long posts are cut');
  assert.equal(text(long.querySelector('a.btn')),'Watch the video');
  await press(button(long,'Show more'));assert.match(text(long.querySelector('.text')),/^A{300}Show less$/);

  await press([...c.querySelectorAll('.seg button')].find(b=>/^Reddit/.test(b.textContent!))!);
  assert.equal(posts().length,2);
  await press(button(c,'Newest'));assert.deepEqual(posts().map(t=>t.slice(0,6)),['AAAAAA','Which '],'newest first');
  await press([...c.querySelectorAll('.seg button')].find(b=>/^All/.test(b.textContent!))!);
  await press(button(c,'Show everything (1 more, not about your topics)'));
  assert.equal(posts().length,4);assert.equal(c.querySelectorAll('.card.sig .reason').length,3,'the post that is not about your topics says nothing');
  assert.ok(button(c,"Hide posts that aren't about your topics"));
 });
});

test('Turn a post into an idea: the card says In ideas afterwards; nothing matching offers Show everything',async()=>{
 await mount(navigate=>createElement(SignalsScreen,{navigate}),signalServer(),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  await press(button(c.querySelector('.card.sig')!,'Turn into idea'));
  assert.equal(writes(calls).at(-1),'POST /signals/idea {"id":"1"}');
  assert.ok(toasts(c).includes('Added to your ideasOpen'));
  await press(button(c.querySelector('.cc-toast')!,'Open'));assert.deepEqual(routes.at(-1),{name:'ideas',new:'idea-s'});
 });
 const made=base('idea-s','Claude can now run your inbox','ideas',{idea:{sources:[{label:'x',url:'https://x.com/alexfinn/status/1'}]}});
 await mount(navigate=>createElement(SignalsScreen,{navigate}),signalServer({videos:[made]}),async ui=>{
  assert.equal(text(ui.container.querySelector('.card.sig .foot .chip')),'In ideas');
  assert.ok(ui.container.querySelector('.card.sig')!.querySelector('.foot .btn:not(.icon-only)')===null);
 });
 await mount(navigate=>createElement(SignalsScreen,{navigate}),signalServer({signals:{items:[post('9','Unrelated',{fit:false,reason:null})],updatedAt:'2026-10-28T09:00:00.000Z',errors:[]}}),async ui=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'No posts about your topics right now');
  await press(button(c.querySelector('.empty')!,'Show everything'));
  assert.equal(c.querySelectorAll('.card.sig').length,1);
 });
});

test('Refresh on Signals follows the job, shows sources that could not be read and any note from the server',async()=>{
 const s=signalServer({signals:{items:signalItems(),updatedAt:'2026-10-28T09:00:00.000Z',errors:['r/ClaudeAI']}});
 await mount(navigate=>createElement(SignalsScreen,{navigate}),s,async (ui,state,calls)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.small.muted')),"Couldn't read r/ClaudeAI.");
  await press(button(c,'Refresh'));
  assert.equal(writes(calls).at(-1),'POST /signals/refresh');
  await emit('progress',{message:'Reading r/ClaudeAI…'});assert.match(text(c.querySelector('.actions')),/Reading r\/ClaudeAI…/);
  state.signals={items:signalItems().slice(0,2),updatedAt:'2026-10-29T08:00:00.000Z',errors:[]};
  await emit('done',{posts:2,added:1,errors:[],note:'X posts refresh when treg is connected.'});
  assert.match(text(c.querySelector('.actions')),/Updated Oct 29 · 2 posts/);
  assert.ok(toasts(c).includes('1 new post'));
  assert.equal(text(c.querySelector('.small.muted')),'X posts refresh when treg is connected.');
 });
 await mount(navigate=>createElement(SignalsScreen,{navigate}),server(),async ui=>{
  assert.equal(text(ui.container.querySelector('.empty h3')),'No posts yet');
  assert.ok(button(ui.container.querySelector('.empty')!,'Refresh'));
 });
});

// ---------------------------------------------------------------- Overview

const overviewVideos=()=>[
 base('r1','Agents for small shops','recording',{updatedAt:'2026-10-07T00:00:00.000Z',recorderProjectId:'proj1',publishDate:'2026-11-05'}),
 base('p1','Hidden features in Claude Code','planning',{updatedAt:'2026-10-05T00:00:00.000Z'}),
 base('i1','Claude for receipts','ideas',{idea:{demand:rated('high','x'),gap:rated('mid','y')}}),
 base('d1','Already out','published',{publishedAt:'2026-10-02',youtubeUrl:VIDEO_URL}),
];
const fullServer=()=>server({
 videos:overviewVideos(),recent:['p1','r1'],workspace:profile('Samin Yasar',['Claude']),projects:[{id:'proj1',sceneCount:3,recordedSceneCount:1}],outlines:{p1:6},
 trending:{items:trendItems(),updatedAt:'2026-10-28T09:00:00.000Z',followed:3},signals:{items:signalItems(),updatedAt:'2026-10-28T09:00:00.000Z',errors:[]},
});

test('Overview: greeting, what you left, production counts, the next ideas, what is working now and the latest signals',async()=>{
 const opened:string[]=[];
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>opened.push('new')}),fullServer(),async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.match(text(c.querySelector('h1')),/^Good (morning|afternoon|evening), Samin$/);
  assert.equal(text(c.querySelector('.lede')),'2 videos in production · 1 idea waiting · 1 published');
  assert.equal(c.querySelector('.btn.primary')!.textContent,'New video');
  await press(c.querySelector('.btn.primary')!);assert.deepEqual(opened,['new']);

  assert.equal(text(c.querySelector('.sec-head h2')),'Pick up where you left off');
  const resume=c.querySelectorAll('.resume .card');
  assert.deepEqual([...resume].map(card=>text(card.querySelector('.title'))),['Hidden features in Claude Code','Agents for small shops'],'the one opened last first');
  assert.equal(text(resume[0].querySelector('.chip.solid')),'Planning');
  assert.equal(text(resume[0].querySelector('.row.small')),'Planning · 6 scenes drafted');assert.equal(resume[0].querySelectorAll('.dots i').length,6);
  assert.equal(text(resume[1].querySelector('.row.small')),'Recording · 1 of 3 scenes');assert.deepEqual([...resume[1].querySelectorAll('.dots i')].map(i=>i.className),['kept','none','none']);
  assert.deepEqual([texts(resume[0],'.btn')[0],texts(resume[1],'.btn')[0]],['Continue to recording','Record scene 2']);
  assert.match(text(resume[1]),/Nov 5/);
  await press(button(resume[1],'Record scene 2'));assert.deepEqual(routes.at(-1),{name:'video',id:'r1',tab:'record'});
  await press(resume[0]);assert.deepEqual(routes.at(-1),{name:'video',id:'p1'});

  assert.deepEqual(texts(c,'.pipeline .pipe-row').map(t=>t.replace(/\s+/g,' ')),['Ideas1','Planning1','Recording1','Editing0','Publishing0','Published1']);
  assert.deepEqual(texts(c,'.list-card .li .tt'),['Claude for receipts']);
  assert.deepEqual(texts(c,'.card.trend .tt'),['Claude Code in 20 minutes','Agents that run a shop'],'what is working for you');
  assert.ok(c.querySelector('.card.trend .foot')===null,'compact cards have no buttons');
  assert.equal(text(c.querySelector('.card.trend .reason')),'Because you picked Claude');
  assert.match(text(c),/See all 3/);
  const lists=c.querySelectorAll('.list-card');
  assert.match(text(lists[lists.length-1].querySelector('.li')),/Alex Finn · 5hClaude can now run your inbox900/);
  assert.equal(lists[lists.length-1].querySelectorAll('.li').length,3,'the posts about your topics, not the Resident Evil game');
  await press(button(c,'See all 3'));assert.deepEqual(routes.at(-1),{name:'trending'});
 });
});

test('Overview for a channel with nothing in production is the first-video checklist, in second person and with no one else\'s name',async()=>{
 const s=server({workspace:profile('Maya Lopez',['Claude','AI agents'],['Complete beginners']),trending:{items:trendItems(),updatedAt:'2026-10-28T09:00:00.000Z',followed:3},signals:{items:signalItems(),updatedAt:null,errors:[]}});
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>{}}),s,async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.match(text(c.querySelector('h1')),/, Maya$/);
  assert.equal(text(c.querySelector('.lede')),"Let's find your first video. Start with what's already working in your space.");
  assert.ok(c.querySelector('.btn.primary')===null,'the checklist has its own primary button');
  assert.equal(text(c.querySelector('h2.sec')),'Your first video');
  assert.deepEqual(texts(c,'.card > div:first-child > .row > div > div:first-child').slice(0,4),['Connect your AI','Tell CreatorClub your space','Pick your first idea','Plan it, record the scenes, edit, publish']);
  assert.ok(c.querySelector('.resume')===null);assert.ok(c.querySelector('.pipeline')===null);
  assert.doesNotMatch(text(c),/Samin|Resident Evil/);
  const picks=c.querySelectorAll('.card.trend.hov');
  assert.ok(picks.length>=2);assert.equal(text(picks[0].querySelector('.reason')),'Because you picked Claude');
  assert.equal(text(picks[1].querySelector('.chip.mult')),'—','a grey dash when the usual is not known');
  await press(button(picks[0],'Break this down'));
  assert.ok(ui.container.querySelector('.drawer'));
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'})}`]);
  assert.deepEqual(routes,[]);
 });
});

test('Overview with only published videos says nothing is in production, and videos in production show a draft, not the source video',async()=>{
 const published=base('d1','Already out','published',{publishedAt:'2026-10-02',youtubeUrl:VIDEO_URL});
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>{}}),server({videos:[published]}),async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.lede')),'0 videos in production · 0 ideas waiting · 1 published');
  assert.equal(text(c.querySelector('.card .empty h3')),'Nothing in production');
  await press(button(c.querySelector('.card .empty')!,'Open Ideas'));assert.deepEqual(routes.at(-1),{name:'ideas'});
 });
 const planning=base('p1','Hidden features','planning',{idea:{sources:[{label:'v',url:VIDEO_URL}]}});
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>{}}),server({videos:[planning]}),async ui=>{
  const thumb=ui.container.querySelector('.resume .thumb')!;
  assert.ok(thumb.querySelector('img')===null,'no YouTube picture');assert.equal(text(thumb.querySelector('.tt')),'Hidden features');
 });
});

test('the greeting uses the person of the channel, and no name when only the channel name is known',async()=>{
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>{}}),server({workspace:profile('AI Business Lab',['Claude'],[],null)}),async ui=>{
  assert.match(text(ui.container.querySelector('h1')),/^Good (morning|afternoon|evening)$/,'not "Good morning, AI"');
 });
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>{}}),server({workspace:{...profile('Maya\'s AI Lab',['Claude'],[],'Maya Lopez')}}),async ui=>{
  assert.match(text(ui.container.querySelector('h1')),/, Maya$/);
 });
});

test('Overview with an idea but no video in production says to open it and start planning',async()=>{
 const s=server({videos:[base('i1','Claude for receipts','ideas')],workspace:profile('Maya Lopez')});
 await mount(navigate=>createElement(OverviewScreen,{navigate,onNewVideo:()=>{}}),s,async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.lede')),'You have 1 idea. Open one and start planning.');
  assert.match(text(c.querySelector('.card')),/You have an idea\. Open it and start planning\./);
  await press(button(c,'Open "Claude for receipts"'));assert.deepEqual(routes.at(-1),{name:'ideas',new:'i1'});
  assert.equal(text(c.querySelector('.empty h3')),'No videos to start from yet');
 });
});

// ---------------------------------------------------------------- review fixes

test('a breakdown that finished is found the next time its card opens, so it does not run (and cost) again',async()=>{
 const s=trendServer();
 await mount(navigate=>createElement(TrendingScreen,{navigate}),s,async (ui,state,calls)=>{
  const c=ui.container,card=()=>c.querySelector('.card.trend')!;
  await press(button(card(),'Break down'));
  assert.equal(writes(calls).filter(w=>w.startsWith('POST /breakdowns')).length,1);
  // The server now has it.
  state.breakdowns=[{id:'bd_aaaaaaaaaaaa',url:'https://www.youtube.com/watch?v=aaaaaaaaaaa',platform:'youtube',createdAt:'2026-10-28T00:00:00.000Z',title:'t',channel:'c'}];
  state.saved={bd_aaaaaaaaaaaa:breakdown({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'})};
  await emit('done',breakdown({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'}));
  await settle();
  await press(c.querySelector('.drawer [aria-label="Close"]')!);
  assert.equal(text(card().querySelector('.foot .btn')),'Open breakdown');
  await press(button(card(),'Open breakdown'));
  assert.equal(writes(calls).filter(w=>w.startsWith('POST /breakdowns')).length,1,'no second run');
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
 });
});

test('a link whose breakdown the server already has shows it at once',async()=>{
 const s=server();
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),s,async (ui,_s,calls)=>{
  const c=ui.container;
  const inner=globalThis.fetch;
  globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>String(input)==='/api/club/breakdowns'&&init?.method==='POST'
   ?new Response(JSON.stringify(breakdown()),{status:200,headers:{'content-type':'application/json'}}):inner(input,init)) as typeof fetch;
  await type(c.querySelector('.breakbar input')!,VIDEO_URL);
  await press(button(c,'Break down'));
  assert.deepEqual(texts(c,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
  assert.equal(FakeEventSource.all.length,0,'no job to follow');
  globalThis.fetch=inner;void calls;
 });
});

test('on an empty New list there is one primary button, and the empty state has it',async()=>{
 await mount(navigate=>createElement(IdeasScreen,{route:{name:'ideas'},navigate}),server({trending:{items:[trend('dQw4w9WgXcQ','Receipts with Claude')],updatedAt:null,followed:1}}),async ui=>{
  const primaries=[...ui.container.querySelectorAll('.btn.primary')];
  assert.deepEqual(primaries.map(text),["Break down a video that's working"]);
 });
});

test('a Working now card and its breakdown say the same multiplier, even when the breakdown read another one',async()=>{
 const items=[trend('aaaaaaaaaaa','Claude Code in 20 minutes',{mult:6.4}),trend('bbbbbbbbbbb','Agents that run a shop',{mult:null,channel:'Metics Media'})];
 const s=server({trending:{items,updatedAt:null,followed:2},workspace:profile('Maya Lopez'),
  breakdowns:[{id:'bd_aaaaaaaaaaaa',url:'https://youtu.be/aaaaaaaaaaa',platform:'youtube',createdAt:'',title:'t',channel:'c'},{id:'bd_bbbbbbbbbbbb',url:'https://youtu.be/bbbbbbbbbbb',platform:'youtube',createdAt:'',title:'t',channel:'c'}],
  saved:{bd_aaaaaaaaaaaa:breakdown({url:'https://youtu.be/aaaaaaaaaaa',video:{...breakdown().video,multiplier:2.84}}),bd_bbbbbbbbbbbb:breakdown({id:'bd_bbbbbbbbbbbb',url:'https://youtu.be/bbbbbbbbbbb',video:{...breakdown().video,multiplier:9.5}})}});
 await mount(navigate=>createElement(TrendingScreen,{navigate}),s,async ui=>{
  const c=ui.container;
  const [first,second]=c.querySelectorAll('.card.trend');
  await press(button(first,'Open breakdown'));
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.bd-head .chip.mult'),['6.40×',"6.40× vs Duncan Rogoff's usual"],'the card says 6.40×');
  await press(c.querySelector('.drawer [aria-label="Close"]')!);
  await press(button(second,'Open breakdown'));
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.bd-head .chip.mult'),['—','— usual'],'a card with a dash is a dash here too');
 });
});
