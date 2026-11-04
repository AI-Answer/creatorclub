import {BrandLogo} from '../../BrandLogo';

/** Where a signal came from: X or Reddit. */
export function SourceIcon({source}:{source:'x'|'reddit'}){
 const name=source==='x'?'X':'Reddit';
 return <span className={`src-ic src-${source}`} title={name} role="img" aria-label={name} style={{borderRadius:'var(--cc-r-sm)',background:source==='x'?'var(--cc-text)':'var(--cc-text-2)',color:'var(--cc-surface)'}}><BrandLogo brand={source} size={14}/></span>;
}
