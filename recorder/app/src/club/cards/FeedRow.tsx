import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {BrandLogo} from '../../BrandLogo';
import {useState,type KeyboardEvent} from 'react';
import type {SignalEntry,TrendingEntry} from '../../../shared/club';
import {FollowChannel} from '../FollowChannel';
import {creatorName,fmtDays,fmtHours,fmtNum} from '../format';
import {Avatar,Icon,IconButton,MultChip,SourceIcon,Thumb} from '../ui';

const LONG=260;

/** The one action every card of Discover has: Turn into idea, or, once it is an idea, a quiet button that opens it. The accessible name starts with the visible words. */
function IdeaButton({title,inIdeas,onIdea}:{title:string;inIdeas:boolean;onIdea():void}){
 return inIdeas
  ?<button type="button" className="btn sm ghost in-ideas" onClick={onIdea} aria-label={`In ideas: open the idea made from ${title}`}><Icon name="check" size={14}/>In ideas</button>
  :<button type="button" className="btn sm" onClick={onIdea} aria-label={`Turn into idea: ${title}`}><Icon name="idea" size={14}/>Turn into idea</button>;
}

/** "Add to Research", beside Turn into idea: shows under the pointer or on focus, like the row's other quiet actions. */
function ResearchButton({onResearch}:{onResearch?():void}){
 return onResearch?<span className="quiet"><IconButton icon="research" label="Add to channel board" onClick={onResearch}/></span>:null;
}

/**
 * A video doing better than usual, one row of Discover at its `rank`. The row opens its breakdown (Enter too); its one button makes it an idea.
 * The multiplier sits in the numbers line with its own words ("2.8× vs Ana's usual"), never on the picture; with no usual known there is none.
 * "Follow this channel" (for a video found by a search) is always there, and "Following <channel>" once it is. `reason` is the server's sentence, shown small.
 */
export function VideoRow({item,rank,isNew,reason,hasBreakdown,inIdeas,onBreak,onIdea,onFollowed,onResearch}:{item:TrendingEntry;rank:number;isNew?:boolean;reason?:string|null;hasBreakdown?:boolean;inIdeas:boolean;onBreak(item:TrendingEntry):void;onIdea(item:TrendingEntry):void;onFollowed?():void;onResearch?(item:TrendingEntry):void}){
 const available=useAiAvailable();
 const who=creatorName(item.channel);
 const open=()=>{if(hasBreakdown||available)onBreak(item);};
 return <div className="frow hov" data-kind="video" onClick={open} tabIndex={0} title={!hasBreakdown&&!available?AI_CONNECT_HINT:hasBreakdown?'Open the breakdown':'Break it down to see why it works'} onKeyDown={(event:KeyboardEvent)=>{if(event.key==='Enter'&&event.target===event.currentTarget)open();}}>
  <span className="rank" title={`Number ${rank} of the list`}>{rank}</span>
  <Thumb videoId={item.videoId} seed={item.videoId} className="fpic">{isNew&&<span className="chip solid br">New</span>}</Thumb>
  <div className="main">
   <div className="tt clamp2">{item.title}</div>
   <div className="meta"><BrandLogo brand="youtube" size={15}/><span className="ellipsis">{item.channel}</span>
    {item.mult!=null&&item.mult>0&&<MultChip m={item.mult} who={who} label/>}
    <span title="Total views">{fmtNum(item.views)} views</span><span title="Views per day since it went up">{fmtNum(item.vpd)} views a day</span><span>{fmtDays(item.ageDays)}</span>
    {hasBreakdown&&<span className="ready"><Icon name="script" size={12}/>Breakdown ready</span>}</div>
   {reason&&<div className="reason">{reason}</div>}
   <div className="follow" onClick={event=>event.stopPropagation()}><FollowChannel item={item} showFollowing onFollowed={onFollowed}/></div>
  </div>
  <div className="acts" onClick={event=>event.stopPropagation()}><IdeaButton title={item.title} inIdeas={inIdeas} onIdea={()=>onIdea(item)}/><ResearchButton onResearch={onResearch&&(()=>onResearch(item))}/></div>
 </div>;
}

/** A post from X or Reddit, one row of Discover: its picture (or the author), the text, the numbers, and Turn into idea. The link to the post shows under the pointer or on focus. */
export function PostRow({item,rank,reason,inIdeas,onIdea,onResearch}:{item:SignalEntry;rank:number;reason?:string|null;inIdeas:boolean;onIdea(item:SignalEntry):void;onResearch?(item:SignalEntry):void}){
 const [more,setMore]=useState(false),[broken,setBroken]=useState(false);
 const long=item.text.length>LONG,reddit=item.source==='reddit';
 const image=item.media?.type==='image'&&item.media.url&&!broken?item.media.url:null;
 const title=`${item.author}'s post`;
 return <div className="frow" data-kind="post">
  <span className="rank" title={`Number ${rank} of the list`}>{rank}</span>
  <div className={`fpic post-pic${image?'':' bare'}`}>{image?<img src={image} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<Avatar name={reddit?item.author.replace('r/',''):item.author} sq={reddit}/>}<SourceIcon source={item.source}/></div>
  <div className="main">
   <div className="who"><b className="ellipsis">{item.author}</b><span className="ellipsis">{reddit?`u/${item.handle}`:`@${item.handle}`} · {fmtHours(item.ageHours)}</span></div>
   <div className="text">{long&&!more?`${item.text.slice(0,250).trim()}…`:item.text}{long&&<button type="button" className="linkish" style={{marginLeft:4}} onClick={()=>setMore(open=>!open)}>{more?'Show less':'Show more'}</button>}</div>
   <div className="meta">
    <span title="Likes"><Icon name="like" size={12}/>{fmtNum(item.likes)}</span><span title="Replies"><Icon name="comment" size={12}/>{fmtNum(item.replies)}</span>{item.views?<span title="Views"><Icon name="preview" size={12}/>{fmtNum(item.views)}</span>:null}
    {item.media?.type==='video'&&<span><Icon name="play" size={12}/>Video</span>}
    {item.flair&&<span className="chip">{item.flair}</span>}
   </div>
   {reason&&<div className="reason">{reason}</div>}
  </div>
  <div className="acts">
   <a className="btn sm ghost icon-only open-post quiet" href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open post" title="Open post"><Icon name="open-external" size={15}/></a>
   <IdeaButton title={title} inIdeas={inIdeas} onIdea={()=>onIdea(item)}/>
   <ResearchButton onResearch={onResearch&&(()=>onResearch(item))}/>
  </div>
 </div>;
}
