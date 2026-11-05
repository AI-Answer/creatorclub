import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rename,rm,utimes} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {JsonCache} from './json-cache.js';

test('cached records are isolated and external writes, replacements, deletion and recreation are read immediately',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cc-json-cache-')),file=path.join(dir,'record.json'),cache=new JsonCache();
 try{
  await writeFile(file,'{"nested":{"text":"one"}}');
  const first=await cache.read<{nested:{text:string}}>(file);first!.nested.text='mutated';
  assert.equal((await cache.read<typeof first>(file))!.nested.text,'one');
  // Even equal-size changes with a restored mtime must be detected (ctime changes).
  const stamp=new Date('2026-01-01');await utimes(file,stamp,stamp);await cache.read(file);
  await writeFile(file,'{"nested":{"text":"two"}}');await utimes(file,stamp,stamp);
  assert.equal((await cache.read<typeof first>(file))!.nested.text,'two');
  await writeFile(file+'.tmp','{"nested":{"text":"new"}}');await rename(file+'.tmp',file);
  assert.equal((await cache.read<typeof first>(file))!.nested.text,'new');
  await rm(file);assert.equal(await cache.read(file),undefined);
  await writeFile(file,'{"new":true}');assert.deepEqual(await cache.read(file),{new:true});
  await writeFile(file,'broken');await assert.rejects(cache.read(file),SyntaxError);
  await writeFile(file,'{}');assert.deepEqual(await cache.read(file),{});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('eviction, explicit invalidation and oversized records preserve fresh values',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cc-json-cache-')),cache=new JsonCache(1,24);
 try{
  for(const name of ['a','b'])await writeFile(path.join(dir,name),'{"value":1}');
  await cache.read(path.join(dir,'a'));await cache.read(path.join(dir,'b'));
  await writeFile(path.join(dir,'a'),'{"value":2}');assert.deepEqual(await cache.read(path.join(dir,'a')),{value:2});
  cache.invalidate(path.join(dir,'a'));assert.deepEqual(await cache.read(path.join(dir,'a')),{value:2});
  await writeFile(path.join(dir,'a'),JSON.stringify({large:'x'.repeat(100)}));
  assert.deepEqual(await cache.read(path.join(dir,'a')),{large:'x'.repeat(100)});
 }finally{await rm(dir,{recursive:true,force:true});}
});
