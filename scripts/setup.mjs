import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Use Node.js 24 for Creator Compiler.');
for(const [cmd,args] of [['npm',['ci','--prefix','recorder/app']],['cargo',['build','--release','--locked','--manifest-path','engine/cutroom/Cargo.toml']],['npm',['run','runtime:desktop']],['npm',['run','build']]]){
 const r=spawnSync(cmd==='npm'?process.execPath:cmd,cmd==='npm'?[process.env.npm_execpath,...args]:args,{cwd:root,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
}
