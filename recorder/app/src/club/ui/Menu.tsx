import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
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
  window.addEventListener('resize',close);return()=>window.removeEventListener('resize',close);
 },[open]);
 const toggle=()=>{
  if(!open&&ref.current){
   const box=ref.current.getBoundingClientRect();
   setHost(ref.current.closest('.club-root'));
   setPlace({top:box.bottom+6,...(align==='left'?{left:box.left}:{right:window.innerWidth-box.right})});
  }
  setOpen(current=>!current);
 };
 return <span ref={ref} style={{position:'relative',display:'inline-flex'}}>
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
