// The desktop app's motion renderer: the media service runs in a utility process (or plain node in the dev app) and cannot open
// windows, so it asks the main process over its message channel to capture a block's frames. The main process renders the page the
// service wrote in offscreen windows (offscreen keeps colours in sRGB; a hidden window converts them to the display's profile) and
// writes one PNG per frame into the job's folder. The service encodes them (server/motion-render.ts).
'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {captureFrames,captureJob}=require('./motion-capture.cjs');

const REQUEST='creatorclub:motion-render',REPLY='creatorclub:motion-rendered';
const PAGES=4,IDLE_MS=30000;

function createMotionRenderer({BrowserWindow,session}){
 // Its own session: the page loads only its own file and data: URLs (the font), nothing from the network.
 let renderSession=null;
 const sessionFor=()=>{
  if(renderSession)return renderSession;
  renderSession=session.fromPartition('creatorclub-motion-render');
  renderSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!/^(file|data):/i.test(details.url)}));
  renderSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  return renderSession;
 };
 const idle=[];let timer=null,queue=Promise.resolve();
 const windowFor=()=>idle.pop()??new BrowserWindow({show:false,width:640,height:360,frame:false,transparent:true,backgroundColor:'#00000000',paintWhenInitiallyHidden:true,
  webPreferences:{offscreen:true,session:sessionFor(),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,spellcheck:false,webgl:false}});
 const release=wins=>{for(const win of wins)if(!win.isDestroyed())idle.push(win);clearTimeout(timer);timer=setTimeout(dispose,IDLE_MS);timer.unref?.();};
 function dispose(){clearTimeout(timer);for(const win of idle.splice(0))if(!win.isDestroyed())win.destroy();}

 async function render(job){
  captureJob(job);
  const dir=job.dir,page=path.join(dir,'page.html');
  if(typeof dir!=='string'||!path.isAbsolute(dir)||!fs.existsSync(page))throw new Error('Invalid motion job folder');
  const count=Math.max(1,Math.min(PAGES,Math.ceil(job.frames/8))),wins=Array.from({length:count},windowFor),attached=[];
  try{
   const sessions=await Promise.all(wins.map(async win=>{
    win.setContentSize(Math.min(job.width,4096),Math.min(job.height,4096));
    await win.loadFile(page);
    const debug=win.webContents.debugger;if(!debug.isAttached())debug.attach('1.3');attached.push(debug);
    return (method,params)=>debug.sendCommand(method,params);
   }));
   await captureFrames(sessions,job,(index,png)=>fs.promises.writeFile(path.join(dir,`f${String(index).padStart(6,'0')}.png`),png));
  }catch(error){for(const win of wins)if(!win.isDestroyed())win.destroy();wins.length=0;throw error;}
  finally{for(const debug of attached){try{debug.detach();}catch{}}release(wins);}
 }
 /** One job at a time: four pages already keep the GPU busy, and frames of two jobs would compete. */
 const enqueue=job=>{const run=queue.then(()=>render(job));queue=run.catch(()=>{});return run;};

 /** Answers the service's render requests; `reply` posts a message back on the same channel. */
 function handle(message,reply){
  if(!message||message.type!==REQUEST||typeof message.id!=='string')return false;
  const began=Date.now();
  enqueue(message.job).then(()=>reply({type:REPLY,id:message.id,ok:true,ms:Date.now()-began}),error=>reply({type:REPLY,id:message.id,ok:false,error:String(error?.message||error)}));
  return true;
 }
 return {handle,render:enqueue,dispose};
}

module.exports={createMotionRenderer,MOTION_RENDER_REQUEST:REQUEST,MOTION_RENDER_REPLY:REPLY};
