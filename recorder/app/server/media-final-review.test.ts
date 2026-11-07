import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProject} from '../shared/types.js';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'creator-frame-review-')),wrapper=path.join(directory,'ffmpeg-fixture'),bad=path.join(directory,'bad.input');
process.env.SCENEFORGE_DATA_DIR=path.join(directory,'data');
await fs.writeFile(wrapper,`#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2),index=args.indexOf('-progress');
if(args.includes(${JSON.stringify(bad)})){
 fs.writeSync(2,'fixture codec failure: option=value\\n');
 const fd=Number(args[index+1].split(':')[1]);
 fs.createWriteStream(null,{fd}).end('frame=1\\nout_time_us=100000\\nprogress=continue\\n'.repeat(1500),()=>process.exit(23));
}else{const result=require('node:child_process').spawnSync('ffmpeg',args,{stdio:['ignore','inherit','inherit',...(index>=0?['inherit']:[])]});process.exit(result.status??1);}
`,{mode:0o700});
process.env.SCENEFORGE_FFMPEG=wrapper;
const media=await import('./media.js'),storage=await import('./storage.js');await storage.initStorage();
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean|Promise<boolean>){for(let i=0;i<1000;i++){if(await check())return;await delay(5);}assert.fail('fixture did not reach expected state');}
async function blockInspection(){let release!:()=>void,entered=false;const job=media.startExport(createProject('Inspection gate'),{format:'json'},storage.OUTPUT_DIR,{inspection:true,beforeComplete:async()=>{entered=true;await new Promise<void>(resolve=>release=resolve);}});await until(()=>entered);return {job,release};}
const project=()=>{const p=createProject('Shared frame');p.canvas={...p.canvas,width:160,height:90,fps:30,background:'#123456'};p.scenes[0].duration=1;return p;};
after(async()=>{await media.shutdownJobs();await fs.rm(directory,{recursive:true,force:true});});
test('disconnecting the first frame waiter leaves the shared render alive for the second',async()=>{
 const gate=await blockInspection(),p=project(),cache=path.join(directory,'shared'),first=new AbortController(),second=new AbortController();
 const one=media.inspectFrames(p,[.1],cache,{width:160,signal:first.signal});const rejected=assert.rejects(one,/first disconnected/);
 await until(()=>media.listJobs().some(job=>job.type==='analysis'&&job.status==='queued'));
 const two=media.inspectFrames(p,[.1],cache,{width:160,signal:second.signal});await delay(40);
 try{first.abort(Error('first disconnected'));await rejected;assert.equal(media.listJobs().filter(job=>job.type==='analysis').length,1);gate.release();const result=await two;assert.equal((await fs.readFile(result[0].path)).subarray(1,4).toString(),'PNG');}finally{gate.release();second.abort();await Promise.allSettled([one,two]);}
});
test('all frame waiters disconnecting aborts the render and a later caller gets fresh work',async()=>{
 const gate=await blockInspection(),p=project(),cache=path.join(directory,'abandoned'),a=new AbortController(),b=new AbortController();
 const one=media.inspectFrames(p,[.2],cache,{width:160,signal:a.signal});const rejectedOne=assert.rejects(one,/disconnected/);
 await until(()=>media.listJobs().some(job=>job.type==='analysis'&&job.status==='queued'));
 const two=media.inspectFrames(p,[.2],cache,{width:160,signal:b.signal});const rejectedTwo=assert.rejects(two,/disconnected/);await delay(40);
 try{a.abort(Error('disconnected'));b.abort(Error('disconnected'));await Promise.all([rejectedOne,rejectedTwo]);assert.equal(media.listJobs().find(job=>job.type==='analysis')?.status,'cancelled');gate.release();const result=await media.inspectFrames(p,[.2],cache,{width:160});assert.ok((await fs.stat(result[0].path)).size>50);await until(async()=>!(await fs.readdir(cache)).some(name=>name.startsWith('.frame-')));}finally{gate.release();await Promise.allSettled([one,two]);}
});
test('ffmpeg error tails retain diagnostics while progress uses a separate pipe',async()=>{
 await fs.writeFile(bad,'invalid media');await assert.rejects(media.thumbnail({id:'bad',name:'Bad',path:bad,kind:'video',duration:1,width:160,height:90},path.join(directory,'errors')),error=>{assert.match(String(error),/fixture codec failure: option=value/);assert.doesNotMatch(String(error),/frame=|out_time_us=|progress=/);return true;});
 // Export paths already supply -progress pipe:2; command redirects these too.
 const p=project();p.media=[{id:'bad',name:'Bad',path:bad,kind:'video',duration:1,width:160,height:90}];const {defaultTransform,defaultEffects}=await import('../shared/types.js');p.clips=[{id:'bad',mediaId:'bad',name:'Bad',track:'screen',start:0,sourceIn:0,sourceOut:1,speed:1,gain:0,muted:true,transform:defaultTransform(),effects:defaultEffects()}];
 const job=media.startExport(p,{format:'mp4',width:160,height:90,hardware:false},path.join(directory,'errors-export'));await until(()=>job.status==='failed');assert.match(job.error!,/fixture codec failure: option=value/);assert.doesNotMatch(job.error!,/frame=|out_time_us=|progress=/);
});
