// Types for motion-capture.cjs, which the media service (TypeScript) and the Electron main process (CommonJS) both run.
export interface MotionCaptureJob {width:number;height:number;fps:number;frames:number;clip:{x:number;y:number;width:number;height:number};seek:string}
export type CdpSend=(method:string,params?:Record<string,unknown>)=>Promise<any>;
export function captureJob<T extends MotionCaptureJob>(job:T):T;
export function captureFrames(sessions:CdpSend[],job:MotionCaptureJob,write:(index:number,png:Buffer)=>Promise<void>):Promise<void>;
