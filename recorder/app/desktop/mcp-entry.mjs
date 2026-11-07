import {spawn} from 'node:child_process';
import {mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startMcp} from './mcp.mjs';
import runtime from '../desktop/runtime.cjs';

const base=process.env.SCENEFORGE_URL||`http://127.0.0.1:${runtime.CREATORCLUB.port}/api`;
const address=new URL(base);
if(!['127.0.0.1','localhost'].includes(address.hostname))throw Error('The packaged MCP connects to a local Creator Compiler service only.');
const data=runtime.creatorClubPaths({appData:process.platform==='win32'?(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming')):path.join(os.homedir(),'Library/Application Support')}).studio;
const env=runtime.runtimeEnvironment({root:fileURLToPath(new URL('../',import.meta.url)),data,port:address.port||'4194'});
// An MCP-launched service must never inherit an app's owner or an unavailable motion bridge.
delete env.CREATORCLUB_PARENT_PID;delete env.CREATORCLUB_MOTION_BRIDGE;
let starting;
async function healthy(){try{const response=await fetch(base+'/ready',{signal:AbortSignal.timeout(1500)});if(!response.ok)return false;const health=await response.json();if(!runtime.isCreatorClubService(health))return false;if(health.parentPid){try{process.kill(health.parentPid,0);}catch(error){if(error.code!=='EPERM')return false;}}return true;}catch{return false;}}
async function ensureService(){
 if(await healthy())return;
 if(starting)return starting;
 starting=(async()=>{
  await mkdir(data,{recursive:true});const log=await open(path.join(data,'service.log'),'a',0o600);
  const child=spawn(process.execPath,[fileURLToPath(new URL('./index.mjs',import.meta.url))],{env,detached:true,stdio:['ignore',log.fd,log.fd]});
  let failure;child.once('error',error=>{failure=error;});child.unref();await log.close();
  for(let attempt=0;attempt<60;attempt++){if(failure)throw failure;if(await healthy())return;await new Promise(resolve=>setTimeout(resolve,150));}
  throw Error('Creator Compiler editing service could not start. See the local service.log.');
 })().finally(()=>{starting=undefined;});return starting;
}
await ensureService();
process.env.SCENEFORGE_URL=base;
await startMcp(async(input,init)=>{await ensureService();return fetch(input,init);});
