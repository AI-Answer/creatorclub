import {useState} from 'react';
import type {SignalEntry} from '../../../shared/club';
import {fmtHours,fmtNum} from '../format';
import {Avatar,Icon,SourceIcon} from '../ui';

const LONG=260;

/** One post from X or Reddit with its numbers. `reason` is the sentence from the server, shown when given. `inIdeas` swaps Turn into idea for a chip. The link to the post shows under the pointer or when focused. */
export function SignalCard({item,reason,inIdeas,onIdea}:{item:SignalEntry;reason?:string|null;inIdeas?:boolean;onIdea(item:SignalEntry):void}){
 const [more,setMore]=useState(false),[broken,setBroken]=useState(false);
 const long=item.text.length>LONG;
 const reddit=item.source==='reddit';
 return <div className="card sig">
  <div className="who"><Avatar name={reddit?item.author.replace('r/',''):item.author} sq={reddit}/>
   <div className="grow" style={{minWidth:0}}><div className="n ellipsis">{item.author}</div><div className="h ellipsis">{reddit?`u/${item.handle}`:`@${item.handle}`} · {fmtHours(item.ageHours)}</div></div>
   <SourceIcon source={item.source}/>
  </div>
  {(item.flair||reason)&&<div className="row" style={{gap:6,flexWrap:'wrap'}}>{item.flair&&<span className="chip">{item.flair}</span>}{reason&&<span className="reason">{reason}</span>}</div>}
  <div className="text">{long&&!more?`${item.text.slice(0,250).trim()}…`:item.text}{long&&<button type="button" className="linkish" style={{marginLeft:4}} onClick={()=>setMore(open=>!open)}>{more?'Show less':'Show more'}</button>}</div>
  {item.media?.type==='image'&&item.media.url&&!broken&&<img className="media" src={item.media.url} alt="" loading="lazy" onError={()=>setBroken(true)}/>}
  {item.media?.type==='video'&&<a className="btn sm" href={item.url} target="_blank" rel="noopener noreferrer"><Icon name="play" size={14}/>Watch the video</a>}
  <div className="foot">
   <span className="stats"><span title="Likes"><Icon name="like" size={13}/><b>{fmtNum(item.likes)}</b></span><span title="Replies"><Icon name="comment" size={13}/><b>{fmtNum(item.replies)}</b></span>{item.views?<span title="Views"><Icon name="preview" size={13}/><b>{fmtNum(item.views)}</b></span>:null}</span>
   <span className="grow"/>
   <a className="btn sm ghost icon-only open-post" href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open post" title="Open post"><Icon name="open-external" size={15}/></a>
   {inIdeas?<span className="chip b-green"><Icon name="check" size={12}/>In ideas</span>:<button type="button" className="btn sm" onClick={()=>onIdea(item)}><Icon name="idea" size={14}/>Turn into idea</button>}
  </div>
 </div>;
}
