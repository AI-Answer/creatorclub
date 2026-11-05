/** Calls to the club server. Failures carry one sentence that is safe to show. */
export class ClubApiError extends Error{constructor(message:string,readonly status?:number){super(message);}}

export const CANT_REACH="Couldn't reach Creator Compiler.";
const GENERIC='That did not work.';
// The shell and home screen can explicitly share their concurrent initial list read.
// Share only concurrent reads, never a retained response or a caller-owned abort signal.
const pendingReads=new Map<string,Promise<unknown>>();

export async function clubFetch<T=unknown>(path:string,init:{method?:string;body?:unknown;signal?:AbortSignal;notify?:boolean;dedupe?:boolean}={}):Promise<T>{
 const method=init.method??(init.body===undefined?'GET':'POST');
 const request=()=>send<T>(path,{signal:init.signal,method,headers:init.body===undefined?undefined:{'content-type':'application/json'},body:init.body===undefined?undefined:JSON.stringify(init.body)},init.notify);
 if(!init.dedupe||method!=='GET'||init.signal||init.body!==undefined)return request();
 const existing=pendingReads.get(path);if(existing)return existing as Promise<T>;
 const pending=request().finally(()=>{if(pendingReads.get(path)===pending)pendingReads.delete(path);});
 pendingReads.set(path,pending);return pending;
}

/** Sends a file (or other form data) as a multipart upload. */
export function clubUpload<T=unknown>(path:string,form:FormData,signal?:AbortSignal):Promise<T>{
 return send<T>(path,{method:'POST',body:form,signal});
}

/** Fired on `window` after the server accepted a change to videos, so anything showing a list of them (the sidebar) can load it again. */
export const VIDEOS_CHANGED='club:videos-changed';

/** Tells everything that lists videos to load them again, for a change the server made that no request of ours reported. */
export const notifyVideosChanged=()=>{pendingReads.clear();window.dispatchEvent(new Event(VIDEOS_CHANGED));};

/** Writes that add, change or remove a video: `/videos…` (not noting that one was opened, moving or editing a tile on its Board, asking the companion, or autosaving its package, outline or script) and a concept added from a breakdown. A plan job that finishes announces itself. */
export function changesVideos(method:string|undefined,path:string):boolean{
 if(!method||method==='GET'||method==='HEAD')return false;
 const route=path.split('?')[0];
 if(/^\/videos(\/|$)/.test(route))return !/^\/videos\/[^/]+\/(opened|companion|board\/import|board\/pin)$/.test(route)&&!(method==='PUT'&&/^\/videos\/[^/]+\/(package|outline|script|script\/scene\/[^/]+)$/.test(route))&&!(method==='PATCH'&&/^\/videos\/[^/]+\/research\/[^/]+$/.test(route));
 return /^\/breakdowns\/[^/]+\/concepts\/[^/]+\/add$/.test(route);
}

async function send<T>(path:string,init:RequestInit,notify=true):Promise<T>{
 let response:Response;
 try{
  response=await fetch(`/api/club${path}`,init);
 }catch{throw new ClubApiError(CANT_REACH);}
 const text=await response.text();let body:unknown;
 try{body=text?JSON.parse(text):undefined;}catch{body=undefined;}
 if(!response.ok){
  const message=typeof body==='object'&&body!==null&&'error' in body&&typeof body.error==='string'?body.error:GENERIC;
  throw new ClubApiError(message,response.status);
 }
 // A read begun before a write must not be reused by the refresh after that write.
 if(init.method&&init.method!=='GET')pendingReads.clear();
 if(notify&&changesVideos(init.method,path))notifyVideosChanged();
 return body as T;
}

/** The sentence to show for any thrown value. */
export const errorMessage=(error:unknown,fallback=GENERIC)=>error instanceof ClubApiError?error.message:fallback;
