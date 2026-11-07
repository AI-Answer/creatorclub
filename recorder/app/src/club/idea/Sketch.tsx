import {createContext,useContext,useEffect,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import type {OnePager,ResearchTile,Video,Workspace} from '../../../shared/club';
import {BrandLogo} from '../../BrandLogo';
import {AI_CONNECT_HINT,useAiAvailable,useAiCheck} from '../ai-status';
import {clubFetch,clubUpload,errorMessage} from '../api';
import type {ConnectedAi} from '../useAi';
import type {Plan} from '../usePlan';
import {Button,Icon,cn,useToast,type IconName} from '../ui';
import {failureMessage,watchJob,type StartedJob} from '../jobs';
import {askClaude,newAskId,onAskSettled,onAskStarted} from '../workspace/ask-claude';
import {GIVE_UP_MS,SETTLE_MS,SHOWN_MS,WORK_TEXT,seeSettled,seeStarted,seeValue,startWork,type SketchWork,type ToolKind} from './sketch-work';
import {addFromText} from '../workspace/Board';
import {emptyOnePager} from './onepager';
import {Clamp,Field} from './sketch-fields';
import {SketchThumbnail} from './SketchThumbnail';
import './sketch.css';

/*
 * A video's sketch: the one page to get right before any script, laid out as one screen. On the left the video as a viewer meets it
 * (the thumbnail, the title under it) and why it will work; on the right the logline and the talking points. Long text shows a few
 * lines and opens where it is when clicked. It starts from one sentence; Suggest writes it with the connected AI, and the sketch
 * fills in on screen as it is written.
 */

const POINT_HINTS=['Show the promise and give viewers a reason to stay.','What started it.','How it works, in a few clear steps.','What changes halfway through.','One thing viewers can try themselves.','Pay off the promise and close.'];
/** The three whys, in the order the sketch writes them: proof from your channel, proof from another, why viewers click. */
const WHYS:readonly {icon:IconName;hint:string}[]=[{icon:'channel',hint:'Proof from your own videos'},{icon:'trending',hint:'Proof from another channel'},{icon:'preview',hint:'Why viewers will click'}];
const URL=/https?:\/\/[^\s<>"']+/g;
/** The most talking points a sketch holds (`onepagerShape`). */
const MAX_POINTS=20;

/** The sketch has something in it: one written part is enough to show the page instead of the start. */
export function sketchStarted(sketch:OnePager|null|undefined):boolean{
 if(!sketch)return false;
 return [sketch.title,sketch.backupTitle,sketch.logline,sketch.thumbnail.headline,sketch.thumbnail.visual,sketch.thumbnail.closer,...sketch.whys,...sketch.skeleton.map(beat=>beat.line)].some(text=>text?.trim());
}

/** A sketch while it is written: any part may not be there yet. */
type Draft={title?:string;backupTitle?:string;logline?:string;thumbnail?:{headline?:string;visual?:string;closer?:string};whys?:string[];skeleton?:{label?:string;line?:string}[]};
const asDraft=(value:unknown):Draft=>value&&typeof value==='object'?value as Draft:{};

/** Text that is written, or a quiet bar where it is still coming. */
function Coming({text,className,width}:{text?:string;className?:string;width?:string}){
 return text?<div className={cn('sk-read',className)}>{text}</div>:<div className="sk-wait" style={{width:width??'85%'}}/>;
}


export function Sketch({video,plan,ai,hasScenes,onTitle,onBoardChanged,onNext}:{video:Video;plan:Plan;ai:ConnectedAi;hasScenes:boolean;
 onTitle(title:string):void;onBoardChanged():void;onNext():void}){
 const sketch=plan.onepager,job=plan.onepagerJob,running=job.phase==='starting'||job.phase==='running';
 // A new title from Suggest or from Ask Claude becomes the video's title, so there is one title everywhere.
 const seen=useRef<string|undefined>(undefined);
 useEffect(()=>{
  const title=sketch?.title.trim()??'';
  if(seen.current!==undefined&&title&&title!==seen.current&&title!==video.title.trim())onTitle(title);
  seen.current=title;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[sketch?.title]);
 const partial=job.phase==='running'?job.partial:undefined;
 // While Suggest writes (the first time or again), the sketch fills in as it arrives, from the click: before the first words, the
 // empty slide shows where they will go (the page's own line above says it is writing, with Stop).
 if(running)return <div className="sk-root"><StreamingSlide draft={asDraft(partial)}/></div>;
 if(!sketchStarted(sketch))return <Start video={video} plan={plan} ai={ai} onTitle={onTitle} onBoardChanged={onBoardChanged}/>;
 return <AiBrand.Provider value={ai.brand}><div className="sk-root"><SketchSlide video={video} sketch={sketch!} plan={plan} hasScenes={hasScenes} onTitle={onTitle} onNext={onNext}/></div></AiBrand.Provider>;
}

/** The blank page: one sentence, anything else that helps, then Suggest (or fill it in by hand). */
function Start({video,plan,ai,onTitle,onBoardChanged}:{video:Video;plan:Plan;ai:ConnectedAi;onTitle(title:string):void;onBoardChanged():void}){
 const available=useAiAvailable(),toast=useToast();
 const [idea,setIdea]=useState(video.title),[more,setMore]=useState(''),[busy,setBusy]=useState(false);
 const suggest=async()=>{
  const sentence=idea.trim();
  if(!sentence||busy)return;
  setBusy(true);
  try{
   if(sentence!==video.title.trim())onTitle(sentence);
   const extra=more.trim();
   if(extra){
    // Links become their own cards (a YouTube or Instagram link is a video to adapt); the words become one note, so nothing is lost.
    const add=(body:{kind:ResearchTile['kind'];url?:string;text?:string})=>clubFetch<ResearchTile>(`/videos/${encodeURIComponent(video.id)}/research`,{body});
    for(const url of new Set(extra.match(URL)??[]))await addFromText(add,url);
    if(extra.replace(URL,'').trim())await add({kind:'note',text:`# The idea\n\n${sentence}\n\n${extra}`});
    onBoardChanged();
   }
   plan.writeOnepager();
  }catch(reason){toast(errorMessage(reason,"Couldn't add that to the board."));}
  finally{setBusy(false);}
 };
 const byHand=()=>plan.editOnepager({...emptyOnePager(),title:idea.trim()||video.title});
 return <div className="bs-root"><div className="bs-col sk-start">
  <h2 className="sk-start-h">What's this video about?</h2>
  <p className="sk-start-p">One sentence is enough. {ai.name} sketches the title, thumbnail, logline and talking points from it.</p>
  <Field className="sk-start-idea" value={idea} label="The idea in one sentence" placeholder="e.g. Claude does my receipts automatically" onChange={setIdea}
   onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void suggest();}}}/>
  <Field className="sk-start-more" value={more} label="Anything else that helps" placeholder="Anything else that helps (optional): your rambling, notes, links, tweets, or a video you want to adapt." onChange={setMore}/>
  <div className="sk-start-a">
   <Button variant="primary" disabled={!available||!idea.trim()||busy} title={!available?AI_CONNECT_HINT:undefined} onClick={()=>void suggest()}><BrandLogo brand={ai.brand} size={16}/>{busy?'Starting…':'Suggest a sketch'}</Button>
   <button type="button" className="sk-link" onClick={byHand}>or fill it in yourself</button>
  </div>
  {!available&&<p className="bs-note">{AI_CONNECT_HINT}</p>}
 </div></div>;
}

type ToolItem={label:string;ask:string;icon:IconName;tool:ToolKind};
const REWRITE={label:'Rewrite',icon:'auto-edit',tool:'rewrite'} as const,SHORTER={label:'Shorter',icon:'text-smaller',tool:'shorter'} as const;

/**
 * Quick changes Claude makes to one part, shown while the pointer or focus is on it. Each is a message to Ask Claude, which applies it with
 * Undo. From the click until the change lands, the part says so in their place: working, a choice to make in the chat, or done.
 */
function Tools({part,items,work,onAsk}:{part:string;items:readonly ToolItem[];work:SketchWork|null;onAsk(part:string,item:ToolItem):void}){
 if(work?.part===part)return <WorkStatus work={work}/>;
 const busy=!!work&&(work.phase==='working'||work.phase==='settling');
 return <div className="sk-tools" role="group" aria-label="Change with Claude">{items.map(item=><button key={item.label} type="button" disabled={busy} title={busy?'Claude is changing another part':undefined} onClick={()=>onAsk(part,item)}><Icon name={item.icon} size={13}/>{item.label}</button>)}</div>;
}

/** The AI that answers in Ask Claude: its mark, breathing, is the sketch's "working" sign. */
const AiBrand=createContext<'claude'|'chatgpt'>('claude');

/** Where the tools were: what is happening to this part. */
function WorkStatus({work,inline}:{work:SketchWork;inline?:boolean}){
 const brand=useContext(AiBrand),text=WORK_TEXT[work.tool];
 const working=work.phase==='working'||work.phase==='settling';
 const [icon,label]:[IconName,string]=work.phase==='choose'?['companion','Pick one in Ask Claude']:work.phase==='changed'?['done',text.changed]:work.phase==='failed'?['warning',"Couldn't change it"]:['loading',text.working];
 return <div className={cn('sk-status',`is-${work.phase}`,inline&&'is-inline')} role="status">{working?<BrandLogo brand={brand} size={14} working/>:<Icon name={icon} size={13}/>}{label}</div>;
}

/**
 * Other titles, picked where the title is: five from the connected AI, listed under the title. One click uses one; the list closes. While
 * they are written, the title's label says so, with the AI's mark breathing.
 */
function useTitleIdeas(videoId:string){
 const [state,setState]=useState<{phase:'loading'|'ready';titles?:string[]}|null>(null),toast=useToast(),abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 const start=async()=>{
  abort.current?.abort();const controller=new AbortController();abort.current=controller;
  setState({phase:'loading'});
  try{const {titles}=await clubFetch<{titles:string[]}>(`/videos/${encodeURIComponent(videoId)}/title-ideas`,{method:'POST',body:{},signal:controller.signal});setState({phase:'ready',titles});}
  catch(reason){if(!controller.signal.aborted){setState(null);toast(errorMessage(reason,"Couldn't get other titles."));}}
 };
 return {state,start,close:()=>{abort.current?.abort();setState(null);}};
}

function TitleChoices({titles,onUse,onClose}:{titles:string[];onUse(title:string):void;onClose():void}){
 useEffect(()=>{const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 return <div className="sk-choices" role="listbox" aria-label="Other titles">
  {titles.map(title=><button key={title} type="button" role="option" aria-selected={false} className="sk-choice" onClick={()=>onUse(title)}><span>{title}</span><span className="sk-choice-use">Use</span></button>)}
  <button type="button" className="sk-choices-close" onClick={onClose}>Keep mine</button>
 </div>;
}

/**
 * One part of the sketch, the same way everywhere: a small label, its actions as quiet icons beside it (shown on hover or focus), then
 * the part itself. While one of its changes runs, what is happening shows there instead of the icons.
 */
function Section({part,label,work,actions,className,children}:{part?:string;label:string;work?:SketchWork|null;actions?:readonly {label:string;icon:IconName;run():void}[];className?:string;children:ReactNode}){
 const mine=!!part&&work?.part===part,busy=!!work&&(work.phase==='working'||work.phase==='settling');
 return <section className={cn('sk-section',className)}>
  <header className="sk-head"><h3 className="sk-label">{label}</h3>
   {mine?<WorkStatus work={work!} inline/>:actions?.length?<span className="sk-head-a">{actions.map(a=><button key={a.label} type="button" className="sk-act" disabled={busy} title={busy?'Claude is changing another part':undefined} onClick={a.run}><Icon name={a.icon} size={13}/>{a.label}</button>)}</span>:null}
  </header>
  {children}
 </section>;
}

/** The one quick change under way on the sketch, followed from the click to the new words. */
function useSketchWork(valueOf:(part:string)=>string){
 const [work,setWork]=useState<SketchWork|null>(null);
 const now=work?valueOf(work.part):'';
 useEffect(()=>{setWork(current=>seeValue(current,now));},[now]);
 useEffect(()=>onAskSettled(settled=>setWork(current=>seeSettled(current,settled))),[]);
 useEffect(()=>onAskStarted(detail=>setWork(current=>seeStarted(current,detail.requestId,detail.parentRequestId))),[]);
 useEffect(()=>{
  if(!work)return;
  const ms=work.phase==='changed'||work.phase==='failed'?SHOWN_MS:work.phase==='settling'?SETTLE_MS:GIVE_UP_MS;
  const timer=setTimeout(()=>setWork(current=>current===work?null:current),ms);
  return()=>clearTimeout(timer);
 },[work]);
 const ask=(part:string,item:ToolItem)=>{
  const next=startWork(work,part,item.tool,valueOf(part));
  if(next===work)return;
  const requestId=newAskId();setWork(next&&{...next,requestId});askClaude(item.ask,requestId);
 };
 /** The class a part gets while it changes, so its words show it. */
 const state=(part:string)=>work?.part===part?`is-${work.phase}`:undefined;
 return {work,ask,state};
}


/** The sketch while it is written: what has arrived reads as text, the rest waits as quiet bars in its place. */
function StreamingSlide({draft}:{draft:Draft}){
 const points=draft.skeleton??[],whys=draft.whys??[];
 return <div className="sk-slide is-streaming" role="status" aria-label="Sketching your video">
  <div className="sk-col">
   <div className="sk-thumb" aria-label="Thumbnail"><div className="sk-thumb-empty"><Icon name="image" size={20}/></div></div>
   {draft.thumbnail?.headline&&<div className="bs-text sk-thumb-words sk-read">{draft.thumbnail.headline}</div>}
   <Coming className="sk-caption" text={draft.thumbnail?.visual} width="70%"/>
   <Coming className="sk-title" text={draft.title}/>
   <ul className="sk-proof" aria-label="Why it will work">{WHYS.map((why,index)=><li key={index}><Icon name={why.icon} size={14}/><Coming text={whys[index]}/></li>)}</ul>
  </div>
  <div className="sk-col">
   <Coming className="sk-logline" text={draft.logline}/>
   <ol className="sk-points" aria-label="Talking points">{(points.length?points:Array.from({length:6},()=>({}))).map((beat:{label?:string;line?:string},index)=><li key={index} className="sk-point">
    <div className="sk-point-label">{beat.label?<span className="sk-read">{beat.label}</span>:<span className="sk-wait" style={{width:'70%',marginLeft:'auto'}}/>}</div>
    <Coming className="sk-point-line" text={beat.line}/>
   </li>)}</ol>
  </div>
 </div>;
}

function SketchSlide({video,sketch,plan,hasScenes,onTitle,onNext}:{video:Video;sketch:OnePager;plan:Plan;hasScenes:boolean;onTitle(title:string):void;onNext():void}){
 const edit=(next:Partial<OnePager>)=>plan.editOnepager({...sketch,...next});
 const save=()=>plan.flushOnepager();
 const thumb=(key:'headline'|'visual'|'closer',text:string)=>edit({thumbnail:{...sketch.thumbnail,[key]:text}});
 const points=sketch.skeleton;
 const [focusPoint,setFocusPoint]=useState<number|null>(null);
 useEffect(()=>{
  if(focusPoint===null)return;
  const target=document.getElementById(`sk-point-${focusPoint}`);
  target?.focus();
  if(target instanceof HTMLTextAreaElement)target.setSelectionRange(target.value.length,target.value.length);
  setFocusPoint(null);
 },[focusPoint]);
 const {work,ask,state}=useSketchWork(part=>part==='thumbnail'?`${sketch.thumbnail.headline}\n${sketch.thumbnail.visual}`:part==='title'?video.title:part==='logline'?sketch.logline:part.startsWith('point-')?points[Number(part.slice(6))]?.line??'':'');
 const setPoint=(index:number,part:{label?:string;line?:string})=>edit({skeleton:points.map((beat,at)=>at===index?{...beat,...part}:beat)});
 const addPoint=(at:number)=>{if(points.length>=MAX_POINTS)return;edit({skeleton:[...points.slice(0,at),{label:'',line:''},...points.slice(at)]});setFocusPoint(at);};
 const pointKey=(event:KeyboardEvent<HTMLTextAreaElement>,index:number)=>{
  const area=event.currentTarget;
  if(event.key==='Enter'&&!event.shiftKey&&area.selectionStart===area.value.length){event.preventDefault();addPoint(index+1);}
  if(event.key==='Backspace'&&!area.value&&!points[index].label.trim()&&points.length>1){event.preventDefault();edit({skeleton:points.filter((_,at)=>at!==index)});setFocusPoint(Math.max(0,index-1));}
 };
 const [studio,setStudio]=useState(false),[titleFresh,setTitleFresh]=useState(false);
 const titles=useTitleIdeas(video.id),ai=useContext(AiBrand);
 return <div className="sk-slide">
  <div className="sk-col">
   <Section label="Thumbnail" className={state('thumbnail')}>
    <SketchThumbnail video={video} sketch={sketch} open={studio} onOpen={()=>setStudio(true)} onClose={()=>setStudio(false)} onThumb={thumb} onSave={save} onRefresh={()=>void plan.refresh()}/>
   </Section>
   <Section label="Title" className={cn(titles.state?.phase==='loading'&&'is-working',titleFresh&&'is-changed')} actions={titles.state?.phase==='loading'?undefined:[{label:'Other titles',icon:'idea',run:()=>void titles.start()}]}>
    {titles.state?.phase==='loading'&&<div className="sk-status is-inline sk-status-under" role="status"><BrandLogo brand={ai} size={14} working/>Finding other titles…</div>}
    <Field className="sk-title" value={video.title} label="Title" placeholder="Your title" onCommit={text=>{const title=text.trim();if(title&&title!==video.title.trim()){onTitle(title);edit({title});}}}/>
    {titles.state?.phase==='ready'&&titles.state.titles&&<TitleChoices titles={titles.state.titles} onClose={titles.close} onUse={title=>{const now=video.title;onTitle(title);edit({title,backupTitle:now});titles.close();setTitleFresh(true);setTimeout(()=>setTitleFresh(false),2600);}}/>}
   </Section>
   <Section label="Why it will work">
    <ul className="sk-proof" aria-label="Why it will work">{WHYS.map((why,index)=><li key={index} className="sk-block" title={why.hint}><Icon name={why.icon} size={14}/>
     <Clamp lines={2} value={sketch.whys[index]??''} label={why.hint} placeholder={why.hint} onChange={text=>edit({whys:sketch.whys.map((one,at)=>at===index?text:one) as OnePager['whys']})} onCommit={save}/>
    </li>)}</ul>
   </Section>
  </div>
  <div className="sk-col">
   <Section part="logline" label="The video in one line" work={work} className={state('logline')} actions={[{label:'Rewrite',icon:'auto-edit',run:()=>ask('logline',{...REWRITE,ask:'Rewrite the logline so it is sharper.'})},{label:'Shorter',icon:'text-smaller',run:()=>ask('logline',{...SHORTER,ask:'Make the logline shorter (under 20 words).'})}]}>
    <Clamp lines={4} className="sk-logline" value={sketch.logline} label="Logline" placeholder="The whole video in one sentence" onChange={logline=>edit({logline})} onCommit={save}/>
   </Section>
   <Section label="Talking points">
   <ol className="sk-points" aria-label="Talking points">{points.map((beat,index)=><li key={index} className={cn('sk-point sk-block',state(`point-${index}`))}>
    <Field className="sk-point-label" value={beat.label} label={`Talking point ${index+1} name`} placeholder={`Point ${index+1}`} onChange={label=>setPoint(index,{label})} onCommit={save}/>
    <Clamp lines={2} id={`sk-point-${index}`} className="sk-point-line" value={beat.line} label={`Talking point ${index+1}`} placeholder={POINT_HINTS[index]??'One plain sentence'}
     onChange={line=>setPoint(index,{line})} onCommit={save} onKeyDown={event=>pointKey(event,index)}/>
    {(beat.line.trim()||work?.part===`point-${index}`)&&<Tools part={`point-${index}`} work={work} onAsk={ask} items={[{...REWRITE,ask:`Rewrite talking point ${index+1} so it is clearer.`},{...SHORTER,ask:`Make talking point ${index+1} shorter (under 12 words).`}]}/>}
   </li>)}</ol>
   {points.length<MAX_POINTS&&<button type="button" className="sk-add" onClick={()=>addPoint(points.length)}><Icon name="add" size={14}/>Add a point</button>}
   </Section>
   <div className="sk-next">
    <Button variant="primary" onClick={onNext}>{hasScenes?'Open the script':'Write the script'}<Icon name="next" size={16}/></Button>
    {!hasScenes&&<span className="sk-next-p">{points.length} {points.length===1?'point becomes a scene':'points become scenes'}</span>}
   </div>
  </div>
 </div>;
}
