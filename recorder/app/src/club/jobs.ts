import type {JobSnapshot} from '../../shared/club';
/** One event of a server job. `data` is whatever the job emitted; `failed` carries `{message}`. */
export type JobMessage={type:'progress'|'done'|'failed'|'cancelled';data:unknown;reset?:JobSnapshot};

const TYPES=['progress','done','failed','cancelled'] as const;
const EVENT_SOURCE_CLOSED=2;
export const LOST_JOB="Couldn't keep up with that.";

/**
 * Follows a job's server-sent events (`GET /api/club/jobs/:id/events`) and returns a function that stops following.
 * The server ends the stream after the last event, and a browser would reconnect to a stream that ended,
 * so the connection is closed here on `done`, `failed` and `cancelled`. If the job cannot be reached at all, `failed` is reported once.
 */
export function watchJob(id:string,onEvent:(event:JobMessage)=>void):()=>void{
 const source=new EventSource(`/api/club/jobs/${encodeURIComponent(id)}/events`);
 let closed=false;
 const close=()=>{if(closed)return;closed=true;source.close();};
 for(const type of TYPES)source.addEventListener(type,event=>{
  if(closed)return;
  if(type!=='progress')close();
  let data:unknown=null;
  try{data=JSON.parse((event as MessageEvent).data);}catch{data=(event as MessageEvent).data??null;}
  onEvent({type,data});
 });
 // A truncated replay starts with authoritative lifecycle state, followed by retained progress.
 source.addEventListener('reset',event=>{
  if(closed)return;
  let snapshot:JobSnapshot;try{snapshot=JSON.parse((event as MessageEvent).data);}catch{return;}
  if(snapshot.status==='running')onEvent({type:'progress',data:null,reset:snapshot});
  else if(snapshot.status==='done'){close();onEvent({type:'done',data:snapshot.result,reset:snapshot});}
  else if(snapshot.status==='failed'){close();onEvent({type:'failed',data:{message:snapshot.error},reset:snapshot});}
  else if(snapshot.status==='cancelled'){close();onEvent({type:'cancelled',data:null,reset:snapshot});}
 });
 source.addEventListener('error',()=>{
  // While the browser is retrying a dropped connection, readyState stays 0 and the job's replay catches up.
  if(closed||source.readyState!==EVENT_SOURCE_CLOSED)return;
  close();onEvent({type:'failed',data:{message:LOST_JOB}});
 });
 return close;
}

/** The sentence a `failed` event carries. */
export const failureMessage=(data:unknown,fallback='That did not work.')=>
 typeof data==='object'&&data!==null&&'message' in data&&typeof data.message==='string'&&data.message?data.message:fallback;

/** One line of text from a progress event: a bare string, or an object with `message`, `line` or `text`. */
export function progressLine(data:unknown):string|undefined{
 if(typeof data==='string')return data||undefined;
 if(typeof data!=='object'||data===null)return undefined;
 for(const key of ['message','line','text'] as const){const value=(data as Record<string,unknown>)[key];if(typeof value==='string'&&value)return value;}
 return undefined;
}

/** A job as the server describes it when it starts one. */
export type StartedJob={id:string;status:string};
export const isStartedJob=(value:unknown):value is StartedJob=>
 typeof value==='object'&&value!==null&&typeof (value as StartedJob).id==='string'&&typeof (value as StartedJob).status==='string';
