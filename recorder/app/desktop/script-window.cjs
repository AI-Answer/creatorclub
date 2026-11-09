const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');

// Borumi's teleprompter window ("Open script as separate window"; its bundle use-teleprompter-context-menu-Do8ZfJQ9.js and the window
// page index-Bek2B5yO.js). As in Borumi, the window is a second view of one script follower: the island's (script-follower.js), which
// keeps the reading position, the scrolling mode and speed, and whether it is playing. The window shows them and sends its changes back.
// The window's own settings (text size, alignment, width, line height, mirror, theme, baseline, transparency) live here.
const TEXT_SIZES=[16,18,20,24,28,32,36,40,44,48,52,56,64,72,80];
const TEXT_WIDTHS=[1,.9,.8,.7,.6,.5,.4,.3,.2,.1];
const LINE_HEIGHTS=[1,1.2,1.5,2,2.5];
const SPEEDS=[8,10,12,14,16,18,20,22,24,26,28,30];
const TRANSPARENCY=[{label:'Not transparent',value:null},{label:'10% transparent',value:.1},{label:'25% transparent',value:.25},{label:'50% transparent',value:.5},{label:'75% transparent',value:.75}];
// Borumi's saved teleprompter settings (settings.db, teleprompter_*_scope_teleprompter).
const DEFAULTS={fontSize:36,lineHeight:1.2,textAlign:'Auto',textWidthRatio:.4,baseline:.5,mirrored:false,theme:'Dark',transparency:null};
const MODES=['Manual','VoiceOptimistic','Voice','ConstSpeedVad','ConstSpeed'],VOICE=['VoiceOptimistic','Voice'];
const ALIGNS=['Auto','Left','Center','Right'],THEMES=['Auto','Light','Dark'];
const SIZE={width:800,height:500},MIN={width:200,height:150};
const near=(a,b)=>Math.abs(a-b)<.01;
const clamp=(n,lo,hi)=>Math.min(Math.max(n,lo),hi);

function cleanSettings(value){
 if(!value||typeof value!=='object')throw new Error('Invalid script settings.');
 const out={},num=(key,lo,hi)=>{if(key in value){if(!Number.isFinite(value[key]))throw new Error('Invalid '+key);out[key]=clamp(value[key],lo,hi);}};
 // The toolbar steps text size by 4 while it is above 10 and below 100 (Borumi's oe).
 num('fontSize',6,104);num('lineHeight',1,2.5);num('textWidthRatio',.1,1);num('baseline',0,1);
 for(const [key,list] of [['textAlign',ALIGNS],['theme',THEMES]])if(key in value){if(!list.includes(value[key]))throw new Error('Invalid '+key);out[key]=value[key];}
 if('mirrored'in value){if(typeof value.mirrored!=='boolean')throw new Error('Invalid mirrored');out.mirrored=value.mirrored;}
 if('transparency'in value){const t=value.transparency;if(t!==null&&!TRANSPARENCY.some(o=>o.value===t))throw new Error('Invalid transparency');out.transparency=t;}
 return out;
}
// What the island's follower reports.
function cleanFollower(value){
 if(!value||typeof value!=='object')throw new Error('Invalid script follower.');
 const out={};
 if('mode'in value){if(!MODES.includes(value.mode))throw new Error('Invalid scrolling mode');out.mode=value.mode;}
 if('speed'in value){if(!Number.isInteger(value.speed)||value.speed<8||value.speed>30)throw new Error('Invalid scrolling speed');out.speed=value.speed;}
 if('index'in value){if(!Number.isInteger(value.index)||value.index<0||value.index>1e6)throw new Error('Invalid script position');out.index=value.index;}
 for(const key of ['playing','voiceAvailable','asking'])if(key in value){if(typeof value[key]!=='boolean')throw new Error('Invalid '+key);out[key]=value[key];}
 if('error'in value){if(value.error!==null&&(typeof value.error!=='string'||value.error.length>500))throw new Error('Invalid follower error');out.error=value.error;}
 if('appName'in value){if(typeof value.appName!=='string'||value.appName.length>80)throw new Error('Invalid app name');out.appName=value.appName;}
 return out;
}
// What the window asks of the follower: one change at a time.
function cleanRequest(value){
 if(!value||typeof value!=='object')throw new Error('Invalid script request.');
 if('seek'in value){if(!Number.isInteger(value.seek)||value.seek<0||value.seek>1e6)throw new Error('Invalid script position');return {seek:value.seek};}
 if('mode'in value){if(!MODES.includes(value.mode))throw new Error('Invalid scrolling mode');return {mode:value.mode};}
 // Borumi's speed slider: 8 to 30 in steps of 1; the menu offers its even speeds.
 if('speed'in value){if(!Number.isInteger(value.speed)||value.speed<8||value.speed>30)throw new Error('Invalid scrolling speed');return {speed:value.speed};}
 if('playing'in value){if(typeof value.playing!=='boolean')throw new Error('Invalid playing');return {playing:value.playing};}
 if(value.authorize===true)return {authorize:true};
 throw new Error('Unknown script request.');
}

// Borumi's teleprompter context menu (Ge). Each item names the choice the window applies. The voice modes need the voice follower.
function teleprompterMenu(v){
 const script=Boolean(v.scriptAvailable),constant=v.mode==='ConstSpeed'||v.mode==='ConstSpeedVad',transport=!script||v.mode==='Manual',pick=v.pick;
 const error=!transport&&Boolean(v.error);
 const check=(label,checked,enabled,id)=>({label,type:'checkbox',checked:Boolean(checked),enabled:Boolean(enabled),click:pick(id)});
 const voice=script&&v.voiceAvailable!==false;
 return [
  {label:error?'Script following error':v.playing?'Pause':'Play',enabled:!transport&&!error,click:pick(v.playing?'pause':'play')},
  {label:'Rewind to start',enabled:!transport,click:pick('rewind')},
  {type:'separator'},
  {label:'Scrolling mode',submenu:[check('Manual',v.mode==='Manual',script,'mode:Manual'),check('Voice follow (Enhanced)',v.mode==='VoiceOptimistic',voice,'mode:VoiceOptimistic'),check('Voice follow',v.mode==='Voice',voice,'mode:Voice'),check('Constant speed (Voice activated)',v.mode==='ConstSpeedVad',script,'mode:ConstSpeedVad'),check('Constant speed',v.mode==='ConstSpeed',script,'mode:ConstSpeed')]},
  {label:'Scrolling speed',enabled:script&&constant,submenu:SPEEDS.map(n=>check(String(n),near(v.speed,n),script&&constant,'speed:'+n))},
  {type:'separator'},
  {label:'Text size',submenu:TEXT_SIZES.map(n=>check(String(n),near(v.fontSize,n),script,'fontSize:'+n))},
  {label:'Text alignment',submenu:[check('Auto',v.textAlign==='Auto',script,'textAlign:Auto'),{type:'separator'},...['Left','Center','Right'].map(a=>check(a,v.textAlign===a,script,'textAlign:'+a))]},
  {label:'Text width',submenu:TEXT_WIDTHS.map(n=>check(`${Math.round(n*100)}%`,near(v.textWidthRatio,n),script,'textWidthRatio:'+n))},
  {label:'Line height',submenu:LINE_HEIGHTS.map(n=>check(n.toFixed(1),near(v.lineHeight,n),script,'lineHeight:'+n))},
  check('Mirror text',v.mirrored,script,'mirrored'),
  {type:'separator'},
  {label:'Theme',submenu:[check('System default',v.theme==='Auto',true,'theme:Auto'),check('Light',v.theme==='Light',true,'theme:Light'),check('Dark',v.theme==='Dark',true,'theme:Dark')]},
  {type:'separator'},
  {label:'Transparency',submenu:TRANSPARENCY.map(o=>check(o.label,o.value===null?v.transparency==null:v.transparency!=null&&v.transparency.toFixed(2)===o.value.toFixed(2),true,'transparency:'+(o.value??'none')))}
 ];
}

// onOpen(open) tells the island when the window opens or closes; onRequest(request) passes the window's follower changes to it.
function createScriptWindow({BrowserWindow,ipcMain,screen,Menu,preferencesPath,appName='CreatorClub',onOpen=()=>{},onRequest=()=>{},nearBounds=()=>null}){
 let win=null,drag=null,disposing=false;
 let take={active:false,script:'',appearance:'dark'},follower={mode:'VoiceOptimistic',speed:14,index:0,playing:false,voiceAvailable:false,asking:false,error:null,appName};
 let saved={};try{if(preferencesPath)saved=JSON.parse(fs.readFileSync(preferencesPath,'utf8'))||{};}catch{/* Missing or damaged preferences use Borumi's defaults. */}
 const settings={...DEFAULTS};try{Object.assign(settings,cleanSettings(saved.settings||{}));}catch{/* Damaged settings use the defaults. */}
 let bounds=saved.bounds&&['x','y','width','height'].every(k=>Number.isFinite(saved.bounds[k]))?saved.bounds:null;
 const documentURL=pathToFileURL(path.join(__dirname,'script-window.html')).href;
 const alive=w=>Boolean(w&&!w.isDestroyed());
 function verify(e){if(!alive(win)||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||e.senderFrame.url!==documentURL)throw new Error('Untrusted script window.');}
 function save(){if(alive(win))bounds=win.getBounds?.()??bounds;if(!preferencesPath)return;try{fs.mkdirSync(path.dirname(preferencesPath),{recursive:true});const temp=preferencesPath+'.tmp';fs.writeFileSync(temp,JSON.stringify({version:1,bounds,settings}));fs.renameSync(temp,preferencesPath);}catch{/* Preference storage never interrupts a take. */}}
 const view=()=>({take:{...take},settings:{...settings},follower:{...follower}});
 function push(patch){if(alive(win))win.webContents.send('script-window-state',patch);}
 function applyOpacity(){if(alive(win))win.setOpacity?.(1-(settings.transparency??0));}
 function setSettings(patch){Object.assign(settings,cleanSettings(patch));applyOpacity();push({settings:{...settings}});save();}
 // The take the island is showing, or none.
 function setTake(next){const active=Boolean(next?.active);if(!active)follower={...follower,index:0,playing:false,asking:false,error:null};take={active,script:active&&typeof next.script==='string'?next.script:'',appearance:next?.appearance==='light'?'light':next?.appearance==='dark'?'dark':take.appearance};push({take:{...take},...(!active?{follower:{...follower}}:{})});}
 function setFollower(patch){const clean=cleanFollower(patch);if(!take.active)Object.assign(clean,{index:0,playing:false,asking:false,error:null});Object.assign(follower,clean);push({follower:clean});}
 function open(){
  if(alive(win)){win.show();win.focus?.();return;}
  const near=nearBounds(),display=screen.getDisplayMatching(bounds||near||screen.getPrimaryDisplay().bounds),area=display.workArea;
  const width=Math.min(Math.max(MIN.width,bounds?.width??SIZE.width),area.width),height=Math.min(Math.max(MIN.height,bounds?.height??SIZE.height),area.height);
  const x=bounds?bounds.x:area.x+Math.round((area.width-width)/2),y=bounds?bounds.y:area.y+Math.round((area.height-height)/2);
  bounds={width,height,x:Math.round(clamp(x,area.x,area.x+area.width-width)),y:Math.round(clamp(y,area.y,area.y+area.height-height))};
  win=new BrowserWindow({...bounds,minWidth:MIN.width,minHeight:MIN.height,title:`${appName} script`,type:'panel',frame:false,transparent:true,backgroundColor:'#00000000',show:false,resizable:true,alwaysOnTop:true,skipTaskbar:true,roundedCorners:true,hasShadow:true,webPreferences:{preload:path.join(__dirname,'script-window-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  // Shows in screenshots, as Borumi's script window; recordings leave it out (native-recording.swift excludes this application's windows).
  win.setAlwaysOnTop(true,'floating');
  win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  applyOpacity();
  win.on('moved',save);win.on('resized',save);
  win.on('closed',()=>{win=null;drag=null;if(!disposing)onOpen(false);});
  const current=win;onOpen(true);
  current.loadFile(path.join(__dirname,'script-window.html')).then(()=>{if(win===current&&alive(current))current.show();}).catch(()=>{if(win===current)close();});
 }
 function close(){if(!alive(win))return;save();win.destroy();}
 const handlers={
  'script-window-read':e=>{verify(e);return view();},
  'script-window-settings':(e,patch)=>{verify(e);setSettings(patch);},
  'script-window-follow':(e,request)=>{verify(e);const clean=cleanRequest(request);if(take.active)onRequest(clean);},
  'script-window-close':e=>{verify(e);close();},
  // Borumi drags the window from anywhere that is not a control; the page sends the pointer's screen position.
  'script-window-drag':(e,phase,at)=>{verify(e);const point=at&&Number.isFinite(at.x)&&Number.isFinite(at.y)&&Math.abs(at.x)<1e5&&Math.abs(at.y)<1e5?{x:at.x,y:at.y}:null;if(phase!=='end'&&!point)throw new Error('Invalid drag position.');
   if(phase==='start'){const [x,y]=win.getPosition();drag={x,y,from:point};return;}
   if(phase==='move'&&drag){win.setPosition(Math.round(drag.x+point.x-drag.from.x),Math.round(drag.y+point.y-drag.from.y));return;}
   if(phase==='end'){drag=null;save();}},
  // Borumi's context menu (request.context_menu.show): the chosen item's id comes back, and the window applies it.
  'script-window-menu':e=>{verify(e);if(!Menu)return null;
   return new Promise(resolve=>{let chosen=null;const pick=id=>()=>{chosen=id;};
    Menu.buildFromTemplate(teleprompterMenu({...settings,...follower,scriptAvailable:take.active&&Boolean(take.script.trim()),pick})).popup({window:win,callback:()=>setImmediate(()=>resolve(chosen))});});}
 };
 for(const [name,handler]of Object.entries(handlers))ipcMain.handle(name,handler);
 return {open,close,setTake,setFollower,isOpen:()=>alive(win),dispose(){disposing=true;close();for(const name of Object.keys(handlers))ipcMain.removeHandler(name);}};
}
module.exports={createScriptWindow,cleanSettings,cleanFollower,cleanRequest,teleprompterMenu,DEFAULTS,TEXT_SIZES,TEXT_WIDTHS,LINE_HEIGHTS,SPEEDS,TRANSPARENCY};
