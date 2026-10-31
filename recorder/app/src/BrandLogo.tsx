import type {CSSProperties} from 'react';

export type Brand='claude'|'chatgpt'|'codex'|'gemini'|'postiz'|'youtube'|'x'|'reddit';
const marks:Record<Brand,{light:string;dark?:string}>={
 claude:{light:'claude.svg'},
 chatgpt:{light:'chatgpt-light.svg',dark:'chatgpt-dark.svg'},
 codex:{light:'chatgpt-light.svg',dark:'chatgpt-dark.svg'},
 gemini:{light:'gemini.png'},postiz:{light:'postiz.svg'},youtube:{light:'youtube.png'},
 x:{light:'x-light.svg',dark:'x-dark.svg'},reddit:{light:'reddit.png'},
};

/** Official service marks, bundled locally. The surrounding label supplies the accessible name. */
export function BrandLogo({brand,size=24,className='',working=false,style}:{brand:Brand;size?:number;className?:string;working?:boolean;style?:CSSProperties}){
 const mark=marks[brand];
 return <span aria-hidden="true" className={`brand-logo brand-logo-${brand}${working?' is-working':''} ${className}`.trim()} style={{width:size,height:size,...style}}>
  <img className={mark.dark?'brand-logo-light':undefined} src={`/brands/${mark.light}`} width={size} height={size} alt="" draggable={false}/>
  {mark.dark&&<img className="brand-logo-dark" src={`/brands/${mark.dark}`} width={size} height={size} alt="" draggable={false}/>}
 </span>;
}
