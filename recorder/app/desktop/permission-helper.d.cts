import type * as Electron from 'electron';
export type CapturePermission='camera'|'microphone'|'screen';
export function resolveAppBundle(executable:string):string;
export function permissionHelperOptions(workArea:Electron.Rectangle,preload:string):Electron.BrowserWindowConstructorOptions;
export function createPermissionHelper(options:{
 app:Electron.App;BrowserWindow:typeof Electron.BrowserWindow;ipcMain:Electron.IpcMain;
 screen:Electron.Screen;shell:Electron.Shell;nativeImage:typeof Electron.nativeImage;
 getStatus(kind:CapturePermission):string;onGranted(kind:CapturePermission):void;appName?:string;
 setInterval?:(callback:()=>void,ms:number)=>ReturnType<typeof setInterval>;
 clearInterval?:(timer:ReturnType<typeof setInterval>)=>void;
}):{open(kind:CapturePermission):Promise<void>;close():void;dispose():void};
