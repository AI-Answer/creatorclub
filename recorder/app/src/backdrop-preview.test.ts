import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {createProject,defaultEffects,defaultTransform,type Clip,type Media,type Project} from '../shared/types';
import {createPlayhead} from './playhead';
const {Stage}=await import('./Stage');

const media=(id:string,kind:Media['kind']):Media=>({id,name:id,path:'/tmp/'+id,kind,duration:4,width:160,height:90});
const clip=(id:string,track:Clip['track'],more:Partial<Clip>={}):Clip=>({id,mediaId:id,name:id,track,start:0,sourceIn:0,sourceOut:10,speed:1,gain:0,muted:true,transform:defaultTransform(),effects:defaultEffects(),...more});
/** The preview asks for a mask 220 ms after the playhead settles. */
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,320));});

test('the Edit preview draws the chosen background behind the masked person, unmirrored',async()=>{
 const realFetch=globalThis.fetch;
 // The person mask the server would make with Vision.
 globalThis.fetch=(async()=>new Response(JSON.stringify({time:0,width:160,height:90,face:null,maskUrl:'/api/media/cam/vision-mask.png?time=0'}),{status:200,headers:{'Content-Type':'application/json'}})) as typeof fetch;
 const p:Project=createProject('Preview');
 p.media=[media('cam','video'),media('screen','video'),media('pic','image'),media('loop','video')];
 const camera=()=>p.clips[1];
 p.clips=[clip('screen','screen',{sourceIn:2}),clip('cam','camera',{effects:{...defaultEffects(),background:'remove',flipX:true,backdrop:{kind:'color',color:'#0000ff'}}})];
 const view=(time:number)=>createElement(Stage,{project:structuredClone(p),playhead:createPlayhead(time),playing:false,onSelect:()=>{},onImport:()=>{}});
 const ui=await mountUI(view(1));
 const behind=()=>ui.container.querySelector<HTMLElement>('.stage-media .vision-background');
 try{
  await settle();
  assert.match(behind()?.style.background??'',/0000ff|rgb\(0, ?0, ?255\)/i,'colour backdrop');
  assert.equal(behind()!.style.transform,'scaleX(-1)','turned back against the clip mirror');
  camera().effects.backdrop={kind:'image',mediaId:'pic'};await ui.render(view(1));
  assert.match(behind()!.getAttribute('src')??'',/\/api\/media\/pic\/file/,'picture backdrop');
  camera().effects.backdrop={kind:'video',mediaId:'loop'};await ui.render(view(6));await settle();
  const loop=behind() as HTMLVideoElement;
  assert.equal(loop.tagName,'VIDEO');assert.ok(loop.muted,'muted');assert.equal(loop.currentTime,2,'6 s into the clip a 4 s video is 2 s into its second pass');
  camera().effects.backdrop={kind:'screen'};await ui.render(view(3));await settle();
  const screen=behind() as HTMLVideoElement;
  assert.match(screen.getAttribute('src')??'',/\/api\/media\/screen\//,'the screen recording');assert.equal(screen.currentTime,5,'at the screen clip\'s own source second');
  camera().effects.background='none';await ui.render(view(3));
  assert.equal(behind(),null,'no cut-out, no backdrop');
 }finally{globalThis.fetch=realFetch;await ui.close();}
});
