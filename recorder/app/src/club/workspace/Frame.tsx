import type {KeyboardEvent} from 'react';
import {routeHash,videoTabs,type Route,type VideoTab} from '../routes';
import {VIDEO_STAGES,type Video,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {ErrorLine} from '../ErrorLine';
import {toProgress,type VideoScenes} from '../scenes';
import {clockTime} from '../video-plan';
import {Ed,Icon,Menu,SceneStatus,StagePill,cn,type MenuItem} from '../ui';
import {TAB_LABEL,nextTab,previousTab,scenesLine,tabDone,type TabFacts} from './rules';
import {fmtDate} from '../format';

/** The header: back to where the video was opened from, the title, the stage, the five tabs (ticked once done) and the date. */
export function Header({video,tab,back,facts,onTitle,onStage,onTab}:{video:Video;tab:VideoTab;back:Route;facts:TabFacts;onTitle(title:string):void;onStage(stage:VideoStage):void;onTab(tab:VideoTab):void}){
 const items:MenuItem[]=[{header:'Move to'},...VIDEO_STAGES.map((stage):MenuItem=>({label:STAGE_LABEL[stage],check:video.stage===stage,fn:()=>onStage(stage)}))];
 return <div className="ws-top">
  <div className="crumb"><a href={routeHash(back)} title="Back to where you came from">Videos</a><Icon name="forward" size={14}/></div>
  <Ed className="ws-title" value={video.title} ph="Video title" onChange={title=>{if(title.trim())onTitle(title.trim());}}/>
  <Menu button={toggle=><button type="button" className="btn ghost sm" onClick={toggle} style={{padding:'0 4px'}} aria-label="Change stage"><StagePill stage={video.stage}/><Icon name="expand" size={13}/></button>} items={items}/>
  <span className="grow"></span>
  <nav className="tabs" aria-label="Video steps">{videoTabs.map(key=><a key={key} href={`#/video/${encodeURIComponent(video.id)}/${key}`} className={tab===key?'on':''} aria-current={tab===key?'page':undefined} onClick={event=>{if(key!==tab){event.preventDefault();onTab(key);}}}>
   {tabDone(key,facts)&&<Icon name="check" size={13} className="ck" stroke={2.6}/>}{TAB_LABEL[key]}</a>)}</nav>
  <span className="grow"></span>
  {video.stage!=='published'&&video.publishDate&&<span className="faint small row" style={{gap:5}}><Icon name="calendar" size={13}/>{fmtDate(video.publishDate)}</span>}
  <Menu align="right" button={toggle=><button type="button" className="btn ghost sm icon-only" onClick={toggle} aria-label="More"><Icon name="more" size={16}/></button>}
   items={[{label:'Copy link to this video',icon:'link',fn:()=>void navigator.clipboard?.writeText(window.location.href).catch(()=>{})}]}/>
 </div>;
}

/** The scenes of the video, shown on Record and Edit only. A failed read says so; an empty outline says what to do. */
export function Strip({scenes,focusId,onPick,onRetry}:{scenes:VideoScenes;focusId:string|null;onPick(sceneId:string):void;onRetry():void}){
 if(scenes.status==='loading')return <div className="strip"><span className="lab"><Icon name="scenes" size={14}/>Scenes</span></div>;
 if(scenes.status==='unknown')return <div className="strip"><ErrorLine message="Couldn't read the scenes." onRetry={onRetry}/></div>;
 const list=scenes.scenes;
 if(!list.length)return <div className="strip"><span className="lab"><Icon name="scenes" size={14}/>Scenes</span><span className="small muted">No scenes yet. Draft them from the board.</span></div>;
 const progress=toProgress(list);
 // The chips are the one scene selector: Tab reaches them and the arrow keys move between them.
 const arrows=(event:KeyboardEvent<HTMLDivElement>)=>{
  const move=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
  if(!move)return;
  const chips=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button.sc')],at=chips.indexOf(document.activeElement as HTMLButtonElement);
  if(at<0)return;
  event.preventDefault();chips[(at+move+chips.length)%chips.length].focus();
 };
 return <div className="strip" role="list" aria-label="Scenes" onKeyDown={arrows}>
  <span className="lab"><Icon name="scenes" size={14}/>{scenesLine(list,clockTime)}</span>
  {list.map((scene,index)=><button key={scene.id} role="listitem" type="button" className={cn('sc',focusId===scene.id&&'on')} onClick={()=>onPick(scene.id)} title={scene.title}>
   <span className="n">{index+1}</span><span className="t">{scene.title}</span><SceneStatus scene={progress[index]}/></button>)}
 </div>;
}

/** The bottom bar has no steps (the tabs above are the only navigation): Back on the left, Continue on the right (primary only once the tab's job is done). */
export function Foot({tab,backLabel,back,onTab,next}:{tab:VideoTab;backLabel:string;back:Route;onTab(tab:VideoTab):void;next?:{label:string;run():void;disabled:boolean;primary:boolean}}){
 const prev=previousTab(tab),after=nextTab(tab);
 return <div className="ws-foot">
  <div className="l">{prev?<button type="button" className="btn ghost" onClick={()=>onTab(prev)}><Icon name="back" size={15}/>Back to {TAB_LABEL[prev].toLowerCase()}</button>
   :<a className="btn ghost" href={routeHash(back)}><Icon name="back" size={15}/>{backLabel}</a>}</div>
  <div className="r">{after&&next?<button type="button" className={cn('btn',next.primary&&'primary')} disabled={next.disabled} onClick={next.run}>{next.label}<Icon name="forward" size={15}/></button>
   :!after?<a className="btn" href={routeHash(back)}>{backLabel}</a>:null}</div>
 </div>;
}
