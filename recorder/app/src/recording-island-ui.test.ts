import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

// The island is Borumi's recorder (its recorder bundle, index-DAWue-_s.js): these checks hold it to that bundle's rules.
async function island(state:Record<string,unknown>,{width=560,height=520,choice=null as string|null,voice=null as null|{available:boolean;authorization:string},stored={} as Record<string,string>}={}){
 const browser=new Window({width,height,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),commands:string[]=[],menus:any[]=[],follows:string[]=[],scripts:any[]=[];let update!:(state:any)=>void,speak:(event:any)=>void=()=>{},ask:(request:any)=>void=()=>{};
 for(const [key,value] of Object.entries(stored))browser.localStorage.setItem(key,value);
 // Frames run only when a test asks (run), on one clock shared with performance.now, so the follower's timing can be stepped.
 const queue=new Map<number,(time:number)=>void>();let nextFrame=1,clock=1000;
 browser.requestAnimationFrame=((callback:(time:number)=>void)=>{const id=nextFrame++;queue.set(id,callback);return id;}) as unknown as typeof browser.requestAnimationFrame;browser.cancelAnimationFrame=((id:number)=>{queue.delete(id);}) as unknown as typeof browser.cancelAnimationFrame;
 Object.defineProperty(browser.performance,'now',{value:()=>clock,configurable:true});
 const run=(ms:number,step=50)=>{for(const end=clock+ms;clock<end;){clock+=step;const callbacks=[...queue.values()];queue.clear();for(const callback of callbacks)callback(clock);}};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async(value:string)=>{commands.push(value);},menu:async(value:any)=>{menus.push(value);return choice;},script:async(value:any)=>{scripts.push(JSON.parse(JSON.stringify(value)));},onScript:(callback:typeof ask)=>{ask=callback;return()=>{};},
  ...(voice?{onSpeech:(callback:typeof speak)=>{speak=callback;return()=>{};},follow:async(action:string)=>{follows.push(action);if(action==='status'){setTimeout(()=>speak({type:'status',authorization:voice.authorization,available:voice.available}),0);return {available:voice.available,appName:'Creator Compiler'};}return null;}}:{})}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/script-follower.js',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,5));
 const doc=browser.document,el=(id:string)=>doc.getElementById(id) as any,click=async(id:string)=>{el(id).click();await new Promise(resolve=>setTimeout(resolve,0));};
 return {browser,doc,el,click,commands,menus,follows,scripts,ask:(request:any)=>ask(request),run,update:(value:any)=>update(value),speak:(event:any)=>speak(event),read:()=>[...doc.querySelectorAll('#script .token')].map((s:any)=>s.classList.contains('read')),close:()=>browser.happyDOM.close()};
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
 try{await mirror.click('more');await new Promise(resolve=>setTimeout(resolve,0));const m=mirror.menus[0];assert.deepEqual([m.mirror,m.showSources,m.scriptAvailable,m.mode,m.speed,[...m.speeds].join()],[true,true,true,'VoiceOptimistic',14,'8,10,12,14,16,18,20,22,24,26,28,30']);assert.deepEqual(mirror.commands,['mirror']);}finally{await mirror.close();}
 const sources=await island({status:'recording',elapsed:1,...camera,script:''},{choice:'sources'});
 try{await sources.click('more');await new Promise(resolve=>setTimeout(resolve,0));assert.ok(sources.doc.body.classList.contains('no-sources'));}finally{await sources.close();}
 const cjs=await readFile(new URL('../desktop/recording-hud.cjs',import.meta.url),'utf8');
 for(const label of ['Mirror camera','Show sources','Scrolling mode','Scrolling speed','Close','Manual','Voice follow (Enhanced)','Voice follow','Constant speed (Voice activated)','Constant speed'])assert.ok(cjs.includes(`label:'${label}'`)||cjs.includes(`mode('${label}'`),label);
});

test('the script pill switches Voice follow (Enhanced) and Manual, and rewinds while on, as Borumi\'s',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:'First.\n\nSecond.'});
 try{
  assert.equal(t.browser.localStorage.getItem('island.scrollMode'),null,'a first take starts with the pill on');
  assert.equal(t.el('auto-pill').getAttribute('aria-pressed'),'true');assert.equal(t.el('rewind').hidden,false);
  await t.click('auto-pill');assert.equal(t.el('auto-pill').getAttribute('aria-pressed'),'false');assert.equal(t.el('rewind').hidden,true);assert.equal(t.browser.localStorage.getItem('island.scrollMode'),'Manual');
  await t.click('auto-pill');assert.equal(t.browser.localStorage.getItem('island.scrollMode'),'VoiceOptimistic','on is Voice follow (Enhanced)');
  t.update({countdown:2});assert.equal(t.el('pill-row').hidden,true,'no pill during the countdown');
 }finally{await t.close();}
});

const SCRIPT='Hello everyone, today we are going to talk about [smile] voice following.\nIt scrolls the script as you read it aloud.';
const readUpTo=(n:number,count:number)=>Array.from({length:count},(_,i)=>n>=1&&i<=n);

test('the script is Borumi\'s tokens: a word a span, a line a paragraph, a [note] faded and never read',async()=>{
 const t=await island({status:'ready',elapsed:0,...camera,script:SCRIPT});
 try{
  const spans=[...t.doc.querySelectorAll('#script .token')] as any[];
  assert.deepEqual(spans.map(s=>s.textContent),['Hello','everyone,','today','we','are','going','to','talk','about','[smile]','voice','following.','It','scrolls','the','script','as','you','read','it','aloud.']);
  assert.equal(t.doc.querySelectorAll('#script p').length,2);assert.ok(spans[9].classList.contains('secondary'));
  assert.ok(t.doc.body.classList.contains('follow'),'with the pill on, words are buttons');
 }finally{await t.close();}
});

test('Voice follow: the words you say fade as the follower hears them; a clicked word and rewind move it',async()=>{
 const t=await island({status:'starting',countdown:null,elapsed:0,...camera,script:SCRIPT},{voice:{available:true,authorization:'authorized'},stored:{'island.scrollMode':'Voice'}});
 try{
  assert.deepEqual(t.follows,['status','start'],'it listens from the start of the take, with permission');
  t.update({status:'recording'});
  t.speak({type:'words',text:'hello everyone today'});assert.deepEqual(t.read(),readUpTo(2,21));
  t.speak({type:'words',text:'hello everyone today we are going to talk about voice'});assert.deepEqual(t.read(),readUpTo(10,21),'the note is passed over');
  t.speak({type:'reset'});t.speak({type:'words',text:'following it scrolls'});assert.deepEqual(t.read(),readUpTo(13,21),'a new recognition carries on from where you are');
  t.speak({type:'words',text:'following it scrolls banana'});assert.deepEqual(t.read(),readUpTo(13,21),'a word that is not next does not move it');
  await t.click('rewind');assert.deepEqual(t.read(),readUpTo(0,21));
  (t.doc.querySelectorAll('#script .token')[15] as any).click();assert.deepEqual(t.read(),readUpTo(15,21),'a clicked word counts as read');
  t.update({status:'paused'});t.speak({type:'words',text:'as you read it aloud'});assert.deepEqual(t.read(),readUpTo(15,21),'nothing moves while paused');
  t.update({status:'saving'});assert.deepEqual(t.follows.at(-1),'stop','it stops listening when the take ends');
  t.update({status:'starting',countdown:3});assert.deepEqual(t.read(),readUpTo(0,21),'the next take reads from the top');
 }finally{await t.close();}
});

test('Voice follow (Enhanced) reads one word ahead of what it heard, for 0.75 s, and never steps back',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:SCRIPT},{voice:{available:true,authorization:'authorized'}});
 try{
  t.speak({type:'words',text:'hello everyone today'});t.run(100);assert.deepEqual(t.read(),readUpTo(2,21));
  t.run(400);assert.deepEqual(t.read(),readUpTo(3,21),'one word ahead at 15 characters a second');
  t.run(2000);assert.deepEqual(t.read(),readUpTo(3,21),'no further, and not back');
  t.speak({type:'words',text:'hello everyone today we are going'});t.run(50);assert.deepEqual(t.read(),readUpTo(5,21));
 }finally{await t.close();}
});

test('Constant speed reads 14 characters a second; Voice activated only while you speak',async()=>{
 const words='aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj';
 const t=await island({status:'recording',elapsed:1,...camera,script:words},{stored:{'island.scrollMode':'ConstSpeed'}});
 try{t.run(1000);assert.deepEqual(t.read(),readUpTo(2,10),'14 characters in a second: the third word');t.run(1000);assert.deepEqual(t.read(),readUpTo(5,10));}finally{await t.close();}
 const vad=await island({status:'recording',elapsed:1,...camera,microphoneLevel:0,script:words},{stored:{'island.scrollMode':'ConstSpeedVad','island.scrollSpeed':'20'}});
 try{
  vad.run(1000);assert.deepEqual(vad.read(),readUpTo(0,10),'silent: it waits');
  vad.update({microphoneLevel:.8});vad.run(1000);assert.deepEqual(vad.read(),readUpTo(4,10),'speaking at 20 a second');
  vad.update({microphoneLevel:.05});vad.run(1000);assert.deepEqual(vad.read(),readUpTo(5,10),'it stops 0.4 s into a pause');vad.run(1000);assert.deepEqual(vad.read(),readUpTo(5,10));
 }finally{await vad.close();}
});

test('Speech Recognition permission: Borumi\'s card takes the pill\'s place, and Allow asks',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:SCRIPT},{voice:{available:true,authorization:'notDetermined'}});
 try{
  assert.equal(t.el('pill-row').hidden,true);assert.equal(t.el('speech-prompt').hidden,false);assert.equal(t.el('speech-text').textContent,'Creator Compiler needs Speech Recognition permission to follow your voice.');
  assert.ok(!t.follows.includes('start'),'no listening before permission');t.run(2000);assert.deepEqual(t.read(),readUpTo(0,21),'and no scrolling');
  await t.click('speech-allow');assert.equal(t.follows.at(-1),'authorize');
  t.speak({type:'status',authorization:'authorized',available:true});assert.equal(t.el('speech-prompt').hidden,true);assert.equal(t.el('pill-row').hidden,false);assert.equal(t.follows.at(-1),'start');
  await t.click('auto-pill');assert.equal(t.follows.at(-1),'stop','Manual stops listening');
 }finally{await t.close();}
});

test('without the voice follower (not a Mac), the voice modes read at constant speed; a follower error shows as a warning',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:'aaaa bbbb cccc dddd eeee'});
 try{t.run(1000);assert.deepEqual(t.read(),readUpTo(2,5));assert.equal(t.el('speech-prompt').hidden,true);}finally{await t.close();}
 const e=await island({status:'recording',elapsed:1,...camera,script:SCRIPT},{voice:{available:true,authorization:'authorized'}});
 try{e.speak({type:'error',message:'The microphone \'USB Mic\' was not found.'});assert.equal(e.el('warning-banner').hidden,false);assert.equal(e.el('warning-title').textContent,'Voice follow stopped');
  const starts=e.follows.filter(a=>a==='start').length;e.update({elapsed:2});assert.equal(e.follows.filter(a=>a==='start').length,starts,'no retry loop after an error');
  e.update({status:'saving'});e.update({status:'starting',countdown:3});assert.equal(e.follows.at(-1),'start','the next take tries again');
 }finally{await e.close();}
});

test('with the script window open the island hides its script, and its follower drives the window',async()=>{
 const words='aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj';
 const t=await island({status:'recording',elapsed:1,...camera,script:words,scriptWindow:true},{stored:{'island.scrollMode':'ConstSpeed'}});
 try{
  assert.equal(t.el('prompt').hidden,true,'Borumi\'s At(): no script card while the window shows it');assert.equal(t.el('camera').style.height,`${520-54}px`,'the camera takes the room');
  const last=()=>t.scripts.at(-1);
  t.run(1000);assert.equal(last().index,2,'it still reads on at 14 characters a second');assert.deepEqual([last().mode,last().speed,last().playing],['ConstSpeed',14,true]);
  t.ask({playing:false});t.run(1000);assert.equal(last().index,2,'Pause from the window holds it');assert.equal(last().playing,false);
  t.ask({playing:true});t.run(1000);assert.equal(last().index,5);
  t.ask({seek:8});assert.equal(last().index,8);assert.deepEqual(t.read(),readUpTo(8,10));t.ask({seek:0});assert.equal(last().index,0);
  t.ask({speed:21});assert.equal(last().speed,21);t.ask({mode:'Manual'});assert.equal(last().mode,'Manual');assert.equal(last().playing,false);assert.equal(t.el('auto-pill').getAttribute('aria-pressed'),'false');
  t.update({scriptWindow:false});assert.equal(t.el('prompt').hidden,false,'closing the window brings the script back');
  await t.click('more');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(t.menus.at(-1).index,0);
 }finally{await t.close();}
 const ready=await island({status:'ready',elapsed:0,...camera,script:words,scriptWindow:true},{stored:{'island.scrollMode':'ConstSpeed'}});
 try{ready.run(1000);assert.equal(ready.scripts.at(-1).playing,false,'outside a take it waits');ready.ask({playing:true});ready.run(1000);assert.equal(ready.scripts.at(-1).index,2,'Play rehearses');assert.equal(ready.scripts.at(-1).playing,true);
  ready.update({status:'starting'});assert.equal(ready.scripts.at(-1).playing,false,'a new take starts from the top, not rehearsing');assert.equal(ready.scripts.at(-1).index,0);}finally{await ready.close();}
});

test('choosing "Open script as separate window" sends the island\'s script-window command',async()=>{
 const t=await island({status:'recording',elapsed:1,...camera,script:'Read this.'},{choice:'script-window'});
 try{await t.click('more');await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(t.commands,['script-window']);}finally{await t.close();}
 const cjs=await readFile(new URL('../desktop/recording-hud.cjs',import.meta.url),'utf8');
 assert.ok(cjs.indexOf("label:'Show sources'")<cjs.indexOf("label:'Open script as separate window'")&&cjs.indexOf("label:'Open script as separate window'")<cjs.indexOf("label:'Scrolling mode'"),'between Show sources and Scrolling mode, as Borumi');
});
