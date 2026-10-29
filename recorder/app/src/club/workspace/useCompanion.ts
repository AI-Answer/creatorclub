import {useCallback,useEffect,useRef,useState} from 'react';
import type {CompanionApplied,CompanionAsked,CompanionChanged,CompanionTab,CompanionContext,CompanionEvent,CompanionMessage,CompanionReplyMessage,CompanionThread} from '../../../shared/companion';
import {clubFetch,errorMessage} from '../api';
import {failureMessage,watchJob} from '../jobs';

/** A step of the reply being written, with when it started. */
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

/**
 * One video's companion: the saved conversation, the reply being written (followed over SSE, and found again when the panel reopens
 * while one runs), Stop, Try again, and applying or undoing a card. `onChanged` hears what an apply or undo changed.
 */
export function useCompanion(videoId:string,{onChanged,beforeApply}:{onChanged(changed:CompanionChanged[]):void;beforeApply?():Promise<void>}){
 const base=`/videos/${encodeURIComponent(videoId)}/companion`;
 const [messages,setMessages]=useState<CompanionMessage[]|null>(null);
 const [loadError,setLoadError]=useState('');
 const [live,setLive]=useState<Live|null>(null);
 const [sendError,setSendError]=useState('');
 const [busyCard,setBusyCard]=useState<string|null>(null);
 const stopFollowing=useRef<(()=>void)|null>(null);
 const liveRef=useRef(live);liveRef.current=live;
 const changedRef=useRef(onChanged);changedRef.current=onChanged;

 /** Follows a reply's events. Text arrives with its place; a piece already shown (a replay) is skipped. */
 const follow=useCallback((jobId:string,questionId:string,tab:CompanionTab)=>{
  stopFollowing.current?.();
  setLive({jobId,questionId,tab,steps:[],text:'',started:Date.now(),phase:'working'});
  stopFollowing.current=watchJob(jobId,event=>{
   if(event.type==='progress'){
    const data=event.data as CompanionEvent;
    if(data?.type==='step')setLive(current=>current&&current.jobId===jobId?{...current,steps:[...current.steps,{label:data.label,started:Date.now()}]}:current);
    else if(data?.type==='text')setLive(current=>{
     if(!current||current.jobId!==jobId)return current;
     if(data.at+data.text.length<=current.text.length)return current;
     return {...current,text:current.text.slice(0,data.at)+data.text};
    });
    return;
   }
   stopFollowing.current=null;
   if(event.type==='done'){
    const reply=event.data as CompanionReplyMessage;
    setMessages(current=>[...(current??[]).filter(message=>message.id!==reply.id),reply]);
    setLive(null);
   }else if(event.type==='failed'){
    setLive(current=>current&&current.jobId===jobId?{...current,phase:'failed',error:failureMessage(event.data,NO_ANSWER)}:current);
   }else setLive(current=>current?.jobId===jobId?null:current);
  });
 },[]);

 const load=useCallback(()=>{
  setLoadError('');
  clubFetch<CompanionThread>(base).then(thread=>{
   setMessages(thread.messages);
   const running=thread.running,question=running&&thread.messages.find(message=>message.id===running.messageId);
   if(running&&question?.role==='user'&&!liveRef.current)follow(running.jobId,running.messageId,question.context.tab);
  },reason=>setLoadError(errorMessage(reason,"Couldn't load the conversation.")));
 },[base,follow]);
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

 /** Try again after a failed reply: the same question, not saved twice. */
 const retry=useCallback((context:CompanionContext)=>{
  const failed=liveRef.current;if(!failed)return;
  const question=messages?.find(message=>message.id===failed.questionId);
  if(!question)return;
  setLive(null);
  void send(question.text,context,question.id);
 },[messages,send]);

 /** Stop: the reply ends where it is; what had arrived stays, marked as stopped. */
 const stop=useCallback(()=>{
  const current=liveRef.current;
  if(!current||current.phase!=='working')return;
  stopFollowing.current?.();stopFollowing.current=null;
  void clubFetch(`/jobs/${encodeURIComponent(current.jobId)}`,{method:'DELETE'}).catch(()=>{});
  const now=Date.now();
  const steps=current.steps.map((step,index)=>({label:step.label,ms:(current.steps[index+1]?.started??now)-step.started}));
  if(current.text.trim())setMessages(list=>[...(list??[]),{id:`stopped-${current.jobId}`,role:'assistant',text:current.text.trim(),tab:current.tab,cards:[],steps,status:'stopped'}]);
  setLive(null);
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

 return {messages,loadError,reload:load,live,sendError,send,retry,stop,apply:(messageId:string,index:number)=>card(messageId,index,'apply'),undo:(messageId:string,index:number)=>card(messageId,index,'undo'),busyCard};
}
