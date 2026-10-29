import {useCallback,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type ClipboardEvent,type KeyboardEvent,type MouseEvent,type Ref} from 'react';
import {Icon} from '../ui';
import {COMMANDS,blockShortcut,enterShortcut,filterCommands,inlineShortcut,isUrl,linkAddress,looksLikeMarkdown,slashQuery,type Command,type CommandId} from './commands';
import {docFromHtml,inlineHtml,markdownFromPage,markdownToHtml,parseMarkdown,plainToDoc,renderHtml} from './index';

/*
 * The note editor: a page you type in, whose text is Markdown. The browser does the typing, the caret and undo; this adds what a writer wants
 * on top: Markdown shortcuts, a `/` menu, bold/italic/link keys, checklists, and paste that keeps headings and lists but nothing else.
 * The page is the truth while you write: it is read back into Markdown after each change, and only replaced when the Markdown changes from outside.
 */

const BLOCKS=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','PRE','BLOCKQUOTE']);
const clean=(value:string)=>value.replace(/[​﻿]/g,'').replace(/ /g,' ');
const escapeHtml=(value:string)=>value.replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[char]!);
const exec=(command:string,argument?:string)=>document.execCommand(command,false,argument);

export interface EditorHandle{focus():void}

/** Where the caret is: the block it is in, the text of that block before it, and the text node it sits in (when it sits in one). */
interface Caret{block:HTMLElement;before:string;node:Text|null;offset:number;range:Range}

function blockOf(node:Node|null,root:HTMLElement):HTMLElement|null{
 for(let current=node;current&&current!==root;current=current.parentNode){
  if(current.nodeType===1&&BLOCKS.has((current as Element).tagName))return current as HTMLElement;
 }
 return null;
}

function caretIn(root:HTMLElement):Caret|null{
 const selection=root.ownerDocument.getSelection();
 if(!selection||!selection.rangeCount||!selection.isCollapsed)return null;
 const range=selection.getRangeAt(0);
 if(!root.contains(range.startContainer))return null;
 const block=blockOf(range.startContainer,root);
 if(!block)return null;
 const upTo=range.cloneRange();upTo.selectNodeContents(block);upTo.setEnd(range.startContainer,range.startOffset);
 const node=range.startContainer.nodeType===3?range.startContainer as Text:null;
 return {block,before:clean(upTo.toString()),node,offset:range.startOffset,range};
}

const closest=(root:HTMLElement,tags:string)=>{
 const node=root.ownerDocument.getSelection()?.anchorNode;
 const element=node?.nodeType===1?node as Element:node?.parentElement;
 const found=element?.closest(tags)??null;
 return found&&root.contains(found)?found as HTMLElement:null;
};

/** Selects the `length` characters before the caret (inside its text node, or by the browser's own step back) and deletes them. */
function deleteBefore(root:HTMLElement,caret:Caret,length:number){
 const selection=root.ownerDocument.getSelection()!;
 if(caret.node&&caret.offset>=length){
  const range=root.ownerDocument.createRange();range.setStart(caret.node,caret.offset-length);range.setEnd(caret.node,caret.offset);
  selection.removeAllRanges();selection.addRange(range);
 }else{
  const range=root.ownerDocument.createRange();range.selectNodeContents(caret.block);range.setEnd(caret.range.startContainer,caret.range.startOffset);
  selection.removeAllRanges();selection.addRange(range);
 }
 exec('delete');
}

function setTask(item:HTMLElement,on:boolean){
 if(on){item.setAttribute('data-task','');if(!item.hasAttribute('data-checked'))item.setAttribute('data-checked','false');}
 else{item.removeAttribute('data-task');item.removeAttribute('data-checked');}
}

/** Takes the line the caret is in out of its quote. */
function leaveBlockquote(root:HTMLElement){
 if(!closest(root,'blockquote'))return;
 exec('outdent');exec('formatBlock','div');
}

/** Turns the block the caret is in into what the command says. A command that is already in effect turns it back into text. */
export function runCommand(root:HTMLElement,id:CommandId){
 const inside=(tags:string)=>!!closest(root,tags);
 const block=closest(root,'h1,h2,h3,h4,h5,h6,p,div,li,pre');
 const leaveQuote=()=>leaveBlockquote(root);
 const heading=(tag:'h1'|'h2'|'h3')=>{leaveQuote();exec('formatBlock',block?.tagName.toLowerCase()===tag?'div':tag);};
 switch(id){
  case 'text':
   if(inside('li'))exec(inside('ol')?'insertOrderedList':'insertUnorderedList');
   leaveQuote();exec('formatBlock','div');break;
  case 'h1':case 'h2':case 'h3':heading(id);break;
  case 'bullets':{
   const item=closest(root,'li');
   if(item&&item.closest('ul')&&!item.hasAttribute('data-task'))exec('insertUnorderedList');
   else{if(!item||!item.closest('ul'))exec('insertUnorderedList');const now=closest(root,'li');if(now)setTask(now,false);}
   break;}
  case 'numbers':exec('insertOrderedList');break;
  case 'tasks':{
   let item=closest(root,'li');
   if(!item||!item.closest('ul')){exec('insertUnorderedList');item=closest(root,'li');}
   if(item)setTask(item,!item.hasAttribute('data-task'));
   break;}
  case 'quote':
   if(inside('blockquote'))leaveQuote();else exec('formatBlock','blockquote');break;
  case 'code':
   if(inside('pre'))exec('formatBlock','div');else exec('formatBlock','pre');break;
  case 'divider':{
   exec('insertHorizontalRule');
   // A divider at the very end leaves nowhere to write after it.
   const rule=[...root.querySelectorAll('hr')].find(candidate=>!candidate.nextElementSibling);
   if(rule){const paragraph=root.ownerDocument.createElement('p');paragraph.innerHTML='<br>';rule.after(paragraph);const range=root.ownerDocument.createRange();range.setStart(paragraph,0);range.collapse(true);const selection=root.ownerDocument.getSelection()!;selection.removeAllRanges();selection.addRange(range);}
   break;}
 }
}

/** Marks the words in the selection as code, or takes the code mark off. The browser has no command for it. */
function toggleCode(root:HTMLElement){
 const code=closest(root,'code');
 const selection=root.ownerDocument.getSelection();
 if(!selection)return;
 if(code){
  const range=root.ownerDocument.createRange();range.selectNode(code);selection.removeAllRanges();selection.addRange(range);
  exec('insertText',code.textContent??'');
  return;
 }
 const words=selection.toString();
 if(words)exec('insertHTML',`<code>${escapeHtml(words)}</code>​`);
}

interface SlashState{items:Command[];index:number;query:string;length:number;left:number;top:number}
interface LinkState{left:number;top:number;value:string;range:Range;existing:boolean}

export function MarkdownEditor({value,onChange,label,placeholder='Write, or type / for commands',autoFocus,editorRef,onBlur}:{value:string;onChange(markdown:string):void;label:string;placeholder?:string;autoFocus?:boolean;editorRef?:Ref<EditorHandle>;onBlur?():void}){
 const page=useRef<HTMLDivElement>(null),wrap=useRef<HTMLDivElement>(null);
 // The Markdown the page holds now; a `value` that equals it is the page's own text coming back and changes nothing.
 const held=useRef<string|null>(null);
 const [slash,setSlash]=useState<SlashState|null>(null),[link,setLink]=useState<LinkState|null>(null);
 const latest=useRef(onChange);latest.current=onChange;

 useImperativeHandle(editorRef,()=>({focus:()=>page.current?.focus()}),[]);

 const markEmpty=useCallback(()=>{
  const root=page.current;if(!root)return;
  root.dataset.empty=String(!root.textContent?.replace(/[​﻿]/g,'').trim()&&!root.querySelector('hr,pre,li'));
 },[]);
 const emit=useCallback(()=>{
  const root=page.current;if(!root)return;
  markEmpty();
  const markdown=markdownFromPage(root);
  if(markdown===held.current)return;
  held.current=markdown;latest.current(markdown);
 },[markEmpty]);

 // The page is written when it first shows and whenever the Markdown changes from outside (a file edited by an agent, or loaded for another note).
 useLayoutEffect(()=>{
  const root=page.current;if(!root)return;
  if(held.current===value)return;
  const scroll=root.parentElement?.parentElement?.scrollTop;
  root.innerHTML=markdownToHtml(value,'div');held.current=value;markEmpty();
  if(scroll!==undefined&&root.parentElement?.parentElement)root.parentElement.parentElement.scrollTop=scroll;
 },[value,markEmpty]);
 useEffect(()=>{
  try{document.execCommand('defaultParagraphSeparator',false,'div');document.execCommand('styleWithCSS',false,'false');}catch{/* a host without it keeps its own */}
  if(autoFocus){
   const root=page.current;if(!root)return;
   root.focus();
   // The caret goes to the end of what is there.
   const range=document.createRange();range.selectNodeContents(root);range.collapse(false);
   const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);
  }
 },[autoFocus]);

 const placeSlash=useCallback(()=>{
  const root=page.current,box=wrap.current;
  const caret=root&&caretIn(root);
  const found=caret&&slashQuery(caret.before);
  if(!root||!box||!caret||!found||caret.block.tagName==='PRE'){setSlash(null);return;}
  const items=filterCommands(found.query);
  if(!items.length){setSlash(null);return;}
  let rect=caret.range.getBoundingClientRect();
  if(!rect.height)rect=caret.block.getBoundingClientRect();
  const frame=box.getBoundingClientRect();
  setSlash(current=>({items,query:found.query,length:found.length,index:current&&current.query===found.query?Math.min(current.index,items.length-1):0,left:Math.max(0,Math.min(rect.left-frame.left,frame.width-260)),top:rect.bottom-frame.top+6}));
 },[]);

 const choose=(command:Command)=>{
  const root=page.current;if(!root)return;
  const caret=caretIn(root);
  if(caret&&slash)deleteBefore(root,caret,slash.length);
  setSlash(null);
  runCommand(root,command.id);
  emit();
 };

 const onInput=(event:{nativeEvent:Event})=>{
  const root=page.current;if(!root)return;
  // A new checklist item starts unchecked, whatever the item it was split from was.
  if((event.nativeEvent as InputEvent).inputType==='insertParagraph'){
   const item=closest(root,'li[data-task]');
   if(item&&!clean(item.textContent??'').trim())item.setAttribute('data-checked','false');
   else if(item){const before=item.previousElementSibling;if(before&&before.getAttribute('data-checked')==='true'&&item.getAttribute('data-checked')==='true')item.setAttribute('data-checked','false');}
  }
  emit();placeSlash();
 };

 const onKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
  const root=page.current;if(!root||event.nativeEvent.isComposing)return;
  const mod=event.metaKey||event.ctrlKey;
  if(slash){
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    setSlash({...slash,index:(slash.index+(event.key==='ArrowDown'?1:slash.items.length-1))%slash.items.length});return;
   }
   if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();choose(slash.items[slash.index]);return;}
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setSlash(null);return;}
  }
  if(link)return;
  if(mod&&!event.altKey){
   const key=event.key.toLowerCase();
   if(key==='b'){event.preventDefault();exec('bold');emit();return;}
   if(key==='i'){event.preventDefault();exec('italic');emit();return;}
   if(key==='e'){event.preventDefault();toggleCode(root);emit();return;}
   if(key==='x'&&event.shiftKey){event.preventDefault();exec('strikeThrough');emit();return;}
   if(key==='k'){event.preventDefault();event.stopPropagation();openLink();return;}
   if(key==='enter'){
    const item=closest(root,'li[data-task]');
    if(item){event.preventDefault();item.setAttribute('data-checked',String(item.getAttribute('data-checked')!=='true'));emit();}
    return;
   }
  }
  if(mod&&event.altKey&&/^[1-3]$/.test(event.key)){event.preventDefault();runCommand(root,`h${event.key}` as CommandId);emit();return;}
  const caret=caretIn(root);
  if(event.key==='Tab'&&closest(root,'li')){event.preventDefault();exec(event.shiftKey?'outdent':'indent');emit();return;}
  if(!caret||event.altKey)return;
  const plain=caret.block.tagName==='P'||caret.block.tagName==='DIV';
  const inList=caret.block.tagName==='LI';
  if(event.key===' '&&!mod){
   const id=blockShortcut(caret.before,inList);
   if(id&&(plain||(inList&&id==='tasks'))){event.preventDefault();deleteBefore(root,caret,caret.before.length);runCommand(root,id);emit();return;}
  }
  if(event.key==='Enter'&&!event.shiftKey&&plain){
   const id=enterShortcut(caret.before);
   if(id&&caret.before===clean(caret.block.textContent??'')){event.preventDefault();deleteBefore(root,caret,caret.before.length);runCommand(root,id);emit();return;}
  }
  if(event.key==='Enter'&&caret.block.tagName==='PRE'){
   // Enter on an empty last line leaves the code block.
   const rest=document.createRange();rest.selectNodeContents(caret.block);rest.setStart(caret.range.startContainer,caret.range.startOffset);
   const last=caret.block.lastChild?.nodeType===1&&(caret.block.lastChild as Element).tagName==='BR';
   if(!rest.toString()&&(last||!clean(caret.block.textContent??''))){
    event.preventDefault();
    while(caret.block.lastChild?.nodeType===1&&(caret.block.lastChild as Element).tagName==='BR')caret.block.lastChild.remove();
    const line=document.createElement('div');line.innerHTML='<br>';caret.block.after(line);
    const range=document.createRange();range.setStart(line,0);range.collapse(true);const selection=document.getSelection()!;selection.removeAllRanges();selection.addRange(range);
    emit();return;
   }
  }
  if(event.key==='Enter'&&!event.shiftKey&&!clean(caret.block.textContent??'')&&closest(root,'blockquote')&&!inList){event.preventDefault();leaveBlockquote(root);emit();return;}
  if(event.key==='Backspace'&&!mod&&!caret.before&&/^(H[1-6]|PRE)$/.test(caret.block.tagName)){event.preventDefault();runCommand(root,'text');emit();return;}
  if(event.key==='Backspace'&&!mod&&!caret.before&&(caret.block.tagName==='P'||caret.block.tagName==='DIV')&&closest(root,'blockquote')){event.preventDefault();leaveBlockquote(root);emit();return;}
  if(event.key.length===1&&!mod&&caret.node&&!closest(root,'code,pre')){
   const match=inlineShortcut(clean(caret.node.data.slice(0,caret.offset)),event.key);
   // Only when everything it replaces is in this one piece of text, so no mark is split.
   if(match&&match.remove<=caret.offset&&clean(caret.node.data.slice(caret.offset-match.remove,caret.offset)).length===match.remove){
    event.preventDefault();
    const selection=document.getSelection()!;
    const range=document.createRange();range.setStart(caret.node,caret.offset-match.remove);range.setEnd(caret.node,caret.offset);
    selection.removeAllRanges();selection.addRange(range);
    const words=escapeHtml(match.text);
    exec('insertHTML',{bold:`<strong>${words}</strong>`,italic:`<em>${words}</em>`,strike:`<s>${words}</s>`,code:`<code>${words}</code>`}[match.mark]+'​');
    emit();return;
   }
  }
 };
 const onKeyUp=(event:KeyboardEvent<HTMLDivElement>)=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))placeSlash();};

 const onPaste=(event:ClipboardEvent<HTMLDivElement>)=>{
  const root=page.current,data=event.clipboardData;
  if(!root||!data)return;
  const html=data.getData('text/html'),plain=data.getData('text/plain');
  if(!html&&!plain)return;
  // What is pasted into a note stays in the note; the Board does not turn it into a card.
  event.preventDefault();event.stopPropagation();
  // In a code block, a code span or a link only the words go in; blocks cannot be nested there.
  if(closest(root,'pre,code,a')){exec('insertText',plain);emit();return;}
  const selected=document.getSelection()?.toString()??'';
  if(isUrl(plain)){
   if(selected)exec('createLink',plain.trim());
   else exec('insertHTML',`<a href="${escapeHtml(plain.trim())}">${escapeHtml(plain.trim())}</a>​`);
   emit();return;
  }
  const doc=html&&!/^<meta[^>]*>$/i.test(html.trim())?docFromHtml(html):looksLikeMarkdown(plain)?parseMarkdown(plain):plainToDoc(plain);
  if(!doc.length){emit();return;}
  // One paragraph goes into the line you are on; anything longer comes in as blocks.
  exec('insertHTML',doc.length===1&&doc[0].t==='p'?inlineHtml(doc[0].inline):renderHtml(doc,'div'));
  emit();
 };

 const onMouseDown=(event:MouseEvent<HTMLDivElement>)=>{
  const target=event.target as HTMLElement;
  if(target.tagName==='LI'&&target.hasAttribute('data-task')&&event.nativeEvent.offsetX<=24){
   event.preventDefault();
   target.setAttribute('data-checked',String(target.getAttribute('data-checked')!=='true'));
   emit();
  }
 };
 const onClick=(event:MouseEvent<HTMLDivElement>)=>{
  const anchor=(event.target as HTMLElement).closest('a');
  if((event.metaKey||event.ctrlKey)&&anchor){event.preventDefault();window.open(anchor.getAttribute('href')??'','_blank','noopener,noreferrer');}
  placeSlash();
 };

 function openLink(){
  const root=page.current,box=wrap.current;if(!root||!box)return;
  const selection=document.getSelection();
  if(!selection||!selection.rangeCount||!root.contains(selection.anchorNode))return;
  const range=selection.getRangeAt(0).cloneRange();
  const frame=box.getBoundingClientRect();let rect=range.getBoundingClientRect();
  if(!rect.height)rect=(selection.anchorNode?.parentElement??root).getBoundingClientRect();
  const anchor=closest(root,'a');
  setLink({left:Math.max(0,Math.min(rect.left-frame.left,frame.width-320)),top:rect.bottom-frame.top+6,value:anchor?.getAttribute('href')??'',range,existing:!!anchor});
  setSlash(null);
 }
 const applyLink=(address:string)=>{
  const root=page.current;if(!root||!link)return;
  root.focus();
  const selection=document.getSelection()!;selection.removeAllRanges();selection.addRange(link.range);
  const href=linkAddress(address);
  if(!href){if(link.existing)exec('unlink');}
  else if(link.range.collapsed&&!link.existing)exec('insertHTML',`<a href="${escapeHtml(href)}">${escapeHtml(address.trim())}</a>​`);
  else exec('createLink',href);
  setLink(null);emit();
 };
 const closeLink=()=>{setLink(null);page.current?.focus();};

 return <div className="md-wrap" ref={wrap}>
  <div ref={page} className="md-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} data-placeholder={placeholder} data-empty="true" spellCheck
   onInput={onInput} onKeyDown={onKeyDown} onKeyUp={onKeyUp} onPaste={onPaste} onMouseDown={onMouseDown} onClick={onClick} onBlur={()=>{setSlash(null);onBlur?.();}}/>
  {slash&&<div className="md-slash menu" role="listbox" aria-label="Commands" style={{left:slash.left,top:slash.top}} onMouseDown={event=>event.preventDefault()}>
   {slash.items.map((command,index)=><button key={command.id} type="button" role="option" aria-selected={index===slash.index} className={index===slash.index?'on':undefined} onClick={()=>choose(command)} onMouseEnter={()=>setSlash(current=>current&&{...current,index})}>
    <Icon name={command.icon} size={15}/><span className="grow">{command.label}</span>{command.hint&&<kbd>{command.hint}</kbd>}
   </button>)}
  </div>}
  {link&&<form className="md-link menu" style={{left:link.left,top:link.top}} onSubmit={event=>{event.preventDefault();applyLink(link.value);}}>
   <input className="input" autoFocus aria-label="Link address" placeholder="Paste or type an address" value={link.value} onChange={event=>setLink({...link,value:event.target.value})} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeLink();}}}/>
   <button type="submit" className="btn sm primary">{link.existing&&!link.value.trim()?'Remove':'Apply'}</button>
  </form>}
 </div>;
}

export {COMMANDS};
