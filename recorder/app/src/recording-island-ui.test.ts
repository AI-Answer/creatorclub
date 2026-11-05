import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

test('island keeps recording controls visible while camera and script panels toggle independently',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),commands:string[]=[];let update!:(state:any)=>void;
 const state={status:'recording',elapsed:12,projectName:'Demo',cameraEnabled:true,script:'Read this paragraph.',layout:{camera:false,script:false},microphoneLabel:'Mic',microphoneLevel:.4};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async(value:string)=>commands.push(value),layout:async(layout:any)=>{update({layout});return layout;}}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document;
 try{
  assert.equal((doc.querySelector('.prompt') as any).hidden,true,'script starts hidden');assert.equal((doc.getElementById('camera') as any).hidden,true);
  assert.match(doc.getElementById('status')?.textContent||'',/Recording/);assert.equal(doc.getElementById('clock')?.textContent,'00:12');
  const stop=doc.getElementById('stop')!,parent=stop.parentElement;
  (doc.getElementById('script-toggle') as any).click();assert.equal((doc.querySelector('.prompt') as any).hidden,false);assert.equal((doc.getElementById('camera') as any).hidden,true);
  (doc.getElementById('camera-toggle') as any).click();assert.equal((doc.getElementById('camera') as any).hidden,false);assert.equal(stop.parentElement,parent);assert.deepEqual(commands,[]);
  update({status:'paused'});assert.equal(doc.getElementById('status')?.textContent,'Paused');assert.equal(doc.getElementById('pause')?.textContent,'Resume');
  (doc.getElementById('stop') as any).click();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(commands,['stop']);
 }finally{await browser.happyDOM.close();}
});

test('island defaults to native scrolling with optional auto-scroll in reading settings',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});let update!:(state:any)=>void;
 const state={status:'paused',elapsed:12,script:'First paragraph.\n\nSecond paragraph.',layout:{camera:false,script:true}};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async()=>{},layout:async(layout:any)=>{update({layout});return layout;}}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document;
 try{
  const size=doc.querySelector('input[type="range"][aria-label="Script text size"]') as any;
  assert.ok(size,'reading size uses a continuous labeled control');
  (doc.getElementById('reading-settings') as any).click();assert.equal((doc.getElementById('reading-options') as any).hidden,false);
  size.value='28';size.dispatchEvent(new browser.Event('input'));assert.equal((doc.getElementById('script') as any).style.fontSize,'28px');assert.equal(doc.getElementById('font-value')?.textContent,'28');
  assert.equal(Boolean(doc.querySelector('[aria-label="Paragraph navigation"]')),false);
  assert.equal(Boolean(doc.querySelector('[aria-label="Start script scrolling"]')),false);
  const automatic=doc.querySelector('input[type="checkbox"][aria-label="Auto-scroll script"]') as any;
  assert.ok(automatic,'automatic scrolling is optional in reading settings');assert.equal(automatic.checked,false);
  const speed=doc.querySelector('[aria-label="Script scroll speed"]') as any;assert.equal(speed.disabled,false);
  speed.value='55';speed.dispatchEvent(new browser.Event('input'));assert.equal(doc.getElementById('speed-value')?.textContent,'55');assert.equal(automatic.checked,false,'choosing speed does not start scrolling');
  automatic.click();assert.equal(automatic.checked,true);assert.equal(speed.disabled,false);
  const wheel=new browser.WheelEvent('wheel',{deltaY:80,cancelable:true});doc.getElementById('script')!.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented,false,'trackpad and mouse scrolling stay native');assert.equal(automatic.checked,false);assert.equal(speed.disabled,false);
  automatic.click();const key=new browser.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true});doc.getElementById('script')!.dispatchEvent(key);
  assert.equal(key.defaultPrevented,false,'native keyboard scrolling is not intercepted');assert.equal(automatic.checked,false);
  assert.equal(doc.getElementById('script-toggle')?.getAttribute('aria-label'),'Collapse teleprompter');
  (doc.getElementById('script-toggle') as any).click();assert.equal(doc.getElementById('script-toggle')?.getAttribute('aria-label'),'Expand teleprompter');
 }finally{await browser.happyDOM.close();}
});

test('island starts scrolling the script when the take starts recording, and respects turning it off',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});let update!:(state:any)=>void;
 const state={status:'starting',elapsed:0,script:'First paragraph.\n\nSecond paragraph.',layout:{camera:false,script:true}};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async()=>{},layout:async(layout:any)=>{update({layout});return layout;}}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document,automatic=doc.querySelector('input[type="checkbox"][aria-label="Auto-scroll script"]') as any;
 try{
  assert.equal(automatic.checked,false,'nothing scrolls before recording starts');
  update({status:'recording'});assert.equal(automatic.checked,true,'the script scrolls once recording starts');
  automatic.click();assert.equal(automatic.checked,false);update({status:'recording',elapsed:5});assert.equal(automatic.checked,false,'a take the person stopped scrolling stays stopped');
  update({status:'paused'});update({status:'recording'});assert.equal(automatic.checked,false,'resuming does not restart it');
  update({status:'idle'});update({status:'starting',script:'Next scene.'});update({status:'recording'});assert.equal(automatic.checked,false,'the next take keeps the choice to scroll by hand');
 }finally{await browser.happyDOM.close();}
});

test('auto-scroll starts again on the next take unless it was switched off',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});let update!:(state:any)=>void;
 // No layout is measured in happy-dom. Keep frames pending so the zero-height script cannot reach its end before assertions.
 browser.requestAnimationFrame=()=>1 as unknown as ReturnType<typeof browser.requestAnimationFrame>;browser.cancelAnimationFrame=()=>{};
 const state={status:'recording',elapsed:0,script:'First paragraph.',layout:{camera:false,script:true}};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async()=>{},layout:async(layout:any)=>{update({layout});return layout;}}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document,automatic=doc.querySelector('input[type="checkbox"][aria-label="Auto-scroll script"]') as any;
 try{
  assert.equal(automatic.checked,true,'a take that opens already recording scrolls');
  update({status:'idle'});update({status:'recording',script:'Second scene.'});assert.equal(automatic.checked,true,'a new scene scrolls from its start');
 }finally{await browser.happyDOM.close();}
});

test('island has Borumi\'s controls: close, record again, More, and the countdown\'s Start now and Cancel',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),commands:string[]=[];let update!:(state:any)=>void;
 const state={status:'starting',countdown:2,elapsed:0,cameraEnabled:true,cameraLabel:'MacBook Air Camera',microphoneLabel:'MacBook Air Microphone',script:'Line.',layout:{camera:true,script:true}};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:(callback:typeof update)=>{update=callback;return()=>{};},command:async(value:string)=>commands.push(value),layout:async(layout:any)=>{update({layout});return layout;}}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document,click=async(id:string)=>{(doc.getElementById(id) as any).click();await new Promise(resolve=>setTimeout(resolve,0));};
 try{
  assert.equal((doc.getElementById('countdown') as any).hidden,false);assert.equal(doc.getElementById('countdown-number')?.textContent,'2');
  assert.equal(doc.getElementById('camera-label')?.textContent,'MacBook Air Camera');assert.equal(doc.getElementById('microphone-hint')?.textContent,'MacBook Air Microphone');
  await click('start-now');await click('cancel-countdown');await click('close');
  assert.deepEqual(commands,['skip-countdown','cancel','cancel'],'during the countdown, close cancels the start');
  update({status:'recording',countdown:null,elapsed:4});commands.length=0;
  assert.equal(doc.getElementById('auto-pill')?.getAttribute('aria-pressed'),'true','the script scrolls once recording starts');
  assert.equal((doc.getElementById('retry') as any).disabled,false);
  await click('retry');await click('close');assert.deepEqual(commands,['retry','stop']);
  assert.equal((doc.getElementById('menu') as any).hidden,true);await click('more');assert.equal((doc.getElementById('menu') as any).hidden,false);
  await click('auto-pill');const pressed=doc.getElementById('auto-pill')?.getAttribute('aria-pressed');assert.equal(String((doc.getElementById('auto-scroll') as any).checked),pressed,'the pill and the setting agree');
  update({status:'paused'});assert.equal(doc.body.classList.contains('paused'),true);assert.equal(doc.getElementById('pause')?.getAttribute('aria-label'),'Resume recording');
 }finally{await browser.happyDOM.close();}
});

test('without a camera the island keeps its picture area and shows the microphone as a live waveform, as Borumi does',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 const state={status:'recording',elapsed:3,projectName:'Demo',cameraEnabled:false,script:'',layout:{camera:true,script:true},microphoneLabel:'Mic',microphoneLevel:.5};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:()=>()=>{},command:async()=>{},layout:async(layout:any)=>layout}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document;
 try{
  assert.equal((doc.getElementById('camera') as any).hidden,false,'the picture area stays, so the island is never a bare bar');
  assert.ok(doc.body.classList.contains('audio-only'));
  assert.equal((doc.getElementById('waveform') as any).hidden,false,'the waveform takes the camera\'s place');
  assert.equal((doc.getElementById('mic-chip') as any).hidden,false);
 }finally{await browser.happyDOM.close();}
});

test('island lays out its sources and bar as Borumi\'s recorder: one centred chip row, a 64 px level, a centred Stop, a dark bar',async()=>{
 const browser=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 const state={status:'recording',elapsed:3,cameraEnabled:true,cameraLabel:'MacBook Air Camera',microphoneLabel:'MacBook Air Microphone',microphoneLevel:.5,script:'',layout:{camera:true,script:false}};
 Object.assign(browser,{recordingPreview:{read:async()=>state,subscribe:()=>()=>{},command:async()=>{},layout:async(layout:any)=>layout}});
 browser.document.write(await readFile(new URL('../desktop/recording-hud.html',import.meta.url),'utf8'));browser.eval(await readFile(new URL('../desktop/recording-hud.js',import.meta.url),'utf8'));await new Promise(resolve=>setTimeout(resolve,0));
 const doc=browser.document,css=await readFile(new URL('../desktop/recording-hud.css',import.meta.url),'utf8');
 try{
  const sources=doc.getElementById('sources')!;
  assert.deepEqual([...sources.children].map(chip=>chip.id),['camera-chip','mic-chip'],'both chips share one row');
  assert.match(css,/#sources \{[^}]*bottom: 8px;[^}]*justify-content: center;/,'the row sits centred at the bottom of the picture');
  assert.match(css,/#microphone-meter \{[^}]*width: 64px; height: 4px;/);assert.match(css,/--level: #ffffff;/);
  assert.equal(doc.getElementById('stop')!.parentElement!.className,'bar-center');assert.equal(doc.getElementById('pause')!.parentElement!.className,'bar-center');
  assert.equal(doc.getElementById('more')!.parentElement!.className,'bar-end');
  assert.match(css,/:root \{[^}]*--glass: #232323;/,'the bar is Borumi\'s dark grey in a dark app');
  assert.equal((doc.getElementById('reading-settings') as any).hidden,true,'with no script there is nothing to scroll, so More does not offer it');
  assert.match(css,/\.menu-check:has\(input:checked\)::before[^{]*\{ content: '✓'; \}/,'More marks what is on with a leading check, as a native menu');
 }finally{await browser.happyDOM.close();}
});
