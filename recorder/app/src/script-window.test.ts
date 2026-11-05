import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
const require=createRequire(import.meta.url);
const {createScriptWindow,teleprompterMenu,cleanRequest,DEFAULTS}=require('../desktop/script-window.cjs');

// Borumi's teleprompter window ("Open script as separate window"): its bundle use-teleprompter-context-menu-Do8ZfJQ9.js and the
// window page index-Bek2B5yO.js. These checks hold our window to them.

function harness(){
 const windows:any[]=[],handlers=new Map<string,Function>();let cursor={x:100,y:100};
 class Win extends EventEmitter {
  dead=false;shown=0;focused=0;opacity=1;protected=false;onTop:any[]=[];workspaces:any[]=[];options:any;position:[number,number];
  webContents:any=Object.assign(new EventEmitter(),{mainFrame:{url:''},messages:[] as any[],send:(...args:any[])=>this.webContents.messages.push(args),setWindowOpenHandler:(fn:Function)=>{this.webContents.openHandler=fn}});
  constructor(options:any){super();this.options=options;this.position=[options.x,options.y];windows.push(this)}
  isDestroyed(){return this.dead}destroy(){this.dead=true;this.emit('closed')}show(){this.shown++}focus(){this.focused++}
  getBounds(){return {x:this.position[0],y:this.position[1],width:this.options.width,height:this.options.height};}
  getPosition(){return this.position}setPosition(x:number,y:number){this.position=[x,y]}
  setContentProtection(v:boolean){this.protected=v}setAlwaysOnTop(...args:any[]){this.onTop=args}setVisibleOnAllWorkspaces(...args:any[]){this.workspaces=args}setOpacity(v:number){this.opacity=v}
  loadFile(file:string){this.webContents.mainFrame.url=new URL('file://'+file).href;return Promise.resolve()}
 }
 let popped:any[]=[],choose:(template:any[])=>void=()=>{};
 const Menu={buildFromTemplate:(t:any[])=>{popped=t;return {popup:({callback}:any)=>{choose(t);callback();}};}};
 const opts={BrowserWindow:Win,Menu,ipcMain:{handle:(name:string,fn:Function)=>handlers.set(name,fn),removeHandler:(name:string)=>handlers.delete(name)},screen:{getDisplayMatching:()=>({workArea:{x:0,y:25,width:1440,height:875}}),getPrimaryDisplay:()=>({bounds:{x:0,y:0,width:1440,height:900}}),getCursorScreenPoint:()=>cursor}};
 const event=(w=windows.at(-1))=>({sender:w.webContents,senderFrame:w.webContents.mainFrame});
 const call=(name:string,...args:any[])=>handlers.get(name)!(event(),...args);
 return {windows,handlers,opts,event,call,menu:()=>popped,choose:(fn:(t:any[])=>void)=>{choose=fn;},move:(x:number,y:number)=>{cursor={x,y};}};
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const labels=(items:any[])=>items.map(i=>i.label??i.type);
const find=(items:any[],label:string)=>items.find(i=>i.label===label);

test('the menu is Borumi\'s teleprompter menu, item for item',()=>{
 const items=teleprompterMenu({...DEFAULTS,mode:'ConstSpeed',speed:14,playing:false,scriptAvailable:true,voiceAvailable:true,pick:()=>()=>{}});
 assert.deepEqual(labels(items),['Play','Rewind to start','separator','Scrolling mode','Scrolling speed','separator','Text size','Text alignment','Text width','Line height','Mirror text','separator','Theme','separator','Transparency']);
 assert.deepEqual(labels(find(items,'Scrolling mode').submenu),['Manual','Voice follow (Enhanced)','Voice follow','Constant speed (Voice activated)','Constant speed']);
 assert.deepEqual(labels(find(items,'Scrolling speed').submenu),['8','10','12','14','16','18','20','22','24','26','28','30']);
 assert.deepEqual(labels(find(items,'Text size').submenu),['16','18','20','24','28','32','36','40','44','48','52','56','64','72','80']);
 assert.deepEqual(labels(find(items,'Text alignment').submenu),['Auto','separator','Left','Center','Right']);
 assert.deepEqual(labels(find(items,'Text width').submenu),['100%','90%','80%','70%','60%','50%','40%','30%','20%','10%']);
 assert.deepEqual(labels(find(items,'Line height').submenu),['1.0','1.2','1.5','2.0','2.5']);
 assert.deepEqual(labels(find(items,'Theme').submenu),['System default','Light','Dark']);
 assert.deepEqual(labels(find(items,'Transparency').submenu),['Not transparent','10% transparent','25% transparent','50% transparent','75% transparent']);
 // Borumi's saved settings are checked: 36, Auto, 40%, 1.2, Dark, not transparent.
 const checked=(label:string)=>find(items,label).submenu.find((i:any)=>i.checked)?.label;
 assert.deepEqual(['Text size','Text alignment','Text width','Line height','Theme','Transparency','Scrolling mode','Scrolling speed'].map(checked),['36','Auto','40%','1.2','Dark','Not transparent','Constant speed','14']);
 assert.equal(find(items,'Mirror text').checked,false);
});

test('the menu follows Borumi\'s rules for what is enabled',()=>{
 const pick=()=>()=>{};
 const manual=teleprompterMenu({...DEFAULTS,mode:'Manual',speed:14,playing:false,scriptAvailable:true,voiceAvailable:true,pick});
 assert.equal(manual[0].enabled,false,'no transport in Manual');assert.equal(manual[1].enabled,false);assert.equal(find(manual,'Scrolling speed').enabled,false,'speed only for the constant modes');
 const playing=teleprompterMenu({...DEFAULTS,mode:'VoiceOptimistic',speed:14,playing:true,scriptAvailable:true,voiceAvailable:true,pick});
 assert.equal(playing[0].label,'Pause');assert.equal(playing[0].enabled,true);
 const vad=teleprompterMenu({...DEFAULTS,mode:'ConstSpeedVad',speed:20,playing:false,scriptAvailable:true,voiceAvailable:true,pick});
 assert.equal(find(vad,'Scrolling speed').enabled,true,'the voice-activated constant speed has a speed too');
 const failed=teleprompterMenu({...DEFAULTS,mode:'Voice',speed:14,playing:false,scriptAvailable:true,voiceAvailable:true,error:'Voice follow stopped.',pick});
 assert.equal(failed[0].label,'Script following error');assert.equal(failed[0].enabled,false);
 const noVoice=teleprompterMenu({...DEFAULTS,mode:'Manual',speed:14,playing:false,scriptAvailable:true,voiceAvailable:false,pick});
 assert.deepEqual(find(noVoice,'Scrolling mode').submenu.map((i:any)=>i.enabled),[true,false,false,true,true],'the voice modes need the voice follower');
 const empty=teleprompterMenu({...DEFAULTS,mode:'ConstSpeed',speed:14,playing:false,scriptAvailable:false,voiceAvailable:true,pick});
 assert.ok(find(empty,'Text size').submenu.every((i:any)=>!i.enabled),'without a script the text settings wait');assert.equal(find(empty,'Mirror text').enabled,false);
 assert.ok(find(empty,'Theme').submenu.every((i:any)=>i.enabled),'theme and transparency always work');assert.ok(find(empty,'Transparency').submenu.every((i:any)=>i.enabled));
});

test('the window is a floating panel kept out of recordings, opened once and closed by its own button',async()=>{
 const h=harness(),opened:boolean[]=[],m=createScriptWindow({...h.opts,onOpen:(v:boolean)=>opened.push(v)});
 try{
  m.open();await tick();const w=h.windows[0];
  assert.equal(w.options.type,'panel');assert.equal(w.options.frame,false);assert.equal(w.options.transparent,true);assert.equal(w.options.resizable,true);
  assert.equal(w.protected,false,'shows in screenshots, like the island');assert.deepEqual(w.onTop,[true,'floating']);assert.equal(w.workspaces[1].visibleOnFullScreen,true);
  assert.equal(w.shown,1);assert.deepEqual(opened,[true]);
  assert.deepEqual(w.webContents.openHandler(),{action:'deny'});
  m.open();assert.equal(h.windows.length,1,'a second open shows the same window');assert.equal(w.focused,1);
  assert.throws(()=>h.handlers.get('script-window-read')!({sender:{},senderFrame:w.webContents.mainFrame}),/Untrusted/);
  await h.call('script-window-close');assert.equal(w.dead,true);assert.deepEqual(opened,[true,false]);assert.equal(m.isOpen(),false);
 }finally{m.dispose();}
});

test('settings are kept with the window\'s place; transparency is the window\'s opacity',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'script-window-')),preferencesPath=path.join(dir,'script-window.json');
 let h=harness(),m=createScriptWindow({...h.opts,preferencesPath});
 try{
  m.open();await tick();let w=h.windows[0];assert.deepEqual([w.options.width,w.options.height],[800,500]);assert.equal(w.options.x,320,'centred on the display');
  assert.deepEqual(h.call('script-window-read').settings,DEFAULTS,'Borumi\'s saved teleprompter settings');
  h.call('script-window-settings',{fontSize:48,transparency:.25,theme:'Light'});assert.equal(w.opacity,.75);
  assert.deepEqual(w.webContents.messages.at(-1),['script-window-state',{settings:{...DEFAULTS,fontSize:48,transparency:.25,theme:'Light'}}]);
  assert.throws(()=>h.call('script-window-settings',{transparency:.3}),/Invalid/);assert.throws(()=>h.call('script-window-settings',{theme:'Sepia'}),/Invalid/);
  // Dragging moves the window by the cursor's travel.
  h.call('script-window-drag','start',{x:100,y:100});h.call('script-window-drag','move',{x:160,y:130});h.call('script-window-drag','end');assert.deepEqual(w.position,[380,243]);
  assert.throws(()=>h.call('script-window-drag','move',{x:'a'}),/Invalid/);
  m.close();m.dispose();
  h=harness();m=createScriptWindow({...h.opts,preferencesPath});m.open();await tick();w=h.windows[0];
  assert.deepEqual([w.options.x,w.options.y],[380,243]);assert.equal(w.opacity,.75);assert.equal(h.call('script-window-read').settings.fontSize,48);
 }finally{m.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});

test('the window shows the island\'s take and follower, and its changes go to the island only during a take',async()=>{
 const h=harness(),requests:any[]=[],m=createScriptWindow({...h.opts,onRequest:(r:any)=>requests.push(r)});
 try{
  m.open();await tick();const w=h.windows[0];
  assert.equal(h.call('script-window-read').take.active,false);
  h.call('script-window-follow',{seek:3});assert.deepEqual(requests,[],'no take, nothing to follow');
  m.setTake({active:true,script:'One two three.',appearance:'light'});assert.deepEqual(w.webContents.messages.at(-1),['script-window-state',{take:{active:true,script:'One two three.',appearance:'light'}}]);
  m.setFollower({index:2,playing:true,mode:'ConstSpeed'});assert.deepEqual(w.webContents.messages.at(-1),['script-window-state',{follower:{index:2,playing:true,mode:'ConstSpeed'}}]);
  for(const r of [{seek:0},{mode:'Manual'},{speed:21},{playing:false},{authorize:true}])h.call('script-window-follow',r);
  assert.deepEqual(requests,[{seek:0},{mode:'Manual'},{speed:21},{playing:false},{authorize:true}]);
  assert.throws(()=>cleanRequest({speed:31}),/Invalid/);assert.throws(()=>cleanRequest({mode:'Fast'}),/Invalid/);assert.throws(()=>cleanRequest({exec:1}),/Unknown/);
  // The menu is built from what the window shows, and its choice comes back.
  h.choose(t=>t[0].click());const choice=await h.call('script-window-menu');assert.equal(choice,'pause');assert.equal(h.menu()[0].label,'Pause');
  m.setTake({active:false});assert.deepEqual(h.call('script-window-read').take,{active:false,script:'',appearance:'light'});
 }finally{m.dispose();}
});

// The page, with the window's preload replaced by a recorder of what it asks.
async function page(view:any,{width=800,height=500,choice=null as string|null}={}){
 const browser=new Window({width,height,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),recorded:any[]=[],calls={push:(c:any)=>recorded.push(JSON.parse(JSON.stringify(c)))};let push!:(patch:any)=>void;
 browser.requestAnimationFrame=((fn:any)=>setTimeout(()=>fn(performance.now()+1000),0)) as any;
 Object.assign(browser,{scriptWindow:{read:async()=>view,subscribe:(fn:any)=>{push=fn;return()=>{};},settings:async(p:any)=>{calls.push(['settings',p]);},follow:async(p:any)=>{calls.push(['follow',p]);},menu:async()=>{calls.push(['menu']);return choice;},close:async()=>{calls.push(['close']);},drag:async(p:string)=>{calls.push(['drag',p]);}}});
 browser.document.write(await readFile(new URL('../desktop/script-window.html',import.meta.url),'utf8'));
 browser.eval(await readFile(new URL('../desktop/script-follower.js',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/script-window.js',import.meta.url),'utf8'));
 await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document,el=(id:string)=>doc.getElementById(id) as any;
 const settle=()=>new Promise(resolve=>setTimeout(resolve,5));
 return {browser,doc,el,calls:recorded,settle,push:(p:any)=>push(p),close:()=>browser.happyDOM.close()};
}
const take=(script:string)=>({take:{active:true,script,appearance:'dark'},settings:{...DEFAULTS},follower:{mode:'ConstSpeed',speed:14,index:0,playing:false,voiceAvailable:true,asking:false,error:null,appName:'CreatorClub'}});

test('before a take it says "Almost there!"; a scene without a script says "Nothing to see here"',async()=>{
 const idle=await page({take:{active:false,script:'',appearance:'dark'},settings:{...DEFAULTS},follower:{}});
 try{assert.equal(idle.el('empty').hidden,false);assert.equal(idle.el('empty-title').textContent,'Almost there!');assert.equal(idle.el('toolbar-wrap').hidden,true);assert.equal(idle.el('empty').style.backgroundColor,'black','Dark, as Borumi\'s saved theme');
  await idle.el('close').dispatchEvent(new idle.browser.MouseEvent('mousedown',{bubbles:true,button:0}));assert.deepEqual(idle.calls,[['close']]);}finally{await idle.close();}
 const empty=await page(take(''));
 try{assert.equal(empty.el('empty-title').textContent,'Nothing to see here 👀');assert.equal(empty.el('view').hidden,true);}finally{await empty.close();}
});

test('the script is Borumi\'s tokens at Borumi\'s saved settings; words already read fade',async()=>{
 const t=await page(take('Hello there [smile]\nSecond line.'));
 try{
  const spans=[...t.el('tokens').querySelectorAll('.token')] as any[];
  assert.deepEqual(spans.map(s=>s.textContent),['Hello','there','[smile]','Second','line.']);assert.ok(spans[2].classList.contains('secondary'));
  assert.equal(t.el('tokens').querySelectorAll('br').length,1);assert.equal(t.el('tokens').querySelectorAll('.gap').length,1,'a 48px gap after each line');
  assert.equal(t.el('scroller').style.fontSize,'36px');assert.equal(t.el('scroller').style.lineHeight,'1.2');assert.equal(t.el('scroller').style.textAlign,'left','Auto is the start side');
  assert.equal(t.el('column').style.width,'40%');assert.ok(t.el('root').classList.contains('teleprompter-dark'));
  assert.equal(spans.filter(s=>s.classList.contains('read')).length,0,'nothing read at the start');
  t.push({follower:{index:3}});assert.deepEqual(spans.map(s=>s.classList.contains('read')),[true,true,true,true,false]);
  t.push({settings:{mirrored:true,textAlign:'Center',textWidthRatio:.7}});assert.equal(t.el('column').style.transform,'scaleX(-1)');assert.equal(t.el('scroller').style.textAlign,'center');assert.equal(t.el('column').style.width,'70%');
 }finally{await t.close();}
});

test('the toolbar: play and rewind, the three modes, text size by 4, alignment and theme; no playback in Manual',async()=>{
 const t=await page(take('One two three four.'));
 try{
  assert.equal(t.el('toolbar-wrap').hidden,false);assert.equal(t.el('play').getAttribute('aria-label'),'Start scrolling');assert.ok(t.el('mode-constant').classList.contains('active'));
  t.el('play').click();t.el('rewind').click();t.el('mode-voice').click();t.el('larger').click();t.el('align-center').click();t.el('theme').click();
  assert.deepEqual(t.calls,[['follow',{playing:true}],['follow',{seek:0}],['follow',{mode:'VoiceOptimistic'}],['settings',{fontSize:40}],['settings',{textAlign:'Center'}],['settings',{theme:'Light'}]]);
  assert.equal(t.el('theme').getAttribute('aria-label'),'Switch to dark mode');
  t.push({follower:{playing:true}});assert.equal(t.el('play').getAttribute('aria-label'),'Pause scrolling');assert.ok(t.el('play').classList.contains('active'));
  t.push({follower:{mode:'ConstSpeedVad'}});assert.ok(t.el('mode-constant').classList.contains('active'),'Voice activated shows as Constant speed');
  t.push({follower:{mode:'Voice'}});assert.ok(t.el('mode-voice').classList.contains('active'),'Voice follow shows as Enhanced');
  t.push({follower:{mode:'Manual'}});assert.equal((t.doc.querySelector('[data-control="playback"]') as any).hidden,true);
  t.push({settings:{fontSize:100}});assert.equal(t.el('larger').disabled,true);t.push({settings:{fontSize:8}});assert.equal(t.el('smaller').disabled,true);
  t.push({follower:{voiceAvailable:false}});assert.equal(t.el('mode-voice').disabled,true);
 }finally{await t.close();}
});

test('words are buttons while following: a click moves the position there; in Manual they are text',async()=>{
 const t=await page(take('One two three four.'));
 try{
  (t.el('tokens').querySelectorAll('.token')[2] as any).click();assert.deepEqual(t.calls,[['follow',{seek:2}]]);assert.ok(t.el('tokens').classList.contains('interactive'));
  t.push({follower:{mode:'Manual'}});(t.el('tokens').querySelectorAll('.token')[1] as any).click();assert.equal(t.calls.length,1);assert.equal(t.el('tokens').classList.contains('interactive'),false);
 }finally{await t.close();}
});

test('More and right-click open the menu, and each choice does what Borumi\'s does',async()=>{
 const choices:[string,any][]=[['play',['follow',{playing:true}]],['pause',['follow',{playing:false}]],['rewind',['follow',{seek:0}]],['mode:ConstSpeedVad',['follow',{mode:'ConstSpeedVad'}]],['speed:22',['follow',{speed:22}]],
  ['fontSize:56',['settings',{fontSize:56}]],['textAlign:Right',['settings',{textAlign:'Right'}]],['textWidthRatio:0.7',['settings',{textWidthRatio:.7}]],['lineHeight:2.5',['settings',{lineHeight:2.5}]],['mirrored',['settings',{mirrored:true}]],
  ['theme:Auto',['settings',{theme:'Auto'}]],['transparency:0.5',['settings',{transparency:.5}]],['transparency:none',['settings',{transparency:null}]]];
 for(const [choice,expected] of choices){
  const t=await page(take('Read this.'),{choice});
  try{t.el('more').dispatchEvent(new t.browser.MouseEvent('mousedown',{bubbles:true,button:0}));await t.settle();assert.deepEqual(t.calls,[['menu'],expected],choice);}finally{await t.close();}
 }
 const t=await page(take('Read this.'));
 try{t.el('scroller').dispatchEvent(new t.browser.MouseEvent('contextmenu',{bubbles:true}));await t.settle();assert.deepEqual(t.calls,[['menu']]);}finally{await t.close();}
});

test('voice follow\'s permission card asks above the toolbar, and Allow goes to the island',async()=>{
 const t=await page({...take('Read this.'),follower:{...take('').follower,mode:'VoiceOptimistic',asking:true}});
 try{assert.equal(t.el('speech').hidden,false);assert.equal(t.el('speech-text').textContent,'CreatorClub needs Speech Recognition permission to follow your voice.');t.el('speech-allow').click();assert.deepEqual(t.calls,[['follow',{authorize:true}]]);
  t.push({follower:{asking:false}});assert.equal(t.el('speech').hidden,true);}finally{await t.close();}
});

test('the page has Borumi\'s teleprompter colours and sizes',async()=>{
 const css=await readFile(new URL('../desktop/script-window.css',import.meta.url),'utf8');
 assert.match(css,/\.teleprompter \{[^}]*border-radius: 24px;/,'rounded-[24px]');
 assert.match(css,/--toolbar-surface: color-mix\(in srgb, var\(--bg\) 58%, var\(--fg\) 8%\);/,'the dark toolbar surface');
 assert.match(css,/\.tool \{[^}]*height: 28px; min-width: 28px;/,'h-7 min-w-7');assert.match(css,/\.gap \{ display: inline-block; height: 48px; \}/,'h-12');
 assert.match(css,/\.speed \{[^}]*width: 150px;/);assert.match(css,/\.close \{[^}]*top: 12px; right: 12px;[^}]*width: 32px; height: 32px;/);
});
