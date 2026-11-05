import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import type {AddressInfo} from 'node:net';
import path from 'node:path';
import type {OnePager,Video} from '../../shared/club.js';
import {onepagerShape,PLAN_JOB_KINDS} from '../../shared/club.js';
import {emptyOnePager,onepagerMarkdown,thumbnailBrief} from '../../src/club/idea/onepager.js';
import type {RunAIOptions} from './ai.js';

await mkdir('/tmp/cc-onepager',{recursive:true});
const temp=await mkdtemp('/tmp/cc-onepager/routes-');
process.env.CREATORCLUB_DIR=path.join(temp,'root');
process.env.CREATORCLUB_SECRETS_DIR=path.join(temp,'secrets');
process.env.SCENEFORGE_DATA_DIR=path.join(temp,'sceneforge');
process.env.SCENEFORGE_PORT='4294';
const p=await import('./planning.js');
const prompts=await import('./prompts.js');
const store=await import('./store.js');
const {clubRouter}=await import('./index.js');
const good:OnePager={title:'The Garden That Waters Itself',backupTitle:'Stop Guessing When To Water',logline:'We build a watering system, discover its limit, and show how to fix it.',thumbnail:{headline:'Never Dry',visual:'A plant sits beside a working water sensor.',closer:'Try It',template:'The creator’s garden comparison'},skeleton:[{label:'Intro',line:'We see the watered plant before learning how it works.'},{label:'Where it started',line:'A dry plant inspired the experiment.'},{label:'How it works',line:'A sensor checks when the soil needs water.'},{label:'The twist',line:'We test whether the sensor works in different soil.'},{label:'Do it yourself',line:'We walk through a small setup the viewer can try.'},{label:'Ending',line:'Ordinary gardeners can now test their assumptions.'}],whys:['Find the views and usual views of the creator’s related garden video.','Find a related outlier on another gardening channel and its real view count and multiple.','Regular gardeners and newcomers can test the soil limitation and try a small setup.'],flags:['Check the sensor in different soil before claiming it works.']};
let queued:unknown[]=[],gate:Promise<void>|undefined;
const asked:RunAIOptions[]=[];
const app=express();
app.use('/api/club',clubRouter({runAI:async options=>{asked.push(options);if(gate)await gate;const json=queued.shift()??good;return {text:JSON.stringify(json),json};}}));
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/club`;
after(()=>server.close());
async function call(method:string,url:string,body?:unknown){const response=await fetch(base+url,{method,headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
const channel=(await call('POST','/workspaces',{name:'Garden Maker',handle:'@garden',topics:['gardening']})).body;
const slug=channel.slug;
async function video(){const result=await call('POST','/videos',{title:'Water a plant'});assert.equal(result.status,201);const v=result.body as Video;await call('PUT',`/videos/${v.id}`,{idea:{why:'Test it in real soil.'}});return v;}
async function finish(id:string){for(let i=0;i<200;i++){const job=(await call('GET',`/jobs/${id}`)).body;if(job.status!=='running')return job;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Job did not finish');}

test('onepager shape accepts blank hand editing, 6–10 labeled beats and exactly three whys; rejects extra fields and oversized values',()=>{
 assert.ok(PLAN_JOB_KINDS.includes('onepager'));
 assert.deepEqual(onepagerShape.parse(good),good);
 assert.ok(onepagerShape.safeParse(emptyOnePager()).success);
 for(const invalid of [{...good,skeleton:good.skeleton.slice(0,5)},{...good,skeleton:Array(11).fill(good.skeleton[0])},{...good,whys:['one','two']},{...good,whys:['one','two','three','four']},{...good,extra:1},{...good,thumbnail:{...good.thumbnail,extra:1}},{...good,skeleton:good.skeleton.map(beat=>({...beat,seconds:5}))},{...good,title:'x'.repeat(201)}])assert.equal(onepagerShape.safeParse(invalid).success,false);
 assert.throws(()=>p.parseAnswer(onepagerShape,{title:'Only a title'},'Claude','one-pager'),/shape we could not read/);
 assert.equal(p.parseAnswer(onepagerShape,{...good,title:'A \\"quoted\\" title'},'Claude','one-pager').title,'A "quoted" title');
});

test('prompt carries the gold method and this creator’s voice, evidence and package without hardcoded brand facts',async()=>{
 const built=await prompts.buildOnePagerPrompt({workspace:{name:'Garden Maker',about:'Tiny gardens',topics:['plants'],cta:''},voice:'# Voice\nUse short friendly sentences.'},{idea:{title:'Water a plant',why:'Test the soil.'},research:[{id:'proof',kind:'video',title:'Self watering pots',meta:{channel:'Plant Maker',views:88000,multiplier:4.5},createdAt:''},{id:'note',kind:'note',text:'Our thumbnail has a yellow background.',meta:{},createdAt:''}],recentTitles:['Grow Your Own Herbs'],pkg:{angle:'Build a soil sensor',twist:'Different soil',titles:['Garden Sensor','',''],thumbnailText:'DRY SOIL',hook:{spoken:'Watch this plant.',visual:'A plant',text:'DRY'}},uploads:[{id:'u1',title:'My herbs',views:12000,date:null}]});
 for(const text of ['Paddy Galloway','6–10','no fragments','no jargon','twist halfway','practical payoff','big-idea ending','Why 1','Why 2','Why 3','Never invent numbers','what evidence to go find','Garden Maker','friendly sentences','88,000 views','4.5x','yellow background','Garden Sensor','12,000 views'])assert.ok(built.prompt.includes(text),text);
 assert.ok(!built.prompt.includes('Samin'));assert.ok(!built.prompt.includes('Is Insane'));assert.ok(!built.prompt.includes('884K'));
 assert.equal((built.schema as {title:string}).title,'onepager');
 const noData=await prompts.buildOnePagerPrompt({workspace:{name:'A creator',about:'',topics:[],cta:''},voice:''},{idea:{title:'An idea'},research:[]});
 assert.match(noData.prompt,/none: say what evidence to go find/);
 assert.ok(prompts.onepagerProblems(emptyOnePager()).length);assert.deepEqual(prompts.onepagerProblems(good),[]);
});

test('read/save routes persist onepager.json and expose it through the plan; invalid edits do not change it',async()=>{
 const v=await video(),url=`/videos/${v.id}/onepager`;
 assert.deepEqual(await call('GET',url),{status:200,body:null});
 assert.equal((await call('PUT',url,good)).status,200);
 assert.deepEqual((await call('GET',url)).body,good);
 assert.deepEqual(JSON.parse(await readFile(p.onepagerFile(slug,v.id),'utf8')),good);
 assert.deepEqual((await call('GET',`/videos/${v.id}/plan`)).body.onepager,good);
 assert.equal((await call('PUT',url,{...good,whys:[]})).status,400);
 assert.deepEqual((await call('GET',url)).body,good);
 assert.equal((await call('GET','/videos/missing/onepager')).status,404);
});

test('job reads the idea, board, package, voice and channel history with the package budget; Rewrite offers Undo',async()=>{
 const v=await video(),url=`/videos/${v.id}`;
 await writeFile(path.join(store.workspaceDir(slug),'voice.md'),'# Voice\nShort and friendly.');
 await store.writeJSON(path.join(store.workspaceDir(slug),'channel.json'),{uploads:[{id:'a',title:'Herbs at home',views:16000,date:null}]});
 await call('POST',url+'/research',{kind:'note',text:'Show the pot and the sensor.'});
 await call('PUT',url+'/package',{angle:'Keep plants watered',twist:'Soil changes readings',titles:['My Garden','',''],thumbnailText:'WATER ME',hook:{visual:'The garden',spoken:'See this soil.',text:'WATER'}});
 await call('PUT',url+'/onepager',{...good,title:'My hand-written title'});
 const started=await call('POST',url+'/onepager');assert.equal(started.status,202);
 const job=await finish(started.body.id);assert.equal(job.status,'done');assert.ok(job.result.replaced);
 const request=asked.at(-1)!;
 assert.equal(request.budgetUsd,p.PACKAGE_BUDGET_USD);
 for(const text of ['Test it in real soil.','Show the pot and the sensor.','Short and friendly.','Herbs at home','16,000 views','Keep plants watered'])assert.ok(request.prompt.includes(text),text);
 assert.deepEqual((await call('GET',url+'/onepager')).body,good);
 const undone=await call('POST',url+'/onepager/undo',{token:job.result.replaced});
 assert.equal(undone.body.onepager.title,'My hand-written title');
 assert.equal((await call('POST',url+'/onepager/undo',{token:'../../bad'})).status,404);
});

test('one run per video, running recovery, late results held on edits, Use it and Undo all reuse Plan versions',async()=>{
 const v=await video(),url=`/videos/${v.id}`;
 let release!:()=>void;gate=new Promise(resolve=>{release=resolve;});
 try{
  const started=(await call('POST',url+'/onepager')).body;
  assert.equal((await call('POST',url+'/onepager')).body.id,started.id);
  assert.equal((await call('GET',url+'/plan')).body.running.onepager,started.id);
  await call('PUT',url+'/onepager',{...good,title:'Typed during the run'});
  release();gate=undefined;
  const job=await finish(started.id);assert.equal(job.status,'done');assert.ok(job.result.held);
  assert.equal((await call('GET',url+'/onepager')).body.title,'Typed during the run');
  assert.equal((await call('GET',url+'/plan')).body.ready.onepager,job.result.held);
  assert.deepEqual((await call('POST',url+'/onepager/use',{token:job.result.held})).body.onepager,good);
  assert.equal((await call('GET',url+'/plan')).body.ready.onepager,undefined);
 }finally{release();gate=undefined;}
});

test('malformed and unfinished AI answers fail without overwriting a hand-written slide; blanks get one repair',async()=>{
 const v=await video(),url=`/videos/${v.id}`;
 await call('PUT',url+'/onepager',good);
 queued=[{...good,thumbnail:{unknown:'bad'}}];
 let job=await finish((await call('POST',url+'/onepager')).body.id);
 assert.equal(job.status,'failed');assert.deepEqual((await call('GET',url+'/onepager')).body,good);
 const before=asked.length;queued=[emptyOnePager(),good];
 job=await finish((await call('POST',url+'/onepager')).body.id);assert.equal(job.status,'done');assert.equal(asked.length-before,2);assert.match(asked.at(-1)!.prompt,/Fix them/);
 queued=[emptyOnePager(),emptyOnePager()];job=await finish((await call('POST',url+'/onepager')).body.id);assert.equal(job.status,'failed');assert.deepEqual((await call('GET',url+'/onepager')).body,good);
});

test('Use title reuses the package/text route; Add to board stores clean Markdown as a note',async()=>{
 const v=await video(),url=`/videos/${v.id}`;
 const used=await call('POST',url+'/package/text',{kind:'title',text:good.backupTitle});
 assert.equal(used.body.package.titles[0],good.backupTitle);
 const markdown=onepagerMarkdown(good);
 const added=await call('POST',url+'/research',{kind:'note',text:markdown});assert.equal(added.status,201);
 const notes=(await call('GET',url+'/research')).body;assert.equal(notes[0].kind,'note');assert.equal(notes[0].text,markdown);
 assert.equal(thumbnailBrief(good),'Headline: Never Dry. Visual: A plant sits beside a working water sensor. Closer: Try It. Layout: The creator’s garden comparison.');
});
