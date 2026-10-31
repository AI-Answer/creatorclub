// Start/reuse this studio's local service, then run the stdio MCP transport.
import {spawn} from 'node:child_process';
import {access,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.join(root,'recorder/app');
const env={...process.env,SCENEFORGE_PORT:process.env.SCENEFORGE_PORT||'4184',SCENEFORGE_DATA_DIR:process.env.SCENEFORGE_DATA_DIR||path.join(app,'.local/studio')};
const base=`http://127.0.0.1:${env.SCENEFORGE_PORT}`;
const healthy=async()=>{try{const r=await fetch(base+'/api/ready',{signal:AbortSignal.timeout(1500)});return r.ok&&(await r.json()).application==='Creator Compiler';}catch{return false;}};
await access(path.join(app,'server-dist/mcp.mjs'));
if(!await healthy()){
 await mkdir(env.SCENEFORGE_DATA_DIR,{recursive:true});
 const log=await open(path.join(env.SCENEFORGE_DATA_DIR,'service.log'),'a');
 const service=spawn(process.execPath,[path.join(app,'server-dist/index.mjs')],{cwd:app,env,detached:true,stdio:['ignore',log.fd,log.fd]});service.unref();await log.close();
 let ready=false;for(let attempt=0;attempt<100;attempt++){if(await healthy()){ready=true;break;}await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Creator Compiler service did not start. Check the local service.log.');
}
const child=spawn(process.execPath,[path.join(app,'server-dist/mcp.mjs')],{cwd:app,env:{...env,SCENEFORGE_URL:base+'/api'},stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
