import {useRef} from 'react';
import {Icon} from './icons';
import {Menu} from './Menu';

/** The app's menu treatment with explicit selection and arrow-key navigation. */
export function Select<T extends string>({id,label,value,options,onChange,disabled=false}:{id?:string;label:string;value:T;options:readonly {value:T;label:string}[];onChange(value:T):void;disabled?:boolean}){
 const anchor=useRef<HTMLButtonElement>(null);
 const selected=options.find(option=>option.value===value);
 const menu=()=>[...document.querySelectorAll<HTMLElement>('[role="menu"]')].find(node=>node.getAttribute('aria-label')===label);
 const focusItem=(last=false)=>{const items=menu()?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');(last?items?.[items.length-1]:items?.[0])?.focus();};
 return <span className="select-control" onKeyDown={event=>{
  if(!['ArrowDown','ArrowUp','Home','End','Escape'].includes(event.key))return;
  event.preventDefault();
  if(event.key==='Escape'){anchor.current?.focus();return;}
  if(!menu()){anchor.current?.click();window.requestAnimationFrame(()=>focusItem(event.key==='ArrowUp'||event.key==='End'));return;}
  const items=[...(menu()?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])];
  const at=items.indexOf(document.activeElement as HTMLButtonElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items[next]?.focus();
 }}><Menu label={label} align="right" restoreFocus items={options.map(option=>({label:option.label,check:option.value===value,fn:()=>onChange(option.value)}))}
 button={(toggle,open)=><button ref={anchor} id={id} type="button" className="btn select-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle}>{selected?.label}<Icon name="expand" size={14}/></button>}/></span>;
}
