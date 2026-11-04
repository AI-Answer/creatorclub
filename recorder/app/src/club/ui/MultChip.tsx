import {band,fmtMult} from '../format';

/**
 * One multiplier per video, always "vs <that creator>'s usual". `who` is the creator's name, or `you`.
 * `label` writes the comparison out; `dash` shows a grey "—" when the usual views aren't known, instead of nothing.
 */
export function MultChip({m,onThumb,who,label,dash}:{m?:number|null;onThumb?:boolean;who?:string;label?:boolean;dash?:boolean}){
 const place=onThumb?' on-thumb':'';
 if(m==null||!Number.isFinite(m)||m<=0){
  if(!dash)return null;
  return <span className={`chip mult b-grey${place}`} style={{borderRadius:'var(--cc-r-sm)'}} title={`${who&&who!=='you'?`${who}'s`:who==='you'?'Your':"This channel's"} usual views aren't tracked yet`}>— {label?'usual':''}</span>;
 }
 // The long form ("2.4× vs Riley Brown's usual") is news only when the video beats its usual; "1.00× vs usual" says nothing.
 if(label&&m<1.5)return null;
 const vs=who==='you'?'vs your usual':who?`vs ${who}'s usual`:'vs usual';
 return <span className={`chip mult ${band(m)}${place}`} style={{borderRadius:'var(--cc-r-sm)'}} title={`${fmtMult(m)} ${vs}`}>{fmtMult(m)}{label?` ${vs}`:''}</span>;
}
