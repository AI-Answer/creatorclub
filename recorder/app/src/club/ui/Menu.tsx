import {Fragment,useState,type CSSProperties,type ReactElement} from 'react';
import {Menu as Root,MenuCheckboxItem,MenuContent,MenuGroup,MenuGroupLabel,MenuItem as Item,MenuItemIndicator,MenuRadioGroup,MenuRadioItem,MenuSeparator,MenuTrigger} from '@ui-sdk/react/menu';
import {Icon,type IconName} from './icons';
import {useClubRoot} from './useClubRoot';

type Action={label:string;fn():void;icon?:IconName;danger?:boolean;disabled?:boolean;title?:string};
/** `check` is an on/off setting (a checkbox item); `selected` is one choice of several (radio items next to each other form one group). */
export type MenuItem='-'|{header:string}|(Action&{check?:boolean;selected?:never})|(Action&{selected:boolean;check?:never});

type Row=Exclude<MenuItem,'-'|{header:string}>;
type Section={header?:string;rows:Row[]};

function sections(items:readonly MenuItem[]):Section[]{
 const out:Section[]=[{rows:[]}];
 for(const item of items){
  if(item==='-'){out.push({rows:[]});continue;}
  const last=out[out.length-1];
  if('header' in item){if(last.header!==undefined||last.rows.length)out.push({header:item.header,rows:[]});else last.header=item.header;continue;}
  last.rows.push(item);
 }
 return out.filter(section=>section.header!==undefined||section.rows.length);
}

const body=(row:Row,check?:boolean)=><>{row.icon&&<Icon name={row.icon} size={15}/>}<span className="grow">{row.label}</span>{check!==undefined&&<MenuItemIndicator render={<span className="menu-check"/>}><Icon name="check" size={15}/></MenuItemIndicator>}</>;
const look=(row:Row):CSSProperties=>({borderRadius:'var(--cc-r)',color:row.danger?'var(--cc-danger)':'var(--cc-text)'});
const itemClass='hover:bg-[var(--cc-hover)] focus-visible:outline-accent';

function Rows({rows}:{rows:Row[]}){
 const runs:Row[][]=[];
 for(const row of rows){const last=runs[runs.length-1];if(last&&(row.selected!==undefined)===(last[0].selected!==undefined)&&row.selected!==undefined)last.push(row);else runs.push([row]);}
 return runs.map((run,r)=>{
  if(run[0].selected!==undefined){
   const chosen=run.findIndex(row=>row.selected);
   return <MenuRadioGroup key={r} value={chosen<0?null:String(chosen)} onValueChange={value=>run[Number(value)]?.fn()}>
    {run.map((row,i)=><MenuRadioItem key={`${i}:${row.label}`} value={String(i)} label={row.label} disabled={row.disabled} closeOnSelect title={row.title} className={itemClass} style={look(row)} render={<button type="button"/>}>{body(row,!!row.selected)}</MenuRadioItem>)}
   </MenuRadioGroup>;
  }
  const row=run[0];
  if(row.check!==undefined)return <MenuCheckboxItem key={`${r}:${row.label}`} value={row.label} label={row.label} checked={row.check} onCheckedChange={()=>row.fn()} disabled={row.disabled} closeOnSelect title={row.title} className={itemClass} style={look(row)} render={<button type="button"/>}>{body(row,row.check)}</MenuCheckboxItem>;
  return <Item key={`${r}:${row.label}`} label={row.label} onSelect={()=>row.fn()} disabled={row.disabled} destructive={row.danger} title={row.title} className={itemClass} style={look(row)} render={<button type="button"/>}>{body(row)}</Item>;
 });
}

/**
 * A button that opens a menu under it, on ui-sdk's Menu: arrow keys, Home/End and typeahead move through the items, Enter or a click runs one,
 * and Escape or a press outside closes it with focus back on the trigger. `trigger(open)` draws the trigger; the menu presses and labels it.
 * The menu is drawn in the browser's top layer from the club's root, so a parent that clips (the sidebar) or lifts on hover (a card) cannot cut it off or move it.
 */
export function Menu({trigger,items,align='left',width,label,below=false}:{trigger(open:boolean):ReactElement;items:readonly MenuItem[];align?:'left'|'right';width?:number;label?:string;/** Scrolls inside the room under the button rather than growing past it. */below?:boolean}){
 const [open,setOpen]=useState(false);
 const [anchor,root]=useClubRoot<HTMLSpanElement>();
 return <span ref={anchor} className="menu-host" style={{position:'relative',display:'inline-flex'}}>
  <Root open={open} onOpenChange={next=>setOpen(next)}>
   <MenuTrigger render={trigger(open)}/>
   <MenuContent container={root} side="bottom" align={align==='left'?'start':'end'} sideOffset={6} collisionPadding={8} aria-label={label}
    className="menu border-line bg-card text-ink shadow-[var(--cc-shadow-3)]" style={{borderRadius:'var(--cc-r-lg)',minWidth:width,maxHeight:below?'var(--available-height)':undefined,overflowY:'auto'}}>
    {sections(items).map((section,s)=><Fragment key={s}>
     {s>0&&<MenuSeparator className="sep"/>}
     {section.header!==undefined?<MenuGroup><MenuGroupLabel className="hd">{section.header}</MenuGroupLabel><Rows rows={section.rows}/></MenuGroup>:<Rows rows={section.rows}/>}
    </Fragment>)}
   </MenuContent>
  </Root>
 </span>;
}
