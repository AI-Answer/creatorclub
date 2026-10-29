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
  <a className="btn ghost sm icon-only" href={routeHash(back)} aria-label="Back" title="Back"><Icon name="ArrowLeft" size={16}/></a>
  <div className="crumb"><a href={routeHash(back)} title="Back to where you came from">Videos</a><Icon name="ChevronRight" size={14}/></div>
  <Ed className="ws-title" value={video.title} ph="Video title" onChange={title=>{if(title.trim())onTitle(title.trim());}}/>
  <Menu button={toggle=><button type="button" className="btn ghost sm" onClick={toggle} style={{padding:'0 4px'}} aria-label="Change stage"><StagePill stage={video.stage}/><Icon name="ChevronDown" size={13}/></button>} items={items}/>
  <span className="grow"></span>
  <nav className="tabs" aria-label="Video steps">{videoTabs.map(key=><a key={key} href={`#/video/${encodeURIComponent(video.id)}/${key}`} className={tab===key?'on':''} aria-current={tab===key?'page':undefined} onClick={event=>{if(key!==tab){event.preventDefault();onTab(key);}}}>
   {tabDone(key,facts)&&<Icon name="Check" size={13} className="ck" stroke={2.6}/>}{TAB_LABEL[key]}</a>)}</nav>
  <span className="grow"></span>
  {video.stage!=='published'&&video.publishDate&&<span className="faint small row" style={{gap:5}}><Icon name="Calendar" size={13}/>{fmtDate(video.publishDate)}</span>}
  <Menu align="right" button={toggle=><button type="button" className="btn ghost sm icon-only" onClick={toggle} aria-label="More"><Icon name="MoreHorizontal" size={16}/></button>}
   items={[{label:'Copy link to this video',icon:'Link',fn:()=>void navigator.clipboard?.writeText(window.location.href).catch(()=>{})}]}/>
 </div>;
}

/** The scenes of the video, the same on every tab. A failed read says so; an empty outline says what to do. */
export function Strip({scenes,focusId,tab,onPick,onRetry}:{scenes:VideoScenes;focusId:string|null;tab?:VideoTab;onPick(sceneId:string):void;onRetry():void}){
 if(scenes.status==='loading')return <div className="strip"><span className="lab"><Icon name="Layers" size={14}/>Scenes</span></div>;
 if(scenes.status==='unknown')return <div className="strip"><ErrorLine message="Couldn't read the scenes." onRetry={onRetry}/></div>;
 const list=scenes.scenes;
 if(!list.length)return <div className="strip"><span className="lab"><Icon name="Layers" size={14}/>Scenes</span><span className="small muted">{tab==='board'?'Gather references here, then draft scenes from the board.':'No scenes yet. Draft them from the board.'}</span></div>;
 const progress=toProgress(list);
 return <div className="strip" role="list" aria-label="Scenes">
  <span className="lab"><Icon name="Layers" size={14}/>{scenesLine(list,clockTime)}</span>
  {list.map((scene,index)=><button key={scene.id} role="listitem" type="button" className={cn('sc',focusId===scene.id&&'on')} onClick={()=>onPick(scene.id)} title={scene.title}>
   <span className="n">{index+1}</span><span className="t">{scene.title}</span><SceneStatus scene={progress[index]}/></button>)}
 </div>;
}

/** The bottom bar: Back on the left, the step dots, Continue on the right (primary only once the tab's job is done). */
export function Foot({tab,backLabel,back,facts,onTab,next}:{tab:VideoTab;backLabel:string;back:Route;facts:TabFacts;onTab(tab:VideoTab):void;next?:{label:string;run():void;disabled:boolean;primary:boolean}}){
 const prev=previousTab(tab),after=nextTab(tab);
 return <div className="ws-foot">
  <div className="l">{prev?<button type="button" className="btn ghost" onClick={()=>onTab(prev)}><Icon name="ChevronLeft" size={15}/>Back to {TAB_LABEL[prev].toLowerCase()}</button>
   :<a className="btn ghost" href={routeHash(back)}><Icon name="ChevronLeft" size={15}/>{backLabel}</a>}</div>
  <nav className="steps" aria-label="Steps">{videoTabs.map((key,index)=>{const done=tabDone(key,facts);return <a key={key} href="#" className={cn(key===tab&&'on',done&&'done')} aria-current={key===tab?'step':undefined}
   onClick={event=>{event.preventDefault();onTab(key);}}><span className="c">{done&&key!==tab?<Icon name="Check" size={11} stroke={2.6}/>:index+1}</span>{TAB_LABEL[key]}</a>;})}</nav>
  <div className="r">{after&&next?<button type="button" className={cn('btn',next.primary&&'primary')} disabled={next.disabled} onClick={next.run}>{next.label}<Icon name="ChevronRight" size={15}/></button>
   :!after?<a className="btn" href={routeHash(back)}>{backLabel}</a>:null}</div>
 </div>;
}
