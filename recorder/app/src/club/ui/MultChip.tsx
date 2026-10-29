import {band,fmtMult} from '../format';

/**
 * One multiplier per video, always "vs <that creator>'s usual". `who` is the creator's name, or `you`.
 * `label` writes the comparison out; `dash` shows a grey "—" when the usual views aren't known, instead of nothing.
 */
export function MultChip({m,onThumb,who,label,dash}:{m?:number|null;onThumb?:boolean;who?:string;label?:boolean;dash?:boolean}){
 const place=onThumb?' on-thumb':'';
 if(m==null||!Number.isFinite(m)||m<=0){
  if(!dash)return null;
  return <span className={`chip mult b-grey${place}`} title={`${who&&who!=='you'?`${who}'s`:who==='you'?'Your':"This channel's"} usual views aren't tracked yet`}>— {label?'usual':''}</span>;
 }
 const vs=who==='you'?'vs your usual':who?`vs ${who}'s usual`:'vs usual';
 return <span className={`chip mult ${band(m)}${place}`} title={`${fmtMult(m)} ${vs}`}>{fmtMult(m)}{label?` ${vs}`:''}</span>;
}
