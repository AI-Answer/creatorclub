import type {ReactNode} from 'react';
import {Dialog,DialogBackdrop,DialogContent} from '@ui-sdk/react/dialog';
import {IconButton} from './IconButton';
import {useInitialFocus} from './Dialog';

/** A sheet: a panel that slides in from the right over a scrim, for looking at one thing without leaving the page. `header` sits left of the close button. A modal on ui-sdk's Dialog. */
export function Sheet({children,header,footer,onClose,label,width}:{children?:ReactNode;header?:ReactNode;footer?:ReactNode;onClose():void;label?:string;width?:number}){
 const [panel,initialFocus]=useInitialFocus();
 return <Dialog open onOpenChange={next=>{if(!next)onClose();}}>
  <DialogBackdrop className="scrim bg-scrim"/>
  <DialogContent ref={panel} initialFocus={initialFocus} render={<aside/>} aria-label={label} className="drawer rounded-[var(--cc-r-lg)] border-line bg-card text-ink shadow-[var(--cc-shadow-3)]" style={width?{width}:undefined}>
   <div className="dh">{header}<IconButton icon="close" label="Close" shortcut="Esc" style={{marginLeft:'auto'}} onClick={onClose}/></div>
   <div className="db">{children}</div>
   {footer&&<div className="df">{footer}</div>}
  </DialogContent>
 </Dialog>;
}

/** The old name of `Sheet`. */
export const Drawer=Sheet;
