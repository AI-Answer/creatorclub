import type {CSSProperties} from 'react';

/**
 * The companion's mark ("Duo"): the CreatorClub tile with a companion docked at its corner, kept apart by a gap. It shares the brand
 * mark's rounded square and solid fill, and takes the colour of its text. `working` lets the docked dot breathe while a reply is written.
 */
export function CompanionMark({size=16,working=false,className='',style}:{size?:number;working?:boolean;className?:string;style?:CSSProperties}){
 return <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`cmp-mark${working?' working':''} ${className}`.trim()} style={style}>
  <path fill="currentColor" d="M8 3h7a5 5 0 0 1 5 5v5a5.7 5.7 0 0 0-7 7H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Z"/>
  <circle className="cmp-mark-dot" fill="currentColor" cx="18.5" cy="18.5" r="3.9"/>
 </svg>;
}
