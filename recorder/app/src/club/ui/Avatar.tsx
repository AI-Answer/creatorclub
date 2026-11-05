import {useState} from 'react';
import {avatarColor,initials} from '../format';

/** A cached channel picture, falling back to two initials when it is absent or cannot load. */
export function Avatar({name,src,size='',sq,color}:{name:string;src?:string;size?:''|'xs'|'sm'|'lg';sq?:boolean;color?:string}){
 const [failed,setFailed]=useState<string>();
 return <span aria-hidden className={`avatar ${size}${sq?' sq':''}`.replace(/\s+/g,' ').trim()} style={{borderRadius:sq?'var(--cc-r-lg)':'50%',background:color||avatarColor(name),color:'var(--cc-on-media)',overflow:'hidden',position:'relative'}}>{initials(name)}{src&&failed!==src&&<img decoding="async" loading="lazy" src={src} alt="" onError={()=>setFailed(src)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}/>}</span>;
}
