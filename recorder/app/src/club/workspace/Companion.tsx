import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import type {Outline,Package,VideoScene} from '../../../shared/club';
import {ACTION_TITLE,ACTION_VERB,isEditAction,type CompanionCard,type CompanionChanged,type CompanionContext,type CompanionReplyMessage,type CompanionStep,type CompanionTab} from '../../../shared/companion';
import type {EditorBridge,EditorState} from '../../App';
import {describeEditAction,type SilencePlan} from '../../editing-actions';
import {clubFetch} from '../api';
import {ErrorLine} from '../ErrorLine';
import {Button,CompanionMark,Icon,Spinner,cn} from '../ui';
import {atBottom,elapsed,lookingAt,previewOf,stepSummary,suggestions,withDividers} from './companion-logic';
import {Markdown} from './Markdown';
import {ReplaceScenes} from './ReplaceScenes';
import {useCompanion,type Live} from './useCompanion';
import './companion.css';

const OPEN_KEY='cc.companion.open';
const readOpen=()=>{try{return localStorage.getItem(OPEN_KEY)!=='0';}catch{return true;}};
const saveOpen=(open:boolean)=>{try{localStorage.setItem(OPEN_KEY,open?'1':'0');}catch{/* the panel still works, it just forgets */}};

export type CompanionScene={id:string;index:number;title:string};
/** The editor while Edit is open: the bridge (read when it is used) and what it shows now. */
export type CompanionEditor={get():EditorBridge|null;state:EditorState|null};

/**
 * The companion, docked on the right of a video's steps: one conversation per video, what it is looking at, suggestions for the step,
 * replies that stream in with their steps, and cards that apply a change with Preview and Undo. Collapses to a rail and remembers it.
 */
export function Companion({videoId,tab,scene,screen,selection,pkg,outline,scenes,onChanged,beforeApply,editor,roomy=false}:{
 videoId:string;tab:CompanionTab;scene?:CompanionScene;screen:string;
 /** Research: the selected cards' ids, sent with every message ("these" means them). */
 selection?:readonly string[];
 pkg:Package|null;outline:Outline|null;
 /** The video's scenes with their takes: replacing scenes that have takes asks first. */
 scenes?:readonly VideoScene[];
 onChanged(changed:CompanionChanged[]):void;beforeApply?():Promise<void>;
 /** Edit: the open editor. Messages carry its playhead and selection; timeline cards preview on its stage and apply as one of its undo steps. */
 editor?:CompanionEditor;
 /** The step needs its width (Record): in a narrow window the panel starts as its rail and opens over the step instead of beside it. */
 roomy?:boolean;
}){
 const narrow=useNarrow(roomy);
 const [saved,setSaved]=useState(readOpen);
 const [openHere,setOpenHere]=useState(false);
 const open=narrow?openHere:saved;
 const [name,setName]=useState('Claude');
 useEffect(()=>{clubFetch<{defaultAi?:string}>('/settings').then(settings=>setName(settings.defaultAi==='codex'?'ChatGPT':'Claude'),()=>{});},[]);
 const editorNow=useRef(editor);editorNow.current=editor;
 // Auto-edit's audio plan, which a cut of pauses is checked against: read again a moment after the timeline changes, so a card's
 // preview and its line ("3 cuts · 0.9 s shorter") use the same plan as Apply.
 const [silences,setSilences]=useState<SilencePlan|null>(null);
 const onEdit=tab==='edit'&&!!editor,timelineVersion=editor?.state?.version;
 useEffect(()=>{
  if(!onEdit)return;
  const timer=setTimeout(()=>{clubFetch<SilencePlan|null>(`/videos/${encodeURIComponent(videoId)}/companion/silences`).then(plan=>setSilences(plan&&Array.isArray(plan.ranges)?plan:null),()=>setSilences(null));},timelineVersion?800:0);
  return()=>clearTimeout(timer);
 },[onEdit,videoId,timelineVersion]);
 const companion=useCompanion(videoId,{onChanged,beforeApply,editor:()=>editorNow.current?.get()??null});
 const {messages,live}=companion;
 const working=live?.phase==='working';
 const context:CompanionContext=useMemo(()=>({tab,...(scene?{sceneId:scene.id,sceneTitle:scene.title}:{}),screen,...(selection?.length?{selection:[...selection].slice(0,200)}:{})}),[tab,scene,screen,selection]);
 const [text,setText]=useState('');
 const input=useRef<HTMLTextAreaElement>(null);
 const rail=useRef<HTMLButtonElement>(null);
 // Focus follows the panel: into the message field when it opens, onto the rail that reopens it when it is hidden.
 const toggle=(next:boolean)=>{if(narrow)setOpenHere(next);else{setSaved(next);saveOpen(next);}setTimeout(()=>(next?input.current:rail.current)?.focus(),0);};

 // A clock for the steps while a reply is written.
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!working)return;const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[working]);

 // Esc stops a reply when focus is in the panel, unless something else already used the key or a dialog is open (Esc closes that).
 const stop=companion.stop;
 const onPanelKey=(event:KeyboardEvent<HTMLElement>)=>{
  if(event.key!=='Escape'||!working||event.defaultPrevented||document.querySelector('[role="dialog"],[aria-modal="true"]'))return;
  event.preventDefault();stop();
 };

 // The log follows new text only while the reader is at its bottom.
 const log=useRef<HTMLDivElement>(null);
 const pinned=useRef(true);
 const [behind,setBehind]=useState(false);
 const onScroll=()=>{const box=log.current;if(!box)return;pinned.current=atBottom(box);if(pinned.current)setBehind(false);};
 const toBottom=useCallback(()=>{const box=log.current;if(box)box.scrollTop=box.scrollHeight;pinned.current=true;setBehind(false);},[]);
 useLayoutEffect(()=>{
  if(!open)return;
  if(pinned.current)toBottom();else setBehind(true);
 },[open,messages?.length,live?.text,live?.steps.length,live?.phase,toBottom]);

 /** The context of a message: on Edit, the editor saves first (the companion reads the saved timeline) and adds its playhead and selection. */
 const contextNow=async():Promise<CompanionContext>=>{
  const bridge=tab==='edit'?editorNow.current?.get():null;
  if(!bridge)return context;
  await bridge.flush().catch(()=>{});
  return {...context,...bridge.context()};
 };
 const ask=async(question:string)=>{
  if(!question.trim()||working)return;
  pinned.current=true;
  const sent=await companion.send(question,await contextNow());
  if(sent)setText('');
 };
 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void ask(text);}
 };
 useLayoutEffect(()=>{const area=input.current;if(!area)return;area.style.height='auto';area.style.height=`${Math.min(140,area.scrollHeight)}px`;},[text,open]);

 const title=`Ask ${name}`;
 if(!open)return <aside className="cmp collapsed" aria-label={title}>
  <button ref={rail} type="button" className="cmp-rail" onClick={()=>toggle(true)} aria-label={`Show ${title}`} title={`Show ${title}`}>
   <CompanionMark size={18} working={working}/><span>{title}</span>
  </button>
 </aside>;

 const items=messages?withDividers(messages,tab):[];
 const selected=tab==='edit'?editor?.state?.selected??0:tab==='research'?selection?.length??0:0;
 const ideas=suggestions(tab,{scenes:outline?.scenes.length??0,scene,selected});
 return <aside className={cn('cmp',narrow&&'over')} aria-label={title} onKeyDown={onPanelKey}>
  <header className="cmp-head">
   <CompanionMark size={18} working={working} className="cmp-head-mark"/>
   <div className="cmp-head-text">
    <div className="cmp-title">{title}</div>
    <div className="cmp-look">Looking at: <span>{lookingAt(tab,scene)}</span>{scene&&<span className="cmp-look-scene">{scene.title}</span>}{selected>0&&<span className="cmp-look-scene">{selected} selected</span>}</div>
   </div>
   <button type="button" className="btn ghost sm icon-only" onClick={()=>toggle(false)} aria-label={`Hide ${title}`} title={`Hide ${title}`}><Icon name="PanelRightClose" size={16}/></button>
  </header>
  {/* One line for screen readers: the step, "Reply ready" or the failure. The timer is never in a live region. */}
  <div className="cmp-sr" role="status">{companion.announce}</div>
  <div className="cmp-log" ref={log} onScroll={onScroll} role="log" aria-live="off" aria-busy={working}>
   {companion.loadError?<ErrorLine message={companion.loadError} onRetry={companion.reload}/>
    :!messages?<div className="cmp-loading"><Spinner label="Loading the conversation" size={16}/></div>
    :!messages.length&&!live&&<div className="cmp-reply">
     <div className="cmp-who"><CompanionMark size={14}/>{name}</div>
     <div className="cmp-md"><p>{tab==='research'?'I see the cards on Research. Ask what they have in common, or ask me to group them or start a video from them: each change comes as a card you can apply and undo.':'I\'m with you on this video from the board to publishing. Ask anything, or tell me what to change: each change comes as a card you can apply and undo.'}</p></div>
    </div>}
   {items.map(item=>item.kind==='divider'?<div key={item.key} className="cmp-divider" role="separator">{item.label}</div>
    :item.message.role==='user'?<div key={item.key} className="cmp-me">{item.message.text}</div>
    :<Reply key={item.key} name={name} message={item.message} pkg={pkg} outline={outline} scenes={scenes} busy={companion.busyCard} editor={editor} silences={silences}
      onApply={index=>companion.apply(item.message.id,index)} onUndo={index=>companion.undo(item.message.id,index)}/>)}
   {live&&<LiveReply name={name} live={live} now={now} onRetry={()=>void contextNow().then(companion.retry)}/>}
   {companion.sendError&&<ErrorLine message={companion.sendError} onRetry={()=>void ask(text)}/>}
  </div>
  {behind&&<button type="button" className="cmp-jump" onClick={toBottom}><Icon name="ArrowDown" size={13}/>Jump to latest</button>}
  <div className="cmp-foot">
   {!working&&ideas.length>0&&<div className="cmp-sugg" aria-label="Suggestions">{ideas.map(idea=><button key={idea} type="button" onClick={()=>void ask(idea)}>{idea}</button>)}</div>}
   <form className="cmp-input" onSubmit={event=>{event.preventDefault();void ask(text);}}>
    <textarea ref={input} rows={1} value={text} onChange={event=>setText(event.target.value)} onKeyDown={onKeyDown} placeholder="Ask, or tell me what to change" aria-label={`Message to ${name}`}/>
    {working
     ?<button type="button" className="cmp-send stop" onClick={stop} aria-label="Stop (Esc)" title="Stop (Esc)"><Icon name="Square" size={12} stroke={2.4}/></button>
     :<button type="submit" className="cmp-send" disabled={!text.trim()} aria-label="Send (Enter)" title="Send (Enter)"><Icon name="ArrowUp" size={15} stroke={2.2}/></button>}
   </form>
   <div className="cmp-hint">{working?'Esc stops the reply':'Enter sends · Shift+Enter for a new line'}</div>
  </div>
 </aside>;
}

const NARROW='(max-width: 1279px)';
/** True while the window is narrow and the step asked for its width. */
function useNarrow(roomy:boolean){
 const query=()=>roomy&&typeof window!=='undefined'&&!!window.matchMedia?.(NARROW).matches;
 const [narrow,setNarrow]=useState(query);
 useEffect(()=>{
  setNarrow(query());
  if(!roomy||!window.matchMedia)return;
  const list=window.matchMedia(NARROW),on=()=>setNarrow(list.matches);
  list.addEventListener?.('change',on);return()=>list.removeEventListener?.('change',on);
 },[roomy]);
 return narrow;
}

/** A finished reply: who, the one-line summary of its steps (opens to the list), the text, and its cards. */
function Reply({name,message,pkg,outline,scenes,busy,editor,silences,onApply,onUndo}:{name:string;message:CompanionReplyMessage;pkg:Package|null;outline:Outline|null;scenes?:readonly VideoScene[];busy:string|null;editor?:CompanionEditor;silences?:SilencePlan|null;onApply(index:number):Promise<string>;onUndo(index:number):Promise<string>}){
 return <div className="cmp-reply">
  <div className="cmp-who"><CompanionMark size={14}/>{name}</div>
  {message.steps&&message.steps.length>0&&<Steps steps={message.steps}/>}
  {message.text&&<div className="cmp-md"><Markdown text={message.text}/></div>}
  {message.status==='stopped'&&<div className="cmp-note">Stopped</div>}
  {message.cards.map((card,index)=><Card key={index} id={`${message.id}:${index}`} card={card} pkg={pkg} outline={outline} scenes={scenes} busy={busy===`${message.id}:${index}`} editor={editor} silences={silences} onApply={()=>onApply(index)} onUndo={()=>onUndo(index)}/>)}
 </div>;
}

function Steps({steps}:{steps:readonly CompanionStep[]}){
 const [open,setOpen]=useState(false);
 return <div className="cmp-sum">
  <button type="button" className="cmp-sum-line" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
   <Icon name="Check" size={13} stroke={2.4} className="cmp-ok"/><span>{stepSummary(steps)}</span><Icon name="ChevronDown" size={13} className={cn('cmp-chev',open&&'open')}/>
  </button>
  {open&&<ol className="cmp-steps">{steps.map((step,index)=><li key={index} className="done"><Icon name="Check" size={12} stroke={2.4} className="cmp-ok"/><span>{step.label}</span><span className="cmp-t">{elapsed(step.ms)}</span></li>)}</ol>}
 </div>;
}

/** The reply being written: the steps with their time, a skeleton before the first words, the words as they arrive, or the failure. */
function LiveReply({name,live,now,onRetry}:{name:string;live:Live;now:number;onRetry():void}){
 const working=live.phase==='working';
 const last=live.steps.length-1;
 return <div className={cn('cmp-reply','live',!working&&'failed')} aria-live="off">
  <div className="cmp-who"><CompanionMark size={14} working={working}/>{name}{working&&<span className="cmp-t">{elapsed(now-live.started)}</span>}</div>
  {live.steps.length>0&&<ol className="cmp-steps live">{live.steps.map((step,index)=>{
   const active=working&&index===last,end=live.steps[index+1]?.started??now;
   return <li key={index} className={active?'on':'done'}>
    {active?<span className="cmp-pulse" aria-hidden/>:<Icon name="Check" size={12} stroke={2.4} className="cmp-ok"/>}
    <span>{step.label}</span>{(active||index<last)&&<span className="cmp-t">{elapsed(end-step.started)}</span>}
   </li>;
  })}</ol>}
  {live.text?<div className="cmp-md streaming"><Markdown text={live.text}/></div>
   :working?<div className="cmp-skel" aria-hidden><i/><i/><i/></div>:null}
  {!working&&live.error&&<ErrorLine message={live.error} onRetry={onRetry}/>}
 </div>;
}

const scenesClock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

/** One change the reply offers: what it is, Apply (or what it changed and Undo), and Preview of before and after. */
function Card({id,card,pkg,outline,scenes,busy,editor,silences,onApply,onUndo}:{id:string;card:CompanionCard;pkg:Package|null;outline:Outline|null;scenes?:readonly VideoScene[];busy:boolean;editor?:CompanionEditor;silences?:SilencePlan|null;onApply():Promise<string>;onUndo():Promise<string>}){
 const [textPreview,setTextPreview]=useState(false);
 const [error,setError]=useState('');
 const [confirm,setConfirm]=useState<'apply'|'undo'|null>(null);
 // New scenes over scenes that have takes ask first, like the Board's Draft scenes.
 // Applying it, or undoing it, replaces the scenes: with takes on any scene, that asks first (the server refuses what would lose takes).
 const asks=card.action.type==='draft_scenes'&&!!scenes?.some(scene=>scene.takes.length>0);
 const action=card.action;
 // A timeline card previews on the editor's stage (pressed while its preview is the one shown); the others show Now and After here.
 const timeline=isEditAction(action);
 const stage=timeline?editor?.get()??null:null;
 const preview=timeline?editor?.state?.previewKey===id:textPreview;
 const setPreview=(on:boolean)=>{
  if(!timeline){setTextPreview(on);return;}
  const problem=stage?.preview(on?action:null,id,{silences});
  setError(problem??'');
 };
 const run=async(fn:()=>Promise<string>)=>{setError('');const failed=await fn();setError(failed);if(!failed)setTextPreview(false);};
 const shown=textPreview&&!timeline?previewOf(action,pkg,outline):undefined;
 let body;
 // What it would do to the timeline as it is now, while it is still on offer: the cuts and seconds, the share of the video, the zoom it replaces.
 const estimate=timeline&&stage&&card.state!=='applied'?stage.estimate(action,{silences}):undefined;
 if(timeline)body=<div className="cmp-card-text">{describeEditAction(action)}{estimate&&<div className={cn('cmp-card-est',estimate.warn&&'warn')}>{estimate.warn&&<Icon name="TriangleAlert" size={12}/>}{estimate.text}</div>}</div>;
 else if(action.type==='draft_scenes'){
  let at=0;
  body=<ol className="cmp-card-scenes">{action.scenes.map((scene,index)=>{const start=at;at+=scene.seconds;return <li key={index}><span>{scene.title}</span><span className="cmp-t">{scenesClock(start)}</span></li>;})}</ol>;
 }else if(action.type==='set_scene'){
  const index=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;
  body=<div className="cmp-card-text"><div className="cmp-card-sub">Scene {index>=0?index+1:''}{action.title?` · ${action.title}`:index>=0?` · ${outline!.scenes[index].title}`:''}</div>
   {action.talkingPoints&&<ul>{action.talkingPoints.map((point,at)=><li key={at}>{point}</li>)}</ul>}</div>;
 }else if(action.type==='group_tiles'||action.type==='start_video'){
  body=<div className="cmp-card-text"><div className="cmp-card-sub">{action.tileIds.length} {action.tileIds.length===1?'card':'cards'}</div>{action.title}</div>;
 }else body=<div className={cn('cmp-card-text',action.type==='set_description'&&'long')}>{action.text}</div>;
 return <div className={cn('cmp-card',card.state)}>
  <div className="cmp-card-h"><span>{ACTION_TITLE[action.type]}{action.type==='draft_scenes'?` · ${action.scenes.length}`:''}</span></div>
  {body}
  {shown&&<div className="cmp-preview">
   <div className="cmp-preview-col"><div className="cmp-preview-h">Now</div>{shown.now.length?shown.now.map((line,index)=><div key={index}>{line}</div>):<div className="cmp-faint">Nothing yet</div>}</div>
   <div className="cmp-preview-col after"><div className="cmp-preview-h">After</div>{shown.after.map((line,index)=><div key={index}>{line}</div>)}</div>
  </div>}
  <div className="cmp-card-a">
   {card.state==='applied'
    ?<><span className="cmp-result"><Icon name="Check" size={13} stroke={2.4}/>{card.result??'Applied'}</span>
     {card.version&&<button type="button" className="btn ghost sm" disabled={busy} onClick={()=>{if(asks)setConfirm('undo');else void run(onUndo);}}><Icon name="Undo2" size={14}/>Undo</button>}
     {card.tooOld&&<span className="cmp-faint">Too old to undo</span>}</>
    :<><Button size="sm" variant="secondary" disabled={busy} onClick={()=>{if(asks)setConfirm('apply');else void run(onApply);}}>{busy?<span className="spin"/>:null}{card.state==='undone'?'Apply again':ACTION_VERB[action.type]}</Button>
     {(!timeline||stage)&&<button type="button" className="btn ghost sm" aria-pressed={preview} onClick={()=>setPreview(!preview)}><Icon name={preview?'EyeOff':'Eye'} size={14}/>{preview?'Hide preview':'Preview'}</button>}
     {card.state==='undone'&&<span className="cmp-faint">Undone</span>}</>}
  </div>
  {error&&<div className="cmp-card-err" role="alert"><Icon name="TriangleAlert" size={13}/><span>{error}</span></div>}
  {confirm&&scenes&&<ReplaceScenes scenes={scenes} action={confirm==='apply'?'Applying these':'Undoing this'} undoLine={confirm==='apply'?'You can undo it from this card.':'You can apply it again from this card.'}
   onKeep={()=>setConfirm(null)} onReplace={()=>{const which=confirm;setConfirm(null);void run(which==='apply'?onApply:onUndo);}}/>}
 </div>;
}
