import {askSettled,askStarted} from './ask-claude';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {JobSnapshot} from '../../../shared/club';
import {isEditAction,type CompanionActionType,type CompanionApplied,type CompanionAsked,type CompanionChanged,type CompanionContext,type CompanionEvent,type CompanionMessage,type CompanionReplyMessage,type CompanionTab,type CompanionThread} from '../../../shared/companion';
import type {EditorBridge} from '../../App';
import {clubFetch,errorMessage} from '../api';
import {LOST_JOB,failureMessage,watchJob} from '../jobs';
import {boardBase} from './board-base';

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

/**
 * The server's conversation with the stopped replies this screen still holds: a local copy stays, right after its question, until the
 * server's own reply to that question arrives.
 */
/** A reply that is not a conversation (an old server, a broken proxy) shows as an empty one instead of breaking the panel. */
export function normalizeThread(raw:CompanionThread|undefined):CompanionThread{
 return {...(raw&&typeof raw==='object'?raw:{}),messages:Array.isArray(raw?.messages)?raw.messages:[]} as CompanionThread;
}

export function withPendingStops(server:readonly CompanionMessage[],pending:ReadonlyMap<string,{questionId:string;message:CompanionMessage}>):{messages:CompanionMessage[];settled:string[]}{
 const messages=[...server],settled:string[]=[];
 for(const [jobId,stop] of pending){
  const at=messages.findIndex(message=>message.id===stop.questionId);
  if(at>=0&&messages[at+1]?.role==='assistant'){settled.push(jobId);continue;}
  if(at>=0)messages.splice(at+1,0,stop.message);else messages.push(stop.message);
 }
 return {messages,settled};
}

/** A text event, placed at its offset: a piece already shown (a replay) changes nothing. */
export function withText(text:string,at:number,piece:string):string{
 if(at+piece.length<=text.length)return text;
 return text.slice(0,at)+piece;
}

/**
 * One video's companion (or Research's, when `videoId` is `CHANNEL_BOARD`): the saved conversation, the reply being written (followed over SSE, picked up again after a dropped
 * connection or when the panel reopens while one runs), Stop, Try again, and applying or undoing a card. `onChanged` hears what an
 * apply or undo changed. `announce` is one short line for screen readers: the current step, "Reply ready", or the failure.
 */
export function useCompanion(videoId:string,{onChanged,beforeApply,editor}:{onChanged(changed:CompanionChanged[],applied?:CompanionActionType):void;beforeApply?():Promise<void>;
 /** The open editor, when Edit is on screen: a timeline card is applied through it, so the change is one step of the editor's own Undo. */
 editor?():EditorBridge|null}){
 const base=`${boardBase(videoId)}/companion`;
 const [messages,setMessages]=useState<CompanionMessage[]|null>(null);
 const [loadError,setLoadError]=useState('');
 const [live,setLive]=useState<Live|null>(null);
 const [sendError,setSendError]=useState('');
 const [busyCard,setBusyCard]=useState<string|null>(null);
 const [announce,setAnnounce]=useState('');
 const stopFollowing=useRef<(()=>void)|null>(null);
 const liveRef=useRef(live);liveRef.current=live;
 const changedRef=useRef(onChanged);changedRef.current=onChanged;
 const editorRef=useRef(editor);editorRef.current=editor;
 const messagesRef=useRef(messages);messagesRef.current=messages;
 const loadRef=useRef<()=>void>(()=>{});
 /** Stopped replies shown locally until the server's copy arrives, by job. */
 const pendingStops=useRef(new Map<string,{questionId:string;message:CompanionMessage;tries:number}>());

 /**
  * Follows a reply's events. `from` is what the screen already has (the server's running text and steps, or the reply so far after a
  * dropped connection); the replayed events then fill in only what is new.
  */
 const follow=useCallback((jobId:string,questionId:string,tab:CompanionTab,from?:{text:string;steps:string[]|LiveStep[]})=>{
  stopFollowing.current?.();
  const now=Date.now();
  const steps=(from?.steps??[]).map(step=>typeof step==='string'?{label:step,started:now}:step);
  if(liveRef.current?.jobId!==jobId)askStarted();
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
    askSettled({ok:true,choice:reply.cards?.some(card=>card.action.type==='ask_choice')??false});
   }else if(event.type==='failed'){
    const message=failureMessage(event.data,NO_ANSWER);
    // The connection dropped, not the reply: ask how the job is doing before saying anything failed.
    if(message===LOST_JOB){void recover(jobId,questionId,tab);return;}
    setLive(current=>current&&current.jobId===jobId?{...current,phase:'failed',error:message}:current);
    setAnnounce(message);askSettled({ok:false,choice:false});
   }else{setLive(current=>current?.jobId===jobId?null:current);askSettled({ok:false,choice:false});}
  });
 },[]);

 /** After a dropped stream: a reply still running is followed again from where the screen is; a finished one is read from the server. */
 const recover=useCallback(async(jobId:string,questionId:string,tab:CompanionTab)=>{
  const job=await clubFetch<JobSnapshot>(`/jobs/${encodeURIComponent(jobId)}`).catch(()=>undefined);
  const current=liveRef.current;
  if(job?.status==='running'){follow(jobId,questionId,tab,current?.jobId===jobId?{text:current.text,steps:current.steps}:undefined);return;}
  if(job?.status==='done'){setLive(null);loadRef.current();setAnnounce('Reply ready');askSettled({ok:true,choice:false});return;}
  const message=job?.status==='failed'&&job.error?job.error:NO_ANSWER;
  setLive(live=>live&&live.jobId===jobId?{...live,phase:'failed',error:message}:live);
  setAnnounce(message);askSettled({ok:false,choice:false});
 },[follow]);

 const load=useCallback(()=>{
  setLoadError('');
  clubFetch<CompanionThread>(base).then(raw=>{
   const thread=normalizeThread(raw);
   const {messages:merged,settled}=withPendingStops(thread.messages,pendingStops.current);
   for(const jobId of settled)pendingStops.current.delete(jobId);
   setMessages(merged);
   // The server may take longer to save a stopped reply: look again a few times, keeping the local copy meanwhile.
   for(const [jobId,stop] of pendingStops.current){
    if(++stop.tries>5){pendingStops.current.delete(jobId);continue;}
    setTimeout(()=>loadRef.current(),SETTLE_MS*stop.tries);
   }
   const running=thread.running,question=running&&thread.messages.find(message=>message.id===running.messageId);
   if(running&&question?.role==='user'&&liveRef.current?.jobId!==running.jobId)follow(running.jobId,running.messageId,question.context.tab,{text:running.text,steps:running.steps});
  },reason=>setLoadError(errorMessage(reason,"Couldn't load the conversation.")));
 },[base,follow]);
 loadRef.current=load;
 useEffect(()=>{load();return()=>{stopFollowing.current?.();stopFollowing.current=null;};},[load]);

 /** Asks a question, or with `retryOf` the one that failed again. */
 const send=useCallback(async(text:string,context:CompanionContext,retryOf?:string,attachments?:readonly string[])=>{
  const message=text.trim();
  if(!message||liveRef.current?.phase==='working')return false;
  setSendError('');
  try{
   const asked=await clubFetch<CompanionAsked>(base,{body:{message,context,...(retryOf?{retryOf}:{}),...(attachments?.length?{attachments}:{})}});
   setMessages(current=>current?.some(each=>each.id===asked.message.id)?current:[...(current??[]),asked.message]);
   follow(asked.jobId,asked.message.id,context.tab);
   return true;
  }catch(reason){setSendError(errorMessage(reason,NO_ANSWER));return false;}
 },[base,follow]);

 /** Try again after a failed reply: the same question, not saved twice; a reply that is in fact still running is followed instead. */
 const retry=useCallback(async(context:CompanionContext)=>{
  const failed=liveRef.current;if(!failed)return;
  const raw=await clubFetch<CompanionThread>(base).catch(()=>undefined);
  const thread=raw?normalizeThread(raw):undefined;
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
  if(current.text.trim()){
   const message:CompanionMessage={id:`stopped-${current.jobId}`,role:'assistant',text:current.text.trim(),tab:current.tab,cards:[],steps,status:'stopped'};
   pendingStops.current.set(current.jobId,{questionId:current.questionId,message,tries:0});
   setMessages(list=>withPendingStops(list??[],new Map([[current.jobId,{questionId:current.questionId,message}]])).messages);
  }
  setLive(null);setAnnounce('Stopped');askSettled({ok:false,choice:false});
  // A reply that finished just before the stop, or the stopped part the server keeps, comes back from the server in a moment.
  void clubFetch(`/jobs/${encodeURIComponent(current.jobId)}`,{method:'DELETE'}).catch(()=>{}).then(()=>setTimeout(()=>loadRef.current(),SETTLE_MS));
 },[]);

 const card=useCallback(async(messageId:string,index:number,action:'apply'|'undo')=>{
  const key=`${messageId}:${index}`;
  setBusyCard(key);
  try{
   if(action==='apply')await beforeApply?.();
   const url=`${base}/${encodeURIComponent(messageId)}/cards/${index}/${action}`;
   const card=messagesRef.current?.find((message):message is CompanionReplyMessage=>message.id===messageId&&message.role==='assistant')?.cards[index];
   const bridge=card&&isEditAction(card.action)?editorRef.current?.()??null:null;
   // A timeline card goes through the open editor: it saves first, sends the revision it saved, and takes the result as one undo step.
   if(bridge)bridge.preview(null,key);
   const result=bridge?await bridge.commit(revision=>clubFetch<CompanionApplied>(url,{body:{revision}})):await clubFetch<CompanionApplied>(url,{method:'POST'});
   setMessages(current=>current&&current.map(message=>message.id===messageId?result.message:message));
   changedRef.current(result.changed,action==='apply'?card?.action.type:undefined);
   return '';
  }catch(reason){return errorMessage(reason,action==='apply'?"Couldn't apply that.":"Couldn't undo that.");}
  finally{setBusyCard(current=>current===key?null:current);}
 },[base,beforeApply]);

 // Add all: the timeline cards of one reply go to the server as one batch, so each lands where its times now are. The editor saves first, as for one card.
 const addCards=useCallback(async(messageId:string,indices:number[])=>{
  const key=`${messageId}:${indices[0]}`;
  setBusyCard(key);
  try{
   await beforeApply?.();
   const url=`${base}/${encodeURIComponent(messageId)}/cards/apply-all`;
   const bridge=editorRef.current?.()??null;
   if(bridge)bridge.preview(null,key);
   const result=bridge?await bridge.commit(revision=>clubFetch<CompanionApplied>(url,{body:{indices,revision}})):await clubFetch<CompanionApplied>(url,{method:'POST',body:{indices}});
   setMessages(current=>current&&current.map(message=>message.id===messageId?result.message:message));
   changedRef.current(result.changed);
   return result.stopped?`Added the changes before this one: ${result.stopped}`:'';
  }catch(reason){return errorMessage(reason,"Couldn't add those changes.");}
  finally{setBusyCard(current=>current===key?null:current);}
 },[base,beforeApply]);

 return {messages,loadError,reload:load,live,announce,sendError,send,retry,stop,apply:(messageId:string,index:number)=>card(messageId,index,'apply'),undo:(messageId:string,index:number)=>card(messageId,index,'undo'),applyAll:addCards,busyCard};
}
