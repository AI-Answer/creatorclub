import {rememberAiStatus} from '../ai-status';
import {ASK_CLAUDE} from '../workspace/ask-claude';
import {mountUI} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Outline,Package,Video} from '../../../shared/club';
import {FakeEventSource,installFetch,type FakeCall,type FakeReply} from '../test-fakes';
const {ScenesColumn}=await import('./ScenesColumn');
const {usePlan}=await import('../usePlan');
const {ToastProvider}=await import('../ui');

rememberAiStatus({claude:{installed:true,version:'test',signedIn:true},codex:{installed:false,version:null,signedIn:false}});
const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const press=async(element:Element|null)=>{assert.ok(element,'element to press');await act(async()=>(element as HTMLElement).click());await flush();};
/** Types into a click-to-edit field and leaves it, which is what saves it. */
const edit=async(element:Element|null,value:string)=>{assert.ok(element,'field to edit');await act(async()=>{(element as HTMLElement).innerText=value;element!.dispatchEvent(new Event('focusout',{bubbles:true}));});};
const named=(container:Element,label:string)=>container.querySelector(`[aria-label="${label}"]`);
const buttonNamed=(container:Element,text:string)=>[...container.querySelectorAll('button')].find(button=>button.textContent?.trim()===text)??null;
const menuItem=(container:Element,text:string)=>[...container.querySelectorAll('[role="menuitem"]')].find(item=>item.textContent?.trim()===text)??null;

const empty:Package={angle:'',twist:'',titles:['','',''],thumbnailText:'',hook:{visual:'',spoken:'',text:''}};
const full:Package={demand:{level:'high',note:'many ask'},angle:'a',twist:'t',titles:['One','Two','Three'],thumbnailText:'THUMB',hook:{visual:'v',spoken:'s',text:'x'}};

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

const video:Video={id:'v1',title:'Two',stage:'planning',order:1,createdAt:'',updatedAt:'',stageDates:{},planning:{research:true,package:false,outline:false}};

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

test('Scenes column: no scenes is one sentence and Draft scenes from the board, shimmer while drafting; with scenes the heading offers Redraft, which asks first',async()=>{
 let drafted=0,all=0;
 const {props}=scenesProps({outline:null,onDraft:()=>{drafted++;},onWriteAll:()=>{all++;}});
 const ui=await mountUI(withToasts(props));
 try{
  const c=ui.container;
  assert.equal(c.querySelectorAll('.plan-empty p').length,1);
  assert.deepEqual([...c.querySelectorAll('button')].map(b=>b.textContent?.trim()),['Add scene','Draft scenes from the board'],'manual creation alongside optional drafting');
  await press(buttonNamed(c,'Draft scenes from the board'));assert.equal(drafted,1);
  await ui.render(withToasts({...props,drafting:true,draftLine:'Reading the board…'}));
  assert.equal(c.querySelectorAll('.shimmer').length,4);assert.equal(buttonNamed(c,'Draft scenes from the board'),null);
  await ui.render(withToasts({...props,outline:three}));
  assert.equal(buttonNamed(c,'Draft scenes from the board'),null);
  await press(buttonNamed(c,'Write with Claude'));
  assert.deepEqual([...c.ownerDocument.querySelectorAll('[role="menuitem"]')].map(item=>item.textContent?.trim()),['Write the full script','Rewrite the scenes']);
  await press(menuItem(c.ownerDocument.body,'Rewrite the scenes'));
  assert.equal(drafted,1,'asked first');
  assert.match(c.ownerDocument.querySelector('[role="dialog"]')!.textContent!,/Replace the scenes\?/);
  await press(buttonNamed(c.ownerDocument.body,'Replace 3 scenes'));assert.equal(drafted,2);
  await press(buttonNamed(c,'Write with Claude'));await press(menuItem(c.ownerDocument.body,'Write the full script'));assert.equal(all,1);
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

test('Scenes column: a board card dropped on a scene becomes its last talking point; anything else dropped is ignored',async()=>{
 const {CARD_DRAG}=await import('../idea/idea-logic');
 const {props,edits}=scenesProps({acceptDrops:true});
 const ui=await mountUI(withToasts(props));
 const drop=async(target:Element,type:string,text:string)=>{
  const data={types:[type],getData:(asked:string)=>asked===type?text:'',dropEffect:'none'};
  for(const name of ['dragover','drop']){const event=new Event(name,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:data});await act(async()=>{target.dispatchEvent(event);});}
 };
 try{
  const second=ui.container.querySelectorAll('.card.scene')[1];
  await drop(second,CARD_DRAG,'A real video about pauses');
  assert.deepEqual(edits.at(-1)?.scenes[1].talkingPoints,['Second point','A real video about pauses']);
  const count=edits.length;
  await drop(second,'text/plain','Some text from elsewhere');
  assert.equal(edits.length,count,'only a board card counts');
 }finally{await ui.close();}
});
