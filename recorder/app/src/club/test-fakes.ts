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
