import {mountUI,button} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {Home} from './Home';
import type {Media} from '../shared/types';
const media=(id:string,kind:'video'|'audio'):Media=>({id,kind,name:id,path:`/native/${id}`,duration:2,width:1280,height:720});
test('native recovery imports every source first then calls back once for one project',async()=>{
 const previous=fetch,events:string[]=[],recovered:Media[][]=[],screen=media('screen.mp4','video'),audio=media('system.wav','audio');
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/recovery'))return Response.json([{id:'native',name:'Native take',chunks:2,nativePaths:[{path:screen.path},{path:audio.path,audioRole:'system'}]}]);const request=JSON.parse(String(options?.body));events.push(request.paths[0]);if(request.paths[0]===audio.path)assert.equal(request.audioRole,'system');return Response.json([request.paths[0]===screen.path?screen:audio]);};
 const ui=await mountUI(createElement(Home,{projects:[],loading:false,onNew(){},onQuick(){},onOpen(){},onImport(){},onImportMedia(){},onDuplicate(){},onDelete(){},onTrash(){},onError(message){throw Error(message);},onRecovered:async media=>{events.push('callback');recovered.push(media);}}));
 try{await act(async()=>button(ui.container,'Recover recording').click());assert.deepEqual(events,[screen.path,audio.path,'callback']);assert.deepEqual(recovered,[[screen,audio]]);assert.doesNotMatch(ui.container.textContent??'',/Recover unfinished recordings/);}finally{await ui.close();globalThis.fetch=previous;}
});
test('failed import never creates a partial recovery project and leaves the take retryable',async()=>{
 const previous=fetch,errors:string[]=[];let callbacks=0;globalThis.fetch=async(url,options)=>String(url).endsWith('/recovery')?Response.json([{id:'native',name:'Native take',chunks:2,nativePaths:[{path:'/screen.mp4'},{path:'/system.wav',audioRole:'system'}]}]):JSON.parse(String(options?.body)).paths[0]==='/screen.mp4'?Response.json([media('screen.mp4','video')]):Response.json({error:'Import failed'},{status:503});
 const ui=await mountUI(createElement(Home,{projects:[],loading:false,onNew(){},onQuick(){},onOpen(){},onImport(){},onImportMedia(){},onDuplicate(){},onDelete(){},onTrash(){},onError:message=>errors.push(message),onRecovered:async()=>{callbacks++;}}));
 try{await act(async()=>button(ui.container,'Recover recording').click());assert.equal(callbacks,0);assert.deepEqual(errors,['Import failed']);assert.ok(button(ui.container,'Recover recording'));}finally{await ui.close();globalThis.fetch=previous;}
});
