import {createElement,useEffect,useRef,type CSSProperties,type KeyboardEvent} from 'react';

/**
 * Text you edit where it stands (Notion style). It saves when you click away; Enter saves too, unless `multiline`.
 * With `onEnter`, Enter saves and then calls it (for "add the next line"). Escape leaves the field.
 */
export function Ed({value,onChange,className='',ph='',multiline,tag='div',onEnter,autoFocus,style}:{value?:string;onChange(text:string):void;className?:string;ph?:string;multiline?:boolean;tag?:'div'|'span'|'h1'|'h2'|'h3'|'p';onEnter?(event:KeyboardEvent<HTMLElement>):void;autoFocus?:boolean;style?:CSSProperties}){
 const ref=useRef<HTMLElement>(null);
 // The text lives in the DOM while you type; React only writes it when the value changes from outside.
 useEffect(()=>{
  const node=ref.current;
  if(node&&document.activeElement!==node&&node.innerText!==(value||''))node.innerText=value||'';
 },[value]);
 useEffect(()=>{
  const node=ref.current;
  if(!autoFocus||!node)return;
  node.focus();
  const range=document.createRange();range.selectNodeContents(node);range.collapse(false);
  const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return createElement(tag,{
  ref,className:`ed ${className}`.trim(),contentEditable:true,suppressContentEditableWarning:true,'data-ph':ph,spellCheck:false,role:'textbox','aria-multiline':multiline||undefined,'aria-label':ph||'Edit text',style,
  onBlur:(event:{currentTarget:HTMLElement})=>{const text=event.currentTarget.innerText.replace(/\n+$/,'');if(text!==(value||''))onChange(text);},
  onKeyDown:(event:KeyboardEvent<HTMLElement>)=>{
   if(event.key==='Enter'&&!multiline){
    event.preventDefault();
    if(onEnter){onChange(event.currentTarget.innerText);onEnter(event);}else event.currentTarget.blur();
   }
   if(event.key==='Escape')event.currentTarget.blur();
  },
  onClick:(event:{stopPropagation():void})=>event.stopPropagation(),
 });
}
