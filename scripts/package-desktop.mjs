import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),app=path.join(root,'recorder/app');
if(!['darwin','win32'].includes(process.platform))throw Error('Package desktop apps on macOS or Windows.');
const args=process.argv.slice(2),platform=args.includes('--win')?'win32':args.includes('--mac')?'darwin':process.platform;
if(platform!==process.platform)throw Error('Build on the target OS so Cutroom and media binaries match. Use the desktop-build workflow for the other platform.');
for(const [cmd,params,cwd] of [
 ['cargo',['build','--release','--locked','--manifest-path','engine/cutroom/Cargo.toml'],root],
 [process.execPath,['scripts/prepare-desktop-runtime.mjs'],app],
 [process.execPath,['node_modules/electron-builder/cli.js','--config','electron-builder.cjs','--publish','never',...(args.length?args:[platform==='darwin'?'--mac':'--win'])],app],
]){const r=spawnSync(cmd,params,{cwd,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
