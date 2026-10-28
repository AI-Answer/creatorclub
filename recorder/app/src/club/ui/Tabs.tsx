import {useRef,type KeyboardEvent} from 'react';
import {cn} from './cn';

export type Tab<T extends string=string>={id:T;label:string};

/** Segmented view switcher (`Board` · `Table` · `Calendar`). Controlled; arrow keys move between tabs. */
export function Tabs<T extends string>({tabs,value,onChange,label,className}:{tabs:readonly Tab<T>[];value:T;onChange(id:T):void;label:string;className?:string}){
 const list=useRef<HTMLDivElement>(null);
 const onKeyDown=(e:KeyboardEvent)=>{
  const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!step)return;e.preventDefault();
  const index=tabs.findIndex(tab=>tab.id===value),next=tabs[(index+step+tabs.length)%tabs.length];
  onChange(next.id);list.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
 };
 return <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('inline-flex items-center gap-1 rounded-md bg-subtle p-1 font-sans',className)}>
  {tabs.map(tab=>{const selected=tab.id===value;return <button key={tab.id} type="button" role="tab" data-tab={tab.id} aria-selected={selected} tabIndex={selected?0:-1} onClick={()=>onChange(tab.id)}
   className={cn('h-7 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent',selected?'bg-card text-ink shadow-xs':'text-muted hover:text-ink')}>{tab.label}</button>;})}
 </div>;
}
