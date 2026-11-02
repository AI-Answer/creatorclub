import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import type {Outline,Package,VideoScene} from '../../../shared/club';
import {ACTION_TITLE,ACTION_VERB,isEditAction,type CompanionAction,type CompanionCard,type CompanionChanged,type CompanionContext,type CompanionReplyMessage,type CompanionStep,type CompanionTab} from '../../../shared/companion';
import type {EditorBridge,EditorState} from '../../App';
import {describeEditAction,type SilencePlan} from '../../editing-actions';
import {MOTION_TEMPLATES} from '../../../shared/motion/templates';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {featuredSkills,matchSkills,slashQuery,type InstalledSkill} from '../../../shared/skills';
import {ErrorLine} from '../ErrorLine';
import {ASK_CLAUDE} from './ask-claude';
import {Button,CompanionMark,Icon,Spinner,cn} from '../ui';
import {atBottom,elapsed,greeting,lookingAt,previewOf,stepSummary,suggestions,tabOf,withDividers} from './companion-logic';
import {Markdown} from './Markdown';
import {ReplaceScenes} from './ReplaceScenes';
import {useCompanion,type Live} from './useCompanion';
import './companion.css';
import {boardBase} from './board-base';

const OPEN_KEY='cc.companion.open';
const TILE_RECOUNT_MS=8000;
const readOpen=()=>{try{return localStorage.getItem(OPEN_KEY)!=='0';}catch{return true;}};
const saveOpen=(open:boolean)=>{try{localStorage.setItem(OPEN_KEY,open?'1':'0');}catch{/* the panel still works, it just forgets */}};

export type CompanionScene={id:string;index:number;title:string};
/** The editor while Edit is open: the bridge (read when it is used) and what it shows now. */
export type CompanionEditor={get():EditorBridge|null;state:EditorState|null};

/**
 * The companion, docked on the right of a video's steps: one conversation per video, what it is looking at, suggestions for the step,
 * replies that stream in with their steps, and cards that apply a change with Preview and Undo. Collapses to a rail and remembers it.
 */
export function Companion({videoId,videoTitle,tab,scene,screen,selection,pkg,outline,scenes,onChanged,beforeApply,editor,roomy=false,boardKey=0}:{
 videoId:string;videoTitle?:string;tab:CompanionTab;scene?:CompanionScene;screen:string;pkg:Package|null;outline:Outline|null;
 /** Research: the selected cards' ids, sent with every message ("these" means them). */
 selection?:readonly string[];
 /** Changes when the board changed through the companion: its tiles are counted again. */
 boardKey?:number;
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
 // On Board the suggestions follow whether anything is on it yet: the tiles are counted when Board opens and every few seconds while it is open.
 const [tiles,setTiles]=useState<number|undefined>();
 useEffect(()=>{
  if(tab!=='board'&&tab!=='research')return;
  let alive=true;
  const count=()=>clubFetch<unknown[]>(`${boardBase(videoId)}/research`).then(list=>{if(alive&&Array.isArray(list))setTiles(list.length);},()=>{});
  void count();const timer=setInterval(()=>void count(),TILE_RECOUNT_MS);
  return()=>{alive=false;clearInterval(timer);};
 },[tab,videoId,boardKey]);
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
 // Pictures to send with the next message: pasted, dropped or attached. They upload at once and show as small thumbnails above the box.
 const chatBase=`${boardBase(videoId)}/companion/attachments`;
 const [pics,setPics]=useState<string[]>([]),[picError,setPicError]=useState('');
 const addPictures=async(files:readonly File[])=>{
  setPicError('');
  for(const file of files.filter(each=>/^image\/(png|jpeg)$/.test(each.type)).slice(0,6-pics.length)){
   const form=new FormData();form.append('file',file);
   try{const {name}=await clubUpload<{name:string}>(chatBase,form);setPics(current=>[...current,name]);}
   catch(reason){setPicError(errorMessage(reason,"Couldn't add that picture."));}
  }
 };
 const ask=async(question:string)=>{
  if(!question.trim()||working)return;
  pinned.current=true;
  const sent=await companion.send(question,await contextNow(),undefined,pics);
  if(sent){setText('');setPics([]);}
 };
 // Typing "/" lists the person's own skills; choosing one puts its name in the message, and sending it runs the skill.
 const [skills,setSkills]=useState<InstalledSkill[]|null>(null);
 const [pick,setPick]=useState(0);
 const [dismissed,setDismissed]=useState(false);
 const query=slashQuery(text);
 useEffect(()=>{if(query===undefined||skills)return;let live=true;clubFetch<InstalledSkill[]>('/skills').then(list=>{if(live)setSkills(list);}).catch(()=>{if(live)setSkills([]);});return()=>{live=false;};},[query,skills]);
 useEffect(()=>{setPick(0);setDismissed(false);if(query===undefined)setShowAll(false);},[query]);
 const [showAll,setShowAll]=useState(false);
 // What was said on other steps is one line, opened on request (a hook, so it sits above the collapsed panel's early return).
 const [showEarlier,setShowEarlier]=useState(false);
 useEffect(()=>setShowEarlier(false),[tab,videoId]);
 // "/" alone lists a short set; typing searches every installed skill, and "Show all" lists them all.
 const short=skills?featuredSkills(skills):[];
 const choices=query!==undefined&&skills&&!dismissed?(query!==''||showAll||!short.length?matchSkills(skills,query):short):[];
 const hidden=query===''&&!showAll&&skills&&short.length>0?skills.length-short.length:0;
 const pickerOpen=query!==undefined&&!dismissed&&!working;
 const choose=(skill:InstalledSkill)=>{setText(`/${skill.name} `);input.current?.focus();};
 // A button elsewhere on the page can ask the chat something for the creator: it opens, sends the question and the answer comes back as cards.
 const askRef=useRef(ask),toggleRef=useRef(toggle);askRef.current=ask;toggleRef.current=toggle;
 useEffect(()=>{const hear=(event:Event)=>{const text=(event as CustomEvent<{text:string}>).detail?.text;if(!text)return;toggleRef.current(true);void askRef.current(text);};window.addEventListener(ASK_CLAUDE,hear);return()=>window.removeEventListener(ASK_CLAUDE,hear);},[]);
 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
  if(pickerOpen&&choices.length){
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setPick(i=>(i+(event.key==='ArrowDown'?1:choices.length-1))%choices.length);return;}
   if((event.key==='Enter'||event.key==='Tab')&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();choose(choices[Math.min(pick,choices.length-1)]);return;}
  }
  if(pickerOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setDismissed(true);return;}
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void ask(text);}
 };
 useLayoutEffect(()=>{const area=input.current;if(!area)return;area.style.height='auto';area.style.height=`${Math.min(140,area.scrollHeight)}px`;},[text,open]);

 const title=`Ask ${name}`;
 if(!open)return <aside className="cmp collapsed" aria-label={title}>
  <button ref={rail} type="button" className="cmp-rail" onClick={()=>toggle(true)} aria-label={`Show ${title}`} title={`Show ${title}`}>
   <CompanionMark size={18} working={working}/><span>{title}</span>
  </button>
 </aside>;

 // The conversation is one per video, but each step shows its own: what was said on other steps is one line, opened on request.
 // A conversation from an earlier day is tucked away too, so the step opens on a fresh start with its suggestions.
 const today=new Date();today.setHours(0,0,0,0);
 const recent=(message:{at?:string})=>!message.at||!(new Date(message.at).getTime()<today.getTime());
 const here=messages?(showEarlier?messages:messages.filter(message=>tabOf(message)===tab&&recent(message))):undefined;
 const hiddenCount=messages&&here?messages.length-here.length:0;
 const items=here?withDividers(here,tab):[];
 const sceneCount=outline?.scenes.length??0;
 const recorded=scenes?scenes.filter(one=>one.takes.length>0).length:undefined;
 const ideas=suggestions(tab,{scenes:sceneCount,scene,selected:tab==='research'?selection?.length:editor?.state?.selected,notes:editor?.state?.notes,hook:!!pkg?.hook.spoken.trim(),longest:Math.max(0,...(outline?.scenes??[]).map(one=>one.seconds||0)),
  tiles:tab==='board'||tab==='research'?tiles:undefined,recorded,titled:!!videoTitle?.trim()||!!pkg?.titles.some(one=>one.trim()),thumbnail:!!pkg?.thumbnailText.trim()});
 // Nothing asked yet: a short greeting for this step with the best prompts right under it, instead of a blank column.
 const fresh=!!here&&!here.length&&!live&&!companion.loadError;
 // Proposals are waiting for a choice: the suggestions step aside so the cards are the one thing to act on.
 const lastMessage=messages?.at(-1),awaiting=!!lastMessage&&'cards' in lastMessage&&lastMessage.cards.some(card=>card.state==='offered'&&(tab==='edit'||!isEditAction(card.action)));
 const chips=ideas.length>0&&<div className={cn('cmp-sugg',fresh&&'fresh')} aria-label="Suggestions">{ideas.map(idea=><button key={idea} type="button" onClick={()=>void ask(idea)}>{idea}</button>)}</div>;
 const selected=tab==='edit'?editor?.state?.selected??0:tab==='research'?selection?.length??0:0;
 return <aside className={cn('cmp',narrow&&'over')} aria-label={title} onKeyDown={onPanelKey}>
  <header className="cmp-head">
   <CompanionMark size={18} working={working} className="cmp-head-mark"/>
   <div className="cmp-head-text">
    <div className="cmp-title">{title}</div>
   </div>
   <button type="button" className="btn ghost sm icon-only" onClick={()=>{setText('/');input.current?.focus();}} aria-label="Run one of your skills" title="Run one of your skills"><Icon name="Sparkles" size={15}/></button>
   <button type="button" className="btn ghost sm icon-only" onClick={()=>toggle(false)} aria-label={`Hide ${title}`} title={`Hide ${title}`}><Icon name="PanelRightClose" size={16}/></button>
  </header>
  {/* One line for screen readers: the step, "Reply ready" or the failure. The timer is never in a live region. */}
  <div className="cmp-sr" role="status">{companion.announce}</div>
  <div className="cmp-log" ref={log} onScroll={onScroll} role="log" aria-live="off" aria-busy={working}>
   {hiddenCount>0&&<button type="button" className="cmp-earlier" onClick={()=>setShowEarlier(true)}>Show {hiddenCount} earlier {hiddenCount===1?'message':'messages'}</button>}
   {companion.loadError?<ErrorLine message={companion.loadError} onRetry={companion.reload}/>
    :!messages?<div className="cmp-loading"><Spinner label="Loading the conversation" size={16}/></div>
    :fresh&&<div className="cmp-hello">
     <p>{greeting(tab,{scenes:sceneCount,tiles:tab==='board'||tab==='research'?tiles:undefined,recorded})}</p>
     {chips||null}
    </div>}
   {items.map(item=>item.kind==='divider'?<div key={item.key} className="cmp-divider" role="separator">{item.label}</div>
    :item.message.role==='user'?<div key={item.key} className="cmp-me">{item.message.attachments?.length?<div className="cmp-pics">{item.message.attachments.map(name=><img key={name} src={`/api/club${chatBase}/${name}`} alt=""/>)}</div>:null}{item.message.text}</div>
    :<Reply key={item.key} name={name} message={item.message} answered={working||(messages?.at(-1)?.id!==item.message.id)} onChoose={answer=>void ask(answer)} pkg={pkg} outline={outline} scenes={scenes} busy={companion.busyCard} editor={editor} silences={silences}
      onApply={index=>companion.apply(item.message.id,index)} onUndo={index=>companion.undo(item.message.id,index)}/>)}
   {live&&<LiveReply name={name} live={live} now={now} onRetry={()=>void contextNow().then(companion.retry)}/>}
   {companion.sendError&&<ErrorLine message={companion.sendError} onRetry={()=>void ask(text)}/>}
  </div>
  {behind&&<button type="button" className="cmp-jump" onClick={toBottom}><Icon name="ArrowDown" size={13}/>Jump to latest</button>}
  <div className="cmp-foot">
   {!working&&!fresh&&!awaiting&&chips}
   {pickerOpen&&<div className="cmp-skills" role="listbox" aria-label="Your skills">
    <div className="cmp-skills-head">{tab==='edit'?'Your skills: on Edit a skill runs for real and makes something for the timeline':'Your skills'}</div>
    <div className="cmp-skills-list">
    {!skills?<div className="cmp-skills-empty">Looking for your skills…</div>
     :!choices.length?<div className="cmp-skills-empty">{skills.length?'No skill with that name.':'No skills are installed in your Claude Code yet.'}</div>
     :choices.map((skill,at)=><button key={skill.name} type="button" role="option" aria-selected={at===pick} className={cn('cmp-skill',at===pick&&'on')} onMouseEnter={()=>setPick(at)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(skill)}>
       <span className="cmp-skill-name">/{skill.name}</span><span className="cmp-skill-what">{skill.description}</span>
      </button>)}
     {hidden>0&&<button type="button" className="cmp-skills-more" onMouseDown={event=>event.preventDefault()} onClick={()=>setShowAll(true)}>Show all {skills!.length} skills, or type a name</button>}
    </div>
   </div>}
   <form className="cmp-input" onSubmit={event=>{event.preventDefault();void ask(text);}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void addPictures([...event.dataTransfer.files]);}}>
    {pics.length>0&&<div className="cmp-pics pending">{pics.map(name=><span key={name} className="cmp-pic"><img src={`/api/club${chatBase}/${name}`} alt=""/><button type="button" aria-label="Remove picture" onClick={()=>setPics(current=>current.filter(each=>each!==name))}><Icon name="X" size={11}/></button></span>)}</div>}
    {picError&&<p className="cmp-pic-err" role="alert">{picError}</p>}
    <textarea ref={input} rows={2} value={text} onChange={event=>setText(event.target.value)} onKeyDown={onKeyDown} onPaste={event=>{const files=[...event.clipboardData.files];if(files.length){event.preventDefault();void addPictures(files);}}} placeholder={working?'Esc stops the reply':'Ask for a change, or type / for your skills'} aria-label={`Message to ${name}`}/>
    <div className="cmp-input-row">
    <span className="cmp-context" title="What Claude is looking at"><Icon name="Eye" size={12}/>{lookingAt(tab,scene)}{scene&&<> · {scene.title}</>}{selected>0&&<> · {selected} selected</>}</span>
    <span className="grow"/>
    <label className="cmp-attach" title="Add a picture (or paste or drop one)"><Icon name="Image" size={15}/><input type="file" className="sr-only" accept="image/png,image/jpeg" multiple onChange={event=>{void addPictures([...(event.target.files??[])]);event.target.value='';}}/></label>
    {working
     ?<button type="button" className="cmp-send stop" onClick={stop} aria-label="Stop (Esc)" title="Stop (Esc)"><Icon name="Square" size={12} stroke={2.4}/></button>
     :<button type="submit" className="cmp-send" disabled={!text.trim()} aria-label="Send (Enter)" title="Send (Enter) · Shift+Enter for a new line"><Icon name="ArrowUp" size={15} stroke={2.2}/></button>}
    </div>
   </form>
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
function Reply({name,message,pkg,outline,scenes,busy,editor,silences,answered,onChoose,onApply,onUndo}:{name:string;message:CompanionReplyMessage;answered:boolean;onChoose(answer:string):void;pkg:Package|null;outline:Outline|null;scenes?:readonly VideoScene[];busy:string|null;editor?:CompanionEditor;silences?:SilencePlan|null;onApply(index:number):Promise<string>;onUndo(index:number):Promise<string>}){
 // Several proposals in one reply: one button applies them all, one after another, and stops at the first that cannot be applied.
 const canEdit=!!editor?.get();
 const offered=message.cards.map((card,index)=>({card,index})).filter(({card})=>card.state!=='applied'&&((isEditAction(card.action)&&canEdit)||card.action.type==='set_scene_script'));
 const [allBusy,setAllBusy]=useState(false);
 const addAll=async()=>{setAllBusy(true);try{for(const {index} of offered){const failed=await onApply(index);if(failed)break;}}finally{setAllBusy(false);}};
 return <div className="cmp-reply">
  <div className="cmp-who"><CompanionMark size={14}/>{name}</div>
  {message.steps&&message.steps.length>0&&<Steps steps={message.steps}/>}
  {message.text&&<div className="cmp-md"><Markdown text={message.text}/></div>}
  {message.status==='stopped'&&<div className="cmp-note">Stopped</div>}
  {offered.length>1&&<div className="cmp-all"><Button size="sm" variant="primary" disabled={!!busy||allBusy} onClick={()=>void addAll()}>{allBusy?<span className="spin"/>:null}Add all {offered.length}</Button><span className="cmp-faint">or choose one below</span></div>}
  {message.cards.map((card,index)=><Card key={index} answered={answered} onChoose={onChoose} id={`${message.id}:${index}`} card={card} pkg={pkg} outline={outline} scenes={scenes} busy={busy===`${message.id}:${index}`} editor={editor} silences={silences} onApply={()=>onApply(index)} onUndo={()=>onUndo(index)}/>)}
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

/** What a card is called: for a new graphic, what it adds ("Add a title card"); otherwise the action's own name. */
const cardTitle=(action:CompanionAction)=>action.type==='add_motion_block'?`Add a ${MOTION_TEMPLATES[action.template]?.label.toLowerCase()??'graphic'}`:ACTION_TITLE[action.type];

const scenesClock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

/** One change the reply offers: what it is, Apply (or what it changed and Undo), and Preview of before and after. */
function Card({id,card,pkg,outline,scenes,busy,editor,silences,answered,onChoose,onApply,onUndo}:{answered:boolean;onChoose(answer:string):void;id:string;card:CompanionCard;pkg:Package|null;outline:Outline|null;scenes?:readonly VideoScene[];busy:boolean;editor?:CompanionEditor;silences?:SilencePlan|null;onApply():Promise<string>;onUndo():Promise<string>}){
 const [textPreview,setTextPreview]=useState(false);
 const [error,setError]=useState('');
 const [confirm,setConfirm]=useState<'apply'|'undo'|null>(null);
 // New scenes over scenes that have takes ask first, like the Board's Draft scenes.
 // Applying it, or undoing it, replaces the scenes: with takes on any scene, that asks first (the server refuses what would lose takes).
 const asks=card.action.type==='draft_scenes'&&!!scenes?.some(scene=>scene.takes.length>0);
 const action=card.action;
 // A question: tapping an answer sends it as the creator's next message. Once something was said after it, the answers are settled.
 if(action.type==='ask_choice')return <div className="cmp-card cmp-choice"><div className="cmp-choice-q">{action.question}</div><div className="cmp-choice-opts">{action.options.map(option=><button key={option} type="button" className="btn sm" disabled={answered} onClick={()=>onChoose(option)}>{option}</button>)}</div></div>;
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
 if(timeline)body=<div className="cmp-card-text">{action.type==='add_clip'&&(action.media.kind==='image'?<img className="cmp-made" src={`/api/media/${encodeURIComponent(action.media.id)}/file`} alt=""/>:<video className="cmp-made" src={`/api/media/${encodeURIComponent(action.media.id)}/file`} muted loop autoPlay playsInline/>)}{stage?stage.describe(action):describeEditAction(action)}{estimate&&<div className={cn('cmp-card-est',estimate.warn&&'warn')}>{estimate.warn&&<Icon name="TriangleAlert" size={12}/>}{estimate.text}</div>}</div>;
 else if(action.type==='draft_scenes'){
  let at=0;
  body=<ol className="cmp-card-scenes">{action.scenes.map((scene,index)=>{const start=at;at+=scene.seconds;return <li key={index}><span>{scene.title}</span><span className="cmp-t">{scenesClock(start)}</span></li>;})}</ol>;
 }else if(action.type==='set_scene'){
  const index=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;
  body=<div className="cmp-card-text"><div className="cmp-card-sub">Scene {index>=0?index+1:''}{action.title?` · ${action.title}`:index>=0?` · ${outline!.scenes[index].title}`:''}</div>
   {action.talkingPoints&&<ul>{action.talkingPoints.map((point,at)=><li key={at}>{point}</li>)}</ul>}</div>;
 }else if(action.type==='set_scene_script'){
  const index=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;
  body=<div className="cmp-card-text long"><div className="cmp-card-sub">Scene {index>=0?index+1:''}{index>=0?` · ${outline!.scenes[index].title}`:''}</div>{action.script}</div>;
 }else if(action.type==='group_tiles'||action.type==='start_video'){
  body=<div className="cmp-card-text"><div className="cmp-card-sub">{action.tileIds.length} {action.tileIds.length===1?'card':'cards'}</div>{action.title}</div>;
 }else body=<div className={cn('cmp-card-text',action.type==='set_description'&&'long')}>{action.text}</div>;
 return <div className={cn('cmp-card',card.state)}>
  <div className="cmp-card-h"><span>{cardTitle(action)}{action.type==='draft_scenes'?` · ${action.scenes.length}`:''}</span></div>
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
    :timeline&&!stage?<span className="cmp-faint">This is a change to the timeline. Open Edit to add it.</span>
    :<><Button size="sm" variant="secondary" disabled={busy} onClick={()=>{if(asks)setConfirm('apply');else void run(onApply);}}>{busy?<span className="spin"/>:null}{card.state==='undone'?'Apply again':ACTION_VERB[action.type]}</Button>
     {(!timeline||stage)&&<button type="button" className="btn ghost sm" aria-pressed={preview} onClick={()=>setPreview(!preview)}><Icon name={preview?'EyeOff':'Eye'} size={14}/>{preview?'Hide preview':'Preview'}</button>}
     {card.state==='undone'&&<span className="cmp-faint">Undone</span>}</>}
  </div>
  {error&&<div className="cmp-card-err" role="alert"><Icon name="TriangleAlert" size={13}/><span>{error}</span></div>}
  {confirm&&scenes&&<ReplaceScenes scenes={scenes} action={confirm==='apply'?'Applying these':'Undoing this'} undoLine={confirm==='apply'?'You can undo it from this card.':'You can apply it again from this card.'}
   onKeep={()=>setConfirm(null)} onReplace={()=>{const which=confirm;setConfirm(null);void run(which==='apply'?onApply:onUndo);}}/>}
 </div>;
}
