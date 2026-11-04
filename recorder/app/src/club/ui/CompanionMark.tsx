import type {CSSProperties} from 'react';

/**
 * The companion's conversation mark, drawn in the current text colour. `working` lets the reply dot breathe while a reply is written.
 */
export function CompanionMark({size=16,working=false,className='',style}:{size?:number;working?:boolean;className?:string;style?:CSSProperties}){
 return <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`cmp-mark${working?' working':''} ${className}`.trim()} style={style}>
  <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M18 11v4a3 3 0 0 1-3 3H9l-5 3v-5a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h7M7 9h5M7 13h7"/>
  <circle className="cmp-mark-dot" fill="currentColor" cx="18" cy="5" r="3"/>
 </svg>;
}
