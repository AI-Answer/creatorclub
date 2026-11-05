const{contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('scriptWindow',{
 read:()=>ipcRenderer.invoke('script-window-read'),
 settings:patch=>ipcRenderer.invoke('script-window-settings',patch),
 follow:patch=>ipcRenderer.invoke('script-window-follow',patch),
 menu:()=>ipcRenderer.invoke('script-window-menu'),
 close:()=>ipcRenderer.invoke('script-window-close'),
 drag:(phase,at)=>ipcRenderer.invoke('script-window-drag',phase,at),
 subscribe:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('script-window-state',listener);return()=>ipcRenderer.removeListener('script-window-state',listener);}
});
