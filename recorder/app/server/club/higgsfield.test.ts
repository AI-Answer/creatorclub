import {test,after} from 'node:test';
import type {HiggsfieldOptions} from './higgsfield.js';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,symlink,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {thumbnailPrompt,type ThumbnailRequest} from '../../shared/higgsfield.js';
const parent='/tmp/cc-higgs';await mkdir(parent,{recursive:true});const temp=await mkdtemp(path.join(parent,'tests-'));
process.env.CREATORCLUB_DIR=path.join(temp,'data');process.env.CREATORCLUB_SECRETS_DIR=path.join(temp,'secrets');process.env.SCENEFORGE_DATA_DIR=path.join(temp,'scene');process.env.SCENEFORGE_PORT='4394';
const {clubRouter}=await import('./index.js');
const hf=await import('./higgsfield.js');
const store=await import('./store.js');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8Dwn4GBgQEAEfkD/bYHL5UAAAAASUVORK5CYII=','base64');
let calls:string[][]=[],failure='',image=png,downloadUrl='https://cdn.example.com/generated.png';
let gate:(()=>Promise<void>)|undefined;
const fake: HiggsfieldOptions={find:async()=>'/fake/higgsfield',resolve:async()=>[{address:'93.184.216.34',family:4}],fetch:async()=>new Response(new Uint8Array(image)),run:async(file,args,options)=>{
 assert.equal(file,'/fake/higgsfield');assert.equal(options.env.HIGGSFIELD_API_KEY,undefined);assert.equal(options.env.ANTHROPIC_API_KEY,undefined);assert.ok(options.env.HOME);calls.push(args);
 if(failure)return {code:1,stderr:failure,stdout:''};
 let value:unknown={};
 if(args[0]==='account')value={email:'creator@example.com',credits:100,subscription_plan_type:'pro'};
 else if(args[0]==='soul-id')value=[{id:'soul-1',name:'Creator',status:'completed'},{id:'pending',name:'Pending',status:'training'}];
 else if(args[1]==='cost')value={credits:2};
 else {await gate?.();value={id:'generation-1',input:{image_references:['https://example.com/reference.png']},results:{images:[{url:downloadUrl}]}};}
 return {code:0,stderr:'',stdout:JSON.stringify(value)};
}};
const app=express();app.use('/api/club',clubRouter({higgsfield:fake}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async()=>{server.closeAllConnections();server.close();await rm(temp,{recursive:true,force:true});});
const call=async(method:string,url:string,body?:unknown)=>{const response=await fetch(base+url,{method,headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();return {status:response.status,body:text?JSON.parse(text):undefined};};
await call('POST','/workspaces',{name:'Higgs Tests',handle:'@creator',topics:['test'],about:'Thumbnails.'});
const video=async()=>(await call('POST','/videos',{title:'Build with AI'})).body;
const input:ThumbnailRequest={prompt:'16:9 thumbnail with headline "BUILD IT"',model:'nano_banana_pro',count:1};
const context=()=>({signal:new AbortController().signal,emit:(_event:unknown)=>{}});
const finish=async(job:string)=>{
 for(let i=0;i<150;i++){const found=(await call('GET',`/jobs/${job}`)).body;if(found.status!=='running')return found;await new Promise(r=>setTimeout(r,10));}
 throw new Error('fake job did not finish');
};

test('prompt is deterministic, names one subject, exact headline, readable feed contrast and optional brief',()=>{
 const prompt=thumbnailPrompt('Build with AI','BUILD IT','A bright robot holding a camera');
 assert.match(prompt,/16:9/);assert.match(prompt,/one clear subject/);assert.match(prompt,/high contrast/);assert.match(prompt,/spelled exactly "BUILD IT"/);assert.match(prompt,/No other text/);assert.match(prompt,/bright robot/);
 assert.match(thumbnailPrompt('Title','one two three four'),/spelled exactly "one two three"/);
 assert.match(thumbnailPrompt('Title',''),/Use no headline/);
 const sketch=thumbnailPrompt('Claude Trader','Claude Trader',{visual:'Claude tile plus a stock chart',closer:'Is Insane',layout:'Tile equation'});
 assert.match(sketch,/closing line in smaller type, spelled exactly "Is Insane"/);
 assert.match(sketch,/Creative brief: Claude tile plus a stock chart\nLayout: Tile equation/);
 assert.doesNotMatch(thumbnailPrompt('T','Words'),/closing line/);
 assert.equal(prompt,thumbnailPrompt('Build with AI','BUILD IT','A bright robot holding a camera'));
});
test('status, Soul IDs and multiplied cost use the allow-listed CLI environment',async()=>{
 process.env.HIGGSFIELD_API_KEY='never-pass-this';process.env.ANTHROPIC_API_KEY='never-pass-this';
 try{
  const status=await call('GET','/higgsfield/status');assert.equal(status.body.email,'creator@example.com');assert.equal(status.body.plan,'pro');assert.equal(status.body.credits,100);
  assert.deepEqual((await call('GET','/higgsfield/soul-ids')).body,[{id:'soul-1',name:'Creator'}]);
  assert.equal((await call('POST','/higgsfield/cost',{...input,count:4})).body.credits,8);
 }finally{delete process.env.HIGGSFIELD_API_KEY;delete process.env.ANTHROPIC_API_KEY;}
 assert.equal((await hf.higgsfieldStatus({find:async()=>undefined})).installed,false);
 failure='unauthorized: login required';assert.match((await hf.higgsfieldStatus(fake)).hint!,/Run higgsfield auth login in Terminal/);
 await assert.rejects(hf.estimateCost(input,fake),/Run higgsfield auth login/);
 failure='insufficient credits';await assert.rejects(hf.estimateCost(input,fake),/out of credits/);failure='';
});
test('model-specific flags and nested, array, URL-list results omit echoed input references',()=>{
 assert.deepEqual(hf.generationParams({...input,model:'text2image_soul_v2',soulId:'soul-1'}),{aspect_ratio:'16:9',quality:'1.5k',custom_reference_id:'soul-1'});
 assert.deepEqual(hf.resultUrls({input:{url:'https://example.com/ref.png'},data:[{results:{images:[{url:'https://example.com/out.png'}]}}]}),['https://example.com/out.png']);
 assert.deepEqual(hf.resultUrls(['https://example.com/out.png']),['https://example.com/out.png']);
 assert.equal(hf.thumbnailBody.safeParse({...input,model:'text2image_soul_v2',references:[{kind:'current'},{kind:'current'}]}).success,false);
 assert.equal(hf.thumbnailBody.safeParse({...input,count:5}).success,false);
 assert.equal(hf.thumbnailBody.safeParse({...input,model:'shell;command'}).success,false);
 assert.equal(hf.thumbnailBody.safeParse({...input,soulId:'x'}).success,false);
});
test('generate is a progress job; candidates serve as images, become the Publish thumbnail, copy to board, vary and move to .removed',async()=>{
 const v=await video(),route=`/videos/${v.id}`;calls=[];
 const job=await call('POST',route+'/thumbnails/generate',{...input,count:2});assert.equal(job.status,202);
 const done=await finish(job.body.id);assert.equal(done.status,'done');assert.equal(done.result.length,2);
 const items=(await call('GET',route+'/thumbnails')).body;assert.equal(items.length,2);
 const generated=calls.filter(c=>c[1]==='create');assert.equal(generated.length,2);assert.ok(generated.every(c=>c.includes('--wait')&&c.includes('--json')&&c.includes('1k')));
 const first=items[0],served=await fetch(`${base}${route}/thumbnails/${first.id}/image`);assert.equal(served.status,200);assert.equal(served.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await served.arrayBuffer()),png);
 assert.equal((await call('POST',route+`/thumbnails/${first.id}/use`,{})).status,204);
 assert.deepEqual(Buffer.from(await (await fetch(base+route+'/thumbnail')).arrayBuffer()),png);
 const tile=(await call('POST',route+`/thumbnails/${first.id}/board`,{})).body;assert.equal(tile.kind,'image');assert.deepEqual(await readFile(store.tileFilePath('higgs-tests',v.id,tile)!),png);
 const events:unknown[]=[];const variations=await hf.generateThumbnails('higgs-tests',v.id,{...input,parentId:first.id,references:[{kind:'candidate',id:first.id}],prompt:'Make background brighter'},{signal:new AbortController().signal,emit:e=>events.push(e)},fake);
 assert.equal(variations[0].parentId,first.id);assert.ok(calls.at(-1)!.some(a=>a.endsWith(first.file)));assert.ok(events.length>=3);
 assert.equal((await call('DELETE',route+`/thumbnails/${first.id}`)).status,204);
 const dir=path.join(store.videoDir('higgs-tests',v.id),'thumbnails');assert.deepEqual(await readFile(path.join(dir,'.removed',first.file)),png);
 assert.equal((await fetch(base+route+`/thumbnails/${first.id}/image`)).status,404);assert.equal((await call('GET',route+'/thumbnails')).body.length,2);
 assert.ok((JSON.parse(await readFile(path.join(dir,'thumbnails.json'),'utf8')) as {removedAt?:string}[]).some(c=>c.removedAt));
});
test('references resolve only safe board files, uploads, the current thumbnail and YouTube thumbnails',async()=>{
 const v=await video(),route=`/videos/${v.id}`,form=new FormData();form.append('file',new Blob([new Uint8Array(png)]),'ref.png');
 const uploaded=await (await fetch(base+route+'/board/images',{method:'POST',body:form})).json() as {path:string};
 const youtube=(await call('POST',route+'/research',{kind:'video',url:'https://youtube.com/watch?v=dQw4w9WgXcQ'})).body;
 const tile=await store.addTile('higgs-tests',v.id,{kind:'image',file:{name:'ref.png',data:png}});
 await hf.generateThumbnails('higgs-tests',v.id,{...input,references:[{kind:'upload',path:uploaded.path},{kind:'tile',id:tile.id},{kind:'tile',id:youtube.id}]},context(),fake);
 const args=calls.at(-1)!;assert.equal(args.filter(a=>a==='--image-references').length,3);
 await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,{...input,references:[{kind:'upload',path:'/etc/passwd'}]},context(),fake),/uploaded image/);
 await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,{...input,references:[{kind:'current'}]},context(),fake),/Add a thumbnail/);
 const dir=path.join(store.videoDir('higgs-tests',v.id),'thumbnails');assert.equal((await readdir(dir)).some(n=>n.startsWith('.references-')),false);
});
test('bad image bytes, private downloads, oversized responses, traversal and symlinks are refused',async()=>{
 const v=await video();image=Buffer.from('<svg>unsafe</svg>');await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,input,context(),fake),/unsupported image/);image=png;
 downloadUrl='https://127.0.0.1/secret';await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,input,context(),fake),/public HTTPS/);downloadUrl='https://cdn.example.com/generated.png';
 await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,input,context(),{...fake,fetch:async()=>new Response('x',{headers:{'content-length':String(21*1024*1024)}})}),/over 20 MB/);
 const [candidate]=await hf.generateThumbnails('higgs-tests',v.id,input,context(),fake),dir=path.join(store.videoDir('higgs-tests',v.id),'thumbnails');
 await rm(path.join(dir,candidate.file));const outside=path.join(temp,'outside.png');await writeFile(outside,png);await symlink(outside,path.join(dir,candidate.file));
 await assert.rejects(hf.candidateImage('higgs-tests',v.id,candidate.id),/safe image/);
 const bad=await video();await symlink(temp,path.join(store.videoDir('higgs-tests',bad.id),'thumbnails'));
 await assert.rejects(hf.listThumbnails('higgs-tests',bad.id),/safe folder/);
});
test('duplicate starts share one job and cancellation never starts the next paid generation',async()=>{
 const v=await video(),route=`/videos/${v.id}`;let release!:()=>void;gate=()=>new Promise<void>(resolve=>{release=resolve;});
 const before=calls.filter(c=>c[1]==='create').length;
 const first=await call('POST',route+'/thumbnails/generate',{...input,count:4});
 const second=await call('POST',route+'/thumbnails/generate',{...input,count:4});assert.equal(first.body.id,second.body.id);
 while(!release)await new Promise(r=>setTimeout(r,2));
 assert.equal((await call('DELETE',`/jobs/${first.body.id}`)).body.status,'running');release();gate=undefined;
 await new Promise(r=>setTimeout(r,30));assert.equal(calls.filter(c=>c[1]==='create').length-before,1);assert.equal((await call('GET',route+'/thumbnails')).body.length,1, 'the completed paid result is retained');
});
test('a later CLI failure retains earlier candidates and provides actionable timeout and download errors',async()=>{
 const v=await video();let creates=0;
 const partial:HiggsfieldOptions={...fake,run:async(file,args,options)=>{
  if(args[1]==='create'&&++creates===2)return {code:1,stdout:'',stderr:'insufficient credits'};
  return fake.run!(file,args,options);
 }};
 await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,{...input,count:4},context(),partial),/out of credits/);
 assert.equal((await hf.listThumbnails('higgs-tests',v.id)).length,1);assert.equal(creates,2);
 await assert.rejects(hf.estimateCost(input,{...fake,run:async()=>({code:null,stdout:'',stderr:''})}),/took too long/);
 await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,input,context(),{...fake,fetch:async()=>{throw new Error('raw network details');}}),/check your connection/);
});
test('JSON progress lines are parsed and private redirect destinations are rejected before fetching them',async()=>{
 const v=await video();
 const lines:HiggsfieldOptions={...fake,run:async()=>({code:0,stderr:'',stdout:'Starting job…\n'+JSON.stringify({status:'running'})+'\n'+JSON.stringify({results:[{url:'https://cdn.example.com/result.png'}]})})};
 assert.equal((await hf.generateThumbnails('higgs-tests',v.id,input,context(),lines)).length,1);
 let downloads=0;
 await assert.rejects(hf.generateThumbnails('higgs-tests',v.id,input,context(),{...fake,fetch:async()=>{downloads++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});}}),/public HTTPS/);
 assert.equal(downloads,1);
});
