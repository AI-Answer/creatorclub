import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const {createNativeRecordingManager}=createRequire(import.meta.url)('../desktop/native-recording.cjs');
test('stopped without media preserves its real error before a warning or the default message',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cc-native-errors-')),helperPath=path.join(directory,'helper');await fs.writeFile(helperPath,'fixture');let child:any;const events:any[]=[];
 const manager=createNativeRecordingManager({dataDir:directory,helperPath,platform:'darwin',getMainWindow:()=>({isDestroyed:()=>false,webContents:{send:(_name:string,event:any)=>events.push(event)}}),ipcMain:{handle(){},removeHandler(){}},spawnProcess:()=>{child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',1));child.stdin.on('data',(data:Buffer)=>{for(const line of data.toString().trim().split('\n')){const command=JSON.parse(line);if(command.command==='start')queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'started',startedAtMs:1000})+'\n'));if(command.command==='stop')queueMicrotask(()=>child.stdout.write(JSON.stringify({type:'stopped',error:'Screen encoder failed',warning:'Audio warning'})+'\n'));}});return child;}});
 try{const started=await manager.start({selection:{kind:'display',displayId:'1'},systemAudio:false});await assert.rejects(manager.stop(started.id),/Screen encoder failed/);assert.equal(events.at(-1).message,'Screen encoder failed');}finally{await manager.dispose();await fs.rm(directory,{recursive:true,force:true});}
});
test('native video append failure stays fatal while audio append failure is a warning',async()=>{
 const source=await fs.readFile(new URL('../desktop/native-recording.swift',import.meta.url),'utf8');assert.match(source,/emit\(\["type":"error","message":videoFailure!\]\)/);assert.match(source,/audioFailure=error.localizedDescription; emit\(\["type":"warning","message":error.localizedDescription\]\)/);
});
