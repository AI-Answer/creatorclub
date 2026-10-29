/** Calls to the club server. Failures carry one sentence that is safe to show. */
export class ClubApiError extends Error{constructor(message:string,readonly status?:number){super(message);}}

export const CANT_REACH="Couldn't reach CreatorClub.";
const GENERIC='That did not work.';

export async function clubFetch<T=unknown>(path:string,init:{method?:string;body?:unknown;signal?:AbortSignal}={}):Promise<T>{
 return send<T>(path,{signal:init.signal,method:init.method??(init.body===undefined?'GET':'POST'),headers:init.body===undefined?undefined:{'content-type':'application/json'},body:init.body===undefined?undefined:JSON.stringify(init.body)});
}

/** Sends a file (or other form data) as a multipart upload. */
export function clubUpload<T=unknown>(path:string,form:FormData,signal?:AbortSignal):Promise<T>{
 return send<T>(path,{method:'POST',body:form,signal});
}

/** Fired on `window` after the server accepted a change to videos, so anything showing a list of them (the sidebar) can load it again. */
export const VIDEOS_CHANGED='club:videos-changed';

/** Writes that add, change or remove a video: `/videos…` (not just noting that one was opened) and a concept added from a breakdown. */
export function changesVideos(method:string|undefined,path:string):boolean{
 if(!method||method==='GET'||method==='HEAD')return false;
 const route=path.split('?')[0];
 if(/^\/videos(\/|$)/.test(route))return !/^\/videos\/[^/]+\/opened$/.test(route);
 return /^\/breakdowns\/[^/]+\/concepts\/[^/]+\/add$/.test(route);
}

async function send<T>(path:string,init:RequestInit):Promise<T>{
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
 if(changesVideos(init.method,path))window.dispatchEvent(new Event(VIDEOS_CHANGED));
 return body as T;
}

/** The sentence to show for any thrown value. */
export const errorMessage=(error:unknown,fallback=GENERIC)=>error instanceof ClubApiError?error.message:fallback;
