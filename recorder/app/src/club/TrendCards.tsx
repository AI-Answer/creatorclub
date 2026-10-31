import type {TrendingEntry} from '../../shared/club';
import {FollowChannel} from './FollowChannel';
import {creatorName,fmtNum} from './format';
import {TREND_HELP} from './steps';
import {Icon,MultChip,Thumb} from './ui';

/**
 * One video that is doing well, as the first-run screens show it: picture, the multiplier chip when the channel's usual is known (never a bare dash),
 * views and views a day, why it fits, Follow this channel and Break this down. A press anywhere on it breaks it down.
 */
export function TrendCard({item,saved,onBreak}:{item:TrendingEntry;saved:boolean;onBreak(item:TrendingEntry):void}){
 return <div className="card trend hov" tabIndex={0} onClick={()=>onBreak(item)} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onBreak(item);}}>
  <Thumb videoId={item.videoId} seed={item.videoId} chip={<MultChip m={item.mult} who={creatorName(item.channel)} onThumb/>}/>
  <div className="meta"><span className="ellipsis">{item.channel}</span></div>
  <div className="tt clamp2" style={{fontSize:13.5}}>{item.title}</div>
  <div className="stats"><span><b>{fmtNum(item.views)}</b> views</span><span><b>{fmtNum(item.vpd)}</b> a day</span></div>
  {item.reason&&<div className="reason"><Icon name="ai" size={12}/>{item.reason}</div>}
  <FollowChannel item={item}/>
  <button type="button" className="btn sm" onClick={event=>{event.stopPropagation();onBreak(item);}}><Icon name={saved?'script':'ai'} size={14}/>{saved?'Open breakdown':'Break this down'}</button>
 </div>;
}

/** What the words on a trend card mean, in plain words, once under the cards. */
export function TrendHelp(){
 return <ul className="trend-help" aria-label="What the cards show">{TREND_HELP.map(([term,means])=><li key={term}><b>{term}</b> {means}</li>)}</ul>;
}
