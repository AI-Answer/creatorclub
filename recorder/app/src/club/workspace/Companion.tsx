import {useAi} from '../useAi';
import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {BrandLogo} from '../../BrandLogo';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import type {Outline,Package,VideoScene} from '../../../shared/club';
import {ACTION_TITLE,ACTION_VERB,isEditAction,type CompanionAction,type CompanionCard,type CompanionChanged,type CompanionContext,type CompanionReplyMessage,type CompanionTab,type EditAction} from '../../../shared/companion';
import type {EditorBridge,EditorState} from '../../App';
import {describeEditAction,type SilencePlan} from '../../editing-actions';
import {MOTION_TEMPLATES} from '../../../shared/motion/templates';
import {clubFetch,clubUpload,errorMessage} from '../api';
import {EDIT_FIRST,editFirst,featuredSkills,matchSkills,slashQuery,type EditSkill,type InstalledSkill} from '../../../shared/skills';
import {ErrorLine} from '../ErrorLine';
import {ASK_CLAUDE,askSettled,newAskId,type AskRequest} from './ask-claude';
import {Button,Icon,Spinner,cn,type IconName} from '../ui';
import {type IdeaPartKey,atBottom,sectionPart,greeting,lookingAt,previewOf,suggestions,tabOf,withDividers} from './companion-logic';
import {Markdown} from './Markdown';
import {visibleInterval} from '../visible-interval';
import {ReplaceScenes} from './ReplaceScenes';
import {useCompanion,type Live} from './useCompanion';
import {useIdeaSection,useIdeaView} from '../idea/view';
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
/**
 * The replies each video's conversation already had the first time it loaded in this app session. Any other reply arrived while the app
 * was open, and applies its changes by itself. Kept for the whole session, so the panel closing, opening or remounting on another step
 * does not turn a fresh reply into history.
 */
const historyIds=new Map<string,Set<string>>();
/** Tests start each case as a new app session. */
export const forgetCompanionHistory=()=>historyIds.clear();

export function Companion({videoId,videoTitle,videoWhy,tab,part,scene,screen,selection,pkg,outline,scenes,onChanged,beforeApply,editor,roomy=false,boardKey=0}:{
 videoId:string;videoTitle?:string;/** Why the idea could work, as the video holds it: what an Idea card's preview compares with. */videoWhy?:string;tab:CompanionTab;/** Idea: the part of "Your video" that is open, by key and name. */part?:{key:IdeaPartKey;name:string};scene?:CompanionScene;screen:string;pkg:Package|null;outline:Outline|null;
 /** Research: the selected cards' ids, sent with every message ("these" means them). */
 selection?:readonly string[];
 /** Changes when the board changed through the companion: its tiles are counted again. */
 boardKey?:number;
 /** The video's scenes with their takes: replacing scenes that have takes asks first. */
 scenes?:readonly VideoScene[];
 onChanged(changed:CompanionChanged[],applied?:CompanionAction['type']):void;beforeApply?():Promise<void>;
 /** Edit: the open editor. Messages carry its playhead and selection; timeline cards preview on its stage and apply as one of its undo steps. */
 editor?:CompanionEditor;
 /** The step needs its width (Record): in a narrow window the panel starts as its rail and opens over the step instead of beside it. */
 /** The step needs its width: `true` in a narrow window (Record), or a window width in px up to which it does (Edit with a panel open). */
 roomy?:boolean|number;
}){
 const aiAvailable=useAiAvailable();
 const [ideaView]=useIdeaView(),ideaSection=useIdeaSection();
 const boardView=tab==='idea'&&ideaView==='board';
 const narrow=useNarrow(typeof roomy==='number'?Math.max(1199,roomy):roomy||1199);
 const [saved,setSaved]=useState(readOpen);
 const [openHere,setOpenHere]=useState(false);
 useEffect(()=>{if(narrow)setOpenHere(false);},[narrow]);
 const open=narrow?openHere:saved;
 const {name}=useAi();
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
  if(tab!=='idea'&&tab!=='research')return;
  let alive=true;
  const count=()=>clubFetch<unknown[]>(`${boardBase(videoId)}/research`).then(list=>{if(alive&&Array.isArray(list))setTiles(list.length);},()=>{});
  const stop=visibleInterval(count,TILE_RECOUNT_MS,true);
  return()=>{alive=false;stop();};
 },[tab,videoId,boardKey]);
 const companion=useCompanion(videoId,{onChanged,beforeApply,editor:()=>editorNow.current?.get()??null});
 const {messages,live}=companion;
 const working=companion.busy;
 const context:CompanionContext=useMemo(()=>({tab,...(!boardView&&scene?{sceneId:scene.id,sceneTitle:scene.title}:{}),screen:tab==='idea'?(boardView?'Board':ideaSection??screen):screen,...(selection?.length?{selection:[...selection].slice(0,200)}:{})}),[tab,scene,screen,selection,boardView,ideaSection]);
 const [text,setText]=useState('');
 const input=useRef<HTMLTextAreaElement>(null);
 const rail=useRef<HTMLButtonElement>(null);
 // Focus follows the panel: into the message field when it opens, onto the rail that reopens it when it is hidden.
 const toggle=(next:boolean)=>{if(narrow)setOpenHere(next);setSaved(next);saveOpen(next);setTimeout(()=>(next?input.current:rail.current)?.focus(),0);};

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
 const ask=async(question:string,requestId=newAskId(),parentRequestId?:string)=>{
  if(!aiAvailable||!question.trim()){askSettled({requestId,ok:false,choice:false});return;}
  pinned.current=true;
  const sentPics=pics;
  const sent=await companion.send(question,contextNow,undefined,sentPics,requestId,parentRequestId);
  if(sent){setText(current=>current===question?'':current);setPics(current=>current.filter(pic=>!sentPics.includes(pic)));}
 };
 // Typing "/" lists the person's own skills; choosing one puts its name in the message, and sending it runs the skill.
 const [skills,setSkills]=useState<InstalledSkill[]|null>(null);
 // Edit lists its own set (with why each is on), so the list is read again when the step changes.
 useEffect(()=>setSkills(null),[tab]);
 const [pick,setPick]=useState(0);
 const [dismissed,setDismissed]=useState(false);
 const query=slashQuery(text);
 useEffect(()=>{if(query===undefined||skills)return;let live=true;clubFetch<EditSkill[]>(tab==='edit'?'/skills/edit':'/skills').then(list=>{if(live)setSkills(list);}).catch(()=>{if(live)setSkills([]);});return()=>{live=false;};},[query,skills]);
 useEffect(()=>{setPick(0);setDismissed(false);if(query===undefined)setShowAll(false);},[query]);
 const [showAll,setShowAll]=useState(false);
 // What was said on other steps is one line, opened on request (a hook, so it sits above the collapsed panel's early return).
 const [showEarlier,setShowEarlier]=useState(false);
 useEffect(()=>setShowEarlier(false),[tab,videoId]);
 // "/" alone lists a short set; typing searches every installed skill, and "Show all" lists them all.
 // On Edit only the skills that edit or make video are listed: there a skill runs for real and makes something for the timeline.
 const offered=skills&&tab==='edit'?(skills as EditSkill[]).filter(skill=>skill.on):skills;
 const first=offered&&tab==='edit'?editFirst(offered):[];
 const short=offered?(tab==='edit'?(first.length?first:offered):featuredSkills(offered)):[];
 const choices=query!==undefined&&offered&&!dismissed?(query!==''||showAll||!short.length?matchSkills(offered,query):short):[];
 const hidden=query===''&&!showAll&&offered&&short.length>0?offered.length-short.length:0;
 const pickerOpen=query!==undefined&&!dismissed&&!working;
 const choose=(skill:InstalledSkill)=>{setText(`/${skill.name} `);input.current?.focus();};
 // A button elsewhere on the page can ask the chat something for the creator: it opens, sends the question and the answer comes back as cards.
 const askRef=useRef(ask),toggleRef=useRef(toggle);askRef.current=ask;toggleRef.current=toggle;
 useEffect(()=>{const hear=(event:Event)=>{const detail=(event as CustomEvent<AskRequest>).detail;if(!detail?.text)return;detail.accepted=true;toggleRef.current(true);void askRef.current(detail.text,detail.requestId);};window.addEventListener(ASK_CLAUDE,hear);return()=>window.removeEventListener(ASK_CLAUDE,hear);},[]);

 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{
  if(pickerOpen&&choices.length){
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setPick(i=>(i+(event.key==='ArrowDown'?1:choices.length-1))%choices.length);return;}
   if((event.key==='Enter'||event.key==='Tab')&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();choose(choices[Math.min(pick,choices.length-1)]);return;}
  }
  if(pickerOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();setDismissed(true);return;}
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void ask(text);}
 };
 useLayoutEffect(()=>{const area=input.current;if(!area)return;area.style.height='auto';area.style.height=`${Math.min(120,area.scrollHeight)}px`;},[text,open]);

 const title=`Ask ${name}`;
 if(messages&&!historyIds.has(videoId))historyIds.set(videoId,new Set(messages.map(message=>message.id)));
 const known=historyIds.get(videoId);
 if(!open)return <aside className="cmp collapsed" aria-label={title}>
  <button ref={rail} type="button" className="cmp-rail" onClick={()=>toggle(true)} aria-label={`Open ${title}`} title={title}>
   <BrandLogo brand={name==='ChatGPT'?'chatgpt':'claude'} size={20} working={working}/><span className="cmp-sr">{title}</span>
  </button>
 </aside>;

 // The conversation is one per video, but each step shows its own: what was said on other steps is one line, opened on request.
 // A conversation from an earlier day is tucked away too, so the step opens on a fresh start with its suggestions.
 const today=new Date();today.setHours(0,0,0,0);
 const recent=(message:{at?:string})=>!message.at||!(new Date(message.at).getTime()<today.getTime());
 const here=messages?(showEarlier?messages:messages.filter(message=>tabOf(message)===tab&&recent(message))):undefined;
 const hiddenCount=messages&&here?messages.length-here.length:0;
 const items=here?withDividers(here,tab):[];
 const retryPlaceholder=(replyId:string)=>{
  const at=messages?.findIndex(message=>message.id===replyId)??-1;
  const question=messages?.slice(0,at).reverse().find(message=>message.role==='user');
  if(aiAvailable&&question)void contextNow().then(context=>companion.retry(context,question.id));
 };
 const sceneCount=outline?.scenes.length??0;
 const recorded=scenes?scenes.filter(one=>one.takes.length>0).length:undefined;
 const ideas=suggestions(tab,{part:boardView?undefined:sectionPart(ideaSection)??part?.key,titles:pkg?.titles.filter(one=>one.trim()).length,scenes:boardView?0:sceneCount,scene:boardView?undefined:scene,selected:tab==='research'?selection?.length:editor?.state?.selected,notes:editor?.state?.notes,stalls:editor?.state?.stalls,opening:editor?.state?.opening,named:editor?.state?.named,polished:(messages??[]).some(one=>one.role==='user'&&one.text.trimStart().startsWith('/proof-edit')),hook:!!pkg?.hook.spoken.trim(),longest:Math.max(0,...(outline?.scenes??[]).map(one=>one.seconds||0)),
  tiles:tab==='idea'||tab==='research'?tiles:undefined,recorded,titled:!!videoTitle?.trim()||!!pkg?.titles.some(one=>one.trim()),thumbnail:!!pkg?.thumbnailText.trim()}).map(plainIdeaCopy);
 // Nothing asked yet: a short greeting for this step with the best prompts right under it, instead of a blank column.
 const fresh=!!here&&!here.length&&!live&&!companion.loadError;
 // Proposals are waiting for a choice: the suggestions step aside so the cards are the one thing to act on.
 const lastMessage=messages?.at(-1),awaiting=!!lastMessage&&'cards' in lastMessage&&lastMessage.cards.some(card=>card.state==='offered'&&(tab==='edit'||!isEditAction(card.action)));
 // The app's rule for suggestions: only on an empty chat on this step, two at most, as plain text links. None under replies.
 const chips=ideas.length>0&&<div className={cn('cmp-sugg',fresh&&'fresh')} aria-label="Suggestions">{ideas.slice(0,2).map(idea=><button key={idea} type="button" disabled={!aiAvailable} title={!aiAvailable?AI_CONNECT_HINT:undefined} onClick={()=>void ask(idea)}><span>{idea.replace(/^\/[\w-]+\s+/,'')}</span></button>)}</div>;
 const selected=tab==='edit'?editor?.state?.selected??0:tab==='research'||boardView?selection?.length??0:0;
 return <aside className={cn('cmp',narrow&&'over')} aria-label={title} onKeyDown={onPanelKey}>
  <header className="cmp-head">
   <BrandLogo brand={name==='ChatGPT'?'chatgpt':'claude'} size={20} working={working} className="cmp-head-mark"/>
   <div className="cmp-head-text">
    <div className="cmp-title">{title}</div>
   </div>
   <button type="button" className="btn ghost sm icon-only" onClick={()=>{setText('/');input.current?.focus();}} aria-label="Run one of your skills" title="Run one of your skills"><Icon name="code" size={15}/></button>
   <button type="button" className="btn ghost sm icon-only" onClick={()=>toggle(false)} aria-label={`Hide ${title}`} title={`Hide ${title}`}><Icon name="PanelRightClose" size={16}/></button>
  </header>
  {/* One line for screen readers: the step, "Reply ready" or the failure. The timer is never in a live region. */}
  <div className="cmp-sr" role="status">{companion.announce}</div>
  <div className="cmp-log" ref={log} onScroll={onScroll} role="log" aria-live="off" aria-busy={working}>
   {hiddenCount>0&&<button type="button" className="cmp-earlier" onClick={()=>setShowEarlier(true)}>Show {hiddenCount} earlier {hiddenCount===1?'message':'messages'}</button>}
   {companion.loadError?<ErrorLine message={companion.loadError} onRetry={companion.reload}/>
    :!messages?<div className="cmp-loading"><span className="row small muted" role="status"><Spinner label="Loading the conversation" size={16}/>Loading the conversation…</span></div>
    :fresh&&<div className="cmp-hello">
     <p>{plainIdeaCopy(greeting(tab,{part:boardView?undefined:sectionPart(ideaSection)??part?.key,scenes:boardView?0:sceneCount,tiles:tab==='idea'||tab==='research'?tiles:undefined,recorded}))}</p>
     {chips||null}
    </div>}
   {items.map(item=>item.kind==='divider'?<div key={item.key} className="cmp-divider" role="separator">{item.label}</div>
    :item.message.role==='user'?<div key={item.key} className="cmp-me">{item.message.attachments?.length?<div className="cmp-pics">{item.message.attachments.map(name=><img key={name} src={`/api/club${chatBase}/${name}`} alt=""/>)}</div>:null}{item.message.text}</div>
    :item.message.status==='running'?(live?null:<div key={item.key} className="cmp-reply live" role="status"><Spinner label="Writing the reply"/>Thinking…</div>)
    :item.message.status==='failed'&&live?.phase==='streaming'&&messages?.slice(0,messages.findIndex(message=>message.id===item.message.id)).reverse().find(message=>message.role==='user')?.id===live.questionId?null
    :item.message.status==='failed'?<div key={item.key} className="cmp-reply failed">{item.message.text&&<Markdown text={item.message.text}/>}<ErrorLine message="Couldn't finish that reply." onRetry={()=>retryPlaceholder(item.message.id)}/></div>
    :<Reply key={item.key} name={name} message={item.message} arrived={!!known&&!known.has(item.message.id)} answered={!aiAvailable||working||(messages?.at(-1)?.id!==item.message.id)} onChoose={answer=>void ask(answer,newAskId(),companion.requestId)} video={{title:videoTitle??'',why:videoWhy}} pkg={pkg} outline={outline} scenes={scenes} busy={companion.busyCard} editor={editor} silences={silences}
      onApply={index=>companion.apply(item.message.id,index)} onApplyAll={indices=>companion.applyAll(item.message.id,indices)} onUndo={index=>companion.undo(item.message.id,index)}/>)}
   {live&&<LiveReply name={name} live={live} onRetry={()=>{if(aiAvailable)void contextNow().then(companion.retry);}}/>}
   {companion.sendError&&<ErrorLine message={companion.sendError} onRetry={()=>void ask(text)}/>}
  </div>
  {behind&&<button type="button" className="cmp-jump" onClick={toBottom}><Icon name="ArrowDown" size={13}/>Jump to latest</button>}
  <div className="cmp-foot">
   {!aiAvailable&&<p className="cmp-faint">{AI_CONNECT_HINT}</p>}
   {pickerOpen&&<div className="cmp-skills" role="listbox" aria-label="Your skills">
    <div className="cmp-skills-head">{tab==='edit'?(query===''&&!showAll&&first.length?'Edit your video with':'Video skills: each one runs and makes something for the timeline'):'Your skills'}</div>
    <div className="cmp-skills-list">
    {!skills?<div className="cmp-skills-empty">Looking for your skills…</div>
     :!choices.length?<div className="cmp-skills-empty">{offered?.length?'No skill with that name. Try another name.':tab==='edit'?'No video skills are installed in your Claude Code yet. Add one in Settings → Skills.':'No skills are installed in your Claude Code yet. Add one in Settings → Skills.'}</div>
     :choices.map((skill,at)=><button key={skill.name} type="button" role="option" aria-selected={at===pick} className={cn('cmp-skill',at===pick&&'on')} onMouseEnter={()=>setPick(at)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(skill)}>
       <span className="cmp-skill-name">/{skill.name}</span><span className="cmp-skill-what">{tab==='edit'&&EDIT_FIRST[skill.name]?EDIT_FIRST[skill.name]:skill.description}</span>
      </button>)}
     {hidden>0&&<button type="button" className="cmp-skills-more" onMouseDown={event=>event.preventDefault()} onClick={()=>setShowAll(true)}>Show all {offered!.length} skills, or type a name</button>}
    {tab==='edit'&&<a className="cmp-skills-more" href="#/settings/skills">Missing a skill? Choose which ones show here in Settings</a>}</div>
   </div>}
   <form className="cmp-input" onSubmit={event=>{event.preventDefault();void ask(text);}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();void addPictures([...event.dataTransfer.files]);}}>
    {pics.length>0&&<div className="cmp-pics pending">{pics.map(name=><span key={name} className="cmp-pic"><img src={`/api/club${chatBase}/${name}`} alt=""/><button type="button" aria-label="Remove picture" onClick={()=>setPics(current=>current.filter(each=>each!==name))}><Icon name="X" size={11}/></button></span>)}</div>}
    {picError&&<p className="cmp-pic-err" role="alert">{picError}</p>}
    <textarea disabled={!aiAvailable} title={!aiAvailable?AI_CONNECT_HINT:undefined} ref={input} rows={1} value={text} onChange={event=>setText(event.target.value)} onKeyDown={onKeyDown} onPaste={event=>{const files=[...event.clipboardData.files];if(files.length){event.preventDefault();void addPictures(files);}}} placeholder={working?'Esc stops the reply':'Ask for a change, or type / to use a skill'} aria-label={`Message to ${name}`}/>
    <div className="cmp-input-row">
    <span className="cmp-context" title={`What ${name} can see`}><Icon name="Eye" size={12}/>Sees: {tab==='idea'&&boardView?'Board':tab==='idea'&&ideaSection?ideaSection:lookingAt(tab,scene)}{!boardView&&!(tab==='idea'&&ideaSection)&&scene&&<> · {scene.title}</>}{!boardView&&!(tab==='idea'&&ideaSection)&&!scene&&part&&<> · {part.name}</>}{selected>0&&<> · {selected} selected</>}</span>
    <span className="grow"/>
    <label className="cmp-attach" title="Add a picture (or paste or drop one)"><Icon name="Image" size={15}/><input type="file" className="sr-only" accept="image/png,image/jpeg" multiple onChange={event=>{void addPictures([...(event.target.files??[])]);event.target.value='';}}/></label>
    {working
     ?<button type="button" className="cmp-send stop" disabled={live?.stopping} onClick={stop} aria-label="Stop (Esc)" title="Stop (Esc)"><Icon name="Square" size={12} stroke={2.4}/></button>
     :<button type="submit" className="cmp-send" disabled={!aiAvailable||!text.trim()} aria-label="Send (Enter)" title={!aiAvailable?AI_CONNECT_HINT:"Send (Enter) · Shift+Enter for a new line"}><Icon name="ArrowUp" size={15} stroke={2.2}/></button>}
    </div>
   </form>
  </div>
 </aside>;
}

/** Keep the prompts conversational while preserving skill commands when sent. */
function plainIdeaCopy(text:string){
 return text.replace('Which pair is strongest, and why?','Ask which title and thumbnail work best together')
  .replace('Ask me which pair is strongest, or for titles and thumbnail words to choose from.','Ask which title and thumbnail work best together, or ask for title ideas and words for the thumbnail.')
  .replace(/\bhooks\b/g,'first lines');
}

const NARROW='(max-width: 1279px)';
/** True while the window is narrow and the step asked for its width. */
function useNarrow(roomy:boolean|number){
 const media=typeof roomy==='number'?`(max-width: ${roomy}px)`:NARROW;
 const query=()=>Boolean(roomy)&&typeof window!=='undefined'&&!!window.matchMedia?.(media).matches;
 const [narrow,setNarrow]=useState(query);
 useEffect(()=>{
  setNarrow(query());
  if(!roomy||!window.matchMedia)return;
  const list=window.matchMedia(media),on=()=>setNarrow(list.matches);
  list.addEventListener?.('change',on);return()=>list.removeEventListener?.('change',on);
 },[roomy,media]);
 return narrow;
}

/** A finished reply: who, the one-line summary of its steps (opens to the list), the text, and its cards. */
function Reply({name,message,arrived,video,pkg,outline,scenes,busy,editor,silences,answered,onChoose,onApply,onApplyAll,onUndo}:{name:string;message:CompanionReplyMessage;/** It came in now, not with the conversation's history. */arrived?:boolean;answered:boolean;onChoose(answer:string):void;video:{title:string;why?:string};pkg:Package|null;outline:Outline|null;scenes?:readonly VideoScene[];busy:ReadonlySet<string>;editor?:CompanionEditor;silences?:SilencePlan|null;onApply(index:number):Promise<string>;onApplyAll(indices:number[]):Promise<string>;onUndo(index:number):Promise<string>}){
 // A reply's changes apply by themselves as it arrives, in order (timeline edits as one batch so each lands where its times now are),
 // and the reply says what changed in one line with one Undo for all of it. The single changes stay behind "Show changes".
 // Left for you: a question, a redraft over scenes that have takes (it asks first), and a timeline change while Edit is not open.
 const canEdit=!!editor?.get();
 const indexed=message.cards.map((card,index)=>({card,index}));
 const choice=({card}:{card:CompanionCard})=>card.action.type==='ask_choice';
 const asksFirst=({card}:{card:CompanionCard})=>card.action.type==='draft_scenes'&&!!scenes?.some(scene=>scene.takes.length>0);
 const automatic=({card}:{card:CompanionCard})=>!choice({card})&&!asksFirst({card})&&(!isEditAction(card.action)||canEdit);
 // Undone changes are not applied again by themselves, but the one button makes them again.
 const pending=indexed.filter(item=>automatic(item)&&item.card.state!=='applied'&&item.card.state!=='undone');
 const unmade=indexed.filter(item=>automatic(item)&&item.card.state!=='applied');
 const undone=unmade.some(({card})=>card.state==='undone');
 const applied=indexed.filter(item=>automatic(item)&&item.card.state==='applied');
 // Each of these keeps its own card, whatever its state: its Apply and Undo ask first, or need Edit open.
 const waiting=indexed.filter(item=>!choice(item)&&!automatic(item));
 const [running,setRunning]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
 const applyAll=async(list:typeof pending)=>{
  setRunning(true);setError('');
  try{
   const edits=list.filter(({card})=>isEditAction(card.action)).map(({index})=>index);
   if(edits.length>1){const failed=await onApplyAll(edits);if(failed){setError(failed);return;}}
   for(const {index} of list){if(edits.length>1&&edits.includes(index))continue;const failed=await onApply(index);if(failed){setError(failed);return;}}
  }finally{setRunning(false);}
 };
 const undoAll=async()=>{
  setRunning(true);setError('');
  try{for(const {index,card} of [...applied].reverse()){if(!card.version)continue;const failed=await onUndo(index);if(failed){setError(failed);return;}}}
  finally{setRunning(false);}
 };
 const started=useRef(false);
 useEffect(()=>{if(!arrived||started.current||!pending.length)return;started.current=true;void applyAll(pending);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[arrived,pending.length]);
 const line=changedLine(applied.map(({card})=>card),outline);
 const card=(item:{card:CompanionCard;index:number})=><Card key={item.index} answered={answered} onChoose={onChoose} id={`${message.id}:${item.index}`} card={item.card} video={video} pkg={pkg} outline={outline} scenes={scenes} busy={busy.has(`${message.id}:${item.index}`)} editor={editor} silences={silences} onApply={()=>onApply(item.index)} onUndo={()=>onUndo(item.index)}/>;
 const changes=indexed.filter(automatic);
 return <div className="cmp-reply">
  {message.text&&<div className="cmp-md"><Markdown text={message.text}/></div>}
  {message.status==='stopped'&&<div className="cmp-note">Stopped</div>}
  {indexed.filter(choice).map(card)}
  {waiting.map(card)}
  {changes.length>0&&<div className="cmp-changed">
   {running?<span className="cmp-changed-line"><span className="spin"/>Making the changes…</span>
    :applied.length>0?<span className="cmp-changed-line" title={line}><Icon name="Check" size={13} stroke={2.4}/><span className="cmp-changed-text">{line}</span></span>
    :<span className="cmp-changed-line is-off">{error?'Not made':undone?'Undone':'Not applied'}</span>}
   {!running&&applied.some(({card})=>card.version)&&<button type="button" className="cmp-changed-undo is-icon" aria-label="Undo" title="Undo" onClick={()=>void undoAll()}><Icon name="undo" size={14}/></button>}
   {!running&&!error&&!applied.length&&unmade.length>0&&<button type="button" className="cmp-changed-undo is-icon" disabled={message.cards.some((_,index)=>busy.has(`${message.id}:${index}`))} aria-label={undone?'Redo':'Apply'} title={undone?'Redo':'Apply'} onClick={()=>void applyAll(unmade)}><Icon name={undone?'redo':'check'} size={14}/></button>}
   <button type="button" className="cmp-changed-more is-icon" aria-expanded={open} aria-label={open?'Hide the changes':'Show the changes'} title={open?'Hide the changes':'Show the changes'} onClick={()=>setOpen(value=>!value)}><Icon name={open?'collapse':'expand'} size={14}/></button>
  </div>}
  {error&&<div className="cmp-card-err" role="alert"><Icon name="TriangleAlert" size={13}/><span>{error}</span></div>}
  {open&&<ul className="cmp-change-list" aria-label="The changes">{changes.map(({card:item,index})=>{
   const timeline=isEditAction(item.action),stage=timeline?editor?.get()??null:null,key=`${message.id}:${index}`,previewing=timeline&&editor?.state?.previewKey===key;
   // One line each: what it did once made, else what it would do; Preview only for a timeline change not made yet, on the editor's stage.
   const estimate=item.state!=='applied'&&stage?stage.estimate(item.action as EditAction,{silences})?.text:undefined;
   const words='text' in item.action&&typeof item.action.text==='string'?item.action.text:'';
   const what=item.state==='applied'?item.result??cardTitle(item.action):`${cardTitle(item.action)}${timeline?` · ${estimate??describeEditAction(item.action as EditAction).replace(/\.$/,'')}`:words?` · “${words}”`:''}`;
   return <li key={index} className={cn('cmp-change',item.state)}><CardIcon action={item.action}/><span className="cmp-change-what">{what}</span>
    {item.state!=='applied'&&stage&&<button type="button" className="cmp-change-preview" aria-pressed={previewing} onClick={()=>stage.preview(previewing?null:item.action as EditAction,key,{silences})}>{previewing?'Hide preview':'Preview'}</button>}</li>;
  })}</ul>}
 </div>;
}

/** Many changes of one kind, said by what they are. */
/** How a few changes of one kind are counted: the verb and the thing ("Removed 2 graphics"). */
const COUNTED:Partial<Record<CompanionAction['type'],{verb:string;one:string;many:string}>>={
 add_motion_block:{verb:'Added',one:'graphic',many:'graphics'},update_motion_block:{verb:'Changed',one:'graphic',many:'graphics'},remove_motion_block:{verb:'Removed',one:'graphic',many:'graphics'},
 add_text:{verb:'Added',one:'text on screen',many:'texts on screen'},add_caption:{verb:'Added',one:'caption',many:'captions'},set_zoom:{verb:'Added',one:'zoom',many:'zooms'},
 add_blur:{verb:'Added',one:'blur',many:'blurs'},add_clip:{verb:'Added',one:'clip',many:'clips'},set_stage:{verb:'Set',one:'stage stretch',many:'stage stretches'},delete_range:{verb:'Cut',one:'stretch',many:'stretches'},
};
const GRAPHIC_CHANGES=new Set<CompanionAction['type']>(['add_motion_block','update_motion_block','remove_motion_block']);

/**
 * What a reply changed, in one short line beside Undo: the scenes it rewrote ("Updated scenes 1 and 2"), then one change in its own words
 * ("Cut 5 pauses, 2.5 s shorter") or several as a count ("Removed 2 graphics", "Made 7 changes"), never a list of sentences.
 */
export function changedLine(cards:readonly CompanionCard[],outline:Outline|null){
 const scenes=new Set<number>(),others:CompanionCard[]=[];let notes=0;
 for(const card of cards){
  const action=card.action;
  if(action.type==='add_timeline_note'){notes++;continue;}
  if(action.type==='set_scene'||action.type==='set_scene_script'){const at=outline?.scenes.findIndex(scene=>scene.id===action.sceneId)??-1;if(at>=0){scenes.add(at+1);continue;}}
  others.push(card);
 }
 const numbers=[...scenes].sort((a,b)=>a-b).map(String);
 const list=numbers.length<2?numbers.join(''):`${numbers.slice(0,-1).join(', ')} and ${numbers.at(-1)}`;
 const kinds=new Set(others.map(card=>card.action.type)),n=others.length,only=kinds.size===1?COUNTED[[...kinds][0]]:undefined;
 const rest=n===0?[]:n===1?[others[0].result??cardTitle(others[0].action)]
  :only?[`${only.verb} ${n} ${only.many}`]
  :[...kinds].every(kind=>GRAPHIC_CHANGES.has(kind))?[`Changed ${n} graphics`]:[`Made ${n} changes`];
 return [...(numbers.length?[`Updated ${numbers.length===1?'scene':'scenes'} ${list}`]:[]),...rest,...(notes?[others.length||numbers.length?`${notes} ${notes===1?'note':'notes'}`:`Left ${notes===1?'a note':`${notes} notes`} on the timeline`]:[])].join(' · ')||'Changed';
}

/**
 * The reply being written: one quiet line with what it is doing now (no list of finished steps, no timers), the words as they arrive, or
 * the failure. The finished reply folds its steps into one line that opens on request.
 */
function LiveReply({name,live,onRetry}:{name:string;live:Live;onRetry():void}){
 const working=live.phase==='streaming',current=live.steps[live.steps.length-1]?.label;
 return <div className={cn('cmp-reply','live',!working&&'failed')} aria-live="off">
  <div className="cmp-who"><BrandLogo brand={name==='ChatGPT'?'chatgpt':'claude'} size={15} working={working}/>{name}</div>
  {working&&<ol className="cmp-steps live"><li className="on"><span className="cmp-pulse" aria-hidden/><span>{live.stopping?'Stopping…':current??'Thinking'}</span></li></ol>}
  {live.text&&<div className="cmp-md streaming"><Markdown text={live.text}/></div>}
  {!working&&live.error&&<ErrorLine message={live.error} onRetry={onRetry}/>}
 </div>;
}

/** What a card is called: for a new graphic, what it adds ("Add a title card"); otherwise the action's own name. */
/** What each card changes, as one icon: the same marks the rest of the app uses for those things. */
const ACTION_ICON:Record<CompanionAction['type'],IconName>={use_hook:'microphone',use_title:'heading-1',set_thumbnail_text:'image',set_idea:'idea',set_pairs:'heading-1',set_hook:'microphone',set_sketch:'idea',add_note:'note',set_scene:'scenes',set_scene_script:'script',draft_scenes:'scenes',ask_choice:'choose',set_description:'paragraph',group_tiles:'layout',start_video:'video',
 cut_pauses:'cut',remove_fillers:'cut',close_gaps:'cut',split_at:'cut',trim_clip:'cut',delete_range:'delete',set_caption_style:'captions',add_caption:'captions',add_timeline_note:'note',add_text:'text',add_blur:'hide',set_stage:'layout',set_look:'ai',set_zoom:'zoom-in',add_motion_block:'layout',update_motion_block:'layout',remove_motion_block:'layout',normalize_audio:'music',add_clip:'film'};
const CardIcon=({action}:{action:CompanionAction})=><span className={cn('cmp-card-ico',`k-${ACTION_ICON[action.type]}`)} aria-hidden><Icon name={ACTION_ICON[action.type]} size={13}/></span>;
const cardTitle=(action:CompanionAction)=>action.type==='add_motion_block'?`Add a ${MOTION_TEMPLATES[action.template]?.label.toLowerCase()??'graphic'}`:ACTION_TITLE[action.type];

const scenesClock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;

/** One change the reply offers: what it is, Apply (or what it changed and Undo), and Preview of before and after. */
function Card({id,card,video,pkg,outline,scenes,busy,editor,silences,answered,onChoose,onApply,onUndo}:{answered:boolean;onChoose(answer:string):void;id:string;card:CompanionCard;video:{title:string;why?:string};pkg:Package|null;outline:Outline|null;scenes?:readonly VideoScene[];busy:boolean;editor?:CompanionEditor;silences?:SilencePlan|null;onApply():Promise<string>;onUndo():Promise<string>}){
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
 const shown=textPreview&&!timeline?previewOf(action,pkg,outline,video):undefined;
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
 }else if(action.type==='set_idea'){
  body=<div className="cmp-card-text">{([['What it\'s about',action.angle],['Your twist',action.twist],['Why it could work',action.why]] as const).filter(([,text])=>text).map(([label,text])=><p key={label} style={{margin:'0 0 6px'}}><span className="cmp-card-sub">{label}</span><br/>{text}</p>)}</div>;
 }else if(action.type==='set_sketch'){
  const thumb=action.thumbnail&&[action.thumbnail.headline,action.thumbnail.visual,action.thumbnail.closer].filter(Boolean).join(' · ');
  const parts:[string,string|undefined][]=[['Title',action.title],['Backup title',action.backupTitle],['Thumbnail',thumb],['Logline',action.logline],...(action.whys??[]).map((why,index)=>[`Why ${index+1}`,why] as [string,string])];
  body=<div className="cmp-card-text">{parts.filter(([,text])=>text).map(([label,text])=><p key={label} style={{margin:'0 0 6px'}}><span className="cmp-card-sub">{label}</span><br/>{text}</p>)}
   {action.skeleton&&<><span className="cmp-card-sub">Talking points</span><ol style={{margin:'2px 0 0',paddingLeft:18}}>{action.skeleton.map((beat,index)=><li key={index}><b>{beat.label}</b>{beat.label&&': '}{beat.line}</li>)}</ol></>}</div>;
 }else if(action.type==='set_pairs'){
  body=<ol className="cmp-card-scenes">{action.pairs.map((pair,index)=><li key={index}><span>{pair.title}<br/><span className="cmp-card-sub">{pair.thumb}{action.use===index+1?' · in use':''}</span></span></li>)}</ol>;
 }else if(action.type==='set_hook'){
  body=<div className="cmp-card-text">{([['Say',action.spoken],['They see',action.visual],['On screen',action.text]] as const).filter(([,text])=>text).map(([label,text])=><p key={label} style={{margin:'0 0 6px'}}><span className="cmp-card-sub">{label}</span><br/>{text}</p>)}</div>;
 }else if(action.type==='group_tiles'||action.type==='start_video'){
  body=<div className="cmp-card-text"><div className="cmp-card-sub">{action.tileIds.length} {action.tileIds.length===1?'card':'cards'}</div>{action.title}</div>;
 }else body=<div className={cn('cmp-card-text',action.type==='set_description'&&'long')}>{action.text}</div>;
 return <div className={cn('cmp-card',card.state)}>
  <div className="cmp-card-h"><CardIcon action={action}/><span>{cardTitle(action)}{action.type==='draft_scenes'?` · ${action.scenes.length}`:''}</span></div>
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
     {(!timeline||stage)&&action.type!=='set_sketch'&&<button type="button" className="btn ghost sm" aria-pressed={preview} onClick={()=>setPreview(!preview)}><Icon name={preview?'EyeOff':'Eye'} size={14}/>{preview?'Hide preview':'Preview'}</button>}
     {card.state==='undone'&&<span className="cmp-faint">Undone</span>}</>}
  </div>
  {error&&<div className="cmp-card-err" role="alert"><Icon name="TriangleAlert" size={13}/><span>{error}</span></div>}
  {confirm&&scenes&&<ReplaceScenes scenes={scenes} action={confirm==='apply'?'Applying these':'Undoing this'} undoLine={confirm==='apply'?'You can undo it from this card.':'You can apply it again from this card.'}
   onKeep={()=>setConfirm(null)} onReplace={()=>{const which=confirm;setConfirm(null);void run(which==='apply'?onApply:onUndo);}}/>}
 </div>;
}
