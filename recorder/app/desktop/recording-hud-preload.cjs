const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('recordingPreview',{
 read:()=>ipcRenderer.invoke('recording-hud-read'),
 command:value=>ipcRenderer.invoke('recording-hud-command',value),
 menu:value=>ipcRenderer.invoke('recording-hud-menu',value),
 follow:action=>ipcRenderer.invoke('recording-hud-follow',action),
 script:value=>ipcRenderer.invoke('recording-hud-script',value),
 onScript:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('recording-hud-script-request',listener);return()=>ipcRenderer.removeListener('recording-hud-script-request',listener);},
 onSpeech:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('recording-hud-speech',listener);return()=>ipcRenderer.removeListener('recording-hud-speech',listener);},
 subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('recording-hud-state',listener);return()=>ipcRenderer.removeListener('recording-hud-state',listener);}
});
