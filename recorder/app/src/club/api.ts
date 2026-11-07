/** Calls to the club server. Failures carry one sentence that is safe to show. */
export class ClubApiError extends Error{constructor(message:string,readonly status?:number){super(message);}}

export const CANT_REACH="Couldn't reach Creator Compiler.";
export const GENERIC='That did not work.';
/** Server messages are written for people (ClubError); only diagnostics are held back: error codes, stack lines, file paths,
  * markup, multi-line dumps, and the request guard's internal refusal. Everything else is shown as the server wrote it. */
export const isUserMessage=(message:string)=>message.length>0&&message.length<=240&&!/[\n<>]|(?:\b\w*Error:|\bE[A-Z]{3,}\b|\bat \w+[.(]|(?:^|\s)\/(?:Users|private|tmp|var|home)\/|Origin is not allowed)/.test(message);
// The shell and home screen can explicitly share their concurrent initial list read.
// Share only concurrent reads, never a retained response or a caller-owned abort signal.
let workspace:string|undefined;
export const currentClubWorkspace=()=>workspace;
export const selectClubWorkspace=(slug:string)=>clubFetch(`/workspaces/${encodeURIComponent(slug)}/current`,{method:'POST'});
/** Capture now, before a delayed delete or Undo can cross a channel switch. */
export const captureWorkspace=()=>workspace?Promise.resolve(workspace):clubFetch<{current:string|null}>('/workspaces').then(list=>list?.current??undefined,()=>undefined);
const videoWorkspaces=new Map<string,string>();
const videoScope=(path:string,explicit?:string)=>{
 const id=/^\/videos\/([^/?]+)(?:\/|$)/.exec(path)?.[1];
 if(!id||id==='scenes')return explicit;
 const scope=explicit??videoWorkspaces.get(id)??workspace;
 if(scope)videoWorkspaces.set(id,scope);return scope;
};
const pendingReads=new Map<string,Promise<unknown>>();

export async function clubFetch<T=unknown>(path:string,init:{method?:string;body?:unknown;signal?:AbortSignal;notify?:boolean;dedupe?:boolean;workspace?:string}={}):Promise<T>{
 const method=init.method??(init.body===undefined?'GET':'POST'),scope=videoScope(path,init.workspace);
 const request=()=>send<T>(path,{signal:init.signal,method,headers:{...(init.body===undefined?{}:{'content-type':'application/json'}),...(scope?{'X-Club-Workspace':scope}:{})},body:init.body===undefined?undefined:JSON.stringify(init.body)},init.notify);
 if(!init.dedupe||method!=='GET'||init.signal||init.body!==undefined)return request();
 const existing=pendingReads.get(path);if(existing)return existing as Promise<T>;
 const pending=request().finally(()=>{if(pendingReads.get(path)===pending)pendingReads.delete(path);});
 pendingReads.set(path,pending);return pending;
}

/** Sends a file (or other form data) as a multipart upload. */
export function clubUpload<T=unknown>(path:string,form:FormData,signal?:AbortSignal):Promise<T>{
 const scope=videoScope(path);return send<T>(path,{method:'POST',body:form,signal,headers:scope?{'X-Club-Workspace':scope}:undefined});
}

/** Fired on `window` after the server accepted a change to videos, so anything showing a list of them (the sidebar) can load it again. */
export const VIDEOS_CHANGED='club:videos-changed';

/** Tells everything that lists videos to load them again, for a change the server made that no request of ours reported. */
export const notifyVideosChanged=()=>{pendingReads.clear();window.dispatchEvent(new Event(VIDEOS_CHANGED));};
if(typeof window!=='undefined')window.addEventListener('sceneforge-media-service-ready',notifyVideosChanged);

/** Writes that add, change or remove a video: `/videos…` (not noting that one was opened, moving or editing a tile on its Board, asking the companion, or autosaving its package, one-pager, outline or script) and a concept added from a breakdown. A plan job that finishes announces itself. */
export function changesVideos(method:string|undefined,path:string):boolean{
 if(!method||method==='GET'||method==='HEAD')return false;
 const route=path.split('?')[0];
 if(/^\/videos(\/|$)/.test(route))return !/^\/videos\/[^/]+\/(opened|companion|board\/import|board\/pin)$/.test(route)&&!(method==='PUT'&&/^\/videos\/[^/]+\/(package|onepager|outline|script|script\/scene\/[^/]+)$/.test(route))&&!(method==='PATCH'&&/^\/videos\/[^/]+\/research\/[^/]+$/.test(route));
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
  console.error(`[Creator Compiler] ${init.method??'GET'} ${path} (${response.status}): ${message}`);
  throw new ClubApiError(isUserMessage(message)?message:GENERIC,response.status);
 }
 // A read begun before a write must not be reused by the refresh after that write.
 if(init.method&&init.method!=='GET')pendingReads.clear();
 if(notify&&changesVideos(init.method,path))notifyVideosChanged();
 if(path==='/workspaces/fresh'&&body&&typeof body==='object'&&'slug' in body&&typeof body.slug==='string')workspace=body.slug;
 if((path==='/workspaces'&&init.method==='GET'||/^\/workspaces\/[^/]+\/current$/.test(path)&&init.method==='POST')&&body&&typeof body==='object'&&'current' in body)workspace=typeof body.current==='string'?body.current:undefined;
 return body as T;
}

/** The sentence to show for any thrown value. */
export const errorMessage=(error:unknown,fallback=GENERIC)=>error instanceof ClubApiError&&error.message!==GENERIC?error.message:fallback;

/** An authoritative video saved without a full list reload (optimistic queues reconcile once drained). */
export const notifyVideoUpdated=(video:import('../../shared/club').Video)=>{pendingReads.clear();window.dispatchEvent(new CustomEvent('club:video-moved',{detail:video}));};
