import {useCallback,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Icon,type IconName} from './icons';
import {useClickAway} from './useClickAway';

export type MenuItem=
 |'-'
 |{header:string}
 |{label:string;fn():void;icon?:IconName;check?:boolean;danger?:boolean;disabled?:boolean;title?:string};

/** The menu is drawn in the club's root when it has one, so no parent's overflow or transform affects it; without one (a test, another host) it stays in place. */
const inRoot=(host:Element|null,menu:ReactNode)=>host?createPortal(menu,host):menu;

/**
 * A button that opens a menu under it. `button(toggle,open)` draws the trigger; items run `fn` and close the menu;
 * a press outside or Escape closes it too. `align` is the side the menu lines up with.
 * `restoreFocus` returns focus to the trigger when the menu closes by Escape or by choosing an item.
 * It is placed with `position:fixed` from the button's edges and drawn in the club's root when there is one (outside the trigger's parents), so neither a parent with `overflow:hidden` (the sidebar) nor a transform (a card lifting on hover, which would make `fixed` relative to the card) can clip or move it; it closes if the window is resized.
 */
export function Menu({button,items,align='left',width,label,restoreFocus,below=false}:{button(toggle:()=>void,open:boolean):ReactNode;items:readonly MenuItem[];align?:'left'|'right';width?:number;label?:string;restoreFocus?:boolean;/** Always opens below the button (scrolling inside when the window is short), never upward over what sits above it. */below?:boolean}){
 const [open,setOpen]=useState(false);
 const [place,setPlace]=useState<CSSProperties>({}),[host,setHost]=useState<Element|null>(null);
 const ref=useRef<HTMLSpanElement>(null),menu=useRef<HTMLDivElement>(null);
 useClickAway([ref,menu],()=>setOpen(false),open);
 useEffect(()=>{
  if(!open)return;
  const close=()=>setOpen(false);
  // Scrolling anywhere but inside the menu closes it, since it is placed from the button's edges when it opens.
  const scrolled=(event:Event)=>{if(!menu.current?.contains(event.target as Node))setOpen(false);};
  window.addEventListener('resize',close);window.addEventListener('scroll',scrolled,true);
  return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',scrolled,true);};
 },[open]);
 const anchor=useRef<{top:number;bottom:number}|null>(null);
 // With `restoreFocus`, closing by Escape or by choosing an item puts focus back on the trigger (the menu had it, and it is gone with the menu).
 const giveBack=useRef(false);
 useEffect(()=>{
  if(!restoreFocus)return;
  if(open){const key=(event:KeyboardEvent)=>{if(event.key==='Escape')giveBack.current=true;};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);}
  if(giveBack.current){giveBack.current=false;ref.current?.querySelector<HTMLElement>('button,a')?.focus();}
 },[open,restoreFocus]);
 // Once it is drawn, a menu that would run off the bottom of the window opens upward from the button instead, when there is more room above.
 // Measured when the menu element itself mounts (wherever it is drawn), so it never depends on effect timing.
 const placeMenu=useCallback((node:HTMLDivElement|null)=>{
  menu.current=node;
  if(!node||!anchor.current||below)return;
  const height=node.getBoundingClientRect().height,{top,bottom}=anchor.current;
  if(height>0&&bottom+6+height>window.innerHeight-8&&top>window.innerHeight-bottom)setPlace(current=>{const {top:_below,...rest}=current;return {...rest,bottom:window.innerHeight-top+6};});
 },[below]);
 const toggle=()=>{
  if(!open&&ref.current){
   const box=ref.current.getBoundingClientRect();
   anchor.current={top:box.top,bottom:box.bottom};
   setHost(ref.current.closest('.club-root'));
   setPlace({top:box.bottom+6,...(align==='left'?{left:box.left}:{right:window.innerWidth-box.right}),...(below?{maxHeight:Math.max(120,window.innerHeight-box.bottom-14),overflowY:'auto' as const}:{})});
  }
  setOpen(current=>!current);
 };
 // The menu is drawn elsewhere in the page, so Tab from the button would skip it: it moves focus to the first item instead.
 const enter=(event:{key:string;shiftKey:boolean;preventDefault():void})=>{
  if(!open||event.key!=='Tab'||event.shiftKey)return;
  const first=menu.current?.querySelector<HTMLElement>('button:not(:disabled)');
  if(first){event.preventDefault();first.focus();}
 };
 return <span ref={ref} onKeyDown={enter} style={{position:'relative',display:'inline-flex'}}>
  {button(toggle,open)}
  {open&&inRoot(host,<div ref={placeMenu} className="menu border-line bg-card text-ink shadow-[var(--cc-shadow-3)]" role="menu" aria-label={label} style={{position:'fixed',borderRadius:'var(--cc-r-lg)',...place,minWidth:width}}>
   {items.map((item,index)=>item==='-'?<div key={index} className="sep"/>
    :'header' in item?<div key={index} className="hd">{item.header}</div>
    :<button key={index} type="button" role={item.check===undefined?'menuitem':'menuitemradio'} aria-checked={item.check} disabled={item.disabled} title={item.title} className="hover:bg-[var(--cc-hover)] focus-visible:outline-accent" onClick={()=>{giveBack.current=true;setOpen(false);item.fn();}} style={{borderRadius:'var(--cc-r)',color:item.danger?'var(--cc-danger)':'var(--cc-text)'}}>
      {item.icon&&<Icon name={item.icon} size={15}/>}<span className="grow">{item.label}</span>{item.check&&<Icon name="check" size={15}/>}
     </button>)}
  </div>)}
 </span>;
}
