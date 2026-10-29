import {useCallback,useEffect,useRef,useState} from 'react';
import type {BoardChatMessage,BoardChatReply,BoardItem,PackageUseResult,Video} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Button,Icon,Spinner,useToast} from '../ui';
import {historyOf,markUsed,noteText,undoRequest} from './chat';

const SUGGESTIONS=['What do these have in common?','Write three hooks from this board','Suggest three titles',"What's missing before I plan?"];

/**
 * "Ask Claude about this board": the saved conversation, a question, and the answer's items. Hooks and titles are used in Plan with Undo;
 * the whole answer can be added to the Board as a note. While a reply runs, the question shows with a working state.
 */
export function ChatPanel({video,tileCount,onClose,onAddNote}:{video:Video;tileCount:number;onClose():void;onAddNote(text:string):void}){
 const toast=useToast();
 const id=encodeURIComponent(video.id);
 const [messages,setMessages]=useState<BoardChatMessage[]|null>(null);
 const [loadError,setLoadError]=useState('');
 const [text,setText]=useState('');
 const [pending,setPending]=useState<string|null>(null);
 const [askError,setAskError]=useState<string|null>(null);
 const body=useRef<HTMLDivElement>(null);

 const load=useCallback(()=>{
  setLoadError('');
  clubFetch<BoardChatMessage[]>(`/videos/${id}/board/chat`).then(setMessages,reason=>setLoadError(errorMessage(reason,"Couldn't load the conversation.")));
 },[id]);
 useEffect(()=>{load();},[load]);
 useEffect(()=>{if(body.current)body.current.scrollTop=body.current.scrollHeight;},[messages,pending]);

 /** Saves the conversation with its used marks. A failure says so; the screen keeps what it shows. */
 const save=useCallback((next:BoardChatMessage[])=>{
  setMessages(next);
  clubFetch(`/videos/${id}/board/chat`,{method:'PUT',body:next}).catch(reason=>toast(errorMessage(reason,"Couldn't save the conversation.")));
 },[id,toast]);

 const ask=async(question:string)=>{
  const q=question.trim();
  if(!q||pending||!messages)return;
  setPending(q);setText('');setAskError(null);
  try{
   const reply=await clubFetch<BoardChatReply>(`/videos/${id}/board/chat`,{body:{message:q,history:historyOf(messages)}});
   setMessages(current=>[...(current??[]),{role:'user',text:q},{role:'assistant',text:reply.reply,...(reply.items.length?{items:reply.items}:{})}]);
  }catch(reason){
   setText(q);setAskError(errorMessage(reason,"Couldn't get an answer."));
  }finally{setPending(null);}
 };

 const useItem=async(index:number,k:number,kind:'hook'|'title',item:BoardItem)=>{
  if(!messages)return;
  try{
   const result=await clubFetch<PackageUseResult>(`/videos/${id}/package/text`,{body:{kind,text:item.text}});
   save(markUsed(messages,index,k));
   toast(kind==='hook'?'Set as your spoken hook in Plan':'Set as your title in Plan',{undo:()=>{
    const request=undoRequest(video.id,result.previous);
    clubFetch(request.path,{method:request.method,...('body' in request?{body:request.body}:{})}).catch(reason=>toast(errorMessage(reason,"Couldn't undo that.")));
   }});
  }catch(reason){toast(errorMessage(reason,"Couldn't use that."));}
 };

 const usedAt=(message:BoardChatMessage,k:number)=>message.used?.includes(k)??false;

 return <aside className="chat" aria-label="Ask Claude about this board">
  <div className="ch"><Icon name="Sparkles" size={16} style={{color:'var(--cc-accent)'}}/>Ask Claude<span className="faint small" style={{fontWeight:500}}>· reads all {tileCount} tiles</span>
   <button type="button" className="btn ghost sm icon-only" style={{marginLeft:'auto'}} onClick={onClose} aria-label="Close chat"><Icon name="X" size={15}/></button></div>
  <div className="cb" ref={body}>
   {loadError?<ErrorLine message={loadError} onRetry={load}/>:!messages?<Spinner label="Loading the conversation" size={16}/>:null}
   {messages&&!messages.length&&!pending&&<div className="muted" style={{fontSize:13.5,lineHeight:1.55}}>Ask anything about what you&apos;ve gathered. Claude reads every tile: the breakdown, the videos, your notes and the posts. Anything useful can go straight onto the board or into your plan.</div>}
   {messages?.map((message,index)=>message.role==='user'?<div key={index} className="msg me">{message.text}</div>:<div key={index} className="msg ai">
    <div style={{whiteSpace:'pre-wrap'}}>{message.text}</div>
    {message.items&&<div className="ai-items">{message.items.map((item,k)=><div key={k} className="ai-item"><div className="grow">{item.text}</div>
     {usedAt(message,k)?<span className="chip b-green" style={{flex:'none'}}><Icon name="Check" size={12}/>Used</span>
      :item.kind==='hook'||item.kind==='title'?<button type="button" className="btn sm" style={{flex:'none'}} onClick={()=>void useItem(index,k,item.kind as 'hook'|'title',item)}>{item.kind==='hook'?'Use as hook':'Use as title'}</button>:null}
    </div>)}</div>}
    <div className="row" style={{marginTop:6}}><button type="button" className="btn sm ghost" onClick={()=>onAddNote(noteText(message.text,message.items??[]))}><Icon name="StickyNote" size={14}/>Add to board</button></div>
   </div>)}
   {pending&&<><div className="msg me">{pending}</div><div className="typing" role="status" aria-label="Claude is reading the board"><i></i><i></i><i></i></div></>}
   {askError&&<ErrorLine message={askError} onRetry={()=>void ask(text||'')}/>}
  </div>
  <div className="cf">
   {messages&&!messages.length&&!pending&&<div className="sugg" style={{marginBottom:10}}>{SUGGESTIONS.map(suggestion=><button key={suggestion} type="button" onClick={()=>void ask(suggestion)}><Icon name="CornerDownRight" size={14}/>{suggestion}</button>)}</div>}
   <form className="composer" onSubmit={event=>{event.preventDefault();void ask(text);}}>
    <textarea rows={1} value={text} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void ask(text);}}} placeholder="Ask about this board" aria-label="Message"/>
    <Button type="submit" variant="primary" size="sm" className="icon-only" disabled={!text.trim()||!!pending} aria-label="Send"><Icon name="ArrowUp" size={15}/></Button>
   </form>
  </div>
 </aside>;
}
