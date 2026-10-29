import {mountUI,button} from '../../test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import type {Package,Video,VideoScene} from '../../../shared/club';
import type {ExportRecord} from '../../../shared/export-history';
const {Publish,PUBLISH_LINE}=await import('./Publish');
const {Teleprompter}=await import('./Teleprompter');
const {installFetch}=await import('../test-fakes');

const flush=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
const type=async(input:Element,value:string,proto:typeof HTMLInputElement|typeof HTMLTextAreaElement=HTMLInputElement)=>act(async()=>{Object.getOwnPropertyDescriptor(proto.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
const byLabel=(root:Element,label:string)=>root.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
const primaries=(root:Element)=>[...root.querySelectorAll('button')].filter(b=>b.classList.contains('primary')).map(b=>b.textContent?.trim());

const video:Video={id:'v1',title:'Seven hidden Claude Code tricks',stage:'publishing',order:0,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',stageDates:{publishing:'2026-10-28T00:00:00.000Z'},planning:{research:true,package:true,outline:true},recorderProjectId:'p1'};
const pkg:Package={angle:'Most people use one feature.',twist:'',titles:['A','B','C'],thumbnailText:'Hidden features',hook:{visual:'A menu',spoken:'You never opened this.',text:'HIDDEN'}};
const scenes:VideoScene[]=[{id:'a',title:'Opening',seconds:60,takes:[{id:'t',seconds:60,kept:true}],status:'Kept take 1'},{id:'b',title:'Level 1',seconds:90,takes:[],status:'Not recorded'}];
const output='/Users/me/SceneForge/exports/Hidden features-e1.mp4';
const exported:ExportRecord={id:'e1',type:'export',status:'complete',progress:1,message:'',outputPath:output,startedAt:'2026-10-28T10:00:00.000Z',completedAt:'2026-10-28T10:01:00.000Z',projectId:'p1',projectName:'Hidden features',projectRevision:'r',snapshotCreatedAt:'',options:{format:'mp4'},updatedAt:'',revision:1,output:{status:'available'},recovery:{status:'available',runtimeChanged:false}};
const props={video,pkg,scenes,onVideo:()=>{},onDescription:()=>{},onGoTo:()=>{},onRetry:()=>{}};

test('Publish: the export, the chosen title, thumbnail text and description to copy, and Mark as published as the one primary',async()=>{
 const revealed:string[]=[],copied:string[]=[],saved:string[]=[],changes:Video[]=[];
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
 const ui=await mountUI(createElement(Publish,{...props,onVideo:(next:Video)=>changes.push(next),onDescription:(text:string)=>saved.push(text)}));
 try{
  await flush();
  const c=ui.container,text=c.textContent??'';
  assert.ok(text.includes(PUBLISH_LINE));
  assert.ok(text.includes('Hidden features-e1.mp4'),'the newest export is shown');
  await act(async()=>button(c,'Show in Finder').click());
  assert.deepEqual(revealed,[output]);
  assert.ok(text.includes(video.title)&&text.includes(pkg.thumbnailText));
  const description=c.querySelector('textarea[aria-label="Description"]') as HTMLTextAreaElement;
  assert.equal(description.value,'You never opened this.\n\nMost people use one feature.\n\nChapters\n0:00 Opening\n1:00 Level 1');
  await act(async()=>byLabel(c,'Copy title').click());await flush();
  assert.deepEqual(copied,[video.title]);
  assert.ok(button(c,'Copied'));
  await type(description,'My own words',HTMLTextAreaElement);
  await act(async()=>{description.dispatchEvent(new Event('focusout',{bubbles:true}));});
  assert.deepEqual(saved,['My own words'],'an edited description is saved on the package');
  await act(async()=>byLabel(c,'Copy description').click());await flush();
  assert.equal(copied.at(-1),'My own words');
  assert.deepEqual(primaries(c),['Mark as published']);
  assert.ok(!/Borumi|successfully|please|!/i.test(c.textContent??''));

  const field=c.querySelector('#club-youtube-link')!;
  assert.equal(button(c,'Mark as published').disabled,true,'needs a link first');
  await type(field,'https://vimeo.com/1');
  await act(async()=>button(c,'Mark as published').click());await flush();
  assert.ok(c.textContent?.includes('Paste the YouTube link of the uploaded video.'));
  assert.equal(field.getAttribute('aria-invalid'),'true');
  assert.equal(changes.length,0);
  await type(field,'https://youtu.be/dQw4w9WgXcQ');
  await act(async()=>button(c,'Mark as published').click());await flush();
  assert.equal(changes.at(-1)?.stage,'published');
  assert.deepEqual(server.calls.filter(call=>call.path==='/videos/v1/publish').at(-1)?.body,{youtubeUrl:'https://youtu.be/dQw4w9WgXcQ'});
 }finally{await ui.close();server.restore();delete (window as {sceneForge?:unknown}).sceneForge;}
});

test('Publish without an export or a package says where to get them; a published video shows its link and views',async()=>{
 const server=installFetch(({path})=>path.startsWith('/api/exports')?{body:{jobs:[],nextOffset:null}}:undefined);
 const goes:string[]=[];
 const published:Video={...video,stage:'published',youtubeUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',publishedAt:'2026-10-29T12:00:00.000Z',views:1234};
 const ui=await mountUI(createElement(Publish,{...props,video:published,pkg:null,onGoTo:(tab:string)=>goes.push(tab)}));
 try{
  await flush();
  const text=ui.container.textContent??'';
  assert.ok(text.includes('No exported video yet.'));
  assert.equal(ui.container.querySelector('textarea[aria-label="Description"]')?.getAttribute('maxlength'),'5000');
  assert.ok(text.includes('No thumbnail text yet. Add it in Plan.'));
  assert.ok(text.includes('1,234')&&text.includes('views since'));
  assert.ok(text.includes('youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.ok(!ui.container.querySelector('#club-youtube-link'),'a published video shows its link, not the form');
  await act(async()=>button(ui.container,'Export it in Edit').click());
  assert.deepEqual(goes,['edit']);
  await act(async()=>button(ui.container,'Change link').click());
  assert.equal((ui.container.querySelector('#club-youtube-link') as HTMLInputElement).value,published.youtubeUrl);
 }finally{await ui.close();server.restore();}
});

test('Publish before anything is recorded leads back to Record, or to Plan without scenes',async()=>{
 const server=installFetch(()=>undefined);
 const goes:string[]=[];
 const empty=[{...scenes[1]}];
 let ui=await mountUI(createElement(Publish,{...props,scenes:empty,onGoTo:(tab:string)=>goes.push(tab)}));
 try{
  await flush();
  assert.ok(ui.container.textContent?.includes('Nothing to publish yet'));
  assert.ok(ui.container.textContent?.includes('1 scene waiting to be recorded'));
  await act(async()=>button(ui.container,'Open record').click());
 }finally{await ui.close();}
 ui=await mountUI(createElement(Publish,{...props,scenes:[],onGoTo:(tab:string)=>goes.push(tab)}));
 try{await flush();await act(async()=>button(ui.container,'Open plan').click());}finally{await ui.close();server.restore();}
 assert.deepEqual(goes,['record','plan']);
});

test('the teleprompter shows the scene\'s talking points, steps through them and sizes the text',async()=>{
 const ui=await mountUI(createElement(Teleprompter,{index:1,scene:{id:'b',title:'Level 1',talkingPoints:['First','Second'],show:'Settings',seconds:90,script:'The words.'}}));
 try{
  const c=ui.container;
  assert.ok(c.textContent?.includes('Level 1')&&c.textContent.includes('about 1:30')&&c.textContent.includes('Show: Settings'));
  const points=()=>[...c.querySelectorAll('.tp')];
  assert.deepEqual(points().map(p=>p.className),['tp cur','tp']);
  await act(async()=>(points()[1] as HTMLElement).click());
  assert.deepEqual(points().map(p=>p.className),['tp done','tp cur']);
  const before=(points()[0] as HTMLElement).style.fontSize;
  await act(async()=>byLabel(c,'Bigger text').click());
  assert.notEqual((points()[0] as HTMLElement).style.fontSize,before);
  assert.ok(c.textContent?.includes('Full script for this scene'));
 }finally{await ui.close();}
 const none=await mountUI(createElement(Teleprompter,{index:0,scene:{title:'Empty',talkingPoints:[],show:'',seconds:0}}));
 try{assert.ok(none.container.textContent?.includes('This scene has no talking points. Add them in Plan.'));}finally{await none.close();}
});

test('a failed description save says so with Try again, and an edit clears once the package has it',async()=>{
 const server=installFetch(({path})=>path.startsWith('/api/exports')?{body:{jobs:[],nextOffset:null}}:undefined);
 const retries:number[]=[];
 const ui=await mountUI(createElement(Publish,{...props,saveError:'raw',onRetry:()=>retries.push(1)}));
 try{
  await flush();
  assert.ok(ui.container.textContent?.includes("Couldn't save the description."));
  await act(async()=>button(ui.container,'Try again').click());
  assert.deepEqual(retries,[1]);
 }finally{await ui.close();server.restore();}
});
