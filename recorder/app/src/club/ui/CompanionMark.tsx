import type {CSSProperties} from 'react';

/**
 * The companion's mark ("Duo"): the Creator Compiler tile with a companion docked at its corner, kept apart by a gap. It shares the brand
 * mark's rounded square and solid fill, and takes the colour of its text. `working` lets the docked dot breathe while a reply is written.
 * The icon registry (`ui/icons.tsx`, Task 7) does not exist yet; Task 7 registers this mark there as `companion`.
 */
export function CompanionMark({size=16,working=false,className='',style}:{size?:number;working?:boolean;className?:string;style?:CSSProperties}){
 return <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`cmp-mark${working?' working':''} ${className}`.trim()} style={style}>
  {/* The same sparkle the app uses for every AI action, so "this is Claude" looks one way everywhere. */}
  <path fill="currentColor" d="M10.5 3.5l1.6 4.6a3 3 0 0 0 1.8 1.8l4.6 1.6-4.6 1.6a3 3 0 0 0-1.8 1.8l-1.6 4.6-1.6-4.6a3 3 0 0 0-1.8-1.8L2.5 11.5l4.6-1.6a3 3 0 0 0 1.8-1.8z"/>
  <path className="cmp-mark-dot" fill="currentColor" d="M18.5 2.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>
 </svg>;
}
