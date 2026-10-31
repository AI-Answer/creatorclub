// Real, isolated integration smoke: MCP -> Rust -> audiovisual render -> editor.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=await mkdtemp(path.join(os.tmpdir(),'creator-compiler-smoke-')),suffix=process.platform==='win32'?'.exe':'',bin=path.join(app,'runtime/bin');
const ffmpeg=path.join(bin,'ffmpeg'+suffix),ffprobe=path.join(bin,'ffprobe'+suffix),cutroom=path.join(bin,'cutroom'+suffix);await Promise.all([ffmpeg,ffprobe,cutroom].map(p=>access(p)));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,SCENEFORGE_PORT:String(port),SCENEFORGE_DATA_DIR:path.join(dir,'studio'),SCENEFORGE_FFMPEG:ffmpeg,SCENEFORGE_FFPROBE:ffprobe,CREATOR_COMPILER_CUTROOM:cutroom,SCENEFORGE_URL:`http://127.0.0.1:${port}/api`};
const server=spawn(process.execPath,['server-dist/index.mjs'],{cwd:app,env,stdio:['ignore','ignore','pipe']});let logs='';server.stderr.on('data',b=>logs=(logs+b).slice(-20000));
const client=new Client({name:'desktop-integration-smoke',version:'1.0.0'}),base=env.SCENEFORGE_URL;
const http=async(route,body,method=body===undefined?'GET':'POST')=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();assert.ok(r.ok,JSON.stringify(j));return j;};
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,r.content[0].text);return JSON.parse(r.content[0].text);};
const done=async(id)=>{for(let i=0;i<300;i++){const w=await call('cutroom_get_workspace',{workspace_id:id});if(w.status!=='running'){assert.equal(w.status,'complete',w.error);return w;}await new Promise(r=>setTimeout(r,200));}throw Error('Engine operation exceeded one minute');};
try{
 let ready=false;for(let i=0;i<100;i++){try{await http('/ready');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,logs);
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(app,'server-dist/mcp.mjs')],cwd:app,env:Object.fromEntries(Object.entries(env).filter(([,v])=>typeof v==='string')),stderr:'inherit'}));
 assert.equal((await client.listTools()).tools.filter(t=>t.name.startsWith('cutroom_')).length,8);
 const file=path.join(dir,'source.mp4');execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=0x25342e:s=640x360:r=30:d=8','-f','lavfi','-i','sine=frequency=220:duration=8','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',file]);
 const [m]=await http('/media/import',{paths:[file]});let p=await call('create_project',{name:'Native engine integration sample'});p.media=[m];p.clips=[{id:'sample',mediaId:m.id,name:'sample',track:'screen',start:0,sourceIn:0,sourceOut:8,speed:1,gain:1,muted:false,transform:{x:0,y:0,width:1,height:1,rotation:0,opacity:1,fit:'contain',borderRadius:0},effects:{brightness:1,contrast:1,saturation:1,blur:0,grayscale:false,flipX:false,fadeIn:0,fadeOut:0,denoise:false,normalize:false}}];p.scenes[0].duration=8;
 p.captions=[{id:'words',start:.2,end:7.8,text:'One idea. Make it count.',words:[{text:'One',start:.2,end:.5},{text:'idea.',start:.6,end:1.2},{text:'Make',start:5.8,end:6.2},{text:'it',start:6.4,end:6.8},{text:'count.',start:7,end:7.8}]}];p.captionStyle.enabled=false;p=await http('/projects/'+p.id,p,'PUT');
 const w=await call('cutroom_prepare',{project_id:p.id});await call('cutroom_run',{workspace_id:w.id,action:'detect'});const plan=await done(w.id);assert.ok(plan.plan.cuts.length>0);
 await call('cutroom_update_graphics',{workspace_id:w.id,beats:[{at:'o:0',hold:'2s',lead:0,kind:'title',text:'One *clear* idea'}],chapters:[]});await call('cutroom_run',{workspace_id:w.id,action:'preview',at:'o:1'});await done(w.id);
 const frame=await fetch(base+`/cutroom/${w.id}/preview.png`);assert.equal(frame.status,200);assert.equal(Buffer.from(await frame.arrayBuffer()).readUInt32BE(0),0x89504e47);
 await call('cutroom_run',{workspace_id:w.id,action:'render'});await done(w.id);const rendered=await call('cutroom_import_render',{workspace_id:w.id});assert.notEqual(rendered.id,p.id);assert.equal(rendered.clips.length,1);
 const info=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-of','json',rendered.media[0].path],{encoding:'utf8'}));assert.ok(info.streams.some(s=>s.codec_type==='video'));assert.ok(info.streams.some(s=>s.codec_type==='audio'));
 const pcm=execFileSync(ffmpeg,['-v','error','-i',rendered.media[0].path,'-map','0:a:0','-f','f32le','pipe:1'],{maxBuffer:32*1024*1024});let peak=0;for(let i=0;i<pcm.length;i+=4)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i)));assert.ok(peak>.001,'Decoded soundtrack is audible');
 const applied=await call('cutroom_apply_cuts',{workspace_id:w.id,expected_revision:w.revision});assert.equal(applied.captions[0].words.length,5,'Silence cuts preserve spoken words');const again=await client.callTool({name:'cutroom_apply_cuts',arguments:{workspace_id:w.id,expected_revision:w.revision}});assert.equal(again.isError,true);
 console.log(`PASS ${process.platform}/${process.arch}: MCP, cut detection, validated graphics, PNG preview, video+audio render, new-project import, revision-guarded cuts, repeat rejection.`);
}finally{
 await client.close().catch(()=>{});
 if(process.platform==='win32'){try{execFileSync('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore'});}catch{}}
 else if(server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
 await rm(dir,{recursive:true,force:true});
}
