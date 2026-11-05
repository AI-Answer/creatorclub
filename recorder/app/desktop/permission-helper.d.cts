import type * as Electron from 'electron';
export type CapturePermission='camera'|'microphone'|'screen';
export function resolveAppBundle(executable:string):string;
export function permissionHelperOptions(workArea:Electron.Rectangle,preload:string):Electron.BrowserWindowConstructorOptions;
export function settingsHelperBounds(window:{found:boolean;x?:number;y?:number;width?:number;height?:number},height?:number):Electron.Rectangle|null;
export function createPermissionHelper(options:{
 app:Electron.App;BrowserWindow:typeof Electron.BrowserWindow;ipcMain:Electron.IpcMain;
 screen:Electron.Screen;shell:Electron.Shell;nativeImage:typeof Electron.nativeImage;
 getStatus(kind:CapturePermission):string;onGranted(kind:CapturePermission):void;relaunch?():void;appName?:string;helperPath?:string;spawnProcess?:typeof import('node:child_process').spawn;
 setTimeout?:(callback:()=>void,ms:number)=>ReturnType<typeof setTimeout>;
 clearTimeout?:(timer:ReturnType<typeof setTimeout>)=>void;
 setInterval?:(callback:()=>void,ms:number)=>ReturnType<typeof setInterval>;
 clearInterval?:(timer:ReturnType<typeof setInterval>)=>void;
}):{open(kind:CapturePermission):Promise<void>;close():void;dispose():void};
