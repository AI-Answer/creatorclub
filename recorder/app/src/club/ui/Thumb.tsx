import {useState,type CSSProperties,type ReactNode} from 'react';
import {thumbGradient,ytThumb} from '../format';

/** A typographic stand-in thumbnail: the text over a gradient picked from the seed. */
export function DraftThumb({text,seed,small}:{text?:string;seed:string;small?:boolean}){
 const [from,to]=thumbGradient(seed);
 const size=small?'clamp(9px, 2.6cqw, 13px)':'clamp(13px, 7.4cqw, 34px)';
 return <div className="tthumb" style={{background:`linear-gradient(135deg, ${from}, ${to})`,containerType:'inline-size'}}>
  <div className="face"/>
  <div className="tt" style={{fontSize:size}}>{text||''}</div>
 </div>;
}

/**
 * A 16:9 thumbnail. With a YouTube `videoId` it shows that picture, and falls back to the draft when it can't load;
 * without one it shows the draft. `chip` sits on the picture, `children` over it.
 */
export function Thumb({videoId,text,seed,chip,children,className='',style}:{videoId?:string|null;text?:string;seed:string;chip?:ReactNode;children?:ReactNode;className?:string;style?:CSSProperties}){
 const [failed,setFailed]=useState(false);
 return <div className={`thumb ${className}`.trim()} style={style}>
  {videoId&&!failed?<img src={ytThumb(videoId)} alt="" loading="lazy" onError={()=>setFailed(true)}/>:<DraftThumb text={text} seed={seed}/>}
  {chip}
  {children}
 </div>;
}
