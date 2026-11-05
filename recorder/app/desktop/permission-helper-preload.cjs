const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('captureAccess',{
 onGranted:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('permission-helper-granted',listener);return()=>ipcRenderer.removeListener('permission-helper-granted',listener);},
 relaunch:()=>ipcRenderer.invoke('permission-helper-relaunch'),
 read:()=>ipcRenderer.invoke('permission-helper-read'),
 drag:()=>ipcRenderer.send('permission-helper-drag'),
 move:(dx,dy)=>ipcRenderer.send('permission-helper-move',dx,dy),
 reveal:()=>ipcRenderer.invoke('permission-helper-reveal'),
 close:()=>ipcRenderer.invoke('permission-helper-close'),
});
