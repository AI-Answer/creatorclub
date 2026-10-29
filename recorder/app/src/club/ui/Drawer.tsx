import type {ReactNode} from 'react';
import {Icon} from './Icon';
import {useEscape,useFocusPanel} from './overlay';

/** A panel that slides in from the right over a scrim, for looking at one thing without leaving the page. `header` sits left of the close button. */
export function Drawer({children,header,footer,onClose,label}:{children?:ReactNode;header?:ReactNode;footer?:ReactNode;onClose():void;label?:string}){
 useEscape(onClose);
 const panel=useFocusPanel();
 return <>
  <div className="scrim" onClick={onClose}/>
  <aside ref={panel} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={label}>
   <div className="dh">{header}<button type="button" className="btn ghost sm icon-only" style={{marginLeft:'auto'}} onClick={onClose} aria-label="Close"><Icon name="X" size={16}/></button></div>
   <div className="db">{children}</div>
   {footer&&<div className="df">{footer}</div>}
  </aside>
 </>;
}
