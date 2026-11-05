import {Fragment,useEffect,useState} from 'react';
import {videoTabs,type VideoTab} from '../routes';
import {VIDEO_STAGES,videoHumanId,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {Button,Dialog,Ed,Icon,IconButton,Menu,Tooltip,cn,useToast,type IconName,type MenuItem} from '../ui';
import {agentPrompt} from '../agent-prompt';
import {TAB_LABEL,workspaceShortcut,previousTab,tabState,tabDone,type ContinueButton,type LockFacts,type TabFacts} from './rules';
import {fmtDate} from '../format';
import './workspace-frame.css';

const STATE_WORDS={done:'Done',next:'Next step',open:undefined,current:undefined} as const;

/**
 * The video's header, laid out like Borumi's project header (48px): a way back to the Video board on the left, the title and muted ID centred (click to rename); on the right the date, the editor's undo, redo and history (on Edit), and the video's one menu ("…"),
 * which moves it to another stage or deletes it (asking first). The steps are in the bar at the bottom (`Foot`).
 */
export function Header({video,tab,onTitle,onStage,onDelete,onHome}:{video:Video;tab:VideoTab;onTitle(title:string):void;onStage(stage:VideoStage):void;onDelete():void;/** Leaves for the Video board the way the other exits do (Record adds a take still under review first). */onHome?():void}){
 const [asking,setAsking]=useState(false);
 const toast=useToast();
 // Hands this video to the person's own agent (Settings › Your AI agent connects it).
 const copyPrompt=()=>{navigator.clipboard?.writeText(agentPrompt(video,tab)).then(()=>toast('Copied. Paste it into Claude Code or Codex.'),()=>toast("Couldn't copy the prompt.",{refused:true}));};
 const items:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map((stage):MenuItem=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>onStage(stage)})),'-',{label:'Copy prompt for your AI agent',icon:'copy',fn:copyPrompt},'-',{label:'Delete video',icon:'delete',danger:true,fn:()=>setAsking(true)}];
 return <div className="ws-top">
  <div className="ws-top-l">
   {/* Every step of a video leads back to the Video board (the Kanban) from here. */}
   <Tooltip text="Back to all your videos"><a href="#/home" className="ws-home" onClick={event=>{if(!onHome)return;event.preventDefault();onHome();}}><Icon name="back" size={16}/>Video board</a></Tooltip>
   <div className="ws-top-slot" id="ws-top-left"/>
  </div>
  <div className="ws-top-c">
   <span className="ws-video-id small faint">{videoHumanId(video)}</span>
   <Tooltip text={`${videoHumanId(video)} · Click to rename the video`}><Ed className="ws-title" value={video.title} ph="Video title" onChange={title=>{if(title.trim())onTitle(title.trim());}}/></Tooltip>
  </div>
  <div className="ws-top-r">
   {video.stage!=='published'&&video.publishDate&&<span className="faint small row" style={{gap:5}}><Icon name="calendar" size={13}/>{fmtDate(video.publishDate)}</span>}
   {/* On Edit the editor puts undo, redo and history here. */}
   {tab==='edit'&&<><div id="ws-edit-tools" className="ws-edit-tools" role="group" aria-label="Undo and history"/><div id="ws-edit-export" className="ws-edit-export"/></>}
   <Menu align="right" button={toggle=><IconButton icon="more" label="More for this video" onClick={toggle}/>} items={items}/>
  </div>
  <Dialog open={asking} onClose={()=>setAsking(false)} title="Delete this video?" description={`“${video.title}” and its plan and board are removed. ${video.recorderProjectId?'Its recording stays in the recorder. ':''}You can undo it for a few seconds.`}
   footer={<><Button onClick={()=>setAsking(false)}>Cancel</Button><Button variant="danger" onClick={()=>{setAsking(false);onDelete();}}>Delete video</Button></>}/>
 </div>;
}

const STEP_ICON:Record<VideoTab,IconName>={idea:'idea',record:'camera',edit:'cut',publish:'upload'};

/**
 * The bottom bar, laid out like Borumi's step bar (64px): "Back to" the previous step on the left, the steps in the middle (a round
 * icon well and the name, joined by chevrons; the current one is filled) and Continue on the right, naming the step it opens.
 * Continue is the primary once the step's job is done; when it cannot go yet it is disabled and the plain line beside it says why.
 * Every step is available at every stage.
 */
export function Foot({video,tab,facts,onTab,next}:{video:Video;tab:VideoTab;facts:TabFacts&LockFacts;onTab(tab:VideoTab):void;next?:ContinueButton&{run():void}}){
 const back=previousTab(tab);
 useEffect(()=>{
  const keys=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'))return;
   const target=event.target instanceof Element?event.target:null;
   // Script's Cmd+Enter creates a scene; text fields and companion prompts keep their keys.
   if(target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
   const action=workspaceShortcut(event);
   if(!action)return;
   event.preventDefault();
   if(action==='continue'){if(next&&!next.disabled)next.run();}
   else if(action!==tab)onTab(action);
  };
  window.addEventListener('keydown',keys);
  return()=>window.removeEventListener('keydown',keys);
 },[next,onTab,tab]);
 return <div className="ws-foot">
  <div className="l">{back&&<button type="button" className="ws-back" onClick={()=>onTab(back)}><Icon name="back" size={16}/>Back to {TAB_LABEL[back]}</button>}</div>
  <nav className="ws-steps" aria-label="Video steps">{videoTabs.map((key,index)=>{
   const state=tabState(key,tab,facts);
   const link=<a href={`#/video/${encodeURIComponent(video.id)}/${key}`} className={cn('ws-step',tab===key&&'on',state)} data-state={state} aria-current={tab===key?'page':undefined}
    aria-description={STATE_WORDS[state]}
    onClick={event=>{if(key===tab)return;event.preventDefault();onTab(key);}}>
    <span className="well"><Icon name={STEP_ICON[key]} size={16}/>{tabDone(key,facts)&&<span className="ws-step-check" aria-label="Done"><Icon name="check" size={10}/></span>}</span>{TAB_LABEL[key]}</a>;
   return <Fragment key={key}>{index>0&&<Icon name="forward" size={16} className="ws-step-sep"/>}<Tooltip text={`${TAB_LABEL[key]} · ⌘${index+1}${STATE_WORDS[state]?` · ${STATE_WORDS[state]}`:''}`} side="top">{link}</Tooltip></Fragment>;
  })}</nav>
  <div className="r">
   {tab==='publish'&&<div id="ws-publish-action" className="ws-publish-action"/>}
   {/* Why it cannot go yet (or what is still missing) is said beside Continue, so nobody has to hover to find out. */}
   {next?.reason&&<span id="ws-foot-why" className="ws-why small muted">{next.reason}</span>}
   {next&&(()=>{
    const button=<button type="button" className={cn('btn',next.primary&&!next.disabled&&'primary')} title={`${next.label} · ⌘↵`} disabled={next.disabled} aria-describedby={next.reason?'ws-foot-why':undefined} onClick={next.run}>{next.label}<Icon name="forward" size={15}/></button>;
    // On a narrow window the line beside it would run into the steps, so there the reason is on hover too.
    return next.reason?<Tooltip text={next.reason} side="top"><span className="ws-next">{button}</span></Tooltip>:button;
   })()}
  </div>
 </div>;
}
