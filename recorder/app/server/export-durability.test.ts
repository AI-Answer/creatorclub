import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {atomicExportJSON} from './export-store.js';

test('Windows export receipts sync files and replace JSON without unsupported directory fsync',async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'creator-compiler-windows-sync-')),file=path.join(dir,'receipt.json'),open=fs.open;
 let fileSyncs=0,directoryAttempts=0;
 try{
  fs.open=(async(...args:Parameters<typeof fs.open>)=>{
   if(args[0]===dir){directoryAttempts++;throw Object.assign(Error('Windows cannot fsync directories'),{code:'EPERM'});}
   const handle=await open(...args),sync=handle.sync.bind(handle);handle.sync=async()=>{fileSyncs++;await sync();};return handle;
  }) as typeof fs.open;
  await atomicExportJSON(file,{status:'running'},'win32');
  await atomicExportJSON(file,{status:'complete'},'win32');
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{status:'complete'});
  assert.equal(fileSyncs,2);assert.equal(directoryAttempts,0);assert.deepEqual(await fs.readdir(dir),['receipt.json']);
  await assert.rejects(()=>atomicExportJSON(file,{status:'complete'},'darwin'),/cannot fsync directories/);
  assert.equal(directoryAttempts,1,'POSIX directory durability errors remain visible');
 }finally{fs.open=open;await fs.rm(dir,{recursive:true,force:true});}
});

test('Windows still rejects file fsync failures and preserves the preceding export receipt',async()=>{
 const dir=await fs.mkdtemp(path.join(tmpdir(),'creator-compiler-file-sync-')),file=path.join(dir,'receipt.json'),open=fs.open;
 await fs.writeFile(file,JSON.stringify({status:'running'}));
 try{
  fs.open=(async(...args:Parameters<typeof fs.open>)=>{const handle=await open(...args);handle.sync=async()=>{throw Object.assign(Error('File fsync denied'),{code:'EPERM'});};return handle;}) as typeof fs.open;
  await assert.rejects(()=>atomicExportJSON(file,{status:'complete'},'win32'),/File fsync denied/);
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{status:'running'});assert.deepEqual(await fs.readdir(dir),['receipt.json']);
 }finally{fs.open=open;await fs.rm(dir,{recursive:true,force:true});}
});
