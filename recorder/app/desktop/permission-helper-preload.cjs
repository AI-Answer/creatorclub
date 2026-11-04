const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('captureAccess',{
 read:()=>ipcRenderer.invoke('permission-helper-read'),
 drag:()=>ipcRenderer.send('permission-helper-drag'),
 reveal:()=>ipcRenderer.invoke('permission-helper-reveal'),
 close:()=>ipcRenderer.invoke('permission-helper-close'),
});
