import {Fragment,useState} from 'react';
import {videoTabs,type VideoTab} from '../routes';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {Button,Dialog,Ed,Icon,IconButton,Menu,Tooltip,cn,useToast,type IconName,type MenuItem} from '../ui';
import {agentPrompt} from '../agent-prompt';
import {TAB_LABEL,previousTab,tabLock,tabState,type ContinueButton,type LockFacts,type TabFacts,type TabLock} from './rules';
import {fmtDate} from '../format';

const STATE_WORDS={done:'Done',next:'Next step',open:undefined,current:undefined,locked:undefined} as const;

/**
 * The video's header, laid out like Borumi's project header (48px): the title centred (click to rename) with the stage after it,
 * like Borumi's "Edited" note; on the right the date, the editor's undo, redo and history (on Edit), and the video's one menu ("…"),
 * which moves it to another stage or deletes it (asking first). The steps are in the bar at the bottom (`Foot`).
 */
export function Header({video,tab,onTitle,onStage,onDelete}:{video:Video;tab:VideoTab;onTitle(title:string):void;onStage(stage:VideoStage):void;onDelete():void}){
 const [asking,setAsking]=useState(false);
 const toast=useToast();
 // Hands this video to the person's own agent (Settings › Your AI agent connects it).
 const copyPrompt=()=>{navigator.clipboard?.writeText(agentPrompt(video,tab)).then(()=>toast('Copied. Paste it into Claude Code or Codex.'),()=>toast("Couldn't copy the prompt.",{refused:true}));};
 const items:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map((stage):MenuItem=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>onStage(stage)})),'-',{label:'Copy prompt for your AI agent',icon:'copy',fn:copyPrompt},'-',{label:'Delete video',icon:'delete',danger:true,fn:()=>setAsking(true)}];
 return <div className="ws-top">
  <div className="ws-top-l" id="ws-top-left"/>
  <div className="ws-top-c">
   <Tooltip text="Click to rename the video"><Ed className="ws-title" value={video.title} ph="Video title" onChange={title=>{if(title.trim())onTitle(title.trim());}}/></Tooltip>
   <span className="ws-stage">{STAGE_LABEL[video.stage]}</span>
  </div>
  <div className="ws-top-r">
   {video.stage!=='published'&&video.publishDate&&<span className="faint small row" style={{gap:5}}><Icon name="calendar" size={13}/>{fmtDate(video.publishDate)}</span>}
   {/* On Edit the editor puts undo, redo and history here. */}
   {tab==='edit'&&<div id="ws-edit-tools" className="ws-edit-tools" role="group" aria-label="Undo and history"/>}
   <Menu align="right" button={toggle=><IconButton icon="more" label="More for this video" onClick={toggle}/>} items={items}/>
  </div>
  <Dialog open={asking} onClose={()=>setAsking(false)} title="Delete this video?" description={`“${video.title}” and its plan and board are removed. ${video.recorderProjectId?'Its recording stays in the recorder. ':''}You can undo it for a few seconds.`}
   footer={<><Button onClick={()=>setAsking(false)}>Keep it</Button><Button variant="danger" onClick={()=>{setAsking(false);onDelete();}}>Delete video</Button></>}/>
 </div>;
}

const STEP_ICON:Record<VideoTab,IconName>={board:'research',plan:'script',record:'camera',edit:'cut',publish:'upload'};

/**
 * The bottom bar, laid out like Borumi's step bar (64px): "Back to" the previous step on the left, the steps in the middle (a round
 * icon well and the name, joined by chevrons; the current one is filled) and Continue on the right, naming the step it opens.
 * Continue is the primary once the step's job is done; when it cannot go yet it is disabled and the plain line beside it says why.
 * A locked step shows a lock; choosing it calls `onLocked`, which goes to the step that unlocks it.
 */
export function Foot({video,tab,facts,onTab,onLocked,next}:{video:Video;tab:VideoTab;facts:TabFacts&LockFacts;onTab(tab:VideoTab):void;onLocked(tab:VideoTab,lock:TabLock):void;next?:ContinueButton&{run():void}}){
 const back=previousTab(tab);
 return <div className="ws-foot">
  <div className="l">{back&&<button type="button" className="ws-back" onClick={()=>onTab(back)}><Icon name="back" size={16}/>Back to {TAB_LABEL[back]}</button>}</div>
  <nav className="ws-steps" aria-label="Video steps">{videoTabs.map((key,index)=>{
   const state=tabState(key,tab,facts);
   const lock=state==='locked'?tabLock(key,facts):undefined;
   const link=<a href={`#/video/${encodeURIComponent(video.id)}/${key}`} className={cn('ws-step',tab===key&&'on',state)} data-state={state} aria-current={tab===key?'page':undefined}
    aria-disabled={lock?true:undefined} aria-description={lock?.reason??STATE_WORDS[state]}
    onClick={event=>{if(key===tab)return;event.preventDefault();if(lock)onLocked(key,lock);else onTab(key);}}>
    <span className="well"><Icon name={lock?'locked':STEP_ICON[key]} size={16} className={lock?'lk':''}/></span>{TAB_LABEL[key]}</a>;
   return <Fragment key={key}>{index>0&&<Icon name="forward" size={16} className="ws-step-sep"/>}{lock?<Tooltip text={lock.reason}>{link}</Tooltip>:link}</Fragment>;
  })}</nav>
  <div className="r">
   {next?.reason&&<span id="ws-foot-why" className="sr-only">{next.reason}</span>}
   {next&&(()=>{
    const button=<button type="button" className={cn('btn',next.primary&&'primary')} disabled={next.disabled} aria-describedby={next.reason?'ws-foot-why':undefined} onClick={next.run}>{next.label}<Icon name="forward" size={15}/></button>;
    // Why it cannot go yet shows on hover, as Borumi keeps the bar to Back, the steps and Continue.
    return next.reason?<Tooltip text={next.reason} side="top"><span className="ws-next">{button}</span></Tooltip>:button;
   })()}
  </div>
 </div>;
}
