import {useEffect,useLayoutEffect,useRef,useState,type ClipboardEvent,type DragEvent,type KeyboardEvent,type MutableRefObject} from 'react';
import {inlineHtml,parseInline,readDoc,serializeInline,safeHref} from '../markdown';
import {escapeText} from '../markdown/serialize';
import {errorMessage} from '../api';
import {boardImageSource} from './board-files';
import {saveBoardImage} from './useBoardFiles';
import {deleteBlock,findBlock,imageOf,indentBlock,insertImage,mergeBlock,moveBlock,outlineBlocks,outdentBlock,pasteBlocks,parseOutline,serializeOutline,setBlockText,splitBlock,toggleFold,visibleBlocks,type OutlineBlock,type OutlineDoc,type OutlineEdit} from './outline-model';
import './outliner.css';

type Caret={id:string;start:number;end:number;before:string;after:string};
/** Reads only an edited block. The rest of the file never passes through HTML. */
function markdownIn(root:HTMLElement,source?:string,raw=root.classList.contains('outliner-raw')):string{
 if(raw)return root.querySelector('div,p,br')?(root.innerText??root.textContent??''):(root.textContent??'');
 if(source!==undefined){const original=root.ownerDocument.createElement('div');original.innerHTML=inlineHtml(parseInline(source));if(root.innerHTML===original.innerHTML)return source;}
 if(!root.querySelector('strong,b,em,i,a,code,s,span[data-md]')){
  const text=(root.querySelector('div,p,br')?root.innerText:root.textContent)??'';
  const prefix=source!==undefined&&!source.startsWith('\\*')?/^\*(?:[ \t]+|$)/.exec(text):null;
  return (prefix?prefix[0]:'')+escapeText(text.slice(prefix?.[0].length??0).replace(/\u00a0/g,' '));
 }
 return readDoc(root).map(block=>'inline' in block?serializeInline(block.inline):'').join('\n');
}
function caretIn(root:HTMLElement):Caret|null{
 const selection=root.ownerDocument.getSelection();if(!selection?.rangeCount)return null;
 const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
 const before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
 const after=range.cloneRange();after.selectNodeContents(root);after.setStart(range.endContainer,range.endOffset);
 const read=(part:Range)=>{const div=root.ownerDocument.createElement('div');div.append(part.cloneContents());return markdownIn(div,undefined,root.classList.contains('outliner-raw'));};
 return {id:root.dataset.block!,start:before.toString().length,end:(root.textContent?.length??0)-after.toString().length,before:read(before),after:read(after)};
}
function focusAt(root:HTMLElement|null,offset:number){
 if(!root)return;root.focus({preventScroll:true});
 const selection=root.ownerDocument.getSelection(),range=root.ownerDocument.createRange();let left=offset;
 const walk=(node:Node):boolean=>{if(node.nodeType===3){const n=node.textContent?.length??0;if(left<=n){range.setStart(node,left);return true;}left-=n;}for(const child of node.childNodes)if(walk(child))return true;return false;};
 if(!walk(root)){range.selectNodeContents(root);range.collapse(false);}else range.collapse(true);
 selection?.removeAllRanges();selection?.addRange(range);
}

function BlockText({block,title,label,placeholder,onInput,onKey,onCaret}:{block:OutlineBlock;title:boolean;label:string;placeholder:string;onInput(id:string,text:string,offset:number):void;onKey(event:KeyboardEvent<HTMLElement>):void;onCaret(root:HTMLElement):void}){
 const element=useRef<HTMLElement>(null),shown=useRef<string|undefined>(undefined);
 useLayoutEffect(()=>{const el=element.current;if(el&&shown.current!==block.text){el.innerHTML=block.kind==='raw'?'':inlineHtml(parseInline(block.text));if(block.kind==='raw')el.textContent=block.text;shown.current=block.text;}},[block.text,block.kind]);
 const Tag=title?'h1':block.kind==='heading'?`h${block.level??2}` as 'h1':'div';
 return <Tag ref={element as never} data-block={block.id} className={`outliner-text${title?' outliner-title':''}${block.kind==='raw'?' outliner-raw':''}`} contentEditable suppressContentEditableWarning role="textbox" aria-label={title?`${label} title`:`${label} block`} aria-multiline="true" data-placeholder={placeholder} spellCheck
  onInput={event=>{shown.current=markdownIn(event.currentTarget,block.text);onInput(block.id,shown.current,caretIn(event.currentTarget)?.start??shown.current.length);onCaret(event.currentTarget);}}
  onBlur={event=>{if(block.kind!=='raw'&&!(event.relatedTarget as HTMLElement|null)?.closest?.('.outliner-link')){const html=inlineHtml(parseInline(shown.current??block.text));if(event.currentTarget.innerHTML!==html)event.currentTarget.innerHTML=html;}}}
  onKeyDown={onKey} onKeyUp={event=>onCaret(event.currentTarget)} onMouseUp={event=>onCaret(event.currentTarget)} onFocus={event=>onCaret(event.currentTarget)}
  onClick={event=>{const link=(event.target as HTMLElement).closest('a');if(link&&(event.metaKey||event.ctrlKey)){event.preventDefault();const href=link.getAttribute('href')??'';if(safeHref(href))window.open(href,'_blank','noopener,noreferrer');}}}/>;
}

export interface OutlinerProps{value:string;onChange(markdown:string):void;label:string;placeholder?:string;autoFocus?:boolean;onBlur?():void;onEdit?():void;readNow?:MutableRefObject<(()=>string)|undefined>;/** The board and note identity keep Markdown image paths relative to the note's file. */boardId?:string;tileId?:string}

/** A card and its full-size view share this Markdown outliner; the existing note writer still owns saving and conflict copies. */
export function Outliner({value,onChange,label,placeholder='Type a note',autoFocus,onBlur,onEdit,readNow,boardId,tileId}:OutlinerProps){
 const [doc,setDoc]=useState(()=>parseOutline(value)),[folded,setFolded]=useState<Set<string>>(new Set()),[selected,setSelected]=useState<string|null>(null),[problem,setProblem]=useState(''),[uploading,setUploading]=useState(false),[link,setLink]=useState<{id:string;range:Range;href:string}|null>(null);
 const current=useRef(doc),held=useRef(value),root=useRef<HTMLDivElement>(null),caret=useRef<Caret|null>(null),pending=useRef<{id:string;offset:number}|null>(null);
 const undo=useRef<OutlineDoc[]>([]),redo=useRef<OutlineDoc[]>([]),lastType=useRef({id:'',time:0});
 const callbacks=useRef({onChange,onEdit});callbacks.current={onChange,onEdit};
 const commit=(next:OutlineDoc,focus?:{id:string;offset:number},typing?:string)=>{
  if(next===current.current)return;
  const now=Date.now();if(!typing||lastType.current.id!==typing||now-lastType.current.time>600)undo.current.push(current.current);
  undo.current=undo.current.slice(-100);redo.current=[];lastType.current={id:typing??'',time:now};
  current.current=next;held.current=serializeOutline(next);pending.current=focus??null;setDoc(next);setSelected(null);callbacks.current.onEdit?.();callbacks.current.onChange(held.current);
 };
 const apply=(edit:OutlineEdit)=>commit(edit.doc,{id:edit.focus,offset:edit.offset});
 useEffect(()=>{if(value===held.current)return;const next=parseOutline(value);held.current=value;current.current=next;setDoc(next);setFolded(new Set());undo.current=[];redo.current=[];},[value]);
 useLayoutEffect(()=>{if(readNow)readNow.current=()=>serializeOutline(current.current);});
 useLayoutEffect(()=>{if(pending.current){const {id,offset}=pending.current;pending.current=null;focusAt(root.current?.querySelector<HTMLElement>(`[data-block="${id}"]`)??null,offset);}},[doc]);
 useEffect(()=>{if(autoFocus)focusAt(root.current?.querySelector<HTMLElement>('[contenteditable=true]')??null,0);},[autoFocus]);
 const remember=(el:HTMLElement)=>{caret.current=caretIn(el);};
 const history=(back:boolean)=>{
  const from=back?undo.current:redo.current,to=back?redo.current:undo.current,next=from.pop();if(!next)return;to.push(current.current);
  current.current=next;held.current=serializeOutline(next);setDoc(next);callbacks.current.onChange(held.current);callbacks.current.onEdit?.();
 };
 const key=(event:KeyboardEvent<HTMLElement>)=>{
  event.stopPropagation();if(event.nativeEvent.isComposing)return;
  const el=event.currentTarget,block=findBlock(current.current,el.dataset.block!);if(!block)return;
  const pos=caretIn(el),mod=event.metaKey||event.ctrlKey;
  const take=()=>event.preventDefault();
  if(mod&&event.key.toLowerCase()==='z'){take();history(!event.shiftKey);return;}
  if(mod&&event.key==='.'){take();setFolded(now=>toggleFold(now,block.id));return;}
  if(mod&&event.shiftKey&&(event.key==='ArrowUp'||event.key==='ArrowDown')){take();commit(moveBlock(current.current,block.id,event.key==='ArrowUp'?-1:1),{id:block.id,offset:pos?.start??0});return;}
  if(event.key==='Tab'){take();const next=(event.shiftKey?outdentBlock:indentBlock)(current.current,block.id);
   const parent=outlineBlocks(next).find(row=>row.children.some(child=>child.id===block.id));if(parent)setFolded(now=>{const open=new Set(now);open.delete(parent.id);return open;});
   commit(next,{id:block.id,offset:pos?.start??0});return;}
  if(mod&&event.key.toLowerCase()==='k'){take();const selection=el.ownerDocument.getSelection();if(selection?.rangeCount)setLink({id:block.id,range:selection.getRangeAt(0).cloneRange(),href:(selection.anchorNode?.parentElement?.closest('a')?.getAttribute('href'))??''});return;}
  if(mod&&['b','i'].includes(event.key.toLowerCase())){take();document.execCommand(event.key.toLowerCase()==='b'?'bold':'italic');commit(setBlockText(current.current,block.id,markdownIn(el,block.text)),undefined,block.id);return;}
  if(event.key==='Escape'){take();el.blur();el.closest<HTMLElement>('.board-wrap')?.focus({preventScroll:true});return;}
  if(event.key==='Enter'&&!event.shiftKey&&block.kind!=='raw'&&pos){
   take();const next=setBlockText(current.current,block.id,pos.before+pos.after);apply(splitBlock(next,block.id,pos.before.length));return;
  }
  if(event.key==='Backspace'&&pos&&pos.start===0&&pos.end===0&&block.kind!=='raw'){take();apply(mergeBlock(current.current,block.id));return;}
  if((event.key==='ArrowUp'||event.key==='ArrowDown')&&pos){
   const rows=visibleBlocks(current.current,folded),index=rows.findIndex(row=>row.id===block.id),up=event.key==='ArrowUp';
   if((up&&pos.start===0)||(!up&&pos.end===(el.textContent?.length??0))){const next=rows[index+(up?-1:1)];if(next){take();focusAt(root.current?.querySelector<HTMLElement>(`[data-block="${next.id}"]`)??null,up?next.text.length:0);}}
  }
 };
 const takeImages=async(files:File[],target?:Caret|null)=>{
  if(!boardId){setProblem('Open this note on its board to add an image.');return;}
  setUploading(true);setProblem('');
  let at=target??caret.current;const first=outlineBlocks(current.current)[0];if(!at)at={id:first.id,start:first.text.length,end:first.text.length,before:first.text,after:''};
  try{
   for(const file of files){
    const snapshot=findBlock(current.current,at.id)?.text;
    const saved=await saveBoardImage(boardId,file,tileId);
    // The stable block identity and saved offset survive the upload; never replace text typed while the upload was running.
    const block=findBlock(current.current,at.id);if(!block)throw new Error('The insertion block was removed.');
    const base=block.text===snapshot?setBlockText(current.current,at.id,at.before+at.after):current.current;
    const offset=Math.min(at.before.length,findBlock(base,at.id)!.text.length);
    const edit=insertImage(base,at.id,offset,saved.markdown);apply(edit);
    at={id:edit.focus,start:0,end:0,before:'',after:findBlock(edit.doc,edit.focus)?.text??''};
   }
  }catch(reason){setProblem(errorMessage(reason,"Couldn't add the image. Your text is still here."));}
  finally{setUploading(false);}
 };
 const paste=(event:ClipboardEvent<HTMLDivElement>)=>{
  event.stopPropagation();const images=[...event.clipboardData.files].filter(file=>file.type.startsWith('image/'));
  if(images.length){event.preventDefault();const el=(event.target as HTMLElement).closest<HTMLElement>('[data-block]');void takeImages(images,el?caretIn(el):caret.current);return;}
  const text=event.clipboardData.getData('text/plain');if(!text)return;event.preventDefault();
  const el=(event.target as HTMLElement).closest<HTMLElement>('[data-block]'),pos=el?caretIn(el):null;if(!el||!pos)return;
  const block=findBlock(current.current,pos.id)!;
  if(!/[\r\n]/.test(text)){document.execCommand('insertText',false,text);return;}
  const next=setBlockText(current.current,block.id,pos.before+pos.after);
  const edit=pasteBlocks(next,block.id,pos.before.length,block.kind==='raw'?text:escapeText(text));
  const last=findBlock(edit.doc,edit.focus)!;apply({...edit,offset:block.kind==='raw'?edit.offset:parseInline(last.text.slice(0,edit.offset)).reduce((n,run)=>n+(run.t==='text'?run.text.length:run.t==='atom'?run.label.length:1),0)});
 };
 const drop=(event:DragEvent<HTMLDivElement>)=>{
  event.preventDefault();event.stopPropagation();const images=[...event.dataTransfer.files].filter(file=>file.type.startsWith('image/'));if(!images.length)return;
  const el=(event.target as HTMLElement).closest<HTMLElement>('[data-block]');
  const doc=event.currentTarget.ownerDocument as Document&{caretRangeFromPoint?(x:number,y:number):Range|null};const range=doc.caretRangeFromPoint?.(event.clientX,event.clientY);
  if(range&&el?.contains(range.startContainer)){const selection=doc.getSelection();selection?.removeAllRanges();selection?.addRange(range);}
  void takeImages(images,el?caretIn(el):caret.current);
 };
 const rows=visibleBlocks(doc,folded),title=rows[0]&&['paragraph','heading'].includes(rows[0].kind)?rows[0].id:undefined;
 const depth=(block:OutlineBlock)=>{let n=0;const walk=(blocks:OutlineBlock[],level:number):boolean=>{for(const b of blocks){if(b.id===block.id){n=level;return true;}if(walk(b.children,level+1))return true;}return false;};walk(doc.blocks,0);return n;};
 return <div ref={root} className="cc-outliner" role="group" aria-label={label} onPaste={paste} onDrop={drop} onDragOver={event=>{event.preventDefault();event.stopPropagation();}} onKeyDown={event=>event.stopPropagation()}
  onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))onBlur?.();}}>
  {rows.map(block=>{
   const image=imageOf(block.text),nested=block.children.some(child=>child.text.trim());
   return <div key={block.id} className={`outliner-row ${block.kind}${title===block.id?' title-row':''}`} style={{paddingLeft:depth(block)*32}} data-outline-id={block.id}>
    {block.kind==='bullet'&&<button type="button" className={`outliner-bullet${nested?' has-children':''}`} tabIndex={nested?0:-1} aria-label={nested?folded.has(block.id)?'Unfold block':'Fold block':'Bullet'} aria-expanded={nested?!folded.has(block.id):undefined} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(nested)setFolded(now=>toggleFold(now,block.id));}}>{nested?(folded.has(block.id)?'▸':'▾'):/^\d/.test(block.marker)?block.marker.trim():'•'}</button>}
    {image&&block.kind!=='raw'?<div data-block={block.id} tabIndex={0} role="button" aria-label="Select image" aria-pressed={selected===block.id} className={`outliner-image${selected===block.id?' selected':''}`} onClick={event=>{setSelected(block.id);event.currentTarget.focus({preventScroll:true});}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();apply(deleteBlock(current.current,block.id));}else if(event.key==='Enter'){event.preventDefault();apply(splitBlock(current.current,block.id,block.text.length));}else if(event.key===' '){event.preventDefault();setSelected(block.id);}else key(event);}}>
     <img src={boardImageSource(boardId,tileId,image[2])} alt={image[1]} draggable={false}/>
    </div>:<BlockText block={block} title={block.id===title} label={label} placeholder={block.id===rows[0]?.id?placeholder:''} onInput={(id,text,offset)=>{const next=setBlockText(current.current,id,text),changed=findBlock(next,id)!;commit(next,changed.text!==text?{id,offset:Math.max(0,offset-(text.length-changed.text.length))}:undefined,id);}} onKey={key} onCaret={remember}/>}
   </div>;
  })}
  {link&&<form className="outliner-link" onSubmit={event=>{
   event.preventDefault();if(!safeHref(link.href)){setProblem('Use a web or email address for the link.');return;}
   const el=root.current?.querySelector<HTMLElement>(`[data-block="${link.id}"]`);if(!el)return;
   el.focus({preventScroll:true});const selection=el.ownerDocument.getSelection();selection?.removeAllRanges();selection?.addRange(link.range);
   if(link.range.collapsed)document.execCommand('insertHTML',false,inlineHtml([{t:'text',text:link.href,marks:{href:link.href}}]));
   else document.execCommand('createLink',false,link.href);commit(setBlockText(current.current,link.id,markdownIn(el,findBlock(current.current,link.id)?.text)));setLink(null);setProblem('');
  }}><input autoFocus aria-label="Link address" placeholder="https://" value={link.href} onChange={event=>setLink({...link,href:event.target.value})} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setLink(null);}}}/><button type="submit">Apply link</button><button type="button" onClick={()=>setLink(null)}>Cancel</button></form>}
  {uploading&&<div className="outliner-status" role="status">Adding image…</div>}
  {problem&&<div className="outliner-status" role="alert">{problem}</div>}
 </div>;
}
