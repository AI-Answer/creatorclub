import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Breakdown,BreakdownSummary,SignalEntry,TrendingEntry,Video,Workspace} from '../../shared/club';
import {FakeEventSource,fakeScenes,installFetch,type FakeCall,type FakeReply} from './test-fakes';
import type {DiscoverShow,Route} from './routes';
const {ToastProvider}=await import('./ui');
const {HomeScreen}=await import('./screens/HomeScreen');
const {VideosScreen}=await import('./screens/VideosScreen');
const {DiscoverScreen}=await import('./screens/DiscoverScreen');

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
 failTrending?:boolean;videos:Video[];recent:string[];trending:{items:TrendingEntry[];updatedAt:string|null;followed:number};signals:{items:SignalEntry[];updatedAt:string|null;errors:string[];sources?:number;sourcesBy?:{x:number;reddit:number}};
 breakdowns:BreakdownSummary[];saved:Record<string,Breakdown>;workspace:Workspace;projects:{id:string;sceneCount:number;recordedSceneCount:number}[];outlines:Record<string,number>;
 jobs:string[];
};
const server=(over:Partial<Server>={}):Server=>({
 videos:[],recent:[],trending:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0},signals:{items:[],updatedAt:null,errors:[]},breakdowns:[],saved:{},workspace:profile('Maya Lopez'),projects:[],outlines:{},jobs:[],...over,
});
const serve=(s:Server)=>(call:FakeCall):FakeReply=>{
 const {path,method,body}=call;
 if(path==='/videos'&&method==='GET')return {body:s.videos};
 if(path==='/videos'&&method==='POST'){const created=base('new1',(body as {title:string}).title,'ideas');s.videos=[...s.videos,created];return {status:201,body:created};}
 if(path==='/recent')return {body:s.recent};
 if(path==='/workspaces')return {body:{current:s.workspace.slug,workspaces:[s.workspace]}};
 if(path==='/trending')return s.failTrending?{status:500,body:{error:"Couldn't load what's working now."}}:{body:s.trending};
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
 if(path==='/followed')return {body:[]};
 if(path==='/signals-config')return {body:{reddit:[]}};
 if(path==='/trending/refresh'||path==='/signals/refresh'){s.jobs.push(path);return {status:202,body:{id:`j${s.jobs.length}`,status:'running'}};}
 if(path==='/trending/idea'){const videoId=(body as {videoId:string}).videoId;const made=base('idea-t',(s.trending.items.find(i=>i.videoId===videoId)!).title,'ideas',{idea:{sources:[{label:'v',url:`https://www.youtube.com/watch?v=${videoId}`}]}});s.videos=[...s.videos,made];return {status:201,body:made};}
 if(path==='/signals/idea'){const made=base('idea-s','From a post','ideas');s.videos=[...s.videos,made];return {status:201,body:made};}
 if(path==='/videos/scenes')return {body:fakeScenes(s.videos,{projects:s.projects,outlines:s.outlines})};
 const move=path.match(/^\/videos\/(\w+)\/move$/);
 if(move){s.videos=s.videos.map(v=>v.id===move[1]?{...v,stage:(body as {stage:Video['stage']}).stage}:v);return {body:s.videos.find(v=>v.id===move[1])};}
 const one=path.match(/^\/videos\/([\w-]+)$/);
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

// ---------------------------------------------------------------- Videos: the Ideas lane

const ideaVideos=()=>[
 base('i1','Claude for receipts','ideas',{createdAt:'2026-10-05T00:00:00.000Z',idea:{hook:'I let Claude do my receipts.',why:'People ask about it.',angle:'You show the setup.',twist:'Your own receipts.',demand:rated('high','Asked in comments'),gap:rated('mid','not checked'),show:rated('high','Easy'),sources:[{label:'Receipts with Claude',url:VIDEO_URL}]}}),
 base('i2','Held back idea','ideas',{hidden:'later',createdAt:'2026-10-04T00:00:00.000Z'}),
 base('i3','Not for me','ideas',{hidden:'skipped',idea:{dropReason:'Too generic'}}),
 base('p1','In planning','planning'),
];
type VideosRouteFor=Extract<Route,{name:'videos'}>;
const videosAt=(over:Partial<VideosRouteFor>={})=>(navigate:(route:Route)=>void)=>createElement(VideosScreen,{route:{name:'videos',view:'board',...over},navigate,onNewVideo:()=>{}});
const lane=(c:Element)=>c.querySelector('[data-column="ideas"]')!;
const ideaCard=(c:Element,id:string)=>c.querySelector<HTMLElement>(`[data-column="ideas"] [data-card-id="${id}"]`);
const laneIds=(c:Element)=>[...lane(c).querySelectorAll('[data-card]')].map(card=>card.getAttribute('data-card-id'));
const moreOf=(c:Element,title:string)=>c.querySelector<HTMLElement>(`button[aria-label="More about ${title}"]`)!;

test('Videos: ideas form a flat compact lane, and clicking opens the video',async()=>{
 await mount(videosAt(),server({videos:ideaVideos()}),async(ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Videos');
  assert.equal(c.querySelector('.igroup-h'),null);
  assert.deepEqual(laneIds(c),['i3','i2','i1']);
  assert.equal(text(ideaCard(c,'i1')!.querySelector('.tt')),'Claude for receipts');
  await press(ideaCard(c,'i1')!);
  assert.deepEqual(routes.at(-1),{name:'video',id:'i1'});
  assert.equal(c.querySelector('.drawer'),null);
 });
});

test('the idea drawer edits every note where it stands and deleting waits so it can be undone',async()=>{
 await mount(videosAt({open:'i1'}),server({videos:ideaVideos()}),async (ui,state,calls)=>{
  const c=ui.container;
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
  assert.ok(c.querySelector('.drawer')===null,'the drawer closes');assert.equal(ideaCard(c,'i1'),null,'the idea is gone at once');
  assert.equal(writes(calls).length,before,'but nothing is deleted on the server yet');
  assert.ok(toasts(c).includes('Idea deletedUndo'));
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.ok(ideaCard(c,'i1'),'Undo brings it back');
  assert.equal(writes(calls).some(w=>w.startsWith('DELETE')),false);
 });
});

test('the drawer of an idea that is on hold offers Restore, and the open link in the address opens it',async()=>{
 await mount(videosAt({group:'later',open:'i2'}),server({videos:ideaVideos()}),async (ui,_s,_calls,routes)=>{
  const drawer=ui.container.querySelector('.drawer')!;
  assert.equal(text(drawer.querySelector('h2')),'Held back idea');
  assert.deepEqual(texts(drawer,'.df button'),['Restore','Delete']);
  await press(drawer.querySelector('[aria-label="Close"]')!);
  assert.ok(ui.container.querySelector('.drawer')===null);assert.deepEqual(routes.at(-1),{name:'videos',view:'board',group:'later'},'the open link leaves the address');
 });
});

test('an idea opens in its drawer from the table and the calendar too',async()=>{
 const videos=[...ideaVideos(),base('i9','Dated idea','ideas',{publishDate:new Date().toISOString().slice(0,10)})];
 await mount(videosAt({view:'table'}),server({videos}),async (ui,_s,_calls,routes)=>{
  await press([...ui.container.querySelectorAll('tbody tr')].find(row=>/Claude for receipts/.test(text(row)))!);
  assert.equal(text(ui.container.querySelector('.drawer h2')),'Claude for receipts');assert.deepEqual(routes,[],'it stays on the table');
 });
 await mount(videosAt({view:'calendar'}),server({videos}),async (ui,_s,_calls,routes)=>{
  await press([...ui.container.querySelectorAll('.ev')].find(ev=>/Dated idea/.test(text(ev)))!);
  assert.equal(text(ui.container.querySelector('.drawer h2')),'Dated idea');assert.deepEqual(routes,[]);
 });
});

test('a new idea is marked and the banner starts planning it; it is the one primary button',async()=>{
 await mount(videosAt({new:'i1'}),server({videos:ideaVideos()}),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.match(text(c.querySelector('.next-idea')),/"Claude for receipts" is in your ideas\.Next: start planning it\./);
  assert.ok(ideaCard(c,'i1')!.classList.contains('new'));assert.equal(text(ideaCard(c,'i1')!.querySelector('.itag')),'New');
  assert.equal(c.querySelectorAll('.btn.primary').length,1,'one primary button on the page');
  await press(button(c.querySelector('.next-idea')!,'Start planning'));
  assert.equal(writes(calls).at(-1),'POST /videos/i1/move {"stage":"planning"}');assert.deepEqual(routes.at(-1),{name:'video',id:'i1',tab:'board'});
 });
});

test('a link from New video is broken down in a drawer on Videos: progress, why it worked, what viewers ask, three concepts; Add to my ideas marks the new idea',async()=>{
 const s=server({videos:ideaVideos(),saved:{bd_aaaaaaaaaaaa:breakdown()}});
 await mount(videosAt({bd:'dQw4w9WgXcQ'}),s,async (ui,state,calls,routes)=>{
  const c=ui.container;
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:VIDEO_URL})}`]);
  assert.deepEqual(routes.at(-1),{name:'videos',view:'board'},'the address forgets the link, so a reload does not run it again');
  assert.deepEqual(texts(c,'.bd-step'),BREAKDOWN_LABELS);
  assert.deepEqual([...c.querySelectorAll('.bd-step')].map(step=>step.className),['bd-step on','bd-step','bd-step','bd-step']);
  await emit('progress',{message:'Reading the transcript…'});
  assert.deepEqual([...c.querySelectorAll('.bd-step')].map(step=>step.className),['bd-step done','bd-step on','bd-step','bd-step']);
  await emit('progress',{message:'Reading 214 comments…'});await emit('progress',{message:'Finding what made it work…'});
  assert.deepEqual([...c.querySelectorAll('.bd-step')].map(step=>step.className),['bd-step done','bd-step done','bd-step done','bd-step on']);
  assert.match(text(c.querySelectorAll('.bd-step')[2]),/Reading the comments · 214 comments/);
  await emit('done',breakdown());

  const bd=c.querySelector('.drawer .bd')!;
  assert.equal(text(bd.querySelector('.bd-head > .grow > div')),'How I built it');
  assert.deepEqual(texts(bd,'.bd-head .chip.outline'),['7.6M views','140K','12K','3 days ago']);
  assert.deepEqual(texts(bd,'.bd-head .chip.mult'),["2.84×","2.84× vs Duncan Rogoff's usual"],'one number, always against that creator');
  assert.deepEqual(texts(bd,'.bd-grid ol > li'),['Clear claim','Fast demo']);
  assert.deepEqual(texts(bd,'.q'),['Does it work on a free plan?90','What about Windows?']);
  assert.deepEqual(texts(bd,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
  assert.doesNotMatch(text(c),/Samin/);
  await press(button(bd,'Show the full breakdown'));
  assert.match(text(bd),/Title and packaging\. A bold claim\./);assert.match(text(bd),/Reusable outline\./);

  await press(button(bd.querySelectorAll('.concept')[1],'Add to my ideas'));
  assert.equal(writes(calls).at(-1),'POST /breakdowns/bd_aaaaaaaaaaaa/concepts/1/add');
  assert.deepEqual(routes.at(-1),{name:'videos',view:'board',new:'added1'});
  assert.equal(state.videos.some(v=>v.id==='added1'),true);
  assert.equal(c.querySelector('.drawer'),null,'the drawer closes on the new idea');
 });
 await mount(videosAt({bd:'https://www.instagram.com/reel/C8aBcD_eFgH/'}),server(),async (_ui,_s,calls)=>{
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:'https://www.instagram.com/reel/C8aBcD_eFgH/'})}`],'an Instagram link works too');
 });
});
const BREAKDOWN_LABELS=['Reading the video','Reading the transcript','Reading the comments','Writing concepts'];

test('a breakdown that fails says one sentence with Try again, and a dropped video file runs it from the file',async()=>{
 await mount(videosAt({bd:'https://www.instagram.com/reel/C8aBcD_eFgH/'}),server(),async (ui,_s,calls)=>{
  const c=ui.container;
  await emit('failed',{message:'Instagram blocked the download. Drop the video file here instead.'});
  assert.equal(text(c.querySelector('[role="alert"] p')),'Instagram blocked the download. Drop the video file here instead.');
  assert.match(text(c.querySelector('.bd')),/Drop a video file here/);
  await press(button(c.querySelector('.drawer')!,'Try again'));
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

test('leaving a breakdown that is still running stops its job',async()=>{
 FakeEventSource.install();
 const fake=installFetch(serve(server()));
 const ui=await mountUI(createElement(ToastProvider,null,videosAt({bd:'dQw4w9WgXcQ'})(()=>{})));
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
 const ui=await mountUI(createElement(ToastProvider,null,videosAt({bd:'dQw4w9WgXcQ'})(()=>{})));
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

// ---------------------------------------------------------------- Discover

const trendItems=()=>[
 trend('aaaaaaaaaaa','Claude Code in 20 minutes',{vpd:9000,views:50000,mult:6.4,firstSeen:'2026-10-28',ageDays:1,history:[{d:'2026-10-27',v:20000},{d:'2026-10-28',v:50000}]}),
 trend('bbbbbbbbbbb','Agents that run a shop',{kind:'creator',channel:'Metics Media',channelId:'UCFeFVytEkT8kaqPCJZGFswg',vpd:4000,views:900000,mult:null,reason:'Because you picked AI agents'}),
 trend('ccccccccccc','My cat learns to code',{vpd:99999,views:10,fit:false,reason:null,channel:'Cat Channel'}),
];
const longText='A'.repeat(300);
const signalItems=()=>[
 post('1','Claude can now run your inbox',{likes:900,ageHours:5,flair:'News',media:{type:'image',url:'https://pbs.example.com/pic.jpg'}}),
 post('2','Which agent framework do you use?',{source:'reddit',author:'r/ClaudeAI',handle:'maya',likes:300,ageHours:30,reason:'Because you picked AI agents'}),
 post('3',longText,{source:'reddit',author:'r/ClaudeAI',handle:'bo',likes:100,ageHours:3,media:{type:'video',url:null}}),
 post('4','Resident Evil fan game released',{likes:2000,ageHours:2,fit:false,reason:null}),
];
const discoverServer=(over:Partial<Server>={})=>server({
 trending:{items:trendItems(),updatedAt:'2026-10-28T09:00:00.000Z',followed:3},signals:{items:signalItems(),updatedAt:'2026-10-28T08:00:00.000Z',errors:[],sources:2},
 workspace:profile('Maya Lopez',['Claude','AI agents'],['Complete beginners']),...over,
});
const discoverAt=(show?:DiscoverShow)=>(navigate:(route:Route)=>void)=>createElement(DiscoverScreen,{show,navigate});
const rows=(c:Element)=>[...c.querySelectorAll('.feed .frow')];
const rowTitles=(c:Element)=>rows(c).map(row=>row.getAttribute('data-kind')==='video'?text(row.querySelector('.tt')):text(row.querySelector('.text')).slice(0,12));
const chip=(c:Element,label:string)=>[...c.querySelectorAll('.disc-views .seg button, .disc-sources button')].find(b=>text(b).startsWith(label))!;

test('Discover: videos and posts in one ranked feed, a view switch and source chips with counts, the multiplier with its legend, reasons and one action on every card',async()=>{
 await mount(discoverAt(),discoverServer(),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Research');
  assert.match(text(c.querySelector('.actions')),/^Updated Oct 28 · 3 videos · 4 posts/);
  assert.equal(c.querySelectorAll('.actions svg').length,1,'one refresh icon: the button\'s, none beside "Updated"');
  assert.deepEqual(texts(c,'.disc-views .seg button'),['For you 6','Followed 2'],'the view switch');
  assert.deepEqual(texts(c,'.disc-sources button'),['All 6','YouTube 3','X 1','Reddit 2'],'the sources of For you, under it');
  assert.equal(c.querySelector('.disc-views .seg button.on')!.textContent!.startsWith('For you'),true);
  assert.equal(text(c.querySelector('.disc-note')),'Matched to your topics: Claude, AI agents.','the audience is not a topic, and no sentence about a number on the picture');
  assert.equal(text(c.querySelector('label[for="discover-sort"]')),'Sort by');
  assert.deepEqual(rowTitles(c),['Claude Code in 20 minutes','Claude can n','Agents that run a shop','Which agent ','My cat learns to code','AAAAAAAAAAAA'],'ranked: each source in its own order, side by side; every video of a channel you follow is here too');
  assert.deepEqual(rows(c).map(row=>text(row.querySelector('.rank'))),['1','2','3','4','5','6']);
  const [first,post1,agents]=rows(c);
  assert.equal(first.querySelector('.thumb .chip.mult'),null,'nothing covers the picture');
  assert.equal(text(first.querySelector('.meta .chip.mult')),"6.40× vs Duncan Rogoff's usual",'the multiplier says what it is, next to it');
  assert.ok(!first.querySelector('.chip.mult')!.className.includes('blue'));
  assert.equal(text(first.querySelector('.chip.solid.br')),'New');
  assert.equal(text(first.querySelector('.reason')),'Because you picked Claude');
  assert.match(text(first.querySelector('.meta')),/Duncan Rogoff \| AI6\.40× vs Duncan Rogoff's usual50K views9K views a day1 day ago$/);
  assert.equal(text(first.querySelector('.follow')),'Following Duncan Rogoff | AI','a channel you follow says so, with no check mark');
  assert.equal(first.querySelector('.follow svg'),null);
  assert.equal(first.querySelector('.thumb img')!.getAttribute('src'),'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg');
  assert.equal(agents.querySelector('.chip.mult'),null,'no usual known yet: no pill at all');
  assert.equal(text(agents.querySelector('.follow')),'Follow this channel','in every card (shown under the pointer or on focus)');
  assert.equal(text(post1.querySelector('.who')),'Alex Finn@alexfinn · 5h');assert.equal(text(post1.querySelector('.meta .chip')),'News');
  assert.equal(post1.querySelector('.post-pic img')!.getAttribute('src'),'https://pbs.example.com/pic.jpg');
  const open=post1.querySelector('a[aria-label="Open post"]')!;assert.equal(open.getAttribute('href'),'https://x.com/alexfinn/status/1');assert.equal(open.getAttribute('rel'),'noopener noreferrer');
  const shown=(row:Element)=>[...row.querySelectorAll('.acts button')].filter(button=>!button.closest('.quiet'));
  assert.ok(rows(c).every(row=>shown(row).map(text).join()==='Turn into idea'),'one action on every card');
  assert.ok(rows(c).every(row=>shown(row)[0].getAttribute('aria-label')!.startsWith('Turn into idea')),'the accessible name holds the visible words');
  assert.ok(rows(c).every(row=>row.querySelector('.acts .quiet [aria-label="Add to Research"]')),'Add to Research on every card, under the pointer or on focus');
  const long=rows(c)[5];
  assert.equal(text(long.querySelector('.text')),`${'A'.repeat(250)}…Show more`,'long posts are cut');
  assert.match(text(long.querySelector('.meta')),/Video/);
  await press(button(long,'Show more'));assert.match(text(long.querySelector('.text')),/^A{300}Show less$/);
  assert.equal(writes(calls).length,0,'looking changes nothing');

  await press(button(c,'Show everything (1 more, off topic or under their usual)'));
  assert.deepEqual(rowTitles(c).length,7);assert.equal(rows(c).filter(row=>row.querySelector('.reason')).length,5,'what is not about your topics says no reason');
  await press(button(c,"Hide what isn't about your topics"));
  assert.equal(rows(c).length,6);

  await press(chip(c,'Followed'));
  assert.deepEqual(routes.at(-1),{name:'discover',show:'followed'},'the view is kept in the address');
  await press(chip(c,'Reddit'));
  assert.deepEqual(routes.at(-1),{name:'discover',show:'reddit'});
 });
 await mount(discoverAt('followed'),discoverServer(),async ui=>{
  assert.deepEqual(rowTitles(ui.container),['My cat learns to code','Claude Code in 20 minutes'],'Followed lists every video from the channels you follow');
  assert.equal(ui.container.querySelectorAll('.frow .reason').length,0,'Followed does not explain why');
  assert.equal(ui.container.querySelector('.disc-sources'),null,'the source chips belong to For you');
 });
 await mount(discoverAt('reddit'),discoverServer(),async ui=>{
  assert.deepEqual(rowTitles(ui.container),['Which agent ','AAAAAAAAAAAA']);
  assert.equal(ui.container.querySelector('.disc-sources button.on')!.textContent!.startsWith('Reddit'),true);
 });
});

test('Discover has one sort that says what it orders by; each chip offers the orders that fit it',async()=>{
 await mount(discoverAt(),discoverServer(),async ui=>{
  const c=ui.container,select=()=>c.querySelector('#discover-sort')!;
  assert.deepEqual([...select().querySelectorAll('option')].map(o=>o.textContent),['Views per day and likes','Newest']);
  await choose(select(),'new');
  assert.deepEqual(rowTitles(c),['AAAAAAAAAAAA','Claude can n','Claude Code in 20 minutes','Which agent ','Agents that run a shop','My cat learns to code'],'videos and posts in one order of age');
 });
 await mount(discoverAt('youtube'),discoverServer(),async ui=>{
  const c=ui.container,select=()=>c.querySelector('#discover-sort')!;
  assert.deepEqual([...select().querySelectorAll('option')].map(o=>o.textContent),['Most views per day','Most views','Furthest above their usual','Newest']);
  await choose(select(),'views');assert.deepEqual(rowTitles(c),['Claude Code in 20 minutes','Agents that run a shop','My cat learns to code'],'videos known to beat their usual come first');
 });
 await mount(discoverAt('x'),discoverServer(),async ui=>{
  assert.deepEqual([...ui.container.querySelectorAll('#discover-sort option')].map(o=>o.textContent),['Most liked','Newest']);
 });
});

test('Discover empty states: nothing on your topics offers everything; Followed with nobody followed sends you to For you; X never offers subreddits; Reddit does',async()=>{
 const off=discoverServer({trending:{items:[trend('ccccccccccc','My cat learns to code',{fit:false,reason:null,kind:'creator'})],updatedAt:'2026-10-28T09:00:00.000Z',followed:1},signals:{items:[],updatedAt:null,errors:[],sources:1}});
 await mount(discoverAt(),off,async ui=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'Nothing about your topics right now');
  await press(button(c.querySelector('.empty')!,'Show everything'));
  assert.deepEqual(rowTitles(c),['My cat learns to code']);
 });
 await mount(discoverAt('followed'),discoverServer({trending:{items:[trend('bbbbbbbbbbb','Agents that run a shop',{kind:'creator'})],updatedAt:'2026-10-28T09:00:00.000Z',followed:0}}),async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'You follow no channels yet');
  assert.equal(text(c.querySelector('.empty p')),'Follow one from For you.');
  await press(button(c,'Open For you'));assert.deepEqual(routes.at(-1),{name:'discover'});
 });
 await mount(discoverAt('youtube'),server({trending:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0}}),async (ui,_s,_calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'No channels followed yet');
  assert.equal((button(c.querySelector('.actions')!,'Refresh') as HTMLButtonElement).disabled,false,'with nobody followed, Refresh searches your topics');
  await press(button(c,'Follow channels'));assert.deepEqual(routes.at(-1),{name:'settings',section:'followed'});
 });
 await mount(discoverAt(),server({trending:{items:[],updatedAt:'2026-10-28T00:00:00.000Z',followed:0},signals:{items:[],updatedAt:null,errors:[],sources:0}}),async ui=>{
  assert.equal(text(ui.container.querySelector('.empty h3')),'Nothing to read yet');
 });
 const reddit=[post('r9','A Reddit post',{source:'reddit',author:'r/ClaudeAI'})];
 await mount(discoverAt('x'),server({signals:{items:reddit,updatedAt:null,errors:[],sources:1,sourcesBy:{x:0,reddit:1}},workspace:profile('Maya Lopez',['Claude','AI agents'])}),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'Add X accounts to read','X has no posts, even when Reddit has');
  assert.equal(c.querySelectorAll('.card button.chip').length,0,'no subreddits on the X chip');
  assert.doesNotMatch(text(c.querySelector('.feed')??c.querySelector('.card')),/r\//);
  await press(button(c,'Add sources'));assert.deepEqual(routes.at(-1),{name:'settings',section:'sources'});
  assert.deepEqual(writes(calls),[]);
 });
 await mount(discoverAt('reddit'),server({signals:{items:[],updatedAt:null,errors:[],sources:0},workspace:profile('Maya Lopez',['Claude','AI agents','Underwater basket weaving'])}),async (ui,_s,calls)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('.empty h3')),'Add subreddits to read');
  assert.deepEqual([...c.querySelectorAll('.card button.chip')].map(b=>b.textContent),['r/ClaudeAI','r/AI_Agents']);
  assert.deepEqual(writes(calls),[],'nothing is added by itself');
  await press(button(c,'r/ClaudeAI'));
  assert.deepEqual(writes(calls),['PUT /signals-config {"reddit":["ClaudeAI"]}']);
 });
 await mount(discoverAt('reddit'),discoverServer({signals:{items:[],updatedAt:null,errors:[],sources:2,sourcesBy:{x:0,reddit:2}}}),async ui=>{
  assert.equal(text(ui.container.querySelector('.empty h3')),'No Reddit posts yet');
  assert.ok(button(ui.container.querySelector('.empty')!,'Refresh'));
 });
});

test('one Refresh reads YouTube, X and Reddit with its progress; rows stay put until it is done, then New results; errors are per source and Try again reads just those',async()=>{
 const s=discoverServer({signals:{items:signalItems(),updatedAt:'2026-10-28T08:00:00.000Z',errors:['r/ClaudeAI'],sources:2}});
 await mount(discoverAt(),s,async (ui,state,calls)=>{
  const c=ui.container,refresh=()=>button(c.querySelector('.actions')!,'Refresh') as HTMLButtonElement;
  assert.deepEqual(texts(c,'[role="alert"] p'),["Couldn't read r/ClaudeAI, so their earlier posts stay."],'the last read failed there: still said after a reload');
  await press(refresh());
  assert.deepEqual(writes(calls),['POST /trending/refresh','POST /signals/refresh']);
  assert.equal(refresh().disabled,true,'one refresh at a time');
  assert.deepEqual(texts(c,'[role="alert"] p'),[],'no stale error while it reads');
  const [videosJob,postsJob]=FakeEventSource.all;
  await act(async()=>{videosJob.emit('progress',{message:'Reading Duncan Rogoff (1 of 3)…'});});
  assert.match(text(c.querySelector('.actions')),/Reading Duncan Rogoff \(1 of 3\)…/);
  await act(async()=>{videosJob.emit('progress',{message:'Reading Metics Media (2 of 3) · under a minute left…'});});
  assert.match(text(c.querySelector('.actions')),/2 of 3\) · under a minute left/,'progress with the time left');
  const before=rowTitles(c);
  state.trending={...state.trending,items:[trend('ddddddddddd','Brand new video',{vpd:99000}),...state.trending.items],updatedAt:'2026-10-29T08:00:00.000Z'};
  await act(async()=>{videosJob.emit('done',{videos:4,added:2,channels:3,failed:['Metics Media']});});await settle();
  assert.deepEqual(toasts(c),[],'the toast waits for both');
  assert.deepEqual(rowTitles(c),before,'the rows do not move while the posts are still read');
  assert.equal(refresh().disabled,true,'still reading posts');
  state.signals={items:signalItems().slice(0,2),updatedAt:'2026-10-29T09:00:00.000Z',errors:[],sources:2};
  await act(async()=>{postsJob.emit('done',{posts:2,added:1,errors:[],failed:[],note:'X posts refresh when treg is connected.',tried:2});});await settle();
  assert.match(text(c.querySelector('.actions')),/Updated Oct 29 · 4 videos · 2 posts/);
  assert.deepEqual(toasts(c),['2 new videos · 1 new post']);
  assert.deepEqual(rowTitles(c),before,'done: still the old order until asked');
  await press(button(c,'New results'));
  assert.equal(rowTitles(c)[0],'Brand new video','New results puts the new order in');
  assert.equal(c.querySelector('.disc-new'),null);
  assert.deepEqual(texts(c,'[role="alert"] p'),["Couldn't read Metics Media, so their earlier videos stay."],'r/ClaudeAI read this time, so its error is gone');
  assert.equal(text(c.querySelector('.small.muted:not(.disc-note)')),'X posts refresh when treg is connected.');

  await press(refresh());
  state.signals={...state.signals,errors:['r/AI_Agents','r/smallbusiness']};
  await act(async()=>{FakeEventSource.all[2].emit('failed',{message:'Nothing could be read.'});});
  await act(async()=>{FakeEventSource.all[3].emit('done',{posts:2,added:0,errors:['r/AI_Agents','r/smallbusiness'],failed:['r/AI_Agents','r/smallbusiness'],tried:2});});await settle();
  assert.deepEqual(texts(c,'[role="alert"] p'),['Nothing could be read.',"Couldn't read r/AI_Agents and r/smallbusiness, so their earlier posts stay."],'when every post source fails it is an error to retry, not a toast');
  assert.equal(c.querySelector('.disc-new'),null,'nothing changed, so no New results');
  await press(button(c.querySelectorAll('[role="alert"]')[1],'Try again'));
  assert.equal(writes(calls).at(-1),'POST /signals/refresh {"only":["r/AI_Agents","r/smallbusiness"]}','Try again reads just the sources that failed');
  await press(button(c.querySelectorAll('[role="alert"]')[0],'Try again'));
  assert.equal(writes(calls).at(-1),'POST /trending/refresh');
 });
 await mount(discoverAt(),discoverServer({signals:{items:[],updatedAt:null,errors:[],sources:0}}),async (ui,_s,calls)=>{
  await press(button(ui.container.querySelector('.actions')!,'Refresh'));
  assert.deepEqual(writes(calls),['POST /trending/refresh'],'with no post sources only YouTube is read');
  await emit('done',{videos:3,added:0,channels:3,failed:[]});await settle();
  assert.deepEqual(toasts(ui.container),['Nothing new since last time']);
  assert.equal(ui.container.querySelector('.disc-new'),null,'the same order needs no New results');
 });
});

test('a video row opens its breakdown in a drawer and runs the job; one already made opens at once; a concept added lands on Videos',async()=>{
 const saved:BreakdownSummary={id:'bd_aaaaaaaaaaaa',url:'https://youtu.be/bbbbbbbbbbb',platform:'youtube',createdAt:'2026-10-27T00:00:00.000Z',title:'Agents',channel:'Metics Media'};
 const s=discoverServer({breakdowns:[saved],saved:{bd_aaaaaaaaaaaa:breakdown({url:'https://youtu.be/bbbbbbbbbbb'})}});
 await mount(discoverAt('youtube'),s,async (ui,_s,calls,routes)=>{
  const c=ui.container;
  const [first,second]=rows(c);
  assert.doesNotMatch(text(first.querySelector('.meta')),/Breakdown ready/);assert.match(text(second.querySelector('.meta')),/Breakdown ready/);
  await press(first);
  const drawer=c.querySelector('.drawer')!;
  assert.match(text(drawer.querySelector('.dh')),/Breakdown\s*· Duncan Rogoff \| AI/);
  assert.deepEqual(writes(calls),[`POST /breakdowns ${JSON.stringify({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'})}`]);
  assert.equal(text(drawer.querySelector('.bd-head .grow > div')),'Claude Code in 20 minutes');
  await press(drawer.querySelector('[aria-label="Close"]')!);
  assert.ok(c.querySelector('.drawer')===null);
  assert.ok(calls.some(call=>call.method==='DELETE'&&call.path==='/jobs/j1'),'closing the drawer stops a breakdown that is running');

  const before=writes(calls).length;
  await act(async()=>{second.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});await settle();
  assert.equal(writes(calls).length,before,'nothing runs again; Enter opens it too');
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
  await press(button(c.querySelectorAll('.drawer .concept')[0],'Add to my ideas'));
  assert.deepEqual(routes.at(-1),{name:'videos',view:'board',new:'added0'});
 });
});

test('Turn into idea on a video or a post: it flips to In ideas at once, the count follows, the toast has Undo and Open; a card already made says In ideas and opens it',async()=>{
 await mount(discoverAt(),discoverServer(),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.match(text(c.querySelector('.ideas-shelf')),/Your ideas 0/);
  await press(button(rows(c)[0],'Turn into idea'));
  assert.equal(writes(calls).at(-1),'POST /trending/idea {"videoId":"aaaaaaaaaaa"}');
  assert.equal(text(rows(c)[0].querySelector('.acts button')),'In ideas','flipped at once, no refresh needed');
  assert.match(text(c.querySelector('.ideas-shelf')),/Your ideas 1/,'the count reads the videos again');
  assert.ok(toasts(c).includes('Added to your ideasUndoOpen'));
  await press(button(c.querySelector('.cc-toast')!,'Undo'));
  assert.equal(writes(calls).at(-1),'DELETE /videos/idea-t','Undo takes the new idea out');
  await settle();
  assert.equal(text(rows(c)[0].querySelector('.acts button')),'Turn into idea');
  assert.match(text(c.querySelector('.ideas-shelf')),/Your ideas 0/);
  await press(button(rows(c)[0],'Turn into idea'));
  await press(button(c.querySelectorAll('.cc-toast')[0],'Open'));assert.deepEqual(routes.at(-1),{name:'videos',view:'board',new:'idea-t'});
  await press(button(rows(c)[1],'Turn into idea'));
  assert.equal(writes(calls).at(-1),'POST /signals/idea {"id":"1"}');
 });
 const made=[
  base('idea-t','Claude Code in 20 minutes','ideas',{idea:{sources:[{label:'Claude Code in 20 minutes',url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'}]}}),
  base('idea-s','Claude can now run your inbox','ideas',{idea:{sources:[{label:'x',url:'https://x.com/alexfinn/status/1'}]}}),
 ];
 await mount(discoverAt(),discoverServer({videos:made}),async (ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.deepEqual(rows(c).slice(0,2).map(row=>text(row.querySelector('.acts .btn:not(.icon-only)'))),['In ideas','In ideas']);
  assert.ok(rows(c)[1].querySelector('.in-ideas')!.getAttribute('aria-label')!.startsWith('In ideas'));
  await press(rows(c)[1].querySelector('.in-ideas')!);
  assert.equal(writes(calls).length,0,'no second idea');assert.deepEqual(routes.at(-1),{name:'videos',view:'board',open:'idea-s'});
  assert.match(text(c.querySelector('.ideas-shelf')),/Your ideas 2/);
  await press(c.querySelector('.ideas-shelf')!);assert.deepEqual(routes.at(-1),{name:'videos',view:'board'},'the shelf is a count that opens Videos');
 });
});

test('Discover for a channel that was never filled and follows nobody searches its topics by itself, with progress, then lists what it found with Follow this channel',async()=>{
 const found=trend('sssssssssss','Home cooking basics',{kind:'creator',channel:'Chef Sam',channelId:'UCFeFVytEkT8kaqPCJZGFswg',mult:null,reason:'Because you picked Home cooking'});
 await mount(discoverAt(),server({trending:{items:[],updatedAt:null,followed:0}}),async (ui,s,calls)=>{
  const c=ui.container;
  assert.deepEqual(writes(calls),['POST /trending/refresh'],'started once, without a click');
  assert.ok(c.querySelector('[role="status"]'),'progress is shown, not an empty list');
  assert.equal(c.querySelector('.empty h3'),null);
  s.trending={items:[found],updatedAt:'2026-10-29T08:00:00.000Z',followed:0};
  await emit('done',{videos:1,added:1,channels:0,failed:[]});
  assert.deepEqual(rowTitles(c),['Home cooking basics']);
  assert.match(text(c.querySelector('.frow .reason')),/Because you picked Home cooking/);
  await press(button(c,'Follow this channel'));
  assert.equal(writes(calls).at(-1),'PUT /followed [{"name":"Chef Sam","channelId":"UCFeFVytEkT8kaqPCJZGFswg"}]');
  assert.match(text(c),/Following Chef Sam/);
  assert.equal(writes(calls).filter(w=>w==='POST /trending/refresh').length,1,'the search is not started again');
 });
});

test('a Discover row and its breakdown say the same multiplier, even when the breakdown read another one; a finished breakdown is found the next time',async()=>{
 const items=[trend('aaaaaaaaaaa','Claude Code in 20 minutes',{mult:6.4}),trend('bbbbbbbbbbb','Agents that run a shop',{mult:null,channel:'Metics Media'})];
 const s=server({trending:{items,updatedAt:null,followed:3},workspace:profile('Maya Lopez'),
  breakdowns:[{id:'bd_aaaaaaaaaaaa',url:'https://youtu.be/aaaaaaaaaaa',platform:'youtube',createdAt:'',title:'t',channel:'c'},{id:'bd_bbbbbbbbbbbb',url:'https://youtu.be/bbbbbbbbbbb',platform:'youtube',createdAt:'',title:'t',channel:'c'}],
  saved:{bd_aaaaaaaaaaaa:breakdown({url:'https://youtu.be/aaaaaaaaaaa',video:{...breakdown().video,multiplier:2.84}}),bd_bbbbbbbbbbbb:breakdown({id:'bd_bbbbbbbbbbbb',url:'https://youtu.be/bbbbbbbbbbb',video:{...breakdown().video,multiplier:9.5}})}});
 await mount(discoverAt('youtube'),s,async ui=>{
  const c=ui.container;
  await press(rows(c)[0]);
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.bd-head .chip.mult'),['6.40×',"6.40× vs Duncan Rogoff's usual"],'the row says 6.40×');
  await press(c.querySelector('.drawer [aria-label="Close"]')!);
  await press(rows(c)[1]);
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.bd-head .chip.mult'),['—','— usual'],'a row with a dash is a dash here too');
 });
 const fresh=discoverServer();
 await mount(discoverAt('youtube'),fresh,async (ui,state,calls)=>{
  const c=ui.container;
  await press(rows(c)[0]);
  assert.equal(writes(calls).filter(w=>w.startsWith('POST /breakdowns')).length,1);
  state.breakdowns=[{id:'bd_aaaaaaaaaaaa',url:'https://www.youtube.com/watch?v=aaaaaaaaaaa',platform:'youtube',createdAt:'2026-10-28T00:00:00.000Z',title:'t',channel:'c'}];
  state.saved={bd_aaaaaaaaaaaa:breakdown({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'})};
  await emit('done',breakdown({url:'https://www.youtube.com/watch?v=aaaaaaaaaaa'}));await settle();
  await press(c.querySelector('.drawer [aria-label="Close"]')!);
  assert.match(text(rows(c)[0].querySelector('.meta')),/Breakdown ready/);
  await press(rows(c)[0]);
  assert.equal(writes(calls).filter(w=>w.startsWith('POST /breakdowns')).length,1,'no second run');
  assert.deepEqual(texts(c.querySelector('.drawer')!,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
 });
});

test('Discover shows thirty cards, then Show more',async()=>{
 const many=Array.from({length:35},(_,n)=>post(`p${n}`,`Post ${n}`,{likes:1000-n}));
 await mount(discoverAt('x'),discoverServer({signals:{items:many,updatedAt:'2026-10-28T08:00:00.000Z',errors:[],sources:1}}),async ui=>{
  const c=ui.container;
  assert.equal(rows(c).length,30);
  await press(button(c,'Show 5 more'));
  assert.equal(rows(c).length,35);
 });
});

// ---------------------------------------------------------------- Home

test('Home is the video board, with six lanes, a count, and New video',async()=>{
 const opened:string[]=[];
 const videos=[base('i','jk','ideas'),base('p','Planning video','planning'),base('d','Published video','published')];
 await mount(navigate=>createElement(HomeScreen,{navigate,onNewVideo:()=>opened.push('new')}),server({videos}),async(ui,_s,calls,routes)=>{
  const c=ui.container;
  assert.equal(text(c.querySelector('h1')),'Video board');
  assert.equal(text(c.querySelector('[aria-label="Video count"]')),'3');
  assert.deepEqual([...c.querySelectorAll('[data-column]')].map(el=>el.getAttribute('data-column')),['ideas','planning','recording','editing','publishing','published']);
  assert.equal(c.querySelectorAll('[data-card]').length,3);
  assert.equal(c.querySelectorAll('.lane-add').length,6);
  assert.equal(c.querySelector('.checklist-row,.nextup,.trend,.greet'),null);
  assert.equal(c.querySelector('[role="tablist"]'),null);
  assert.equal(calls.some(call=>call.path==='/trending'||call.path==='/trending/refresh'),false);
  await press(button(c,'New video'));assert.deepEqual(opened,['new']);
  await press(c.querySelector('[data-card-id="i"]')!);assert.deepEqual(routes.at(-1),{name:'video',id:'i'});
 });
});

test('Home for an empty channel immediately shows six usable lanes',async()=>{
 await mount(navigate=>createElement(HomeScreen,{navigate,onNewVideo(){}}),server(),async ui=>{
  assert.equal(ui.container.querySelectorAll('[data-column]').length,6);
  assert.equal(ui.container.querySelectorAll('.lane-add').length,6);
  assert.equal(text(ui.container.querySelector('[aria-label="Video count"]')),'0');
  assert.equal(ui.container.querySelector('.first-steps'),null);
 });
});

// ---------------------------------------------------------------- review fixes

test('a link whose breakdown the server already has shows it at once',async()=>{
 FakeEventSource.install();
 const fake=installFetch(serve(server()));
 const inner=globalThis.fetch;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>String(input)==='/api/club/breakdowns'&&init?.method==='POST'
  ?new Response(JSON.stringify(breakdown()),{status:200,headers:{'content-type':'application/json'}}):inner(input,init)) as typeof fetch;
 const ui=await mountUI(createElement(ToastProvider,null,videosAt({bd:'dQw4w9WgXcQ'})(()=>{})));
 try{
  await settle();
  assert.deepEqual(texts(ui.container,'.concept .tt'),['Concept 1','Concept 2','Concept 3']);
  assert.equal(FakeEventSource.all.length,0,'no job to follow');
 }finally{await ui.close();globalThis.fetch=inner;fake.restore();}
});

test('the search runs only for a channel that follows too few channels and was never filled; a followed channel is not offered again',async()=>{
 const {needsSeed,followTarget}=await import('./trending-view');
 assert.equal(needsSeed({items:[],updatedAt:null,followed:0}),true);
 assert.equal(needsSeed({items:[],updatedAt:null,followed:2}),true);
 assert.equal(needsSeed({items:[],updatedAt:null,followed:3}),false);
 assert.equal(needsSeed({items:[],updatedAt:'2026-10-29T00:00:00.000Z',followed:0}),false,'it was read before');
 assert.equal(needsSeed({items:[trend('aaaaaaaaaaa','x')],updatedAt:null,followed:0}),false);
 assert.deepEqual(followTarget({kind:'creator',channel:'Chef Sam',channelId:'UCFeFVytEkT8kaqPCJZGFswg'}),{name:'Chef Sam',channelId:'UCFeFVytEkT8kaqPCJZGFswg'});
 assert.equal(followTarget({kind:'followed',channel:'Chef Sam',channelId:'UCFeFVytEkT8kaqPCJZGFswg'}),null);
 assert.equal(followTarget({kind:'creator',channel:'Chef Sam'}),null,'no channel id, nothing to follow');
});

test('For you never lists a video under its creator\'s usual; it waits under Show everything, and unknown usuals follow the known ones',async()=>{
 const {trendList,trendCounts}=await import('./trending-view');
 const items=[trend('aaaaaaaaaaa','Below',{mult:0.83,vpd:9000}),trend('bbbbbbbbbbb','Unknown',{mult:null,vpd:8000}),trend('ccccccccccc','Above',{mult:1.2,vpd:100}),trend('ddddddddddd','Exactly',{mult:1,vpd:50})];
 assert.deepEqual(trendList(items,'fit','vpd').map(i=>i.title),['Above','Exactly','Unknown']);
 assert.deepEqual(trendList(items,'all','vpd').map(i=>i.title),['Below','Unknown','Above','Exactly']);
 assert.equal(trendCounts(items).fit,3);
});
