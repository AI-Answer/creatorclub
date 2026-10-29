import type {TrendingEntry,Video} from '../../../shared/club';
import {ideaLead,ideaSourceVideoId,isTimely} from '../ideas';
import {creatorName} from '../format';
import {Icon,Level,Menu,MultChip,Thumb} from '../ui';
import {SKIP_REASONS} from '../ideas';
import type {useIdeaActions} from '../useIdeaActions';

export type IdeaActionSet=ReturnType<typeof useIdeaActions>;

/** The buttons of an idea: Start planning, Later and Skip with a reason; for a put-off or skipped idea, Restore. */
export function IdeaActions({video,actions}:{video:Video;actions:IdeaActionSet}){
 if(video.hidden)return <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();void actions.restore(video);}}><Icon name="RotateCcw" size={14}/>Restore</button>;
 return <>
  <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();void actions.startPlanning(video);}}><Icon name="ArrowRight" size={14}/>Start planning</button>
  <button type="button" className="btn sm ghost" onClick={event=>{event.stopPropagation();void actions.later(video);}}><Icon name="Bookmark" size={14}/>Later</button>
  <span onClick={event=>event.stopPropagation()}>
   <Menu align="right" label="Why skip it?" button={toggle=><button type="button" className="btn sm ghost" onClick={toggle}><Icon name="EyeOff" size={14}/>Skip</button>}
    items={[{header:'Why skip it?'},...SKIP_REASONS.map(reason=>({label:reason,fn:()=>void actions.skip(video,reason)}))]}/>
  </span>
 </>;
}

/** An idea on Ideas: the picture, the title, its hook or why, the three ratings and where it came from. `trend` is the Working now video it came from, for its outlier chip. */
export function IdeaCard({video,trend,highlight,actions,onOpen}:{video:Video;trend?:TrendingEntry;highlight?:boolean;actions:IdeaActionSet;onOpen():void}){
 const source=video.idea?.sources?.[0],lead=ideaLead(video);
 return <div id={`idea-${video.id}`} className="card idea hov" onClick={onOpen} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen();}}
  style={highlight?{boxShadow:'0 0 0 2px var(--cc-accent), var(--cc-shadow-2)',borderColor:'transparent'}:undefined}>
  <Thumb videoId={ideaSourceVideoId(video)} text={video.title} seed={video.id} chip={trend&&<MultChip m={trend.mult} who={creatorName(trend.channel)} onThumb/>}>
   {trend&&<span className="chip solid br"><Icon name="Youtube" size={12}/>From {creatorName(trend.channel)}</span>}
   {highlight&&<span className="chip b-blue" style={{position:'absolute',top:8,right:8}}>New</span>}
  </Thumb>
  <div className="body">
   {(isTimely(video)||video.idea?.dropReason)&&<div className="row" style={{gap:6}}>{isTimely(video)&&<span className="chip b-amber">Timely</span>}{video.idea?.dropReason&&<span className="chip">Skipped · {video.idea.dropReason}</span>}</div>}
   <div className="tt">{video.title}</div>
   {lead&&(lead.kind==='hook'?<div className="hookq clamp3">{lead.text}</div>:<div className="why clamp3">{lead.text}</div>)}
   <div className="sigs"><Level label="Demand" d={video.idea?.demand}/><Level label="Gap" d={video.idea?.gap}/><Level label="Easy to show" d={video.idea?.show}/></div>
   {source&&<div className="src"><Icon name={ideaSourceVideoId(video)?'Youtube':'Link'} size={13}/><span className="ellipsis">{source.label}</span></div>}
  </div>
  <div className="foot"><IdeaActions video={video} actions={actions}/></div>
 </div>;
}
