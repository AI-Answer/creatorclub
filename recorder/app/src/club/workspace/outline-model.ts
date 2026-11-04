/** Markdown lines with stable identities. Unchanged syntax, whitespace, fences and line endings survive edits elsewhere. */
export interface OutlineBlock{id:string;kind:'paragraph'|'heading'|'bullet'|'image'|'raw';indent:string;marker:string;text:string;eol:string;level?:number;children:OutlineBlock[]}
export interface OutlineDoc{blocks:OutlineBlock[];newline:string;bom:string}
export interface OutlineEdit{doc:OutlineDoc;focus:string;offset:number}
let nextId=0;
const id=()=>`ob${++nextId}`;
const width=(s:string)=>[...s].reduce((n,c)=>c==='\t'?n+4-n%4:n+1,0);
const clone=(doc:OutlineDoc):OutlineDoc=>({...doc,blocks:copy(doc.blocks)});
const copy=(blocks:OutlineBlock[]):OutlineBlock[]=>blocks.map(block=>({...block,children:copy(block.children)}));
export const imageMarkdown=(source:string,alt='')=>`![${alt.replace(/[\[\]\\]/g,'\\$&')}](${source.replace(/ /g,'%20').replace(/\(/g,'%28').replace(/\)/g,'%29')})`;
export const imageOf=(text:string)=>/^!\[([^\]]*)\]\(<?([^\s>]+)>?(?:\s+"[^"]*")?\)$/.exec(text.trim());

function lineBlock(raw:string,eol:string):OutlineBlock{
 const [,indent='',body='']=/^(\s*)(.*)$/.exec(raw)!;
 const bullet=/^([-+*•]|\d+[.)])(\s+|$)(.*)$/.exec(body),heading=/^(#{1,6})(\s+)(.*)$/.exec(body);
 return {id:id(),kind:bullet?'bullet':heading?'heading':imageOf(body)?'image':'paragraph',indent,marker:bullet?bullet[1]+bullet[2]:heading?heading[1]+heading[2]:'',text:bullet?bullet[3]:heading?heading[3]:body,eol,level:heading?.[1].length,children:[]};
}

export function parseOutline(markdown:string):OutlineDoc{
 const bom=markdown.startsWith('\uFEFF')?'\uFEFF':'';
 const source=markdown.slice(bom.length),lines=[...source.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter(match=>match[0]!==''),blocks:OutlineBlock[]=[],stack:OutlineBlock[]=[];
 const doc:OutlineDoc={blocks,newline:source.match(/\r\n|\r|\n/)?.[0]??'\n',bom};
 for(let i=0;i<lines.length;i++){
  const raw=lines[i][1],eol=lines[i][2];
  const fence=/^\s*(`{3,}|~{3,})/.exec(raw),front=i===0&&raw==='---';
  let block:OutlineBlock;
  if(fence||front){
   let text=raw+eol;
   while(i+1<lines.length){i++;text+=lines[i][0];if(front?lines[i][1]==='---':new RegExp(`^\\s*${fence![1][0]}{${fence![1].length},}\\s*$`).test(lines[i][1]))break;}
   const indent=/^[ \t]*/.exec(raw)![0],tail=lines[i][2];
   block={id:id(),kind:'raw',indent,marker:'',text:text.slice(indent.length,tail?-tail.length:undefined),eol:tail,children:[]};
  }else block=lineBlock(raw,eol);
  if(block.kind==='bullet'){
   while(stack.length&&width(stack.at(-1)!.indent)>=width(block.indent))stack.pop();
   (stack.at(-1)?.children??blocks).push(block);stack.push(block);
  }else{
   if(raw.trim())while(stack.length&&width(stack.at(-1)!.indent)>=width(block.indent))stack.pop();
   if(stack.length)stack.at(-1)!.children.push(block);else blocks.push(block);
  }
 }
 if(!blocks.length)blocks.push(lineBlock('',''));
 return doc;
}

export const serializeOutline=(doc:OutlineDoc):string=>doc.bom+serialize(doc.blocks);
const serialize=(blocks:OutlineBlock[]):string=>blocks.map(block=>block.indent+block.marker+block.text+block.eol+serialize(block.children)).join('');
export function outlineBlocks(doc:OutlineDoc):OutlineBlock[]{return doc.blocks.flatMap(function walk(block):OutlineBlock[]{return [block,...block.children.flatMap(walk)];});}
export function visibleBlocks(doc:OutlineDoc,folded:ReadonlySet<string>):OutlineBlock[]{return doc.blocks.flatMap(function walk(block):OutlineBlock[]{return [block,...(folded.has(block.id)?[]:block.children.flatMap(walk))];});}
export function toggleFold(folded:ReadonlySet<string>,block:string):Set<string>{const next=new Set(folded);if(next.has(block))next.delete(block);else next.add(block);return next;}

type Place={nodes:OutlineBlock[];index:number;parent?:OutlineBlock};
function locate(doc:OutlineDoc,id:string):Place|undefined{
 const walk=(nodes:OutlineBlock[],parent?:OutlineBlock):Place|undefined=>{for(let index=0;index<nodes.length;index++){if(nodes[index].id===id)return {nodes,index,parent};const found=walk(nodes[index].children,nodes[index]);if(found)return found;}};
 return walk(doc.blocks);
}
export const findBlock=(doc:OutlineDoc,id:string)=>outlineBlocks(doc).find(block=>block.id===id);
function spaceFor(block:OutlineBlock,indent:string){const before=block.indent;const shift=(node:OutlineBlock)=>{node.indent=indent+(node.indent.startsWith(before)?node.indent.slice(before.length):'');node.children.forEach(shift);};shift(block);}
function separated(doc:OutlineDoc){const all=outlineBlocks(doc);for(const block of all.slice(0,-1))if(!block.eol&&!block.text.endsWith('\n')&&!block.text.endsWith('\r'))block.eol=doc.newline;return doc;}

/** Recognizes typed Markdown prefixes without normalizing neighbouring blocks. */
export function setBlockText(doc:OutlineDoc,key:string,text:string):OutlineDoc{
 if(findBlock(doc,key)?.text===text)return doc;
 const next=clone(doc),place=locate(next,key);if(!place)return doc;
 const block=place.nodes[place.index];
 if(block.kind==='paragraph'){
  const parsed=lineBlock(block.indent+text,block.eol);
  if(parsed.kind==='bullet'&&!/\s$/.test(parsed.marker))block.text=text;else Object.assign(block,{...parsed,id:block.id,children:block.children});
 }else{block.text=text;if(block.kind==='image'&&!imageOf(text))block.kind='paragraph';}
 return next;
}
export function moveBlock(doc:OutlineDoc,key:string,direction:-1|1):OutlineDoc{
 const next=clone(doc),p=locate(next,key);if(!p||p.index+direction<0||p.index+direction>=p.nodes.length)return doc;
 const [block]=p.nodes.splice(p.index,1);p.nodes.splice(p.index+direction,0,block);return separated(next);
}
export function indentBlock(doc:OutlineDoc,key:string):OutlineDoc{
 const next=clone(doc),p=locate(next,key);if(!p||p.index===0)return doc;
 const block=p.nodes[p.index],previous=p.nodes[p.index-1];if(block.kind!=='bullet'||previous.kind!=='bullet')return doc;
 const sample=previous.children.find(child=>child.kind==='bullet')?.indent;
 spaceFor(block,sample??previous.indent+(previous.indent.includes('\t')?'\t':'  '));
 p.nodes.splice(p.index,1);previous.children.push(block);return separated(next);
}
export function outdentBlock(doc:OutlineDoc,key:string):OutlineDoc{
 const next=clone(doc),p=locate(next,key);if(!p)return doc;
 const block=p.nodes[p.index];if(block.kind!=='bullet')return doc;
 if(!p.parent){block.kind='paragraph';block.marker='';block.indent='';return next;}
 const outer=locate(next,p.parent.id)!;p.nodes.splice(p.index,1);spaceFor(block,p.parent.indent);outer.nodes.splice(outer.index+1,0,block);return separated(next);
}
export function splitBlock(doc:OutlineDoc,key:string,start:number,end=start):OutlineEdit{
 const next=clone(doc),p=locate(next,key);if(!p)return {doc,focus:key,offset:start};
 const block=p.nodes[p.index];if(block.kind==='bullet'&&!block.text.trim())return {doc:outdentBlock(doc,key),focus:key,offset:0};
 const right:OutlineBlock={...block,id:id(),kind:block.kind==='heading'?'paragraph':block.kind,marker:block.kind==='heading'?'':block.kind==='bullet'&&!/\s$/.test(block.marker)?block.marker+' ':block.marker,text:block.text.slice(end),children:block.children,eol:block.eol};
 if(right.kind==='raw'||right.kind==='image'){right.kind='paragraph';right.marker='';}
 block.text=block.text.slice(0,start);block.children=[];block.eol=next.newline;p.nodes.splice(p.index+1,0,right);
 return {doc:separated(next),focus:right.id,offset:0};
}
/** At the start of a nested bullet, lift it; at the start of a root bullet, merge into the preceding block. */
export function mergeBlock(doc:OutlineDoc,key:string):OutlineEdit{
 const next=clone(doc),p=locate(next,key);if(!p)return {doc,focus:key,offset:0};
 const block=p.nodes[p.index];
 if(p.parent)return {doc:outdentBlock(doc,key),focus:key,offset:0};
 if(p.index===0){return {doc:block.kind==='bullet'?outdentBlock(doc,key):doc,focus:key,offset:0};}
 const previous=p.nodes[p.index-1];if(previous.kind==='raw'||previous.kind==='image')return {doc,focus:key,offset:0};
 const offset=previous.text.length;previous.text+=block.text;previous.children.push(...block.children);previous.eol=block.eol;p.nodes.splice(p.index,1);
 return {doc:separated(next),focus:previous.id,offset};
}
export function deleteBlock(doc:OutlineDoc,key:string):OutlineEdit{
 const next=clone(doc),p=locate(next,key);if(!p)return {doc,focus:key,offset:0};
 p.nodes.splice(p.index,1);if(!next.blocks.length)next.blocks.push(lineBlock('',''));
 const focus=p.nodes[Math.min(p.index,p.nodes.length-1)]??p.parent??next.blocks[0];return {doc:next,focus:focus.id,offset:0};
}
/** A pasted image occupies its own Markdown line, between the two halves of the caret's block. */
export function insertImage(doc:OutlineDoc,key:string,start:number,source:string,end=start):OutlineEdit{
 const next=clone(doc),p=locate(next,key);if(!p)return {doc,focus:key,offset:start};
 const block=p.nodes[p.index],image=lineBlock(imageMarkdown(source),next.newline);
 image.indent=block.indent;
 const tail=lineBlock(block.indent+block.text.slice(end),block.eol);tail.children=block.children;block.children=[];
 block.text=block.text.slice(0,start);block.eol=next.newline;
 if(!block.text&&block.kind==='paragraph')p.nodes.splice(p.index,1,image,tail);else p.nodes.splice(p.index+1,0,image,tail);
 return {doc:separated(next),focus:tail.id,offset:0};
}

/** Paste continues the caret's block; later lines inherit its marker and depth. */
export function pasteBlocks(doc:OutlineDoc,key:string,start:number,text:string,end=start):OutlineEdit{
 const next=clone(doc),p=locate(next,key);if(!p)return {doc,focus:key,offset:start};
 const block=p.nodes[p.index],lines=text.split(/\r\n|\r|\n/),before=block.text.slice(0,start),after=block.text.slice(end);
 if(lines.length===1||block.kind==='raw'){block.text=before+text+after;return {doc:next,focus:key,offset:start+text.length};}
 const siblings=lines.slice(1).map((line):OutlineBlock=>({...block,id:id(),kind:block.kind==='heading'?'paragraph':block.kind,marker:block.kind==='heading'?'':block.marker,text:line,eol:next.newline,children:[]}));
 const last=siblings.at(-1)!;last.text+=after;last.eol=block.eol;last.children=block.children;
 block.text=before+lines[0];block.eol=next.newline;block.children=[];p.nodes.splice(p.index+1,0,...siblings);
 return {doc:next,focus:last.id,offset:lines.at(-1)!.length};
}
