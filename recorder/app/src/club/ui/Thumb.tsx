import {useState,type CSSProperties,type ReactNode} from 'react';
import {ytThumb} from '../format';

/** The stand-in when a video has no picture yet: a plain card with its title, never made-up art. `seed` is kept for callers. */
export function DraftThumb({text,small}:{text?:string;seed:string;small?:boolean}){
 const size=small?'clamp(9px, 2.6cqw, 12px)':'clamp(12px, 5.6cqw, 22px)';
 return <div className="tthumb" style={{containerType:'inline-size'}}>
  {text?<div className="tt" style={{fontSize:size}}>{text}</div>:<svg className="tthumb-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>}
 </div>;
}

/**
 * A 16:9 thumbnail. With a YouTube `videoId` it shows that picture, with `cover` the video's own picture or a frame of its recording, or the picture at `src` when one is given (a breakdown's saved thumbnail),
 * and falls back to the draft when it can't load; without either it shows the draft. `chip` sits on the picture, `children` over it.
 */
export function Thumb({videoId,src,cover,text,seed,chip,children,className='',style}:{videoId?:string|null;src?:string|null;/** A CreatorClub video's id: its picked thumbnail or a frame of its recording, when there is one. */cover?:string;text?:string;seed:string;chip?:ReactNode;children?:ReactNode;className?:string;style?:CSSProperties}){
 const [failed,setFailed]=useState(false);
 const picture=src||(videoId?ytThumb(videoId):cover?`/api/club/videos/${encodeURIComponent(cover)}/cover`:null);
 return <div className={`thumb ${className}`.trim()} style={style}>
  {picture&&!failed?<img src={picture} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<DraftThumb text={text} seed={seed}/>}
  {chip}
  {children}
 </div>;
}
