import type {TrendingEntry} from '../../../shared/club';
import {FollowChannel} from '../FollowChannel';
import {creatorName,fmtDays,fmtNum} from '../format';
import {Avatar,Icon,MultChip,Thumb} from '../ui';

/**
 * One video from Working now, at its `rank` in the list. The whole card opens its breakdown, which is its one button; making it an idea is a quiet icon on the picture that shows under the pointer, or when focused.
 * `reason` is the sentence from the server ("Because you picked Claude"), shown small when given. `inIdeas` says so under the title and turns the idea button into a check that opens the idea that was already made.
 */
export function TrendCard({item,rank,isNew,reason,hasBreakdown,inIdeas,onBreak,onIdea}:{item:TrendingEntry;rank:number;isNew?:boolean;reason?:string|null;hasBreakdown?:boolean;inIdeas?:boolean;onBreak(item:TrendingEntry):void;onIdea(item:TrendingEntry):void}){
 const who=creatorName(item.channel);
 return <div className="card trend hov" onClick={()=>onBreak(item)} tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onBreak(item);}}>
  <Thumb videoId={item.videoId} seed={item.videoId} chip={<MultChip m={item.mult} who={who} onThumb dash/>}>
   {isNew&&<span className="chip solid br">New</span>}
  </Thumb>
  <div className="meta"><span className="rank" title={`Number ${rank} of the list`}>{rank}</span><Avatar name={item.channel} size="xs"/><span className="ellipsis grow">{item.channel}</span>{inIdeas?<span className="faint small inline-flex items-center gap-1"><Icon name="Check" size={12} style={{color:'var(--cc-ok)'}}/>In ideas</span>:item.kind==='followed'&&<span className="faint small">Followed</span>}</div>
  <div className="tt clamp2">{item.title}</div>
  <div className="stats"><span title="Total views"><Icon name="Eye" size={13}/><b>{fmtNum(item.views)}</b></span><span title="Views per day since it went up"><Icon name="TrendingUp" size={13}/><b>{fmtNum(item.vpd)}</b>/day</span><span><Icon name="Clock" size={13}/>{fmtDays(item.ageDays)}</span></div>
  {reason&&<div className="reason">{reason}</div>}
  <FollowChannel item={item}/>
  <div className="foot" onClick={event=>event.stopPropagation()}>
   <button type="button" className="btn sm" onClick={()=>onBreak(item)}><Icon name={hasBreakdown?'FileText':'Sparkles'} size={14}/>{hasBreakdown?'Open breakdown':'Break down'}</button>
  </div>
  <button type="button" className="btn sm icon-only idea-pin" onClick={event=>{event.stopPropagation();onIdea(item);}} aria-label={inIdeas?'In your ideas':'Make it an idea'} title={inIdeas?'In your ideas. Open it':'Make it an idea'}>
   <Icon name={inIdeas?'Check':'Lightbulb'} size={15}/>
  </button>
 </div>;
}
