import type {ReactNode} from 'react';

/*
 * The small part of Markdown the companion writes: paragraphs, bullet and numbered lists, bold, italic and inline code.
 * Built as React elements (never HTML), so a reply can never inject markup. Text still streaming in renders as it stands:
 * an unclosed `**` shows as written until its pair arrives.
 */

const INLINE=/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

export function inline(text:string,key='i'):ReactNode[]{
 return text.split(INLINE).filter(part=>part!=='').map((part,index)=>{
  const k=`${key}-${index}`;
  if(part.startsWith('`')&&part.endsWith('`')&&part.length>2)return <code key={k}>{part.slice(1,-1)}</code>;
  if((part.startsWith('**')&&part.endsWith('**')||part.startsWith('__')&&part.endsWith('__'))&&part.length>4)return <strong key={k}>{inline(part.slice(2,-2),k)}</strong>;
  if((part.startsWith('*')&&part.endsWith('*')||part.startsWith('_')&&part.endsWith('_'))&&part.length>2)return <em key={k}>{part.slice(1,-1)}</em>;
  return part;
 });
}

type Block={kind:'p';lines:string[]}|{kind:'ul'|'ol';items:string[]};
const BULLET=/^\s*[-*•]\s+(.*)$/,NUMBERED=/^\s*\d+[.)]\s+(.*)$/,HEADING=/^#{1,6}\s+(.*)$/;

export function blocks(text:string):Block[]{
 const out:Block[]=[];
 for(const raw of text.replace(/\r/g,'').split('\n')){
  const line=raw.trimEnd();
  const bullet=BULLET.exec(line),numbered=NUMBERED.exec(line),last=out[out.length-1];
  if(!line.trim()){out.push({kind:'p',lines:[]});continue;}
  if(bullet||numbered){
   const kind=bullet?'ul':'ol',item=(bullet??numbered)![1];
   if(last?.kind===kind)last.items.push(item);else out.push({kind,items:[item]});
   continue;
  }
  const heading=HEADING.exec(line);
  const textLine=heading?`**${heading[1]}**`:line.trim();
  if(last?.kind==='p'&&last.lines.length)last.lines.push(textLine);else out.push({kind:'p',lines:[textLine]});
 }
 return out.filter(block=>block.kind!=='p'||block.lines.length);
}

export function Markdown({text}:{text:string}){
 return <>{blocks(text).map((block,index)=>block.kind==='p'
  ?<p key={index}>{block.lines.map((line,at)=><span key={at}>{at>0&&<br/>}{inline(line,`${index}-${at}`)}</span>)}</p>
  :block.kind==='ul'?<ul key={index}>{block.items.map((item,at)=><li key={at}>{inline(item,`${index}-${at}`)}</li>)}</ul>
  :<ol key={index}>{block.items.map((item,at)=><li key={at}>{inline(item,`${index}-${at}`)}</li>)}</ol>)}</>;
}
