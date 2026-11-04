import {useState,type CSSProperties,type ReactNode} from 'react';
import {ytThumb} from '../format';
import {BrandMark} from '../../BrandMark';

/** The stand-in when a video has no picture yet: a plain card with its title, never made-up art. `seed` is kept for callers. */
export function DraftThumb({text,small}:{text?:string;seed:string;small?:boolean}){
 const size=small?'clamp(9px, 2.6cqw, 12px)':'clamp(12px, 5.6cqw, 22px)';
 return <div className="tthumb" style={{containerType:'inline-size'}}>
  {text?<div className="tt" style={{fontSize:size}}>{text}</div>:<div className="draft-mark" aria-hidden="true"><BrandMark/></div>}
 </div>;
}

/**
 * A 16:9 thumbnail. With a YouTube `videoId` it shows that picture, with `cover` the video's own picture or a frame of its recording, or the picture at `src` when one is given (a breakdown's saved thumbnail),
 * and falls back to the draft when it can't load; without either it shows the draft. `chip` sits on the picture, `children` over it.
 */
export function Thumb({videoId,src,cover,text,seed,chip,children,className='',style,fallback}:{videoId?:string|null;src?:string|null;/** A CreatorClub video's id: its picked thumbnail or a frame of its recording, when there is one. */cover?:string;text?:string;seed:string;chip?:ReactNode;children?:ReactNode;className?:string;style?:CSSProperties;fallback?:ReactNode}){
 const [failed,setFailed]=useState(false);
 const picture=src||(videoId?ytThumb(videoId):cover?`/api/club/videos/${encodeURIComponent(cover)}/cover`:null);
 return <div className={`thumb ${className}`.trim()} style={style}>
  {picture&&!failed?<img src={picture} alt="" loading="lazy" onError={()=>setFailed(true)}/>:(fallback??<DraftThumb text={text} seed={seed}/>)}
  {chip}
  {children}
 </div>;
}
