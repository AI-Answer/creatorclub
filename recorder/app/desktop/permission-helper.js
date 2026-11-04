'use strict';
const access=window.captureAccess;
const error=error=>{document.getElementById('error').textContent=error.message||'Try Show in Finder instead.';};
access.read().then(info=>{
 document.getElementById('instruction').textContent=`Drag ${info.appName} into the list above, then switch it on`;
 const icon=document.getElementById('icon');icon.src=info.icon;icon.alt=`Drag ${info.appName} into System Settings`;
 if(info.development){const note=document.getElementById('development');note.hidden=false;note.textContent=`Development: this adds ${info.bundleName}, the running app.`;}
}).catch(error);
document.getElementById('icon').addEventListener('dragstart',event=>{event.preventDefault();access.drag();});
document.getElementById('icon').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();access.reveal().catch(error);}});
document.getElementById('finder').addEventListener('click',()=>access.reveal().catch(error));
document.getElementById('close').addEventListener('click',()=>access.close().catch(error));
document.addEventListener('keydown',event=>{if(event.key==='Escape')access.close().catch(error);});
// Drag the card (anywhere but the icon and buttons) to move the helper out of the way.
const card=document.querySelector('main');let last=null;
card.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,img'))return;last={x:event.screenX,y:event.screenY};card.setPointerCapture(event.pointerId);card.classList.add('moving');});
card.addEventListener('pointermove',event=>{if(!last)return;const dx=event.screenX-last.x,dy=event.screenY-last.y;if(!dx&&!dy)return;last={x:event.screenX,y:event.screenY};access.move(dx,dy);});
const stop=()=>{last=null;card.classList.remove('moving');};
card.addEventListener('pointerup',stop);card.addEventListener('pointercancel',stop);card.addEventListener('lostpointercapture',stop);
