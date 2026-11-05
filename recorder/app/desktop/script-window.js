(()=>{
 'use strict';
 // Borumi's teleprompter window, rule for rule: the window (ye), its script view (ht with de and he), the toolbar (be, Ce, Te), the speech
 // permission card (ut) and the context menu (Ge, built by the main process). The follower is the island's: its position, mode, speed and
 // whether it plays come from there, and this window's changes go back to it.
 const api=window.scriptWindow,F=window.ScriptFollower;
 const el=id=>document.getElementById(id),root=el('root'),scroller=el('scroller'),column=el('column'),list=el('tokens');
 let view={take:{active:false,script:'',appearance:'dark'},settings:{fontSize:36,lineHeight:1.2,textAlign:'Auto',textWidthRatio:.4,baseline:.5,mirrored:false,theme:'Dark',transparency:null},follower:{mode:'VoiceOptimistic',speed:14,index:0,playing:false,voiceAvailable:false,asking:false,error:null,appName:'CreatorClub'}};
 let tokens=[],dir='ltr',spans=[],shownScript=null,inset=64;
 const clamp=(n,lo,hi)=>Number.isFinite(n)?Math.min(Math.max(n,lo),hi):lo;

 // Ce (tokenize-script): the script's direction from its first letter.
 const RTL=[[1424,2303],[64285,65023],[65136,65279],[67584,69631],[124928,126975]];
 function direction(list){for(const token of list)for(const ch of token.text){const p=ch.codePointAt(0);if(RTL.some(([a,b])=>p>=a&&p<=b))return 'rtl';if(/\p{Alphabetic}/u.test(ch))return 'ltr';}return 'ltr';}
 // y / se / F: the baseline stays between 3% and 90% of the view, and above the toolbar (Le: the text sits fontSize×0.12 lower).
 const visualOffset=()=>view.settings.fontSize*.12;
 const maxBaseline=h=>h?clamp((h-Math.max(inset,0)-Math.max(visualOffset(),0))/h,.03,.9):.9;
 const baseline=()=>clamp(view.settings.baseline,.03,maxBaseline(scroller.clientHeight));
 const appDark=()=>view.take.active?view.take.appearance==='dark':Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
 const resolvedTheme=()=>view.settings.theme==='Auto'?(appDark()?'Dark':'Light'):view.settings.theme;
 const scriptAvailable=()=>view.take.active&&tokens.length>0;
 const transportDisabled=()=>!scriptAvailable()||view.follower.mode==='Manual';
 const interactive=()=>view.follower.mode!=='Manual';
 // se: Voice follow shows as Enhanced and the voice-activated constant speed as Constant speed.
 const shownMode=()=>({Voice:'VoiceOptimistic',VoiceOptimistic:'VoiceOptimistic',ConstSpeedVad:'ConstSpeed',ConstSpeed:'ConstSpeed'})[view.follower.mode]||'Manual';

 // Re / Pe / Me: a span a word, a space between, a line break and a 48px gap after a line's last word.
 function renderTokens(){
  shownScript=view.take.script;tokens=F.tokenize(view.take.script);dir=direction(tokens);spans=[];
  const out=document.createDocumentFragment();
  tokens.forEach((token,i)=>{const span=document.createElement('span');span.className='token'+(token.secondary?' secondary':'');span.dataset.scriptTokenIndex=String(i);span.textContent=token.text;out.appendChild(span);spans.push(span);
   if(token.newline){out.appendChild(document.createElement('br'));const gap=document.createElement('span');gap.className='gap';out.appendChild(gap);}
   else if(i<tokens.length-1){const space=document.createElement('span');space.setAttribute('aria-hidden','true');space.textContent=' ';out.appendChild(space);}});
  list.replaceChildren(out);
 }
 // Pe: a token is read once the position reaches it (the first only from index 1).
 function paintRead(){const i=view.follower.index;spans.forEach((span,n)=>span.classList.toggle('read',n===0?i>=1:n<=i));}

 function render(){
  const s=view.settings,f=view.follower;
  root.className=`teleprompter teleprompter-${s.theme.toLowerCase()}${appDark()?' app-dark':''}`;
  if(shownScript!==view.take.script)renderTokens();
  const available=scriptAvailable();
  el('empty').hidden=available;el('view').hidden=!available;el('toolbar-wrap').hidden=!available;
  el('speech').hidden=!(available&&f.asking);el('speech-text').textContent=`${f.appName} needs Speech Recognition permission to follow your voice.`;
  if(!available){
   // $ and ee: "Almost there!" before a take, "Nothing to see here" for a scene without a script, in black and white (K).
   const dark=resolvedTheme()==='Dark';Object.assign(el('empty').style,{backgroundColor:dark?'black':'white',color:dark?'white':'black'});el('empty-text').style.color=dark?'rgba(255, 255, 255, 0.7)':'rgba(0, 0, 0, 0.7)';
   el('empty-title').textContent=view.take.active?'Nothing to see here 👀':'Almost there!';
   el('empty-text').textContent=view.take.active?'This scene doesn\'t have a script. Add one to the scene, and it will appear here on your next take.':'Start recording a scene, and its script will appear here.';
   hideSpeed();hideTip();return;
  }
  Object.assign(scroller.style,{fontSize:s.fontSize+'px',lineHeight:String(s.lineHeight),textAlign:s.textAlign==='Auto'?(dir==='rtl'?'right':'left'):s.textAlign.toLowerCase()});
  column.dir=dir;column.style.width=`${s.textWidthRatio*100}%`;column.style.transform=s.mirrored?'scaleX(-1)':'';
  list.classList.toggle('interactive',interactive());
  renderToolbar();
  // The spacers put the first word on the baseline and let the last one reach it (D).
  const d=baseline();el('lead').style.height=`${clamp(d,0,1)*100}vh`;el('trail').style.height=`${clamp(1-d,0,1)*100}vh`;
  const top=`calc(${d*100}% + ${visualOffset()}px)`;el('baseline-guide').style.top=top;el('baseline-handle').style.top=top;
  placeWidthGuides();paintRead();follow();
 }

 // The toolbar: the controls that fit, in Borumi's order and widths, dropping from the end (Te); More always stays. No playback in Manual.
 const WIDTHS={playback:66,scrollingMode:94,fontSize:66,textAlignment:66,theme:36},MORE=36,GAP=6;
 function fitting(available,ordered){if(available<=0)return ordered;for(let n=ordered.length;n>=0;n--){const pick=ordered.slice(0,n);if(MORE+pick.reduce((sum,c)=>sum+WIDTHS[c],0)+GAP*pick.length<=available)return pick;}return [];}
 const press=(b,on)=>{b.classList.toggle('active',on);if(on)b.setAttribute('aria-pressed','true');else b.removeAttribute('aria-pressed');};
 function renderToolbar(){
  const f=view.follower,s=view.settings,wrap=el('toolbar-wrap');
  const ordered=['playback','scrollingMode','fontSize','textAlignment','theme'].filter(c=>!(f.mode==='Manual'&&c==='playback'));
  const shown=new Set(fitting(Math.max(0,wrap.clientWidth-28),ordered));
  for(const group of document.querySelectorAll('[data-control]'))group.hidden=!shown.has(group.dataset.control);
  // re: play or pause (a warning when following failed), and rewind.
  const disabled=transportDisabled(),error=!disabled&&f.error?f.error:null,label=error||(f.playing?'Pause scrolling':'Start scrolling'),play=el('play');
  play.disabled=disabled;press(play,f.playing);play.classList.toggle('playing',disabled||f.playing);play.classList.toggle('error',Boolean(error));play.dataset.tip=label;play.setAttribute('aria-label',label);if(error)play.setAttribute('aria-disabled','true');else play.removeAttribute('aria-disabled');
  el('rewind').disabled=disabled;
  for(const id of ['mode-manual','mode-voice','mode-constant']){const b=el(id);press(b,b.dataset.mode===shownMode());b.disabled=!scriptAvailable()||(id==='mode-voice'&&!f.voiceAvailable);}
  el('smaller').disabled=!(s.fontSize>10);el('larger').disabled=!(s.fontSize<100);
  // ue: Left and Center, or Right and Center for a right-to-left script; Auto shows as the start side.
  const start=dir==='rtl'?'Right':'Left',align=s.textAlign==='Auto'?start:s.textAlign,a=el('align-start');a.dataset.align=start;a.dataset.tip=`${start} align`;a.setAttribute('aria-label',`${start} align`);a.classList.toggle('rtl',start==='Right');
  for(const b of [a,el('align-center')])press(b,b.dataset.align===align);
  // gt: the moon while dark (pressed), the sun while light; it switches to the other.
  const dark=resolvedTheme()==='Dark',other=dark?'light':'dark',t=el('theme');press(t,dark);t.classList.toggle('light',!dark);t.dataset.tip=`Switch to ${other} mode`;t.setAttribute('aria-label',`Switch to ${other} mode`);
  // _e: the baseline stays 12px above the toolbar, and at least 64px from the bottom.
  inset=Math.max(64,Math.ceil(el('toolbar').getBoundingClientRect().height)+12);
  if(!el('speed').hidden)placeSpeed();
 }

 // fe: where the text column's edges are, from the scroller's width and padding.
 function placeWidthGuides(){const cs=getComputedStyle(scroller),l=parseFloat(cs.paddingLeft)||0,r=parseFloat(cs.paddingRight)||0,inner=Math.max(scroller.getBoundingClientRect().width-l-r,0),n=inner*view.settings.textWidthRatio,left=l+Math.max((inner-n)/2,0);el('left-guide').style.left=el('left-handle').style.left=left+'px';el('right-guide').style.left=el('right-handle').style.left=(left+n)+'px';}

 // pe / we / Ie: when the position moves, token index+1 settles on the baseline, eased over 500 ms, or 180 ms going back or jumping six
 // or more. Manual while playing leaves the scroll to you.
 let seekFrame=0,last={index:null,script:null,mode:null,playing:null};
 function anchorFor(i){const span=spans[i];if(!span)return null;const box=scroller.getBoundingClientRect(),r=span.getBoundingClientRect();return r.top-box.top+scroller.scrollTop+r.height*.82+visualOffset();}
 const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
 function follow(){
  const f=view.follower,on=(f.mode!=='Manual'&&f.playing)||!f.playing,previous=last.index;
  const changed=previous===null||previous!==f.index||last.script!==view.take.script||last.mode!==f.mode||last.playing!==f.playing;
  last={index:f.index,script:view.take.script,mode:f.mode,playing:f.playing};
  if(!on){cancelAnimationFrame(seekFrame);seekFrame=0;return;}
  if(!changed)return;
  const anchor=anchorFor(f.index+1);if(anchor===null)return;
  const to=clamp(anchor-scroller.clientHeight*baseline(),0,Math.max(0,scroller.scrollHeight-scroller.clientHeight)),from=scroller.scrollTop;
  cancelAnimationFrame(seekFrame);seekFrame=0;if(Math.abs(from-to)<1)return;
  const diff=previous===null?0:f.index-previous,duration=previous!==null&&(diff<0||diff>=6)?180:500,begin=performance.now();
  const step=now=>{const t=clamp((now-begin)/duration,0,1);scroller.scrollTop=from+(to-from)*ease(t);if(t>=1||Math.abs(scroller.scrollTop-to)<1){scroller.scrollTop=to;seekFrame=0;return;}seekFrame=requestAnimationFrame(step);};
  seekFrame=requestAnimationFrame(step);
 }

 // Settings are this window's: they show at once and the main process keeps them. Follower changes go to the island, which answers.
 function settings(patch){view.settings={...view.settings,...patch};render();void api.settings(patch).catch(()=>{});}
 const request=value=>{void api.follow(value).catch(()=>{});};

 // Borumi's More menu and right-click menu (Ge): the main process builds it; the choice comes back here.
 async function menu(){
  hideTip();hideSpeed();const choice=await api.menu().catch(()=>null);if(typeof choice!=='string')return;
  const [key,value]=choice.split(':');
  if(choice==='play')request({playing:true});else if(choice==='pause')request({playing:false});else if(choice==='rewind')request({seek:0});
  else if(key==='mode')request({mode:value});else if(key==='speed')request({speed:Number(value)});
  else if(['fontSize','lineHeight','textWidthRatio'].includes(key))settings({[key]:Number(value)});
  else if(key==='textAlign'||key==='theme')settings({[key]:value});
  else if(choice==='mirrored')settings({mirrored:!view.settings.mirrored});
  else if(key==='transparency')settings({transparency:value==='none'?null:Number(value)});
 }
 el('more').addEventListener('mousedown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();void menu();});
 for(const target of [scroller,el('toolbar')])target.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();void menu();});
 el('close').addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();void api.close();});
 el('play').addEventListener('click',()=>{if(!transportDisabled()&&!view.follower.error)request({playing:!view.follower.playing});});
 el('rewind').addEventListener('click',()=>{if(!transportDisabled())request({seek:0});});
 for(const id of ['mode-manual','mode-voice','mode-constant'])el(id).addEventListener('click',()=>{const mode=el(id).dataset.mode;if(mode!==shownMode())request({mode});});
 el('smaller').addEventListener('click',()=>{if(view.settings.fontSize>10)settings({fontSize:view.settings.fontSize-4});});
 el('larger').addEventListener('click',()=>{if(view.settings.fontSize<100)settings({fontSize:view.settings.fontSize+4});});
 for(const id of ['align-start','align-center'])el(id).addEventListener('click',()=>{const a=el(id).dataset.align,current=view.settings.textAlign==='Auto'?(dir==='rtl'?'Right':'Left'):view.settings.textAlign;if(a!==current)settings({textAlign:a});});
 el('theme').addEventListener('click',()=>settings({theme:resolvedTheme()==='Dark'?'Light':'Dark'}));
 el('speech-allow').addEventListener('click',()=>request({authorize:true}));
 // Pe: while following, a word is a button that moves the position there.
 list.addEventListener('click',e=>{const token=interactive()&&e.target.closest?.('.token');if(token){e.stopPropagation();request({seek:Number(token.dataset.scriptTokenIndex)});}});

 // ie: the speed popover over Constant speed while it is chosen, closing 180 ms after the pointer leaves.
 let speedTimer=0;
 function placeSpeed(){const b=el('mode-constant').getBoundingClientRect(),box=root.getBoundingClientRect(),pop=el('speed');pop.style.left=`${clamp(b.left-box.left+b.width/2-75,4,Math.max(4,box.width-154))}px`;pop.style.top=`${b.top-box.top-pop.offsetHeight-4}px`;}
 function showSpeed(){clearTimeout(speedTimer);const b=el('mode-constant');if(shownMode()!=='ConstSpeed'||b.disabled||b.closest('[data-control]').hidden)return;hideTip();el('speed-input').value=String(Math.round(view.follower.speed));el('speed').hidden=false;placeSpeed();}
 function hideSpeed(){clearTimeout(speedTimer);el('speed').hidden=true;}
 const leaveSpeed=()=>{clearTimeout(speedTimer);speedTimer=setTimeout(hideSpeed,180);};
 for(const target of [el('mode-constant'),el('speed')]){target.addEventListener('mouseenter',showSpeed);target.addEventListener('mouseleave',leaveSpeed);}
 el('speed-input').addEventListener('input',e=>request({speed:Number(e.target.value)}));

 // Tooltips: 200 ms after the pointer arrives, above the control. Constant speed has none while chosen: its popover shows instead.
 let tipTimer=0,tipFor=null,dragging=null,pointer={x:0,y:0};
 function hideTip(){clearTimeout(tipTimer);tipFor=null;el('tip').hidden=true;}
 function showTip(target){
  if(dragging||(target.id==='mode-constant'&&shownMode()==='ConstSpeed'))return;
  const tip=el('tip'),box=root.getBoundingClientRect(),r=target.getBoundingClientRect();tip.textContent=target.dataset.tip;tip.hidden=false;
  // The baseline's is at the pointer; a width guide's at the pointer's height, 8px off (sideOffset 8).
  const v=target.classList.contains('handle-v'),x=target.classList.contains('handle-h')?pointer.x:r.left+r.width/2,top=v?pointer.y-8:r.top-4;
  tip.style.left=`${clamp(x-box.left-tip.offsetWidth/2,4,Math.max(4,box.width-tip.offsetWidth-4))}px`;tip.style.top=`${clamp(top-box.top-tip.offsetHeight,4,Math.max(4,box.height-tip.offsetHeight-4))}px`;
 }
 addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};},{passive:true});
 root.addEventListener('pointerover',e=>{const target=e.target.closest?.('[data-tip]');if(!target||target===tipFor)return;hideTip();tipFor=target;tipTimer=setTimeout(()=>{if(tipFor===target)showTip(target);},200);});
 root.addEventListener('pointerout',e=>{const target=e.target.closest?.('[data-tip]');if(target&&!target.contains(e.relatedTarget))hideTip();});
 root.addEventListener('mousedown',hideTip,true);

 // de and he: the baseline handle and the text width handles; their guides show on hover and while dragging.
 let hovered=null;
 function showGuides(){
  const g=el('baseline-guide');g.classList.toggle('shown',hovered==='baseline'||dragging==='baseline');g.classList.toggle('active',dragging==='baseline');
  const width=['Left','Right'].includes(hovered)||['Left','Right'].includes(dragging);for(const id of ['left-guide','right-guide'])el(id).classList.toggle('shown',width);
  el('left-guide').classList.toggle('active',dragging==='Left');el('right-guide').classList.toggle('active',dragging==='Right');
 }
 // E: the baseline at the pointer; L: the width from the column's centre to the pointer, both ways.
 function baselineAt(y){const r=scroller.getBoundingClientRect(),o=visualOffset();return clamp((y-r.top-o)/r.height,.03,maxBaseline(r.height));}
 function widthAt(x){const r=scroller.getBoundingClientRect(),cs=getComputedStyle(scroller),l=parseFloat(cs.paddingLeft)||0,rr=parseFloat(cs.paddingRight)||0,inner=Math.max(r.width-l-rr,1);return clamp(Math.abs(x-(r.left+l+inner/2))*2/inner,.1,1);}
 function handle(node,kind){
  const move=e=>{if(dragging!==kind)return;e.preventDefault();if(kind==='baseline')settings({baseline:baselineAt(e.clientY)});else settings({textWidthRatio:widthAt(e.clientX)});};
  const end=e=>{if(node.hasPointerCapture?.(e.pointerId))node.releasePointerCapture(e.pointerId);dragging=null;hovered=null;showGuides();};
  node.addEventListener('pointerenter',()=>{hovered=kind;showGuides();});
  node.addEventListener('pointerleave',()=>{if(dragging!==kind){hovered=null;showGuides();}});
  node.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.button!==0)return;e.preventDefault();node.setPointerCapture?.(e.pointerId);hideTip();dragging=kind;hovered=kind;showGuides();move(e);});
  node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);
 }
 handle(el('baseline-handle'),'baseline');handle(el('left-handle'),'Left');handle(el('right-handle'),'Right');

 // W / De / je: the window moves when dragged from anywhere that is not a control, a word you can click, or the scroll bar.
 function onScrollbar(x,y){const r=scroller.getBoundingClientRect(),w=scroller.offsetWidth-scroller.clientWidth;return !el('view').hidden&&w>0&&scroller.scrollHeight>scroller.clientHeight&&x>=r.right-w&&y>=r.top&&y<=r.bottom;}
 root.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest?.('button,input,.speed,.handle')||(interactive()&&e.target.closest?.('.token'))||onScrollbar(e.clientX,e.clientY))return;
  dragging='window';root.setPointerCapture?.(e.pointerId);void api.drag('start',{x:e.screenX,y:e.screenY}).catch(()=>{});
 });
 root.addEventListener('pointermove',e=>{if(dragging==='window')void api.drag('move',{x:e.screenX,y:e.screenY}).catch(()=>{});});
 const endDrag=e=>{if(dragging!=='window')return;dragging=null;if(root.hasPointerCapture?.(e.pointerId))root.releasePointerCapture(e.pointerId);void api.drag('end').catch(()=>{});};
 root.addEventListener('pointerup',endDrag);root.addEventListener('pointercancel',endDrag);

 addEventListener('resize',render);
 window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',render);

 // The main process sends what changed; the first read has everything.
 function apply(patch){view={take:{...view.take,...(patch?.take||{})},settings:{...view.settings,...(patch?.settings||{})},follower:{...view.follower,...(patch?.follower||{})}};render();}
 let ready=false;const pending=[];
 api.subscribe(value=>{if(ready)apply(value);else pending.push(value);});
 api.read().then(value=>{ready=true;apply(value||{});for(const p of pending.splice(0))apply(p);}).catch(()=>{ready=true;render();});
})();
