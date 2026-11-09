import {execFileSync,type ChildProcess} from 'node:child_process';
import {mkdirSync,readFileSync,readdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DATA_DIR} from './storage.js';
export function processStart(pid:number):string|undefined{try{return execFileSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',timeout:2000,env:{...process.env,LC_ALL:'C',TZ:'UTC'}}).trim()||undefined;}catch{return undefined;}}
function startSeconds(start:string){return Date.parse(/^[A-Za-z]{3} [A-Za-z]{3}\s+\d+ \d{2}:\d{2}:\d{2} \d{4}$/.test(start)?start+' UTC':start)/1000;}
export function processMatches(pid:number,start?:string){const actual=processStart(pid);if(actual)return start===undefined||Math.abs(startSeconds(actual)-startSeconds(start))<=2;try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code!=='ESRCH';}}
const directory=path.join(DATA_DIR,'owned-processes'),file=path.join(directory,`${process.pid}-${randomUUID()}.json`),ownerStart=processStart(process.pid);
type Entry={pid:number;start?:string;group:boolean};const children=new Map<number,Entry>();
function persist(){mkdirSync(directory,{recursive:true,mode:0o700});const temp=file+'.tmp';writeFileSync(temp,JSON.stringify({pid:process.pid,start:ownerStart,children:[...children.values()]}),{mode:0o600});renameSync(temp,file);}
export function ownChild<T extends ChildProcess>(child:T,group=false):T{if(child.pid){const pid=child.pid;try{children.set(pid,{pid,start:processStart(pid),group});persist();}catch(error){child.kill('SIGKILL');throw error;}child.once('close',()=>{children.delete(pid);try{persist();}catch(error){console.error('Could not update child ownership',error);}});}return child;}
const exactChild=(child:Entry)=>!!child.start&&processStart(child.pid)===child.start;
/** Only dead owners and the exact recorded child start time permit orphan cleanup. */
export function recoverOwnedProcesses(){mkdirSync(directory,{recursive:true});for(const name of readdirSync(directory).filter(n=>n.endsWith('.json'))){const source=path.join(directory,name);try{const saved=JSON.parse(readFileSync(source,'utf8'));if(processMatches(saved.pid,saved.start))continue;for(const child of saved.children as Entry[]){if(!exactChild(child))continue;try{process.kill(child.pid,'SIGCONT');process.kill(child.group&&process.platform!=='win32'?-child.pid:child.pid,'SIGTERM');const timer=setTimeout(()=>{if(exactChild(child))try{process.kill(child.group&&process.platform!=='win32'?-child.pid:child.pid,'SIGKILL');}catch{}},1500);timer.unref();}catch{}}rmSync(source,{force:true});}catch(error){console.error('Could not recover owned children',error);}}}
