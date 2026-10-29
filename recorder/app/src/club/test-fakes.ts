import type {ScenesByVideo,Video} from '../../shared/club';

/** Stand-ins for the browser's EventSource and fetch, so screens can be tested against a scripted server. */
export class FakeEventSource{
 static all:FakeEventSource[]=[];
 static reset(){FakeEventSource.all=[];}
 static install(){FakeEventSource.reset();Object.assign(globalThis,{EventSource:FakeEventSource});}
 static last(){return FakeEventSource.all[FakeEventSource.all.length-1];}
 readyState=1;closed=false;
 private listeners=new Map<string,Array<(event:Event)=>void>>();
 constructor(readonly url:string){FakeEventSource.all.push(this);}
 addEventListener(type:string,listener:(event:Event)=>void){this.listeners.set(type,[...(this.listeners.get(type)??[]),listener]);}
 close(){this.closed=true;this.readyState=2;}
 /** Sends one server event. A closed source hears nothing, like the real one. */
 emit(type:string,data?:unknown){
  if(this.closed)return;
  for(const listener of this.listeners.get(type)??[])listener(Object.assign(new Event(type),{data:data===undefined?undefined:JSON.stringify(data)}));
 }
}

export type FakeCall={method:string;path:string;body:unknown};
export type FakeReply={status?:number;body?:unknown}|undefined;

/** Replaces `fetch` for `/api/club/...` calls. `reply` answers each one; an unanswered call is a 404. */
export function installFetch(reply:(call:FakeCall)=>FakeReply|Promise<FakeReply>){
 const calls:FakeCall[]=[];
 const original=globalThis.fetch;
 globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input).replace(/^\/api\/club/,'');
  const call={method:init?.method??'GET',path,body:typeof init?.body==='string'?JSON.parse(init.body):undefined};
  calls.push(call);
  const answer=await reply(call);
  return new Response(JSON.stringify(answer?.body??(answer?undefined:{error:'That was not found.'})),{status:answer?.status??(answer?200:404),headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 return {calls,restore:()=>{globalThis.fetch=original;}};
}

/**
 * What `GET /videos/scenes` answers for a set of videos: a video with a recording project has that project's scene count and how many are kept,
 * any other has its outline's count (none when `outlines` lacks it). Videos in `unreadable` are left out, as the server does when it cannot read one.
 */
export function fakeScenes(videos:readonly Video[],data:{projects?:readonly {id:string;sceneCount:number;recordedSceneCount:number}[];outlines?:Record<string,number>;unreadable?:readonly string[]}={}):ScenesByVideo{
 return Object.fromEntries(videos.filter(video=>video.stage!=='published'&&!data.unreadable?.includes(video.id)).map(video=>{
  const project=data.projects?.find(candidate=>candidate.id===video.recorderProjectId);
  const count=project?.sceneCount??data.outlines?.[video.id]??0,kept=project?.recordedSceneCount??0;
  return [video.id,Array.from({length:count},(_,index)=>({id:`s${index}`,title:`S${index}`,seconds:30,takes:index<kept?[{id:`t${index}`,seconds:20,kept:true,retained:false}]:[],status:index<kept?'Kept take 1':'Not recorded'}))];
 }));
}
