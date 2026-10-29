import type {TrendingEntry,Video} from '../../../shared/club';
import {ideaSourceVideoId,ideaWhy,isTimely,SKIP_REASONS} from '../ideas';
import {creatorName,fmtMult} from '../format';
import {Icon,Menu,Thumb} from '../ui';
import type {useIdeaActions} from '../useIdeaActions';

export type IdeaActionSet=ReturnType<typeof useIdeaActions>;

/** What a row offers: Start planning (Restore for an idea on hold) and one "…" menu with Later, Skip with a reason and Delete. */
function RowActions({video,actions}:{video:Video;actions:IdeaActionSet}){
 const items=video.hidden
  ?[{label:'Delete idea',icon:'Trash2' as const,danger:true,fn:()=>actions.remove(video)}]
  :[{label:'Later',icon:'Bookmark' as const,fn:()=>void actions.later(video)},'-' as const,{header:'Skip it because…'},...SKIP_REASONS.map(reason=>({label:reason,fn:()=>void actions.skip(video,reason)})),'-' as const,{label:'Delete idea',icon:'Trash2' as const,danger:true,fn:()=>actions.remove(video)}];
 return <>
  {video.hidden
   ?<button type="button" className="btn sm" onClick={()=>void actions.restore(video)}><Icon name="RotateCcw" size={14}/>Restore</button>
   :<button type="button" className="btn sm" onClick={()=>void actions.startPlanning(video)}><Icon name="ArrowRight" size={14}/>Start planning</button>}
  <Menu align="right" label="More about this idea" items={items} button={toggle=><button type="button" className="btn sm ghost icon-only" aria-label="More" title="Later, Skip, Delete" onClick={toggle}><Icon name="MoreHorizontal" size={16}/></button>}/>
 </>;
}

/**
 * An idea on Ideas, one line of a compact list: the title, why it could work in one line and where it came from in small text.
 * `thumb` shows the source video's picture (the list passes it only when the video differs from the row above). The ratings are in the drawer.
 * `trend` is the Working now video it came from. `primary` rows always show their buttons; the others show them under the pointer or when focused.
 */
export function IdeaRow({video,trend,thumb,highlight,primary,actions,onOpen}:{video:Video;trend?:TrendingEntry;thumb:boolean;highlight?:boolean;primary?:boolean;actions:IdeaActionSet;onOpen():void}){
 const source=video.idea?.sources?.[0],why=ideaWhy(video),sourceId=ideaSourceVideoId(video);
 const className=['irow','hov',highlight&&'new',(primary||highlight)&&'always',video.hidden&&'held'].filter(Boolean).join(' ');
 return <div id={`idea-${video.id}`} className={className} onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen();}}>
  <div className="pic">{thumb&&<Thumb videoId={sourceId} seed={video.id}/>}</div>
  <div className="main">
   <div className="tt clamp2">{video.title}{highlight&&<span className="itag">New</span>}{isTimely(video)&&<span className="itag warm">Timely</span>}</div>
   {why&&<div className="why ellipsis">{why}</div>}
   {(source||video.idea?.dropReason)&&<div className="src">
    {source&&<><Icon name={sourceId?'Youtube':'Link'} size={12}/><span className="ellipsis">{source.label}{trend&&trend.mult!==null&&trend.mult>0?` · ${fmtMult(trend.mult)} ${creatorName(trend.channel)}'s usual`:''}</span></>}
    {video.idea?.dropReason&&<span className="reason-off">Skipped · {video.idea.dropReason}</span>}
   </div>}
  </div>
  <div className="acts" onClick={event=>event.stopPropagation()}><RowActions video={video} actions={actions}/></div>
 </div>;
}
