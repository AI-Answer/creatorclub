const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');

const COMMANDS=new Set(['pause','resume','stop','retry','skip-countdown','cancel','show-editor','record','close','mirror']);
// Borumi's island sizes (screens/borumi/62, 66): the bar, the camera's height for the window's width (taller without a script), and the script's room.
// A first take's window: Borumi's compact toolbar, the camera at 60% of the width, and with a script the room Borumi gives it below.
const BAR=48,CAMERA=.6,SCRIPT=132;
const islandHeight=(width,script)=>BAR+Math.round(width*CAMERA)+(script?SCRIPT:0);
function cleanState(value,initial=false){
 if(!value||typeof value!=='object')throw new Error('Invalid recording preview state.');
 const out={};
 if('microphoneLevel'in value){if(value.microphoneLevel!==null&&(!Number.isFinite(value.microphoneLevel)||value.microphoneLevel<0||value.microphoneLevel>1))throw Error('Invalid microphone level.');out.microphoneLevel=value.microphoneLevel;}
 if('appearance'in value){if(!['light','dark'].includes(value.appearance))throw Error('Invalid appearance.');out.appearance=value.appearance;}
 for(const [key,max] of [['projectName',240],['script',100000],['cameraLabel',240],['cameraRawLabel',240],['microphoneLabel',240],['systemAudioLabel',240]])if(key in value){if(typeof value[key]!=='string'||value[key].length>max)throw new Error('Invalid '+key);out[key]=value[key];}
 if('countdown'in value){if(value.countdown!==null&&(!Number.isInteger(value.countdown)||value.countdown<1||value.countdown>3))throw new Error('Invalid recording countdown.');out.countdown=value.countdown;}
 for(const key of ['error','warning'])if(key in value){const v=value[key];if(v!==null&&(!v||typeof v.title!=='string'||typeof v.message!=='string'||v.title.length>200||v.message.length>1000))throw new Error('Invalid recording '+key+'.');out[key]=v===null?null:{title:v.title,message:v.message};}
 if('status'in value){if(!['starting','ready','recording','paused','saving','idle'].includes(value.status))throw new Error('Invalid recording status.');out.status=value.status;}
 if('elapsed'in value){if(!Number.isFinite(value.elapsed)||value.elapsed<0||value.elapsed>604800)throw new Error('Invalid recording clock.');out.elapsed=value.elapsed;}
 for(const key of ['cameraEnabled','mirror','hideMain'])if(key in value){if(typeof value[key]!=='boolean')throw new Error('Invalid '+key);out[key]=value[key];}
 if('cameraFrame'in value){if(value.cameraFrame!==null&&(typeof value.cameraFrame!=='string'||value.cameraFrame.length>350000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.cameraFrame)))throw new Error('Invalid preview frame.');out.cameraFrame=value.cameraFrame;}
 if(initial)return {projectName:'Recording',script:'',cameraEnabled:false,mirror:false,hideMain:true,status:'starting',elapsed:0,...out};
 return out;
}

// Electron does not emit 'hide' for BrowserWindow.hide() on macOS, so the HUD reports
// each editor hide/show it makes through onMainVisibility instead of relying on that event.
function createRecordingHud({BrowserWindow,ipcMain,screen,Menu,getMainWindow,verifyMain,onMainVisibility=()=>{},preferencesPath,appName='SceneForge'}){
 let hud=null,state=null,hiddenMain=false,ready=null,ending=false,sessionId=null,synced=false,area=null,bounds=null;
 let preferences={};try{if(preferencesPath)preferences=JSON.parse(fs.readFileSync(preferencesPath,'utf8'));}catch{/* Missing or damaged preferences use the compact default. */}
 const documentURL=pathToFileURL(path.join(__dirname,'recording-hud.html')).href;
 const alive=w=>Boolean(w&&!w.isDestroyed());
 function verifyHud(e){if(!alive(hud)||e.sender!==hud.webContents||e.senderFrame!==hud.webContents.mainFrame||e.senderFrame.url!==documentURL)throw new Error('Untrusted recording preview.');}
 function restore(){const main=getMainWindow();if(hiddenMain&&alive(main)){main.show();main.focus();hiddenMain=false;onMainVisibility();}hiddenMain=false;}
 function remember(){if(!alive(hud))return;bounds=hud.getBounds?.()??bounds;preferences={version:2,bounds};if(preferencesPath)try{fs.mkdirSync(path.dirname(preferencesPath),{recursive:true});const temp=preferencesPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(preferences));fs.renameSync(temp,preferencesPath);}catch{/* Preference storage never interrupts a take. */}}
 function end({restoreMain=true,id}={}){if(id&&id!==sessionId)return;ending=true;remember();if(restoreMain)restore();else hiddenMain=false;if(alive(hud))hud.destroy();hud=null;state=null;ready=null;sessionId=null;synced=false;ending=false;}
 // The loaded HUD gets the full state once, then only changed fields (it merges);
 // the script is not re-sent with every clock tick.
 function publish(patch){if(!state||!alive(hud))return;if(synced||!patch){hud.webContents.send('recording-hud-state',synced&&patch?patch:state);synced=true;}const main=getMainWindow();// As in Borumi, the editor steps away as soon as the island opens for a take (its countdown included), so the island is what you see.
  if(!hiddenMain&&state.hideMain&&['starting','recording','paused'].includes(state.status)&&alive(main)){main.hide();hiddenMain=true;onMainVisibility();}if(['saving','idle'].includes(state.status))restore();}
 async function begin(value){
  const next=cleanState(value,true);if(alive(hud))end();sessionId=randomUUID();synced=false;const id=sessionId;
  // The picture area is the camera, or the microphone's live waveform when there is no camera (as Borumi does): the island never shrinks to a bare bar.
  state={...next};const main=getMainWindow(),saved=preferences.bounds,valid=saved&&['x','y','width','height'].every(key=>Number.isFinite(saved[key]));
  const display=screen.getDisplayMatching(valid?saved:alive(main)?main.getBounds():screen.getPrimaryDisplay().bounds);area=display.workArea;
  // As Borumi's recorder, the window keeps the size it was given and its content follows that size (recording-hud.js); a first take opens
  // at 250px wide with room for the camera and, when there is one, the script.
  const width=Math.min(valid?Math.max(250,saved.width):250,area.width);
  const height=Math.min(valid?Math.max(BAR,saved.height):islandHeight(width,Boolean(next.script.trim())),area.height-12);
  bounds={width,height,x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,valid?saved.x:area.x+area.width-width-20))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,valid?saved.y:area.y+24)))};
  hud=new BrowserWindow({...bounds,minWidth:250,minHeight:48,title:`${appName} recording`,type:'panel',frame:false,transparent:true,backgroundColor:'#00000000',show:false,resizable:true,alwaysOnTop:true,skipTaskbar:true,roundedCorners:true,webPreferences:{preload:path.join(__dirname,'recording-hud-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  // Defense in depth only. macOS ScreenCaptureKit also explicitly excludes this
  // application's PID in native-recording.swift; this flag alone is insufficient.
  hud.setContentProtection(true);hud.setAlwaysOnTop(true,'floating');
  // A panel joins full-screen Spaces without the Dock hide/show process transform.
  hud.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
  hud.webContents.setWindowOpenHandler(()=>({action:'deny'}));hud.webContents.on('will-navigate',e=>e.preventDefault());
  hud.on('close',e=>{if(!ending&&state&&['starting','recording','paused'].includes(state.status)){e.preventDefault();if(alive(getMainWindow()))getMainWindow().webContents.send('recording-hud-command','stop');}else if(!ending&&state?.status==='ready'&&alive(getMainWindow()))getMainWindow().webContents.send('recording-hud-command','close');});
  hud.on('closed',()=>{hud=null;if(!ending)restore();});
  hud.on('moved',remember);hud.on('resized',remember);
  const current=hud;ready=current.loadFile(path.join(__dirname,'recording-hud.html')).then(()=>{if(hud===current&&alive(current)){current.showInactive();publish();}});
  try{await ready;return {id,visible:sessionId===id&&alive(hud)};}catch(e){end({id});throw e;}
 }
 const handlers={
  'begin-recording-hud':async(e,value)=>{verifyMain(e);return begin(value);},
  'update-recording-hud':(e,value,id)=>{verifyMain(e);const patch=cleanState(value);if(state&&(!id||id===sessionId)){state={...state,...patch};publish(patch);}return {visible:(!id||id===sessionId)&&alive(hud)};},
  'end-recording-hud':(e,id)=>{verifyMain(e);end({id});},
  'recording-hud-read':e=>{verifyHud(e);return state;},
  // Borumi's More (request.context_menu.show): a system menu. The island passes what it shows; the chosen item's id comes back.
  'recording-hud-menu':(e,value)=>{verifyHud(e);if(!Menu)return null;const v=value&&typeof value==='object'?value:{};const speeds=Array.isArray(v.speeds)?v.speeds.filter(n=>Number.isInteger(n)&&n>0&&n<1000).slice(0,40):[];
   return new Promise(resolve=>{let chosen=null;const pick=id=>()=>{chosen=id;};const constant=v.mode==='ConstSpeed';
    const menu=Menu.buildFromTemplate([
     {label:'Mirror camera',type:'checkbox',checked:Boolean(v.mirror),click:pick('mirror')},
     {label:'Show sources',type:'checkbox',checked:Boolean(v.showSources),click:pick('sources')},
     {type:'separator'},
     {label:'Scrolling mode',submenu:[{label:'Manual',type:'checkbox',checked:v.mode==='Manual',enabled:Boolean(v.scriptAvailable),click:pick('mode:Manual')},{label:'Constant speed',type:'checkbox',checked:constant,enabled:Boolean(v.scriptAvailable),click:pick('mode:ConstSpeed')}]},
     {label:'Scrolling speed',enabled:Boolean(v.scriptAvailable)&&constant,submenu:speeds.map(n=>({label:String(n),type:'checkbox',checked:n===v.speed,enabled:Boolean(v.scriptAvailable)&&constant,click:pick('speed:'+n)}))},
     {type:'separator'},
     {label:'Close',click:pick('close')}
    ]);
    menu.popup({window:hud,callback:()=>setImmediate(()=>resolve(chosen))});
   });
  },
  'recording-hud-command':(e,command)=>{verifyHud(e);if(!COMMANDS.has(command))throw new Error('Unknown recording action.');const main=getMainWindow();if(command==='show-editor'){if(state)state.hideMain=false;if(alive(main)){main.show();main.focus();hiddenMain=false;onMainVisibility();}return;}if(alive(main))main.webContents.send('recording-hud-command',command);}
 };
 for(const [name,handler]of Object.entries(handlers))ipcMain.handle(name,handler);
 // The HUD opens its own live camera preview: video only, from its exact document.
 function allowsCamera(contents,permission,details){return permission==='media'&&alive(hud)&&contents===hud.webContents&&details?.requestingUrl===documentURL&&details?.isMainFrame!==false&&Array.isArray(details?.mediaTypes)&&details.mediaTypes.length===1&&details.mediaTypes[0]==='video';}
 return {end,allowsCamera,dispose(){end({restoreMain:false});for(const name of Object.keys(handlers))ipcMain.removeHandler(name);}};
}
module.exports={createRecordingHud,cleanState};
