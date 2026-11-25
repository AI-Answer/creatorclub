import {useRef,type ReactNode} from 'react';
import {Dialog as Root,DialogBackdrop,DialogContent,DialogDescription,DialogTitle} from '@ui-sdk/react/dialog';
import {cn} from './cn';
import {IconButton} from './IconButton';

/** Focus stays on a field inside that took it as it mounted (React's `autoFocus`); otherwise the panel itself takes it, without a focus ring on a control. */
export function useInitialFocus(){
 const panel=useRef<HTMLDivElement>(null);
 const initialFocus=()=>{const node=panel.current,active=document.activeElement;return node&&active instanceof HTMLElement&&node.contains(active)?active:node;};
 return [panel,initialFocus] as const;
}

/**
 * A centred modal on ui-sdk's Dialog: a scrim, a title, the content and a footer of buttons (primary last).
 * Escape, a press on the scrim and Close call `onClose`; Tab stays inside, and focus goes back to what had it. The parent owns whether it shows.
 */
export function Dialog({open=true,onClose,title,description,children,footer,width,className}:{open?:boolean;onClose():void;title:string;description?:string;children?:ReactNode;footer?:ReactNode;width?:number;className?:string}){
 const [panel,initialFocus]=useInitialFocus();
 if(!open)return null;
 return <Root open onOpenChange={next=>{if(!next)onClose();}}>
  <DialogBackdrop className="scrim bg-scrim"/>
  <DialogContent ref={panel} initialFocus={initialFocus} className={cn('dialog rounded-[var(--cc-r-lg)] border-line bg-card text-ink shadow-[var(--cc-shadow-3)]',className)} style={width?{width}:undefined}>
   <div className="dh" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
    <div><DialogTitle render={<h3/>}>{title}</DialogTitle>{description&&<DialogDescription className="muted" style={{marginTop:4}}>{description}</DialogDescription>}</div>
    <IconButton icon="close" label="Close" shortcut="Esc" style={{marginRight:-6,marginTop:-2}} onClick={onClose}/>
   </div>
   <div className="db">{children}</div>
   {footer&&<div className="df">{footer}</div>}
  </DialogContent>
 </Root>;
}
