import {useCallback,useEffect,useRef,useState} from 'react';
import type {JobSnapshot} from '../../../shared/club';
import type {CompanionApplied,CompanionAsked,CompanionChanged,CompanionContext,CompanionEvent,CompanionMessage,CompanionReplyMessage,CompanionTab,CompanionThread} from '../../../shared/companion';
import {clubFetch,errorMessage} from '../api';
import {LOST_JOB,failureMessage,watchJob} from '../jobs';

/** A step of the reply being written, with when it started (as this screen saw it). */
export type LiveStep={label:string;started:number};

/** The reply being written: its steps and text so far, or how it ended when it did not finish. */
export type Live={
 jobId:string;
 /** The question it answers. */
 questionId:string;
 /** The step it was asked on. */
 tab:CompanionTab;
 steps:LiveStep[];
 text:string;
 started:number;
 phase:'working'|'failed';
 error?:string;
};

const NO_ANSWER="Couldn't get an answer.";
/** After Stop, the conversation is read again once the server has saved what it keeps, so the screen shows the server's truth. */
const SETTLE_MS=400;

/** A step event, placed by its index, so a replayed stream never repeats a step. */
export function withStep(steps:readonly LiveStep[],index:number,label:string,now:number):LiveStep[]{
 return index<steps.length?steps as LiveStep[]:[...steps,{label,started:now}];
}

/** A text event, placed at its offset: a piece already shown (a replay) changes nothing. */
export function withText(text:string,at:number,piece:string):string{
 if(at+piece.length<=text.length)return text;
 return text.slice(0,at)+piece;
}

/**
 * One video's companion: the saved conversation, the reply being written (followed over SSE, picked up again after a dropped
 * connection or when the panel reopens while one runs), Stop, Try again, and applying or undoing a card. `onChanged` hears what an
 * apply or undo changed. `announce` is one short line for screen readers: the current step, "Reply ready", or the failure.
 */
export function useCompanion(videoId:string,{onChanged,beforeApply}:{onChanged(changed:CompanionChanged[]):void;beforeApply?():Promise<void>}){
 const base=`/videos/${encodeURIComponent(videoId)}/companion`;
 const [messages,setMessages]=useState<CompanionMessage[]|null>(null);
 const [loadError,setLoadError]=useState('');
 const [live,setLive]=useState<Live|null>(null);
 const [sendError,setSendError]=useState('');
 const [busyCard,setBusyCard]=useState<string|null>(null);
 const [announce,setAnnounce]=useState('');
 const stopFollowing=useRef<(()=>void)|null>(null);
 const liveRef=useRef(live);liveRef.current=live;
 const changedRef=useRef(onChanged);changedRef.current=onChanged;
 const loadRef=useRef<()=>void>(()=>{});

 /**
  * Follows a reply's events. `from` is what the screen already has (the server's running text and steps, or the reply so far after a
  * dropped connection); the replayed events then fill in only what is new.
  */
 const follow=useCallback((jobId:string,questionId:string,tab:CompanionTab,from?:{text:string;steps:string[]|LiveStep[]})=>{
  stopFollowing.current?.();
  const now=Date.now();
  const steps=(from?.steps??[]).map(step=>typeof step==='string'?{label:step,started:now}:step);
  setLive({jobId,questionId,tab,steps,text:from?.text??'',started:liveRef.current?.jobId===jobId?liveRef.current.started:now,phase:'working'});
  // Only a step not seen before is announced; a replayed one is not.
  let seen=steps.length;
  stopFollowing.current=watchJob(jobId,event=>{
   if(event.type==='progress'){
    const data=event.data as CompanionEvent;
    if(data?.type==='step'){
     setLive(current=>current&&current.jobId===jobId?{...current,steps:withStep(current.steps,data.index,data.label,Date.now())}:current);
     if(data.index>=seen){seen=data.index+1;setAnnounce(data.label);}
    }else if(data?.type==='text')setLive(current=>current&&current.jobId===jobId?{...current,text:withText(current.text,data.at,data.text)}:current);
    return;
   }
   stopFollowing.current=null;
   if(event.type==='done'){
    const reply=event.data as CompanionReplyMessage;
    setMessages(current=>[...(current??[]).filter(message=>message.id!==reply.id),reply]);
    setLive(null);setAnnounce('Reply ready');
   }else if(event.type==='failed'){
    const message=failureMessage(event.data,NO_ANSWER);
    // The connection dropped, not the reply: ask how the job is doing before saying anything failed.
    if(message===LOST_JOB){void recover(jobId,questionId,tab);return;}
    setLive(current=>current&&current.jobId===jobId?{...current,phase:'failed',error:message}:current);
    setAnnounce(message);
   }else setLive(current=>current?.jobId===jobId?null:current);
  });
 },[]);

 /** After a dropped stream: a reply still running is followed again from where the screen is; a finished one is read from the server. */
 const recover=useCallback(async(jobId:string,questionId:string,tab:CompanionTab)=>{
  const job=await clubFetch<JobSnapshot>(`/jobs/${encodeURIComponent(jobId)}`).catch(()=>undefined);
  const current=liveRef.current;
  if(job?.status==='running'){follow(jobId,questionId,tab,current?.jobId===jobId?{text:current.text,steps:current.steps}:undefined);return;}
  if(job?.status==='done'){setLive(null);loadRef.current();setAnnounce('Reply ready');return;}
  const message=job?.status==='failed'&&job.error?job.error:NO_ANSWER;
  setLive(live=>live&&live.jobId===jobId?{...live,phase:'failed',error:message}:live);
  setAnnounce(message);
 },[follow]);

 const load=useCallback(()=>{
  setLoadError('');
  clubFetch<CompanionThread>(base).then(thread=>{
   setMessages(thread.messages);
   const running=thread.running,question=running&&thread.messages.find(message=>message.id===running.messageId);
   if(running&&question?.role==='user'&&liveRef.current?.jobId!==running.jobId)follow(running.jobId,running.messageId,question.context.tab,{text:running.text,steps:running.steps});
  },reason=>setLoadError(errorMessage(reason,"Couldn't load the conversation.")));
 },[base,follow]);
 loadRef.current=load;
 useEffect(()=>{load();return()=>{stopFollowing.current?.();stopFollowing.current=null;};},[load]);

 /** Asks a question, or with `retryOf` the one that failed again. */
 const send=useCallback(async(text:string,context:CompanionContext,retryOf?:string)=>{
  const message=text.trim();
  if(!message||liveRef.current?.phase==='working')return false;
  setSendError('');
  try{
   const asked=await clubFetch<CompanionAsked>(base,{body:{message,context,...(retryOf?{retryOf}:{})}});
   setMessages(current=>current?.some(each=>each.id===asked.message.id)?current:[...(current??[]),asked.message]);
   follow(asked.jobId,asked.message.id,context.tab);
   return true;
  }catch(reason){setSendError(errorMessage(reason,NO_ANSWER));return false;}
 },[base,follow]);

 /** Try again after a failed reply: the same question, not saved twice; a reply that is in fact still running is followed instead. */
 const retry=useCallback(async(context:CompanionContext)=>{
  const failed=liveRef.current;if(!failed)return;
  const thread=await clubFetch<CompanionThread>(base).catch(()=>undefined);
  if(thread){
   setMessages(thread.messages);
   if(thread.running){
    const question=thread.messages.find(message=>message.id===thread.running!.messageId);
    if(question?.role==='user'){follow(thread.running.jobId,thread.running.messageId,question.context.tab,{text:thread.running.text,steps:thread.running.steps});return;}
   }
   const at=thread.messages.findIndex(message=>message.id===failed.questionId);
   if(at>=0&&thread.messages[at+1]?.role==='assistant'){setLive(null);return;}
  }
  const question=(thread?.messages??messages??[]).find(message=>message.id===failed.questionId);
  if(!question)return;
  setLive(null);
  void send(question.text,context,question.id);
 },[base,follow,messages,send]);

 /** Stop: the reply ends where it is; what had arrived stays, marked as stopped, until the server's own copy replaces it. */
 const stop=useCallback(()=>{
  const current=liveRef.current;
  if(!current||current.phase!=='working')return;
  stopFollowing.current?.();stopFollowing.current=null;
  const now=Date.now();
  const steps=current.steps.map((step,index)=>({label:step.label,ms:(current.steps[index+1]?.started??now)-step.started}));
  if(current.text.trim())setMessages(list=>[...(list??[]),{id:`stopped-${current.jobId}`,role:'assistant',text:current.text.trim(),tab:current.tab,cards:[],steps,status:'stopped'}]);
  setLive(null);setAnnounce('Stopped');
  // A reply that finished just before the stop, or the stopped part the server keeps, comes back from the server in a moment.
  void clubFetch(`/jobs/${encodeURIComponent(current.jobId)}`,{method:'DELETE'}).catch(()=>{}).then(()=>setTimeout(()=>loadRef.current(),SETTLE_MS));
 },[]);

 const card=useCallback(async(messageId:string,index:number,action:'apply'|'undo')=>{
  const key=`${messageId}:${index}`;
  setBusyCard(key);
  try{
   if(action==='apply')await beforeApply?.();
   const result=await clubFetch<CompanionApplied>(`${base}/${encodeURIComponent(messageId)}/cards/${index}/${action}`,{method:'POST'});
   setMessages(current=>current&&current.map(message=>message.id===messageId?result.message:message));
   changedRef.current(result.changed);
   return '';
  }catch(reason){return errorMessage(reason,action==='apply'?"Couldn't apply that.":"Couldn't undo that.");}
  finally{setBusyCard(current=>current===key?null:current);}
 },[base,beforeApply]);

 return {messages,loadError,reload:load,live,announce,sendError,send,retry,stop,apply:(messageId:string,index:number)=>card(messageId,index,'apply'),undo:(messageId:string,index:number)=>card(messageId,index,'undo'),busyCard};
}
