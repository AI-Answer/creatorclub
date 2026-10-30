import {useState,type KeyboardEvent} from 'react';
import {originLabel,routeHash,videoTabs,type Route,type VideoTab} from '../routes';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {ErrorLine} from '../ErrorLine';
import {toProgress,type VideoScenes} from '../scenes';
import {clockTime} from '../video-plan';
import {Button,Dialog,Ed,Icon,IconButton,Menu,SceneStatus,StagePill,Tooltip,cn,type MenuItem} from '../ui';
import {TAB_LABEL,scenesLine,tabLock,tabState,type ContinueButton,type LockFacts,type TabFacts,type TabLock} from './rules';
import {fmtDate} from '../format';

const STATE_WORDS={done:'Done',next:'Next step',open:undefined,current:undefined,locked:undefined} as const;

/**
 * The header: back to where the video was opened from (named), the title, the stage, the five steps and the date. The steps are the
 * only navigation between steps, and each says where it stands: done (a tick), the current one, the next one, or locked (a lock and,
 * on hover or focus, what unlocks it). A locked step is not a page: choosing it calls `onLocked`, which goes to the step that unlocks it.
 * The stage shows beside the title; the video's one menu ("…") beside it moves it to another stage or deletes it (asking first).
 */
export function Header({video,tab,back,facts,onTitle,onStage,onTab,onLocked,onDelete}:{video:Video;tab:VideoTab;back:Route;facts:TabFacts&LockFacts;onTitle(title:string):void;onStage(stage:VideoStage):void;onTab(tab:VideoTab):void;onLocked(tab:VideoTab,lock:TabLock):void;onDelete():void}){
 const [asking,setAsking]=useState(false);
 const items:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map((stage):MenuItem=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>onStage(stage)})),'-',{label:'Delete video',icon:'delete',danger:true,fn:()=>setAsking(true)}];
 return <div className="ws-top">
  <div className="crumb"><a href={routeHash(back)} aria-label={`Back to ${originLabel(back).toLowerCase()}`}>{originLabel(back)}</a><Icon name="forward" size={14}/></div>
  <Ed className="ws-title" value={video.title} ph="Video title" onChange={title=>{if(title.trim())onTitle(title.trim());}}/>
  <StagePill stage={video.stage}/>
  <Menu button={toggle=><IconButton icon="more" label="More for this video" onClick={toggle}/>} items={items}/>
  <Dialog open={asking} onClose={()=>setAsking(false)} title="Delete this video?" description={`“${video.title}” and its plan and board are removed. ${video.recorderProjectId?'Its recording stays in the recorder. ':''}You can undo it for a few seconds.`}
   footer={<><Button onClick={()=>setAsking(false)}>Keep it</Button><Button variant="danger" onClick={()=>{setAsking(false);onDelete();}}>Delete video</Button></>}/>
  <span className="grow"></span>
  <nav className="tabs" aria-label="Video steps">{videoTabs.map(key=>{
   const state=tabState(key,tab,facts);
   const lock=state==='locked'?tabLock(key,facts):undefined;
   const link=<a key={key} href={`#/video/${encodeURIComponent(video.id)}/${key}`} className={cn(tab===key&&'on',state)} data-state={state} aria-current={tab===key?'page':undefined}
    aria-disabled={lock?true:undefined} aria-description={lock?.reason??STATE_WORDS[state]}
    onClick={event=>{if(key===tab)return;event.preventDefault();if(lock)onLocked(key,lock);else onTab(key);}}>
    {state==='done'&&<Icon name="check" size={13} className="ck" stroke={2.6}/>}{lock&&<Icon name="locked" size={12} className="lk"/>}{TAB_LABEL[key]}{state==='next'&&<span className="nx" aria-hidden/>}</a>;
   return lock?<Tooltip key={key} text={lock.reason}>{link}</Tooltip>:link;
  })}</nav>
  <span className="grow"></span>
  {video.stage!=='published'&&video.publishDate&&<span className="faint small row" style={{gap:5}}><Icon name="calendar" size={13}/>{fmtDate(video.publishDate)}</span>}
 </div>;
}

/** The scenes of the video, shown on Record and Edit only. A failed read says so; an empty outline says what to do. */
export function Strip({scenes,focusId,onPick,onRetry,bottom=false}:{scenes:VideoScenes;focusId:string|null;onPick(sceneId:string):void;onRetry():void;/** On Edit the scenes sit under the timeline, as a row of clips. */bottom?:boolean}){
 const place=bottom?'strip at-bottom':'strip';
 if(scenes.status==='loading')return <div className={place}><span className="lab"><Icon name="scenes" size={14}/>Scenes</span></div>;
 if(scenes.status==='unknown')return <div className={place}><ErrorLine message="Couldn't read the scenes." onRetry={onRetry}/></div>;
 // On Edit only what was recorded is on the timeline, so only that is listed: scenes still to record belong to Record.
 const list=bottom?scenes.scenes.filter(scene=>scene.takes.length>0):scenes.scenes;
 if(!list.length)return <div className={place}><span className="lab"><Icon name="scenes" size={14}/>Scenes</span><span className="small muted">No scenes yet. Plan the scenes first.</span></div>;
 const progress=toProgress(list);
 // The chips are the one scene selector: Tab reaches them and the arrow keys move between them.
 const arrows=(event:KeyboardEvent<HTMLDivElement>)=>{
  const move=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
  if(!move)return;
  const chips=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button.sc')],at=chips.indexOf(document.activeElement as HTMLButtonElement);
  if(at<0)return;
  event.preventDefault();chips[(at+move+chips.length)%chips.length].focus();
 };
 return <div className={place} role="list" aria-label="Scenes" onKeyDown={arrows}>
  <span className="lab"><Icon name="scenes" size={14}/>{bottom?`${list.length} ${list.length===1?'scene':'scenes'} on the timeline`:scenesLine(list,clockTime)}</span>
  {list.map((scene,index)=><button key={scene.id} role="listitem" type="button" className={cn('sc',focusId===scene.id&&'on')} onClick={()=>onPick(scene.id)} title={scene.title}>
   <span className="n">{index+1}</span><span className="t">{scene.title}</span><SceneStatus scene={progress[index]}/></button>)}
 </div>;
}

/**
 * The bottom bar holds the step's way forward only: Continue on the right, naming the step it opens. It is the primary once the
 * step's job is done; when it cannot go yet it is disabled and the plain line beside it says why. Going back is the step rail above
 * (one place per function), so there is no Back button; the last step has no bar at all.
 */
export function Foot({next}:{next?:ContinueButton&{run():void}}){
 if(!next)return null;
 return <div className="ws-foot">
  <div className="l"/>
  <div className="r">
   {next.reason&&<span id="ws-foot-why" className="small muted ws-why">{next.reason}</span>}
   <button type="button" className={cn('btn',next.primary&&'primary')} disabled={next.disabled} aria-describedby={next.reason?'ws-foot-why':undefined} onClick={next.run}>{next.label}<Icon name="forward" size={15}/></button>
  </div>
 </div>;
}
