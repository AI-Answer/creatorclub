import type {ReactElement,ReactNode} from 'react';
import {Select as Root,SelectContent,SelectItem,SelectItemIndicator,SelectTrigger,SelectValue} from '@ui-sdk/react/select';
import {Icon} from './icons';
import {useClubRoot} from './useClubRoot';

type Option<T extends string>={value:T;label:string};
type Props<T extends string>={id?:string;label:string;value:T;options:readonly Option<T>[];onChange(value:T):void;disabled?:boolean;
 /** The trigger's classes, so each place keeps its own look. */triggerClass?:string;/** An element the trigger renders as, like the app's `Button`. */render?:ReactElement;/** Drawn after the value, like a chevron. */chevron?:ReactNode;align?:'start'|'end'};

/**
 * A single choice from a popup list, on ui-sdk's Select: arrow keys, Home/End and typing a name move through the options without opening it,
 * Enter or Space opens it, and Escape or a press outside closes it with focus back on the trigger. The list renders in the club's root.
 */
export function Select<T extends string>({id,label,value,options,onChange,disabled=false,triggerClass='btn select-button',chevron=<Icon name="expand" size={14}/>,align='end',render}:Props<T>){
 const [anchor,root]=useClubRoot<HTMLSpanElement>();
 return <span ref={anchor} className="select-control">
  <Root<T> value={value} items={options as Option<T>[]} disabled={disabled} onValueChange={next=>{if(next!==null&&next!==value)onChange(next as T);}}>
   <SelectTrigger id={id} aria-label={label} className={triggerClass} render={render}><SelectValue/>{chevron}</SelectTrigger>
   <SelectContent container={root} side="bottom" align={align} sideOffset={6} collisionPadding={8}
    className="menu select-menu border-line bg-card text-ink shadow-[var(--cc-shadow-3)]" style={{borderRadius:'var(--cc-r-lg)',minWidth:'var(--anchor-width)',maxHeight:'var(--available-height)',overflowY:'auto'}}>
    {options.map(option=><SelectItem key={option.value} value={option.value} label={option.label} className="hover:bg-[var(--cc-hover)]" style={{borderRadius:'var(--cc-r)'}}>
     <span className="grow">{option.label}</span><SelectItemIndicator render={<span className="menu-check"/>}><Icon name="check" size={15}/></SelectItemIndicator>
    </SelectItem>)}
   </SelectContent>
  </Root>
 </span>;
}
