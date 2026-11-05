(()=>{
 'use strict';
 // Borumi's recorder (recorder bundle index-DAWue-_s.js), rule for rule: the layout from the window's size (St/_t), the chips (Ie/H),
 // the toolbar (me), the script (Fe/L), the banners (Ze/nt), the flash (Ht), the starting screen (ct) and the countdown (ot).
 const el=id=>document.getElementById(id),video=el('camera-video'),image=el('camera-image'),script=el('script'),shown=new Map();
 const put=(key,value,apply)=>{if(shown.has(key)&&shown.get(key)===value)return;shown.set(key,value);apply(value);};
 const remembered=key=>{try{return localStorage.getItem(key);}catch{return null;}},keep=(key,value)=>{try{localStorage.setItem(key,value);}catch{/* not remembered */}};
 let state={},previousScript=null,selected=null,showSources=remembered('island.showSources')!=='0',notice=null;
 // Script following: Manual, or Constant speed at Borumi's speeds (8 to 30, default 14), in pixels a second.
 const SPEEDS=[8,10,12,14,16,18,20,22,24,26,28,30];
 let mode=remembered('island.scrollMode')==='Manual'?'Manual':'ConstSpeed',speed=SPEEDS.includes(Number(remembered('island.scrollSpeed')))?Number(remembered('island.scrollSpeed')):14;
 let frame=0,lastTime=0,position=0,camera=null,cameraFor=null,cameraTicket=0,live=false,lastStatus=null,flashTimer=0,startingSince=0,startingTimer=0;

 // St and _t: what shows and how tall it is, from the window's size.
 const BAR=48,BAR_NORMAL=54,BANNER=100,ROOM=20,MIN_CLOSE=80,NARROW=350,SCRIPT_HIGH=250,CHIPS_NARROW=400,CHIPS_TOP=150;
 function layoutFor(W,H,{hasScript,hasErrors,hasWarnings,starting,kind}){
  const narrow=W<CHIPS_NARROW,preview=H<64?undefined:{height:0,placement:narrow&&H>CHIPS_TOP?'top':'bottom',align:narrow?'left':'center',sea:H<100};
  const toolbar={sizing:H>300&&W>300?'normal':'compact',height:0},out={preview,toolbar,script:{placement:W>NARROW&&H>SCRIPT_HIGH?'floating':'bottom',height:0},errors:starting?undefined:hasErrors?{height:0}:undefined,warnings:starting?undefined:hasWarnings?{height:0}:undefined,close:starting?{compact:H<150}:H<150?undefined:{},countdown:{horizontal:H<200},starting:starting?{horizontal:H<=180}:undefined};
  if(out.preview===undefined)toolbar.height=H;
  if(!hasScript)out.script=undefined;
  if(!out.preview&&!out.script&&!out.errors&&!out.warnings)toolbar.height=H;
  else{let r=H;const i=toolbar.sizing==='normal'?BAR_NORMAL:BAR;toolbar.height=i;r-=i;
   const fit=()=>{if(out.errors){out.errors.height=BANNER;r-=BANNER;if(r<ROOM){out.errors.height=BANNER+r;return false;}}if(out.warnings){out.warnings.height=BANNER;r-=BANNER;if(r<ROOM){out.warnings.height=BANNER+r;return false;}}if(r<ROOM){toolbar.height=H;return false;}return true;};
   if(fit()){if(out.preview&&out.script){if(W<NARROW){const c=W*(kind==='audio'?.3:kind==='video'?.6:0);if(r<c)out.preview.height=r;else{out.preview.height=c;r-=c;out.script.height=r;}}else out.preview.height=r;}else if(out.preview)out.preview.height=r;else if(out.script)out.script.height=r;}}
  if(out.preview&&out.preview.height===0)out.preview=undefined;
  if(out.script&&out.script.height===0&&out.script.placement==='bottom')out.script=undefined;
  if(!out.starting&&(!out.preview?.height||out.preview.height<MIN_CLOSE))out.close=undefined;
  return out;
 }

 // The sources: the camera first, then the microphone (ve); the selected one fills the preview.
 const sources=()=>[...(state.cameraEnabled?['camera']:[]),...(state.microphoneLabel?['microphone']:[])];
 const selection=()=>{const list=sources();return list.includes(selected)?selected:list[0]||null;};

 function paintCamera(){const still=live?null:state.cameraFrame||null;put('video-hidden',!live||selection()!=='camera',v=>{video.hidden=v;});put('frame',selection()==='camera'?still:null,v=>{if(v)image.src=v;else image.removeAttribute('src');image.hidden=!v;});}
 // The microphone's wave: the last levels, newest at the right, as one mirrored shape.
 const wave=el('waveform'),levels=[];let waveFrame=0,lastPush=0;
 function drawWave(now){waveFrame=0;if(wave.hidden)return;
  if(now-lastPush>=50){lastPush=now;levels.push(state.status==='recording'&&typeof state.microphoneLevel==='number'?Math.max(0,Math.min(1,state.microphoneLevel)):0);}
  const ratio=window.devicePixelRatio||1,w=wave.clientWidth,h=wave.clientHeight;if(w&&h){if(wave.width!==Math.round(w*ratio)||wave.height!==Math.round(h*ratio)){wave.width=Math.round(w*ratio);wave.height=Math.round(h*ratio);}
   const g=wave.getContext('2d');if(g){const step=4,count=Math.ceil(w/step)+1;while(levels.length>count)levels.shift();g.setTransform(ratio,0,0,ratio,0,0);g.clearRect(0,0,w,h);
    const css=getComputedStyle(document.documentElement),fill=g.createLinearGradient(0,0,0,h);fill.addColorStop(0,css.getPropertyValue('--wave-top').trim()||'#8fd0ff');fill.addColorStop(1,css.getPropertyValue('--wave-bottom').trim()||'#3d8fe6');
    const mid=h/2,x0=w-(levels.length-1)*step,amp=v=>Math.max(1,v*mid*.9);g.beginPath();g.moveTo(x0,mid);levels.forEach((v,i)=>g.lineTo(x0+i*step,mid-amp(v)));for(let i=levels.length-1;i>=0;i--)g.lineTo(x0+i*step,mid+amp(levels[i]));g.closePath();g.fillStyle=fill;g.fill();}}
  if(['recording','starting','ready'].includes(state.status))waveFrame=requestAnimationFrame(drawWave);}
 function syncWave(){if(!waveFrame&&!wave.hidden&&['recording','starting','ready'].includes(state.status))waveFrame=requestAnimationFrame(drawWave);}

 function chips(placement,align){
  const top=el('chips-top'),row=el('sources'),list=sources(),pick=selection();
  for(const id of ['camera','microphone']){const chip=el(id==='camera'?'camera-chip':'mic-chip');chip.hidden=!list.includes(id);
   const parent=placement==='top'&&id===pick?top:row;if(chip.parentElement!==parent)parent.appendChild(chip);}
  // Bottom placement keeps every source in the row, in order (camera, then microphone).
  if(placement!=='top'){for(const id of ['camera-chip','mic-chip'])row.appendChild(el(id));}
  row.classList.toggle('left',align==='left');
 }

 function render(){
  put('theme',state.appearance||'',v=>{if(v)document.documentElement.dataset.theme=v;});
  const status=state.status||'starting',recording=status==='recording',paused=status==='paused',running=recording||paused;
  const starting=status==='starting'&&!state.countdown;
  if(status==='starting'&&!startingSince){startingSince=Date.now();clearInterval(startingTimer);startingTimer=setInterval(render,1000);}
  if(status!=='starting'&&startingSince){startingSince=0;clearInterval(startingTimer);}
  const pick=selection(),kind=pick==='camera'?'video':pick==='microphone'?'audio':undefined;
  const hasScript=Boolean(state.script?.trim()),error=state.error||null,warning=state.warning||notice||null;
  const L=layoutFor(innerWidth,innerHeight,{hasScript,hasErrors:Boolean(error),hasWarnings:Boolean(warning),starting,kind});
  put('status-text',({starting:'Starting…',ready:'Ready',recording:'Recording',paused:'Paused',saving:'Saving…',idle:'Saved'})[status]||'Starting…',v=>{el('status').textContent=v;});
  put('title',state.projectName||'',v=>{el('title').textContent=v;});
  const seconds=running?Math.max(0,Math.floor(state.elapsed||0)):0;
  put('clock',`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`,v=>{el('clock').textContent=v;});
  // The toolbar: Record when ready, Stop while recording or paused; pause or play and record again only while recording or paused.
  put('compact',L.toolbar.sizing==='compact',v=>{document.body.classList.toggle('compact',v);});
  put('toolbar-height',L.toolbar.height,v=>{el('toolbar').style.height=v+'px';});
  put('record',!running&&status!=='saving',v=>{el('record').hidden=!v;el('stop').hidden=v;});
  put('record-disabled',Boolean(error)||status!=='ready',v=>{el('record').disabled=v;});
  put('stop-disabled',status==='saving',v=>{el('stop').disabled=v;});
  put('secondary',running,v=>{el('bar-secondary').hidden=!v;});
  put('paused',paused,v=>{document.body.classList.toggle('paused',v);el('pause-text').textContent=v?'Resume':'Pause';el('pause').title=v?'Resume':'Pause';el('pause').setAttribute('aria-label',`${v?'Resume':'Pause'} recording`);});
  // The preview and its chips.
  put('preview-height',L.preview?L.preview.height:0,v=>{el('camera').hidden=!v;el('camera').style.height=v+'px';});
  put('preview-kind',kind||'',v=>{el('camera').classList.toggle('audio',v==='audio');wave.hidden=v!=='audio';document.body.classList.toggle('audio-only',v==='audio');document.body.classList.toggle('has-camera',v==='video');});
  put('chips',[L.preview?.placement,L.preview?.align,pick,sources().join()].join('|'),()=>chips(L.preview?.placement,L.preview?.align));
  put('sources-shown',showSources,v=>{document.body.classList.toggle('no-sources',!v);});
  put('camera-label',state.cameraLabel||'Camera',v=>{el('camera-label').textContent=v;});
  put('microphone-label',state.microphoneLabel||'Microphone',v=>{el('microphone-hint').textContent=v;});
  put('microphone-level',typeof state.microphoneLevel==='number'?state.microphoneLevel:null,v=>{el('microphone-bar').style.transform=`scaleX(${typeof v==='number'?Math.max(0,Math.min(1,v)):0})`;if(typeof v==='number')el('microphone-meter').setAttribute('aria-valuenow',String(Math.round(v*100)));else el('microphone-meter').removeAttribute('aria-valuenow');});
  put('mirror',state.mirror?'scaleX(-1)':'',v=>{video.style.transform=v;image.style.transform=v;});
  // The banners.
  put('error',error?`${L.errors?.height||0}|${error.title}|${error.message}`:'',()=>{el('error-banner').hidden=!(error&&L.errors);if(error&&L.errors){el('error-banner').style.height=L.errors.height+'px';el('error-title').textContent=error.title;el('error-message').textContent=error.message;}});
  put('warning',warning?`${L.warnings?.height||0}|${warning.title}|${warning.message}`:'',()=>{el('warning-banner').hidden=!(warning&&L.warnings);if(warning&&L.warnings){el('warning-banner').style.height=L.warnings.height+'px';el('warning-title').textContent=warning.title;el('warning-message').textContent=warning.message;}});
  // The script: bottom or floating at the top.
  put('script-layout',L.script?`${L.script.placement}|${L.script.height}`:'',()=>{const prompt=el('prompt');prompt.hidden=!L.script;if(L.script){prompt.classList.toggle('floating',L.script.placement==='floating');prompt.style.height=L.script.placement==='floating'?'':L.script.height+'px';}});
  if(previousScript!==state.script){previousScript=state.script;script.replaceChildren();for(const paragraph of (state.script||'').split(/\n\s*\n|\n/)){const p=document.createElement('p');p.textContent=paragraph;script.appendChild(p);}const trail=document.createElement('div');trail.className='trail';script.appendChild(trail);script.scrollTop=0;position=0;}
  put('pill',mode,v=>{const on=v!=='Manual';el('pill').classList.toggle('on',on);el('auto-pill').setAttribute('aria-pressed',String(on));el('auto-pill').title=on?'Disable scrolling for the script while recording':'Scroll script automatically while recording';el('rewind').hidden=!on;});
  put('pill-hidden',Boolean(state.countdown),v=>{el('pill-row').hidden=v;});
  // Close, starting, countdown.
  put('close',L.close?(L.close.compact?'compact':'normal'):'',v=>{el('close').hidden=!v;el('close').classList.toggle('compact',v==='compact');});
  const waited=startingSince?(Date.now()-startingSince)/1000:0;
  put('starting',L.starting?`${L.starting.horizontal}|${waited>=10?2:waited>=5?1:0}`:'',()=>{el('init').hidden=!L.starting;if(L.starting){el('init').classList.toggle('horizontal',L.starting.horizontal);el('init-text').textContent=waited>=10?'Trying one last time...':waited>=5?'Taking a bit longer...':'Getting things ready...';}});
  put('countdown',state.countdown?`${state.countdown}|${L.countdown.horizontal}`:'',()=>{el('countdown').hidden=!state.countdown;el('countdown-number').textContent=String(state.countdown||'');el('countdown').classList.toggle('horizontal',L.countdown.horizontal);});
  // The flash: each time the take becomes Recording, 500 ms (Ht).
  if(status!==lastStatus){if(status==='recording'){el('flash').classList.add('on');clearTimeout(flashTimer);flashTimer=setTimeout(()=>el('flash').classList.remove('on'),500);}else{clearTimeout(flashTimer);el('flash').classList.remove('on');}lastStatus=status;}
  paintCamera();syncWave();syncCamera(Boolean(L.preview));syncScroll();
 }

 // A live <video> of the editor's camera, found by its label (device IDs are salted per origin); Chromium shares the running capture.
 function closeCamera(){cameraTicket++;cameraFor=null;if(camera)for(const track of camera.getTracks())track.stop();camera=null;video.srcObject=null;live=false;paintCamera();}
 async function openCamera(label){
  const ticket=++cameraTicket,media=navigator.mediaDevices,find=list=>label?list.find(d=>d.kind==='videoinput'&&d.label===label):undefined;cameraFor=label;let stream=null;
  try{
   let device=find(await media.enumerateDevices());stream=await media.getUserMedia({audio:false,video:device?{deviceId:{exact:device.deviceId}}:true});
   if(ticket===cameraTicket&&!device&&label&&stream.getVideoTracks()[0]?.label!==label&&(device=find(await media.enumerateDevices()))){const first=stream;stream=null;for(const track of first.getTracks())track.stop();stream=await media.getUserMedia({audio:false,video:{deviceId:{exact:device.deviceId}}});}
   if(ticket!==cameraTicket){for(const track of stream.getTracks())track.stop();return;}
   camera=stream;video.srcObject=stream;stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(camera===stream){camera=null;video.srcObject=null;live=false;paintCamera();}});
  }catch{if(stream&&stream!==camera)for(const track of stream.getTracks())track.stop();}
 }
 function syncCamera(previewShown){const want=state.cameraEnabled&&previewShown&&selection()==='camera'&&['starting','ready','recording','paused'].includes(state.status)?state.cameraRawLabel||state.cameraLabel||'':null;if(want===null){if(cameraFor!==null)closeCamera();}else if(want!==cameraFor){if(cameraFor!==null)closeCamera();void openCamera(want);}}
 video.addEventListener('playing',()=>{if(camera&&!live){live=true;paintCamera();}});addEventListener('pagehide',closeCamera);

 async function command(name){try{notice=null;await window.recordingPreview.command(name);}catch(error){notice={title:'Warning!',message:error?.message||'The recording action could not finish.'};}render();}

 // Constant speed scrolls while recording; Manual leaves the script to the person. The fractional position lives here because Chromium
 // snaps scrollTop to device pixels.
 function syncScroll(){const run=mode==='ConstSpeed'&&state.status==='recording'&&!el('prompt').hidden;if(run){if(!frame){lastTime=0;position=script.scrollTop;frame=requestAnimationFrame(tick);}}else if(frame){cancelAnimationFrame(frame);frame=0;lastTime=0;}}
 function tick(now){frame=0;if(mode!=='ConstSpeed'||state.status!=='recording'){lastTime=0;return;}if(Math.abs(script.scrollTop-position)>1)position=script.scrollTop;if(lastTime){position+=Math.min(100,now-lastTime)/1000*speed;script.scrollTop=position;}lastTime=now;frame=requestAnimationFrame(tick);}
 function setMode(next){mode=next;keep('island.scrollMode',mode);render();}

 el('record').addEventListener('click',()=>command('record'));
 el('stop').addEventListener('click',()=>command('stop'));
 el('pause').addEventListener('click',()=>command(state.status==='paused'?'resume':'pause'));
 el('retry').addEventListener('click',()=>command('retry'));
 el('start-now').addEventListener('click',()=>command('skip-countdown'));
 el('cancel-countdown').addEventListener('click',()=>command('cancel'));
 el('close').addEventListener('click',()=>command('close'));
 el('auto-pill').addEventListener('click',()=>setMode(mode==='Manual'?'ConstSpeed':'Manual'));
 el('rewind').addEventListener('click',()=>{script.scrollTop=0;position=0;});
 for(const chip of [el('camera-chip'),el('mic-chip')])chip.addEventListener('click',()=>{selected=chip.dataset.source;render();});
 // More is the system menu, as Borumi's (request.context_menu.show), built by the main process from these values.
 el('more').addEventListener('click',async()=>{
  const choice=await window.recordingPreview.menu({mirror:Boolean(state.mirror),showSources,scriptAvailable:Boolean(state.script?.trim()),mode,speed,speeds:SPEEDS}).catch(()=>null);
  if(choice==='mirror')void command('mirror');
  else if(choice==='sources'){showSources=!showSources;keep('island.showSources',showSources?'1':'0');render();}
  else if(choice==='mode:Manual'||choice==='mode:ConstSpeed')setMode(choice.slice(5));
  else if(typeof choice==='string'&&choice.startsWith('speed:')&&SPEEDS.includes(Number(choice.slice(6)))){speed=Number(choice.slice(6));keep('island.scrollSpeed',String(speed));}
  else if(choice==='close')void command('close');
 });
 addEventListener('resize',render);

 // The main process sends the full state once, then only changed fields; read() fills in whatever pushes have not.
 let pushed=false;window.recordingPreview.subscribe(value=>{pushed=true;state={...state,...value};render();});window.recordingPreview.read().then(value=>{state={...(value||{}),...state};render();}).catch(e=>{if(!pushed){notice={title:'Warning!',message:e.message};render();}});
})();
