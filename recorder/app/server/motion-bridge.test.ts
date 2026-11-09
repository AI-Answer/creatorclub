import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {newMotionBlock} from '../shared/motion/templates.js';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('a hung bridge request times out, rejects its waiter, ignores late replies, and accepts a later request',async t=>{
 const oldSend=process.send,oldBridge=process.env.CREATORCLUB_MOTION_BRIDGE,messages:any[]=[];process.env.CREATORCLUB_MOTION_BRIDGE='1';process.send=((message:unknown)=>{messages.push(message);return true;}) as typeof process.send;
 const {renderMotionBlock}=await import('./motion-render.js');
 try{
  t.mock.timers.enable({apis:['setTimeout']});
  const first=renderMotionBlock(newMotionBlock('lower-third',0,randomUUID(),{props:{name:randomUUID()}}),320,180,1);void first.catch(()=>{});while(!messages.some(m=>m.type==='creatorclub:motion-render'))await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(900001);await new Promise(resolve=>setImmediate(resolve));assert.equal(messages.some(m=>m.type==='creatorclub:motion-cancel'),false,'queue wait has no render deadline');
  (process as import('node:events').EventEmitter).emit('message',{type:'creatorclub:motion-started',id:messages[0].id});
  t.mock.timers.tick(240000);(process as import('node:events').EventEmitter).emit('message',{type:'creatorclub:motion-progress',id:messages[0].id});t.mock.timers.tick(240000);assert.equal(messages.some(m=>m.type==='creatorclub:motion-cancel'),false,'progress extends the deadline');
  t.mock.timers.tick(60001);await assert.rejects(first,/timed out/);t.mock.timers.reset();assert.ok(messages.some(m=>m.type==='creatorclub:motion-cancel'));
  (process as import('node:events').EventEmitter).emit('message',{type:'creatorclub:motion-rendered',id:messages[0].id,ok:true});
  const controller=new AbortController(),second=renderMotionBlock(newMotionBlock('lower-third',0,randomUUID(),{props:{name:randomUUID()}}),320,180,1,controller.signal);void second.catch(()=>{});while(messages.filter(m=>m.type==='creatorclub:motion-render').length<2)await delay(5);controller.abort(Error('second cancelled'));await assert.rejects(second,/second cancelled/);
 }finally{t.mock.timers.reset();process.send=oldSend;if(oldBridge===undefined)delete process.env.CREATORCLUB_MOTION_BRIDGE;else process.env.CREATORCLUB_MOTION_BRIDGE=oldBridge;}
});

test('desktop announces started only when a queued render begins and reports frame progress',async()=>{
 const {createRequire}=await import('node:module'),{promises:fs}=await import('node:fs'),path=await import('node:path'),os=await import('node:os');const {createMotionRenderer}=createRequire(import.meta.url)('../desktop/motion-render.cjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'motion-started-'));await fs.writeFile(path.join(dir,'page.html'),'page');let release!:()=>void,blocked=true;const gate=new Promise<void>(resolve=>release=resolve),replies:any[]=[];
 class Window{destroyed=false;webContents={debugger:{isAttached:()=>true,attach(){},detach(){},sendCommand:async(method:string)=>{if(method==='Page.captureScreenshot'){if(blocked)await gate;return {data:Buffer.from('fixture png').toString('base64')};}return {};}}};isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}setContentSize(){}async loadFile(){}}
 const renderer=createMotionRenderer({BrowserWindow:Window,session:{fromPartition:()=>({webRequest:{onBeforeRequest(){}},setPermissionRequestHandler(){}})}}),job={dir,width:320,height:180,fps:1,frames:1,clip:{x:0,y:0,width:320,height:180},seek:'window.seek(__MS__)'};
 try{for(const id of ['first','second'])renderer.handle({type:'creatorclub:motion-render',id,job},(message:any)=>replies.push(message));for(let i=0;i<100&&!replies.some(m=>m.type==='creatorclub:motion-started');i++)await delay(1);assert.deepEqual(replies.filter(m=>m.type==='creatorclub:motion-started').map(m=>m.id),['first']);blocked=false;release();for(let i=0;i<200&&replies.filter(m=>m.type==='creatorclub:motion-rendered').length<2;i++)await delay(2);assert.deepEqual(replies.filter(m=>m.type==='creatorclub:motion-started').map(m=>m.id),['first','second']);assert.equal(replies.filter(m=>m.type==='creatorclub:motion-rendered'&&m.ok).length,2);assert.ok(replies.some(m=>m.type==='creatorclub:motion-progress'));}finally{release();renderer.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
