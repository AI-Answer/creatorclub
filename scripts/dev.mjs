import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(process.execPath,[process.env.npm_execpath,'run','dev'],{cwd:path.join(root,'recorder/app'),stdio:'inherit',env:{...process.env,SCENEFORGE_PORT:'4184',SCENEFORGE_DATA_DIR:process.env.SCENEFORGE_DATA_DIR||path.join(root,'recorder/app/.local/studio'),CREATORCLUB_DIR:process.env.CREATORCLUB_DIR||path.join(root,'recorder/app/.local/channels')}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
