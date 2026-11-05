import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

// The island is Borumi's recorder (its recorder bundle, index-DAWue-_s.js): these checks hold it to that bundle's rules.
async function island(state:Record<string,unknown>,{width=560,height=520,choice=null as string|null}={}){
 const browser=new Window({width,height,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),commands:string[]=[],menus:any[]=[];let update!:(state:any)=>void;
 browser.requestAnimationFrame=()=>1 as unknown as ReturnType<typeof browser.requestAnimationFrame>;browser.cancelAnimationFrame=()=>{};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async(value:string)=>{commands.push(value);},menu:async(value:any)=>{menus.push(value);return choice;}}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document,el=(id:string)=>doc.getElementById(id) as any,click=async(id:string)=>{el(id).click();await new Promise(resolve=>setTimeout(resolve,0));};
 return {browser,doc,el,click,commands,menus,update:(value:any)=>update(value),close:()=>browser.happyDOM.close()};
}
const camera={cameraEnabled:true,cameraLabel:'MacBook Air Camera',microphoneLabel:'MacBook Air Microphone',microphoneLevel:.5};

test('while recording: timer, Stop, pause and record again; Record only when ready; pause turns into play',async()=>{
 const t=await island({status:'recording',elapsed:72,...camera,script:''});
 try{
  assert.equal(t.el('clock').textContent,'01:12');assert.equal(t.el('stop').hidden,false);assert.equal(t.el('record').hidden,true);assert.equal(t.el('bar-secondary').hidden,false);
  await t.click('pause');t.update({status:'paused'});assert.ok(t.doc.body.classList.contains('paused'));assert.equal(t.el('pause').getAttribute('aria-label'),'Resume recording');
  await t.click('pause');await t.click('retry');await t.click('stop');assert.deepEqual(t.commands,['pause','resume','retry','stop']);
  t.update({status:'ready',elapsed:0});assert.equal(t.el('clock').textContent,'00:00');assert.equal(t.el('record').hidden,false);assert.equal(t.el('record').disabled,false);assert.equal(t.el('stop').hidden,true);assert.equal(t.el('bar-secondary').hidden,true,'pause and record again only while recording');
  await t.click('record');assert.equal(t.commands.at(-1),'record');
  t.update({error:{title:'Oh snap! Something went wrong.',message:'We don\'t recommend proceeding with the recording to avoid any data loss.'}});assert.equal(t.el('record').disabled,true,'Record is off while there is an error');
 }finally{await t.close();}
});

test('toolbar is 54px with a 36px Stop above 300×300, 48px and 32px below, as Borumi sizes it',async()=>{
 const big=await island({status:'recording',elapsed:1,...camera,script:''},{width:560,height:520});
 try{assert.equal(big.el('toolbar').style.height,'54px');assert.equal(big.doc.body.classList.contains('compact'),false);}finally{await big.close();}
 const small=await island({status:'recording',elapsed:1,...camera,script:''},{width:250,height:330});
 try{assert.equal(small.el('toolbar').style.height,'48px');assert.ok(small.doc.body.classList.contains('compact'));}finally{await small.close();}
 const css=await readFile(new URL('../desktop/recording-hud.css',import.meta.url),'utf8');
 assert.match(css,/\.primary \{ height: 36px; padding: 0 8px; border-radius: 8px;/);assert.match(css,/body\.compact \.primary \{ height: 32px; font-size: 12px;/);
 assert.match(css,/--stop: hsl\(0 72% 51%\);/,'dark:bg-red-400');assert.match(css,/--window: #232323;/);
});

test('the preview takes the room the toolbar leaves; a narrow window gives the script the rest under the toolbar',async()=>{
 const wide=await island({status:'recording',elapsed:1,...camera,script:'Read this.'},{width:560,height:520});
 try{
  assert.equal(wide.el('camera').style.height,`${520-54}px`);assert.ok(wide.el('prompt').classList.contains('floating'),'above 350×250 the script floats at the top');assert.equal(wide.el('prompt').hidden,false);
 }finally{await wide.close();}
 const narrow=await island({status:'recording',elapsed:1,...camera,script:'Read this.'},{width:300,height:500});
 try{
  assert.equal(narrow.el('camera').style.height,`${300*.6}px`,'60% of the width for a camera');assert.equal(narrow.el('prompt').classList.contains('floating'),false);assert.equal(narrow.el('prompt').style.height,`${500-48-180}px`);
 }finally{await narrow.close();}
 const short=await island({status:'recording',elapsed:1,...camera,script:'Read this.'},{width:500,height:240});
 try{assert.equal(short.el('prompt').hidden,true,'wide but short: the camera takes it all, as Borumi');}finally{await short.close();}
});

test('chips: one centred row at the bottom; in a narrow window the shown source moves to the top and the rest sit left',async()=>{
 const wide=await island({status:'recording',elapsed:1,...camera,script:''});
 try{
  assert.deepEqual([...wide.el('sources').children].map((c:any)=>c.id),['camera-chip','mic-chip']);assert.equal(wide.el('sources').classList.contains('left'),false);
  assert.equal(wide.el('camera-label').textContent,'MacBook Air Camera');assert.equal(wide.el('microphone-hint').textContent,'MacBook Air Microphone');
  await wide.click('mic-chip');assert.ok(wide.el('camera').classList.contains('audio'),'choosing the microphone shows its wave');assert.equal(wide.el('waveform').hidden,false);
  await wide.click('camera-chip');assert.equal(wide.el('camera').classList.contains('audio'),false);
 }finally{await wide.close();}
 const narrow=await island({status:'recording',elapsed:1,...camera,script:''},{width:300,height:400});
 try{assert.equal(narrow.el('camera-chip').parentElement.id,'chips-top');assert.equal(narrow.el('mic-chip').parentElement.id,'sources');assert.ok(narrow.el('sources').classList.contains('left'));}finally{await narrow.close();}
 const css=await readFile(new URL('../desktop/recording-hud.css',import.meta.url),'utf8');
 assert.match(css,/\.chip \{[^}]*padding: 2px 6px;[^}]*background: rgb\(0 0 0 \/ 0\.4\);[^}]*font-size: 8px;/);assert.match(css,/#microphone-meter \{[^}]*width: 64px; height: 4px;/);
});

test('without a camera the microphone fills the preview as its wave',async()=>{
 const t=await island({status:'recording',elapsed:3,cameraEnabled:false,microphoneLabel:'Mic',microphoneLevel:.5,script:''});
 try{assert.equal(t.el('camera').hidden,false);assert.ok(t.doc.body.classList.contains('audio-only'));assert.equal(t.el('waveform').hidden,false);assert.equal(t.el('camera-chip').hidden,true);}finally{await t.close();}
});

test('starting shows "Getting things ready...", the countdown has Start now and Cancel, close sends close',async()=>{
 const t=await island({status:'starting',countdown:null,elapsed:0,...camera,script:''});
 try{
  assert.equal(t.el('init').hidden,false);assert.equal(t.el('init-text').textContent,'Getting things ready...');
  t.update({countdown:3});assert.equal(t.el('init').hidden,true);assert.equal(t.el('countdown').hidden,false);assert.equal(t.el('countdown-number').textContent,'3');
  await t.click('start-now');await t.click('cancel-countdown');await t.click('close');assert.deepEqual(t.commands,['skip-countdown','cancel','close']);
 }finally{await t.close();}
});

test('the flash shows when the take starts recording, and again on resume',async()=>{
 const t=await island({status:'starting',countdown:1,elapsed:0,...camera,script:''});
 try{
  assert.equal(t.el('flash').classList.contains('on'),false);t.update({status:'recording',countdown:null});assert.ok(t.el('flash').classList.contains('on'));
  t.update({status:'paused'});assert.equal(t.el('flash').classList.contains('on'),false);t.update({status:'recording'});assert.ok(t.el('flash').classList.contains('on'));
 }finally{await t.close();}
});

test('banners: a red error and an orange warning above the toolbar, 100px each',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:'',error:{title:'Oh snap! Something went wrong.',message:'We recommend stopping the recording to avoid any data loss.'},warning:{title:'No sound from microphone',message:'\'Mic\' has been silent for a while. Make sure the microphone is not muted.'}});
 try{
  assert.equal(t.el('error-banner').hidden,false);assert.equal(t.el('error-banner').style.height,'100px');assert.equal(t.el('error-title').textContent,'Oh snap! Something went wrong.');
  assert.equal(t.el('warning-banner').hidden,false);assert.equal(t.el('warning-title').textContent,'No sound from microphone');
  assert.equal(t.el('camera').style.height,`${520-54-200}px`);
 }finally{await t.close();}
});

test('More is the system menu with Borumi\'s items; its choices mirror the camera, hide the sources, or close',async()=>{
 const mirror=await island({status:'recording',elapsed:1,...camera,mirror:true,script:'A script.'},{choice:'mirror'});
 try{await mirror.click('more');await new Promise(resolve=>setTimeout(resolve,0));const m=mirror.menus[0];assert.deepEqual([m.mirror,m.showSources,m.scriptAvailable,m.mode,m.speed,[...m.speeds].join()],[true,true,true,'ConstSpeed',14,'8,10,12,14,16,18,20,22,24,26,28,30']);assert.deepEqual(mirror.commands,['mirror']);}finally{await mirror.close();}
 const sources=await island({status:'recording',elapsed:1,...camera,script:''},{choice:'sources'});
 try{await sources.click('more');await new Promise(resolve=>setTimeout(resolve,0));assert.ok(sources.doc.body.classList.contains('no-sources'));}finally{await sources.close();}
 const cjs=await readFile(new URL('../desktop/recording-hud.cjs',import.meta.url),'utf8');
 for(const label of ['Mirror camera','Show sources','Scrolling mode','Scrolling speed','Close','Manual','Constant speed'])assert.ok(cjs.includes(`label:'${label}'`),label);
});

test('the script pill switches Constant speed and Manual, and rewinds while on',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:'First.\n\nSecond.'});
 try{
  assert.equal(t.el('auto-pill').getAttribute('aria-pressed'),'true');assert.equal(t.el('rewind').hidden,false);
  await t.click('auto-pill');assert.equal(t.el('auto-pill').getAttribute('aria-pressed'),'false');assert.equal(t.el('rewind').hidden,true);
  t.update({countdown:2});assert.equal(t.el('pill-row').hidden,true,'no pill during the countdown');
 }finally{await t.close();}
});
