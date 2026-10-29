import {mountUI,button} from '../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Package,Video} from '../../shared/club';
import type {ExportRecord} from '../../shared/export-history';
const {PublishStep,PUBLISH_LINE}=await import('./screens/PublishStep');
const {installFetch}=await import('./test-fakes');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const type=async(input:Element,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const primaries=(root:Element)=>[...root.querySelectorAll('button')].filter(b=>b.className.includes('bg-primary')).map(b=>b.textContent?.trim());

const video:Video={id:'v1',title:'Hidden features',stage:'publishing',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{publishing:'2026-10-28T00:00:00.000Z'},planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
const pkg:Package={demand:{level:'high',note:''},gap:{level:'mid',note:''},show:{level:'high',note:''},angle:'',twist:'',titles:['Claude Code features you missed','Seven hidden Claude Code tricks','Stop using Claude Code wrong'],thumbnailText:'Hidden features',hook:{visual:'A menu',spoken:'You never opened this.',text:'HIDDEN'}};
const output='/Users/me/SceneForge/exports/Hidden features-e1.mp4';
const exported:ExportRecord={id:'e1',type:'export',status:'complete',progress:1,message:'',outputPath:output,startedAt:'2026-10-28T10:00:00.000Z',completedAt:'2026-10-28T10:01:00.000Z',projectId:'p1',projectName:'Hidden features',projectRevision:'r',snapshotCreatedAt:'',options:{format:'mp4'},updatedAt:'',revision:1,output:{status:'available'},recovery:{status:'available',runtimeChanged:false}};

test('Publish: the line, the exported file with Show in Finder, the package to copy, and Mark as published as the one primary',async()=>{
 const revealed:string[]=[],copied:string[]=[];
 Object.assign(window,{sceneForge:{reveal:async(path:string)=>{revealed.push(path);}}});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{copied.push(text);}}});
 const server=installFetch(({method,path,body})=>{
  if(path.startsWith('/api/exports?projectId=p1'))return {body:{jobs:[{...exported,id:'old',completedAt:'2026-10-27T10:00:00.000Z',outputPath:'/old.mp4'},exported],nextOffset:null}};
  if(method==='POST'&&path==='/videos/v1/publish'){
   const url=(body as {youtubeUrl:string}).youtubeUrl;
   if(!url.includes('youtu'))return {status:400,body:{error:'Paste the YouTube link of the uploaded video.'}};
   return {body:{...video,stage:'published',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',publishedAt:'2026-10-29T12:00:00.000Z'}};
  }
 });
 const changes:Video[]=[];
 const ui=await mountUI(createElement(PublishStep,{video,pkg,onVideo:(next:Video)=>changes.push(next)}));
 try{
  await flush();
  const text=ui.container.textContent??'';
  assert.ok(text.includes(PUBLISH_LINE));
  assert.ok(text.includes('Hidden features-e1.mp4'),'the newest export is shown');
  await act(async()=>button(ui.container,'Show in Finder').click());
  assert.deepEqual(revealed,[output]);
  for(const line of [...pkg.titles,pkg.thumbnailText,pkg.hook.spoken])assert.ok(text.includes(line),line);
  const copies=[...ui.container.querySelectorAll('button')].filter(b=>b.textContent?.trim()==='Copy');
  assert.equal(copies.length,5);
  await act(async()=>copies[1].click());await flush();
  assert.deepEqual(copied,[pkg.titles[1]]);
  assert.ok(button(ui.container,'Copied'));
  assert.deepEqual(primaries(ui.container),['Mark as published']);
  assert.ok(!/Borumi|successfully|please|!/i.test(ui.container.textContent??''));

  const field=ui.container.querySelector('#club-youtube-link')!;
  assert.equal(button(ui.container,'Mark as published').disabled,true,'needs a link first');
  await type(field,'https://vimeo.com/1');
  await act(async()=>button(ui.container,'Mark as published').click());await flush();
  assert.ok(ui.container.textContent?.includes('Paste the YouTube link of the uploaded video.'));
  assert.equal(field.getAttribute('aria-invalid'),'true');
  assert.equal(changes.length,0);

  await type(field,'https://youtu.be/dQw4w9WgXcQ');
  await act(async()=>button(ui.container,'Mark as published').click());await flush();
  assert.equal(changes.at(-1)?.stage,'published');
  assert.deepEqual(server.calls.filter(c=>c.path==='/videos/v1/publish').at(-1)?.body,{youtubeUrl:'https://youtu.be/dQw4w9WgXcQ'});
 }finally{await ui.close();server.restore();delete (window as {sceneForge?:unknown}).sceneForge;}
});

test('Publish without an export or a package says where to get them',async()=>{
 const server=installFetch(({path})=>path.startsWith('/api/exports')?{body:{jobs:[],nextOffset:null}}:undefined);
 const ui=await mountUI(createElement(PublishStep,{video:{...video,stage:'published',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',publishedAt:'2026-10-29T12:00:00.000Z',views:1234},pkg:null,onVideo:()=>{}}));
 try{
  await flush();
  const text=ui.container.textContent??'';
  assert.ok(text.includes('No exported video yet. Export it in Edit.'));
  assert.ok(text.includes('No package yet. Package it in Plan.'));
  assert.ok(text.includes('1,234 views'));
  assert.ok(!ui.container.querySelector('#club-youtube-link'),'a published video shows its link, not the form');
  await act(async()=>button(ui.container,'Change link').click());
  assert.equal((ui.container.querySelector('#club-youtube-link') as HTMLInputElement).value,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 }finally{await ui.close();server.restore();}
});
