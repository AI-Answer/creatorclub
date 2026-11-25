import {Tabs as Root,TabsList,TabsTab} from '@ui-sdk/react/tabs';
import {cn} from './cn';
import {Icon,type IconName} from './icons';

export type Tab<T extends string=string>={id:T;label:string;icon?:IconName};

/** Segmented view switcher (`Board` · `Table` · `Calendar`) on ui-sdk's Tabs: one tab stop, arrow keys and Home/End move and select. Controlled. */
export function Tabs<T extends string>({tabs,value,onChange,label,className}:{tabs:readonly Tab<T>[];value:T;onChange(id:T):void;label:string;className?:string}){
 return <Root style={{display:"contents"}} value={value} onValueChange={next=>{if(next!==null)onChange(next as T);}}>
  <TabsList aria-label={label} className={cn('seg border-line bg-subtle text-[var(--cc-text-2)]',className)} style={{borderRadius:'var(--cc-r-pill)'}}>
   {tabs.map(tab=>{const selected=tab.id===value;return <TabsTab key={tab.id} value={tab.id} data-tab={tab.id} className={selected?'on':undefined}
    style={{borderRadius:'var(--cc-r-pill)',background:selected?'var(--cc-bg)':undefined,boxShadow:selected?'var(--cc-shadow-1)':undefined,color:selected?'var(--cc-text)':undefined}}>{tab.icon&&<Icon name={tab.icon} size={14}/>}{tab.label}</TabsTab>;})}
  </TabsList>
 </Root>;
}
