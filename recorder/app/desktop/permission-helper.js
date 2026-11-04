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
