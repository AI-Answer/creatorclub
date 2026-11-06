import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {cn} from '../ui';

/* The sketch's text: typed straight into, with no boxes. Shared by the sketch and its thumbnail studio. */

/** A text box that grows with its text. It keeps what is being typed; a new value from outside shows once it is not being typed in. */
export function Field({value,label,placeholder,className,onChange,onCommit,onKeyDown,onFocus,id,autoFocus}:{value:string;label:string;placeholder?:string;className?:string;
 onChange?(text:string):void;onCommit?(text:string):void;onKeyDown?(event:KeyboardEvent<HTMLTextAreaElement>):void;onFocus?():void;id?:string;autoFocus?:boolean}){
 const [text,setText]=useState(value),area=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{if(document.activeElement!==area.current)setText(value);},[value]);
 useEffect(()=>{const node=area.current;if(autoFocus&&node){node.focus();node.setSelectionRange(node.value.length,node.value.length);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return <textarea ref={area} id={id} className={cn('bs-text',className)} value={text} rows={1} spellCheck={false} aria-label={label} placeholder={placeholder}
  onChange={event=>{setText(event.target.value);onChange?.(event.target.value);}} onFocus={onFocus} onBlur={()=>onCommit?.(text)} onKeyDown={onKeyDown}/>;
}

/** Long text at rest: a few lines, the rest cut. A click (or Tab) opens it where it is, whole, to edit. */
export function Clamp({lines,className,id,...field}:{value:string;lines:number;label:string;placeholder?:string;className?:string;id?:string;
 onChange?(text:string):void;onCommit?(text:string):void;onKeyDown?(event:KeyboardEvent<HTMLTextAreaElement>):void}){
 const [editing,setEditing]=useState(false);
 if(editing||!field.value.trim())return <Field {...field} id={id} className={className} autoFocus={editing} onFocus={()=>setEditing(true)} onCommit={text=>{setEditing(false);field.onCommit?.(text);}}/>;
 return <div id={id} role="textbox" tabIndex={0} aria-label={field.label} className={cn('sk-clamp',className)} style={{WebkitLineClamp:lines}} onFocus={()=>setEditing(true)}>{field.value}</div>;
}

