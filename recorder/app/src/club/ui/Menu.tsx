import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Icon,type IconName} from './Icon';
import {useClickAway} from './useClickAway';

export type MenuItem=
 |'-'
 |{header:string}
 |{label:string;fn():void;icon?:IconName;check?:boolean;danger?:boolean};

/** The menu is drawn in the club's root when it has one, so no parent's overflow or transform affects it; without one (a test, another host) it stays in place. */
const inRoot=(host:Element|null,menu:ReactNode)=>host?createPortal(menu,host):menu;

/**
 * A button that opens a menu under it. `button(toggle,open)` draws the trigger; items run `fn` and close the menu;
 * a press outside or Escape closes it too. `align` is the side the menu lines up with.
 * It is placed with `position:fixed` from the button's edges and drawn in the club's root when there is one (outside the trigger's parents), so neither a parent with `overflow:hidden` (the sidebar) nor a transform (a card lifting on hover, which would make `fixed` relative to the card) can clip or move it; it closes if the window is resized.
 */
export function Menu({button,items,align='left',width,label}:{button(toggle:()=>void,open:boolean):ReactNode;items:readonly MenuItem[];align?:'left'|'right';width?:number;label?:string}){
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
 // Once it is drawn, a menu that would run off the bottom of the window opens upward from the button instead, when there is more room above.
 useLayoutEffect(()=>{
  if(!open||!menu.current||!anchor.current)return;
  const height=menu.current.getBoundingClientRect().height,{top,bottom}=anchor.current;
  if(height>0&&bottom+6+height>window.innerHeight-8&&top>window.innerHeight-bottom)setPlace(current=>{const {top:_below,...rest}=current;return {...rest,bottom:window.innerHeight-top+6};});
 },[open]);
 const toggle=()=>{
  if(!open&&ref.current){
   const box=ref.current.getBoundingClientRect();
   anchor.current={top:box.top,bottom:box.bottom};
   setHost(ref.current.closest('.club-root'));
   setPlace({top:box.bottom+6,...(align==='left'?{left:box.left}:{right:window.innerWidth-box.right})});
  }
  setOpen(current=>!current);
 };
 // The menu is drawn elsewhere in the page, so Tab from the button would skip it: it moves focus to the first item instead.
 const enter=(event:{key:string;shiftKey:boolean;preventDefault():void})=>{
  if(!open||event.key!=='Tab'||event.shiftKey)return;
  const first=menu.current?.querySelector<HTMLElement>('button');
  if(first){event.preventDefault();first.focus();}
 };
 return <span ref={ref} onKeyDown={enter} style={{position:'relative',display:'inline-flex'}}>
  {button(toggle,open)}
  {open&&inRoot(host,<div ref={menu} className="menu" role="menu" aria-label={label} style={{position:'fixed',...place,minWidth:width}}>
   {items.map((item,index)=>item==='-'?<div key={index} className="sep"/>
    :'header' in item?<div key={index} className="hd">{item.header}</div>
    :<button key={index} type="button" role={item.check===undefined?'menuitem':'menuitemradio'} aria-checked={item.check} onClick={()=>{setOpen(false);item.fn();}} style={item.danger?{color:'var(--cc-rec)'}:undefined}>
      {item.icon&&<Icon name={item.icon} size={15}/>}<span className="grow">{item.label}</span>{item.check&&<Icon name="Check" size={15}/>}
     </button>)}
  </div>)}
 </span>;
}
