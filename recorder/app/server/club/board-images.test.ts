import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,mkdir,readFile,rm,symlink,writeFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
const temp=await mkdtemp(path.join(os.tmpdir(),'cc-board-images-'));
process.env.CREATORCLUB_DIR=path.join(temp,'root');process.env.CREATORCLUB_SECRETS_DIR=path.join(temp,'secrets');
const {clubRouter}=await import('./index.js');
const app=express();app.use('/api/club',clubRouter());const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(async()=>{server.closeAllConnections();server.close();await rm(temp,{recursive:true,force:true});});
const call=async(method:string,url:string,body?:unknown)=>{const res=await fetch(base+url,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:res.status,body:await res.json()};};
await call('POST','/workspaces',{name:'Image Tests',handle:'@images',topics:['test'],about:'Images.'});
const video=async()=>(await call('POST','/videos',{title:'Images'})).body;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8Dwn4GBgQEAEfkD/bYHL5UAAAAASUVORK5CYII=','base64');
const upload=async(board:string,tile?:string,data:Buffer=png)=>{const form=new FormData();form.append('file',new Blob([new Uint8Array(data)],{type:'image/png'}),'../../unsafe name.png');if(tile)form.append('tile',tile);const res=await fetch(base+board+'/board/images',{method:'POST',body:form});return {status:res.status,body:await res.json()};};
const get=(board:string,src:string,tile?:string)=>fetch(base+board+'/board/images?'+new URLSearchParams({src,...(tile?{tile}:{})}));

test('uploaded pixels are saved under board notes/assets; relative Markdown renders and survives a note save',async()=>{
 const v=await video(),route=`/videos/${v.id}`,note=(await call('POST',route+'/research',{kind:'note',text:'# One-pager\n'})).body;
 const saved=await upload(route,note.id);assert.equal(saved.status,201);assert.match(saved.body.path,/^notes\/assets\/[a-f0-9]{24}\.png$/);assert.match(saved.body.markdown,/^assets\//);
 const file=path.join(temp,'root','image-tests','videos',v.id,saved.body.path);assert.deepEqual(await readFile(file),png);
 const edited=await call('PATCH',route+'/research/'+note.id,{text:`# One-pager\n![](${saved.body.markdown})`,base:note.doc.hash});assert.equal(edited.status,200);
 const image=await get(route,saved.body.markdown,note.id);assert.equal(image.status,200);assert.match(image.headers.get('content-type')!,/image\/png/);assert.equal(image.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 assert.match(await readFile(path.join(temp,'root','image-tests','videos',v.id,edited.body.doc.path),'utf8'),/!\[\]\(assets\//);
});
test('images in an imported top-level note use notes/assets relative paths and channel notes work too',async()=>{
 const v=await video(),dir=path.join(temp,'root','image-tests','videos',v.id);await writeFile(path.join(dir,'agent.md'),'# Agent');
 const route=`/videos/${v.id}`,list=(await call('GET',route+'/research')).body,note=list.find((tile:{doc?:{path:string}})=>tile.doc?.path==='agent.md');
 const saved=await upload(route,note.id);assert.match(saved.body.markdown,/^notes\/assets\//);assert.equal((await get(route,saved.body.markdown,note.id)).status,200);
 const channel=(await call('POST','/channel/research',{kind:'note',text:'# Channel'})).body,c=await upload('/channel',channel.id);assert.equal(c.status,201);assert.equal((await get('/channel',c.body.markdown,channel.id)).status,200);
});
test('a pinned note links relatively to board assets, but an old Notes folder cannot read or upload',async()=>{
 const v=await video(),route=`/videos/${v.id}`,vault=path.join(temp,'vault');await mkdir(vault);await writeFile(path.join(vault,'pin.md'),'# Pin');
 await call('PUT','/board/notes-folder',{path:vault});const note=(await call('POST',route+'/board/pin',{path:'pin.md'})).body;
 const saved=await upload(route,note.id);assert.equal(saved.status,201);assert.match(saved.body.markdown,/^\.\.\//);assert.equal((await get(route,saved.body.markdown,note.id)).status,200);
 await call('PUT','/board/notes-folder',{path:null});assert.equal((await upload(route,note.id)).status,400);assert.equal((await get(route,saved.body.markdown,note.id)).status,400);
});
test('existing relative image exports resolve within the note root; traversal, SVG, symlinks and non-images are refused',async()=>{
 const v=await video(),route=`/videos/${v.id}`,dir=path.join(temp,'root','image-tests','videos',v.id),note=(await call('POST',route+'/research',{kind:'note',text:'# A'})).body;
 await writeFile(path.join(dir,'notes','original.png'),png);assert.equal((await get(route,'original.png',note.id)).status,200);
 await writeFile(path.join(dir,'notes','fake.png'),'<html>unsafe</html>');assert.equal((await get(route,'fake.png',note.id)).status,400);
 await symlink(path.join(dir,'notes','original.png'),path.join(dir,'notes','link.png'));assert.equal((await get(route,'link.png',note.id)).status,400);
 for(const src of ['../../../../etc/passwd','%2Fetc/passwd','http://example.com/a.png','data:image/png;base64,a','%00','a\\b.png','%2e%2e/%2e%2e/%2e%2e/secret.png'])assert.equal((await get(route,src,note.id)).status,400,src);
 assert.equal((await upload(route,note.id,Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status,400);
 assert.equal((await upload('/videos/missing',note.id)).status,404);assert.equal((await upload(route,'t_missing')).status,404);
});
test('uploads reject a symlink assets folder, missing files, excessive sizes and do not overwrite names',async()=>{
 const v=await video(),route=`/videos/${v.id}`,dir=path.join(temp,'root','image-tests','videos',v.id);await mkdir(path.join(dir,'notes'));await symlink(temp,path.join(dir,'notes','assets'));
 assert.equal((await upload(route)).status,400);await rm(path.join(dir,'notes','assets'));
 const a=await upload(route),b=await upload(route);assert.equal(a.status,201);assert.notEqual(a.body.path,b.body.path);assert.equal((await readdir(path.join(dir,'notes','assets'))).length,2);
 assert.equal((await fetch(base+route+'/board/images',{method:'POST',body:new FormData()})).status,400);
 assert.equal((await upload(route,undefined,Buffer.alloc(20*1024*1024+1))).status,400);
});
test('a real image header with a script after it, saved as .html, still goes out as an image and never as a page',async()=>{
 const v=await video(),route=`/videos/${v.id}`,dir=path.join(temp,'root','image-tests','videos',v.id),note=(await call('POST',route+'/research',{kind:'note',text:'# A'})).body;
 await writeFile(path.join(dir,'notes','attack.html'),Buffer.concat([png,Buffer.from('<script>alert(1)</script>')]));
 const res=await get(route,'attack.html',note.id);assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'image/png');assert.equal(res.headers.get('x-content-type-options'),'nosniff');assert.match(res.headers.get('content-security-policy')??'',/default-src 'none'/);
});
