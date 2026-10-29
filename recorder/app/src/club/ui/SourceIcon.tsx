import {Icon} from './icons';

/** Where a signal came from: X or Reddit. */
export function SourceIcon({source}:{source:'x'|'reddit'}){
 return source==='x'?<span className="src-ic src-x" title="X">𝕏</span>:<span className="src-ic src-reddit" title="Reddit"><Icon name="comment" size={12} stroke={2.4}/></span>;
}
