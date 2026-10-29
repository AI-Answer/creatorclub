import type {TrendingEntry} from '../../../shared/club';
import {creatorName,fmtDays,fmtNum} from '../format';
import {Avatar,Icon,MultChip,Thumb} from '../ui';

/**
 * One video from Working now. The whole card opens its breakdown. `reason` is the sentence from the server ("Because you picked Claude"), shown when given.
 * `compact` drops the buttons, for the Overview strip. `inIdeas` turns the idea button into a way to open the idea that was already made.
 */
export function TrendCard({item,isNew,reason,compact,hasBreakdown,inIdeas,onBreak,onIdea}:{item:TrendingEntry;isNew?:boolean;reason?:string|null;compact?:boolean;hasBreakdown?:boolean;inIdeas?:boolean;onBreak(item:TrendingEntry):void;onIdea?(item:TrendingEntry):void}){
 const who=creatorName(item.channel);
 return <div className="card trend hov" onClick={()=>onBreak(item)} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onBreak(item);}}>
  <Thumb videoId={item.videoId} seed={item.videoId} chip={<MultChip m={item.mult} who={who} onThumb dash/>}>
   {isNew&&<span className="chip solid br">New</span>}
  </Thumb>
  <div className="meta"><Avatar name={item.channel} size="xs"/><span className="ellipsis grow">{item.channel}</span>{item.kind==='followed'&&<span className="chip outline" style={{height:20}}>Followed</span>}</div>
  <div className="tt clamp2">{item.title}</div>
  <div className="stats"><span title="Total views"><Icon name="Eye" size={13}/><b>{fmtNum(item.views)}</b></span><span title="Views per day since it went up"><Icon name="TrendingUp" size={13}/><b>{fmtNum(item.vpd)}</b>/day</span><span><Icon name="Clock" size={13}/>{fmtDays(item.ageDays)}</span></div>
  {reason&&<div className="reason"><Icon name="Sparkles" size={12}/>{reason}</div>}
  {!compact&&<div className="foot" onClick={event=>event.stopPropagation()}>
   <button type="button" className="btn sm" onClick={()=>onBreak(item)}><Icon name={hasBreakdown?'FileText':'Sparkles'} size={14}/>{hasBreakdown?'Open breakdown':'Break down'}</button>
   <button type="button" className="btn sm icon-only" style={{flex:'none'}} onClick={()=>onIdea?.(item)} aria-label={inIdeas?'In your ideas':'Make it an idea'} title={inIdeas?'In your ideas. Open it':'Make it an idea'}>
    <Icon name={inIdeas?'Check':'Lightbulb'} size={15} style={inIdeas?{color:'var(--cc-ok)'}:undefined}/>
   </button>
  </div>}
 </div>;
}
