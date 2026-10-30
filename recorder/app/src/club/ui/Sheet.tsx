import type {ReactNode} from 'react';
import {IconButton} from './IconButton';
import {useEscape,useFocusPanel} from './overlay';

/** A sheet: a panel that slides in from the right over a scrim, for looking at one thing without leaving the page. `header` sits left of the close button. */
export function Sheet({children,header,footer,onClose,label,width}:{children?:ReactNode;header?:ReactNode;footer?:ReactNode;onClose():void;label?:string;width?:number}){
 useEscape(onClose);
 const panel=useFocusPanel();
 return <>
  <div className="scrim" onClick={onClose}/>
  <aside ref={panel} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={label} style={width?{width}:undefined}>
   <div className="dh">{header}<IconButton icon="close" label="Close" shortcut="Esc" style={{marginLeft:'auto'}} onClick={onClose}/></div>
   <div className="db">{children}</div>
   {footer&&<div className="df">{footer}</div>}
  </aside>
 </>;
}

/** The old name of `Sheet`. */
export const Drawer=Sheet;
