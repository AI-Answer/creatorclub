import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Outline,Package,Video} from '../../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from '../test-fakes';
const {PackageColumn,usePackageWrite}=await import('./PackageColumn');
const {ScenesColumn}=await import('./ScenesColumn');
const {Plan}=await import('./Plan');
const {usePlan}=await import('../usePlan');
const {ToastProvider}=await import('../ui');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element|null)=>{assert.ok(element,'element to press');await act(async()=>(element as HTMLElement).click());await flush();};
/** Types into a click-to-edit field and leaves it, which is what saves it. */
const edit=async(element:Element|null,value:string)=>{assert.ok(element,'field to edit');await act(async()=>{(element as HTMLElement).innerText=value;element!.dispatchEvent(new Event('focusout',{bubbles:true}));});};
const named=(container:Element,label:string)=>container.querySelector(`[aria-label="${label}"]`);
const buttonNamed=(container:Element,text:string)=>[...container.querySelectorAll('button')].find(button=>button.textContent?.trim()===text)??null;
const menuItem=(container:Element,text:string)=>[...container.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent?.trim()===text)??null;

const empty:Package={angle:'',twist:'',titles:['','',''],thumbnailText:'',hook:{visual:'',spoken:'',text:''}};
const full:Package={demand:{level:'high',note:'many ask'},angle:'a',twist:'t',titles:['One','Two','Three'],thumbnailText:'THUMB',hook:{visual:'v',spoken:'s',text:'x'}};

test('Package column: titles, thumbnail text and the hook line first, the rest one click away under More; no ratings stay Not rated; picking a level saves only that one; the chosen title is the video title',async()=>{
 const seen:Package[]=[],picked:string[]=[];
 const ui=await mountUI(createElement(PackageColumn,{videoId:'v1',videoTitle:'Two',pkg:{...empty,titles:['One','Two',''],hook:{visual:'',spoken:'A hook',text:''}},running:false,onEdit:next=>seen.push(next),onPickTitle:title=>picked.push(title)}));
 try{
  const c=ui.container;
  assert.equal(c.querySelectorAll('.dgs-row').length,0,'why it gets watched is folded');
  assert.equal(c.querySelectorAll('.hook-row').length,0,'what the hook shows is folded');
  assert.ok(c.textContent?.includes('A hook'),'the spoken hook is shown');
  const more=c.querySelector('.pkg-more')!;assert.equal(more.getAttribute('aria-expanded'),'false');
  await press(more);assert.equal(more.getAttribute('aria-expanded'),'true');
  assert.equal(c.querySelectorAll('.hook-row').length,2);
  assert.equal(c.querySelectorAll('.dgs-row')[0].textContent?.includes('Not rated'),true);
  assert.equal(c.querySelectorAll('.dgs-row [role="textbox"]').length,0,'no note to write for a rating that was never given');
  await press(c.querySelector('[role="radiogroup"][aria-label="Demand"] button'));
  assert.deepEqual(seen.at(-1)?.demand,{level:'high',note:''});assert.equal('gap' in seen.at(-1)!,false);
  const radios=[...c.querySelectorAll('.topt')];
  assert.deepEqual(radios.map(radio=>radio.getAttribute('aria-checked')),['false','true','false']);
  await press(radios[0]);assert.deepEqual(picked,['One']);
  await press(radios[2]);assert.deepEqual(picked,['One'],'an empty option cannot be picked');
  assert.equal(c.querySelector('.prev-thumb .tt')?.textContent,'');
 }finally{await ui.close();}
});

test('Writing the package: titles are written at once while a title is empty, asked first when all are written, and the hook the same',async()=>{
 const writes:Array<string|undefined>=[];
 function Writer({pkg}:{pkg:Package|null}){
  const w=usePackageWrite(pkg,replace=>{writes.push(replace);});
  return createElement('div',null,createElement('button',{onClick:()=>w.write('titles')},'Write titles'),createElement('button',{onClick:()=>w.write('hook')},'Write the hook'),w.dialog);
 }
 const ui=await mountUI(createElement(Writer,{pkg:{...full,titles:['One','','']}}));
 try{
  const c=ui.container;
  const confirm=(text:string)=>[...c.ownerDocument.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent===text)!;
  await press(buttonNamed(c,'Write titles'));assert.deepEqual(writes,[undefined]);
  await press(buttonNamed(c,'Write the hook'));
  assert.equal(c.ownerDocument.querySelector('[role="dialog"]')?.textContent?.includes('Write the hook again?'),true,'the hook is complete: asks before replacing');
  assert.deepEqual(writes,[undefined]);
  await press(buttonNamed(c.ownerDocument.body,'Cancel'));assert.deepEqual(writes,[undefined]);
  await press(buttonNamed(c,'Write the hook'));await press(confirm('Write the hook'));
  assert.deepEqual(writes,[undefined,'hook']);
  await ui.render(createElement(Writer,{pkg:full}));
  await press(buttonNamed(c,'Write titles'));assert.equal(c.ownerDocument.querySelector('[role="dialog"]')?.textContent?.includes('Write the titles again?'),true);
  await press(confirm('Write titles'));
  assert.deepEqual(writes.slice(2),['titles']);
  await ui.render(createElement(Writer,{pkg:null}));
  await press(buttonNamed(c,'Write the hook'));assert.deepEqual(writes.slice(3),[undefined],'nothing written yet: no question');
 }finally{await ui.close();}
});

const scene=(id:string,title:string,extra:object={})=>({id,title,talkingPoints:[`${title} point`],show:`Show ${title}`,seconds:60,...extra});
const three:Outline={scenes:[scene('a','First'),scene('b','Second',{script:'Second words'}),scene('c','Third')]};

function scenesProps(over:Partial<Parameters<typeof ScenesColumn>[0]>={}){
 const edits:Outline[]=[];
 const props:Parameters<typeof ScenesColumn>[0]={target:0,onTarget(){},hasRecording:false,outline:three,known:undefined,focusId:null,drafting:false,scripting:false,onEdit:next=>edits.push(next),onFocus(){},onDraft(){},onWriteScene(){},onSceneScript(){},onRecord(){},...over};
 return {props,edits};
}
const withToasts=(props:Parameters<typeof ScenesColumn>[0])=>createElement(ToastProvider,null,createElement(ScenesColumn,props));

const rows=(c:Element)=>[...c.querySelectorAll<HTMLButtonElement>('.scene-open')];
const openScene=async(c:Element,title:string)=>press(rows(c).find(row=>row.textContent?.includes(title))??null);

test('Scenes column: collapsed rows with number, title and length; one open at a time; Alt+arrows reorder; remove has Undo; add opens the new scene',async()=>{
 const {props,edits}=scenesProps();const focused:string[]=[];props.onFocus=id=>focused.push(id);
 const ui=await mountUI(withToasts(props));
 try{
  const c=ui.container;
  assert.deepEqual([...c.querySelectorAll('.scene .n')].map(n=>n.textContent),['1','2','3']);
  assert.equal(rows(c).length,3,'every scene starts closed');
  assert.match(c.querySelector('.len')!.textContent!,/3:00/);
  assert.equal(c.querySelectorAll('.script').length,0,'a closed scene shows no script');
  assert.equal(c.querySelectorAll('.pts').length,0,'nor its talking points');
  await openScene(c,'Second');
  assert.equal(c.querySelectorAll('.script').length,1,'the open scene shows its script');assert.deepEqual(focused,['b']);
  await openScene(c,'First');
  assert.equal(c.querySelectorAll('.scene.open').length,1,'one open at a time');assert.equal(rows(c).length,2);
  await press(named(c,'Close scene'));assert.equal(rows(c).length,3);

  const alt=(row:Element,key:string)=>act(async()=>{row.dispatchEvent(new KeyboardEvent('keydown',{key,altKey:true,bubbles:true}));});
  await alt(rows(c)[0],'ArrowDown');
  assert.deepEqual(edits.at(-1)?.scenes.map(s=>s.id),['b','a','c']);
  await alt(rows(c)[2],'ArrowUp');
  assert.deepEqual(edits.at(-1)?.scenes.map(s=>s.id),['a','c','b']);
  const before=edits.length;
  await alt(rows(c)[0],'ArrowUp');
  await act(async()=>{rows(c)[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));});
  assert.equal(edits.length,before,'the first scene cannot move up, and a plain arrow does not move a row');

  await openScene(c,'Second');
  await press(c.querySelector('[aria-label="Scene options"]'));
  await press(menuItem(c,'Delete scene'));
  assert.deepEqual(edits.at(-1)?.scenes.map(s=>s.id),['a','c']);
  const undo=buttonNamed(c.ownerDocument.body,'Undo');
  assert.ok(undo,'the toast offers Undo');await press(undo);
  assert.deepEqual(edits.at(-1)?.scenes.map(s=>s.id),['a','b','c']);

  await press(buttonNamed(c,'Add scene'));
  const added=edits.at(-1)!.scenes;
  assert.equal(added.length,4);assert.equal(added[3].title,'New scene');assert.deepEqual(focused.at(-1),added[3].id);
 }finally{await ui.close();}
});

test('Scenes column: a typed scene length is saved, a bad one goes back, the target shows the total against it',async()=>{
 const targets:number[]=[];
 const {props,edits}=scenesProps({onTarget:seconds=>targets.push(seconds)});
 const ui=await mountUI(withToasts(props));
 try{
  const c=ui.container;
  await openScene(c,'First');
  const dur=c.querySelectorAll<HTMLInputElement>('.dur')[0];
  await act(async()=>{dur.value='2:30';dur.dispatchEvent(new Event('focusout',{bubbles:true}));});
  assert.equal(edits.at(-1)?.scenes[0].seconds,150);
  const count=edits.length;
  await act(async()=>{dur.value='nonsense';dur.dispatchEvent(new Event('focusout',{bubbles:true}));});
  assert.equal(edits.length,count);assert.equal(dur.value,'1:00');
  const select=named(c,'Target length') as HTMLSelectElement;
  assert.equal(c.querySelector('.len .bar'),null,'no target, no bar');
  await act(async()=>{select.value='600';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.deepEqual(targets,[600],'the choice goes to the video, not the browser');
  await ui.render(withToasts({...props,target:120}));
  assert.equal(c.querySelector('.len .bar i.over')!==null,true,'3:00 is over a 2 minute target');
  await ui.render(withToasts({...props,target:600}));
  assert.equal(c.querySelector('.len .bar i.over'),null);assert.equal(c.querySelector('.len .bar i')!.getAttribute('style')?.includes('30'),true);
 }finally{await ui.close();}
});

test('Scenes column: no scenes shows the prototype empty state with Draft scenes from board, and shimmer while drafting',async()=>{
 let drafted=0;
 const {props}=scenesProps({outline:null,onDraft:()=>{drafted++;}});
 const ui=await mountUI(withToasts(props));
 try{
  const c=ui.container;
  assert.match(c.textContent!,/No scenes yet/);
  await press(buttonNamed(c,'Draft scenes from board'));assert.equal(drafted,1);
  await ui.render(withToasts({...props,drafting:true,draftLine:'Reading the board…'}));
  assert.equal(c.querySelectorAll('.shimmer').length,4);assert.equal(buttonNamed(c,'Draft scenes from board'),null);
 }finally{await ui.close();}
});

test('Scenes column: Write script is in the scene menu, a scene being written shows a shimmer, and the strip focus scrolls to the card',async()=>{
 const wrote:string[]=[];let scrolled=0;
 const original=HTMLElement.prototype.scrollIntoView;
 HTMLElement.prototype.scrollIntoView=function(){scrolled++;};
 const {props}=scenesProps({onWriteScene:id=>wrote.push(id)});
 const ui=await mountUI(withToasts(props));
 try{
  const c=ui.container;
  await openScene(c,'First');
  await press(c.querySelector('[aria-label="Scene options"]'));
  await press(menuItem(c,'Write script for this scene'));
  await openScene(c,'Second');
  await press(c.querySelector('[aria-label="Scene options"]'));
  assert.equal(menuItem(c,'Write the script again')!==null,true,'a scene that has a script offers to write it again');
  await press(menuItem(c,'Write the script again'));
  assert.deepEqual(wrote,['a','b']);
  await ui.render(withToasts({...props,scripting:true,scriptingScene:'c'}));
  assert.ok(c.querySelector('#plan-scene-c [aria-label="Writing the script"]'),'a closed scene being written says so on its row');
  assert.equal(c.querySelectorAll('.scene.focus').length,0);
  await ui.render(withToasts({...props,scripting:true,scriptingScene:'c',focusId:'c'}));
  assert.equal(c.querySelector('#plan-scene-c')!.classList.contains('focus'),true);
  assert.equal(c.querySelector('#plan-scene-c')!.classList.contains('open'),true,'the focused scene opens');
  assert.equal(c.querySelectorAll('.script .shimmer').length,1);
  assert.ok(scrolled>0,'the card is scrolled into view');
 }finally{HTMLElement.prototype.scrollIntoView=original;await ui.close();}
});

// ---- the tab with its hook, against a scripted server

const video:Video={id:'v1',title:'Two',stage:'planning',order:1,createdAt:'',updatedAt:'',stageDates:{},planning:{research:true,package:false,outline:false}};
function Harness({events}:{events:string[]}){
 const plan=usePlan(video,{onVideo:()=>events.push('video'),onRecord:()=>events.push('record')});
 return createElement(ToastProvider,null,createElement(Plan,{video,plan,known:undefined,focusId:null,onFocus(){},onTitle:title=>events.push(`title:${title}`),onTarget:seconds=>events.push(`target:${seconds}`),onRecordScene(){}}),
  createElement('button',{onClick:()=>plan.continueAction?.run()},'Continue now'));
}
async function withPlan(reply:(call:FakeCall)=>FakeReply|Promise<FakeReply>,run:(c:Element,calls:FakeCall[],events:string[])=>Promise<void>){
 FakeEventSource.install();const server=installFetch(reply);const events:string[]=[];
 const ui=await mountUI(createElement(Harness,{events}));
 try{await flush();await run(ui.container,server.calls,events);}finally{await ui.close();server.restore();}
}
const planReply=(plan:object)=>(call:FakeCall):FakeReply=>{if(call.method==='GET'&&call.path==='/videos/v1/plan')return {body:{running:{},ready:{},...plan}};};

test('Plan tab: Write titles shows the package the server merged, and makes no save of its own',async()=>{
 const earlier:Package={...empty,angle:'Mine',titles:['Mine','',''],hook:{visual:'',spoken:'My line',text:''}};
 const merged:Package={...full,angle:'Mine',titles:['Mine','N2','N3'],hook:{visual:'nv',spoken:'My line',text:'nt'}};
 await withPlan(call=>{
  if(call.method==='POST'&&call.path==='/videos/v1/package')return {body:{value:merged,replaced:'2026-10-28T22-50-18-485Z'}};
  return planReply({package:earlier,outline:null})(call);
 },async(c,calls)=>{
  await press(buttonNamed(c,'Write with Claude'));await press(menuItem(c.ownerDocument.body,'Write titles'));await flush();
  assert.deepEqual([...c.querySelectorAll('.topt [role="textbox"]')].map(t=>t.textContent),['Mine','N2','N3']);
  assert.deepEqual(calls.filter(call=>call.method==='POST'&&call.path==='/videos/v1/package').map(call=>call.body),[undefined]);
  assert.equal(calls.some(call=>call.method==='PUT'),false,'nothing is saved over the server\'s merge');
  assert.match(c.textContent!,/Replaced the package/);
 });
});

test('Plan tab: writing a full group again asks, then tells the server which group to replace',async()=>{
 await withPlan(call=>{
  if(call.method==='POST'&&call.path==='/videos/v1/package')return {body:{value:{...full,titles:['R1','R2','R3']}}};
  return planReply({package:full,outline:null})(call);
 },async(c,calls)=>{
  await press(buttonNamed(c,'Write with Claude'));await press(menuItem(c.ownerDocument.body,'Write titles'));
  assert.equal(calls.some(call=>call.method==='POST'),false,'asked first');
  await press([...c.ownerDocument.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Write titles')!);await flush();
  assert.deepEqual(calls.filter(call=>call.method==='POST').map(call=>call.body),[{replace:'titles'}]);
  assert.deepEqual([...c.querySelectorAll('.topt [role="textbox"]')].map(t=>t.textContent),['R1','R2','R3']);
 });
});

test('Plan tab: a scene script is saved on its own route as soon as it is edited, the outline first, and a failure says one sentence with Try again',async()=>{
 const outline:Outline={scenes:[scene('a','First',{script:'Old words'}),scene('b','Second')],scriptState:'partial'};
 let fail=true;
 await withPlan(call=>{
  if(call.method==='PUT'&&call.path==='/videos/v1/script/scene/a'){
   if(fail)return {status:500,body:{error:'The script could not be saved.'}};
   const body=call.body as {text:string};outline.scenes[0].script=body.text;return {body:{outline}};
  }
  return planReply({package:null,outline})(call);
 },async(c,calls)=>{
  await openScene(c,'First');
  await edit(c.querySelector('.script [role="textbox"]'),'New words');
  await flush();
  assert.deepEqual(calls.filter(call=>call.method==='PUT').map(call=>[call.path,call.body]),[['/videos/v1/script/scene/a',{text:'New words'}]]);
  assert.match(c.querySelector('[role="alert"]')!.textContent!,/The script could not be saved/);
  fail=false;await press(buttonNamed(c,'Try again'));
  assert.equal(c.querySelector('[role="alert"]'),null);
  assert.equal(c.querySelector('.script [role="textbox"]')!.textContent,'New words');
 });
});

test('Plan tab: Write script for one scene posts its id, Write full script posts none, and Continue to recording syncs and opens Record',async()=>{
 const outline:Outline={scenes:[scene('a','First'),scene('b','Second')]};
 await withPlan(call=>{
  if(call.method==='POST'&&call.path==='/videos/v1/script')return {body:{value:{...outline,scriptState:'partial'}}};
  if(call.method==='POST'&&call.path==='/videos/v1/recorder')return {body:{...video,recorderProjectId:'p1'}};
  return planReply({package:null,outline})(call);
 },async(c,calls,events)=>{
  await openScene(c,'Second');
  await press(c.querySelector('[aria-label="Scene options"]'));await press(menuItem(c,'Write script for this scene'));
  await press(buttonNamed(c,'Write with Claude'));await press(menuItem(c,'Write the full script'));
  assert.deepEqual(calls.filter(call=>call.path==='/videos/v1/script').map(call=>call.body),[{sceneId:'b'},undefined]);
  await press(buttonNamed(c,'Continue now'));
  assert.ok(calls.some(call=>call.method==='POST'&&call.path==='/videos/v1/recorder'));
  assert.deepEqual(events,['video','record']);
 });
});

test('Plan: a package written elsewhere (Use as hook) shows when Plan opens again, and the next edit sends only the field that was edited',async()=>{
 let latest!:ReturnType<typeof usePlan>;
 const Probe=()=>{latest=usePlan(video,{onVideo(){},onRecord(){}});return createElement('span',null,latest.pkg?.hook.spoken??'none');};
 let server:Package={...full,hook:{visual:'v',spoken:'old hook',text:'x'}};
 FakeEventSource.install();
 const fake=installFetch(call=>{
  if(call.method==='GET'&&call.path==='/videos/v1/plan')return {body:{running:{},ready:{},package:server,outline:null}};
  if(call.method==='PUT'&&call.path==='/videos/v1/package'){server={...server,...(call.body as object),hook:{...server.hook,...((call.body as {hook?:object}).hook??{})}};return {body:server};}
 });
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();
  assert.equal(ui.container.textContent,'old hook');
  server={...server,hook:{...server.hook,spoken:'hook from the board'}};
  await act(async()=>{await latest.refresh();});await flush();
  assert.equal(ui.container.textContent,'hook from the board');
  await act(async()=>{latest.editPackage({...latest.pkg!,angle:'My angle'});});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,700));});
  assert.deepEqual(fake.calls.filter(call=>call.method==='PUT').map(call=>call.body),[{angle:'My angle'}],'not the whole package');
  assert.equal(server.hook.spoken,'hook from the board');
  // Behind the server: an edit made on a page that never saw the new hook still cannot put the old one back.
  server={...server,hook:{...server.hook,spoken:'written again'}};
  await act(async()=>{latest.editPackage({...latest.pkg!,twist:'My twist'});});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,700));});
  assert.equal(server.hook.spoken,'written again');
 }finally{await ui.close();fake.restore();}
});

test('Plan: a refresh waits for a save that is already on its way, so an older read cannot put the old value back',async()=>{
 let latest!:ReturnType<typeof usePlan>;
 const Probe=()=>{latest=usePlan(video,{onVideo(){},onRecord(){}});return createElement('span',null,latest.pkg?.angle??'none');};
 let server:Package={...full,angle:'old'};
 let releaseSave:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{releaseSave=resolve;});
 FakeEventSource.install();
 const fake=installFetch(async call=>{
  if(call.method==='GET'&&call.path==='/videos/v1/plan')return {body:{running:{},ready:{},package:server,outline:null}};
  if(call.method==='PUT'&&call.path==='/videos/v1/package'){await gate;server={...server,...(call.body as object)};return {body:server};}
 });
 const ui=await mountUI(createElement(Probe));
 try{
  await flush();
  await act(async()=>{latest.editPackage({...latest.pkg!,angle:'mine'});});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,700));});
  assert.equal(fake.calls.filter(call=>call.method==='PUT').length,1,'the save is on its way');
  let done=false;
  const refreshing=act(async()=>{await latest.refresh();done=true;});
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(fake.calls.filter(call=>call.method==='GET'&&call.path==='/videos/v1/plan').length,1,'it has not read yet: it waits for the save');
  releaseSave();await refreshing;
  assert.ok(done);
  assert.equal(ui.container.textContent,'mine','the edit was not reverted');
 }finally{releaseSave();await ui.close();fake.restore();}
});

test('Scenes column: what is left to decide is a folded list on the open scene, counted on its row, and Mark decided removes one',async()=>{
 const outline:Outline={scenes:[scene('a','First',{decide:['which tool to use','which features'],talkingPoints:['Say this']})]};
 const {props,edits}=scenesProps({outline});
 const ui=await mountUI(withToasts(props));
 try{
  const c=ui.container;
  assert.match(rows(c)[0].textContent!,/2 to decide/);
  await openScene(c,'First');
  const box=c.querySelector('details.decide')!;
  assert.equal(box.hasAttribute('open'),false,'folded');
  assert.equal(box.querySelector('summary')!.textContent,'To decide (2)');
  assert.ok(!c.querySelector('.pts')!.textContent!.includes('which tool'),'not among the talking points');
  await press(buttonNamed(box,'Mark decided'));
  assert.deepEqual(edits.at(-1)?.scenes[0].decide,['which features']);
 }finally{await ui.close();}
});
