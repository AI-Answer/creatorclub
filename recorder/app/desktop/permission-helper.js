'use strict';
const access=window.captureAccess;
const error=error=>{document.getElementById('error').textContent=error.message||'Try Show in Finder instead.';};
const card=document.querySelector('main');let last=null,granted=false;
access.onGranted(({kind})=>{
 granted=true;document.getElementById('guide').hidden=true;document.getElementById('celebration').hidden=false;card.classList.add('granted');
 if(kind==='screen'){document.getElementById('restart-note').hidden=false;document.getElementById('restart').hidden=false;}
});
access.read().then(info=>{
 document.getElementById('instruction').textContent=info.kind==='screen'?'Drag into “Screen & System Audio Recording”, not the audio-only list.':`Drag into the ${info.kind==='camera'?'Camera':'Microphone'} list above, then switch it on.`;
 document.getElementById('app-name').textContent=info.appName;
 document.getElementById('icon').src=info.icon;document.getElementById('pill').setAttribute('aria-label',`Drag ${info.appName} into System Settings`);
 document.getElementById('restart-note').textContent=`Restart ${info.appName} to use it`;
 if(info.development){const note=document.getElementById('development');note.hidden=false;note.textContent=`Development: this adds ${info.bundleName}, the running app.`;}
}).catch(error);
document.getElementById('pill').addEventListener('dragstart',event=>{event.preventDefault();if(!granted)access.drag();});
document.getElementById('pill').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();access.reveal().catch(error);}});
document.getElementById('finder').addEventListener('click',()=>access.reveal().catch(error));
document.getElementById('close').addEventListener('click',()=>access.close().catch(error));
document.getElementById('restart').addEventListener('click',()=>access.relaunch().catch(error));
document.addEventListener('keydown',event=>{if(event.key==='Escape')access.close().catch(error);});
// Drag the card outside the app pill and buttons to stop following Settings and move it.
card.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,#pill'))return;last={x:event.screenX,y:event.screenY};card.setPointerCapture(event.pointerId);card.classList.add('moving');});
card.addEventListener('pointermove',event=>{if(!last)return;const dx=event.screenX-last.x,dy=event.screenY-last.y;if(!dx&&!dy)return;last={x:event.screenX,y:event.screenY};access.move(dx,dy);});
const stop=()=>{last=null;card.classList.remove('moving');};
card.addEventListener('pointerup',stop);card.addEventListener('pointercancel',stop);card.addEventListener('lostpointercapture',stop);
