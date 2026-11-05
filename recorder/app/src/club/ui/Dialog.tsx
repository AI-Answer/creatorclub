import {useId,type ReactNode} from 'react';
import {cn} from './cn';
import {IconButton} from './IconButton';
import {useEscape,useFocusPanel} from './overlay';

/**
 * A centred modal: a scrim, a title, the content and a footer of buttons (primary last).
 * Escape, a click on the scrim and `onClose` close it; the parent owns whether it shows (`open` defaults to true).
 */
export function Dialog({open=true,onClose,title,description,children,footer,width,className}:{open?:boolean;onClose():void;title:string;description?:string;children?:ReactNode;footer?:ReactNode;width?:number;className?:string}){
 if(!open)return null;
 return <DialogPanel onClose={onClose} title={title} description={description} footer={footer} width={width} className={className}>{children}</DialogPanel>;
}

function DialogPanel({onClose,title,description,children,footer,width,className}:{onClose():void;title:string;description?:string;children?:ReactNode;footer?:ReactNode;width?:number;className?:string}){
 const titleId=useId(),descriptionId=useId();
 useEscape(onClose);
 const panel=useFocusPanel(true);
 return <>
  <div className="scrim bg-scrim" onClick={onClose}/>
  <div ref={panel} tabIndex={-1} className={cn('dialog rounded-[var(--cc-r-lg)] border-line bg-card text-ink shadow-[var(--cc-shadow-3)]',className)} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined} style={width?{width}:undefined}>
   <div className="dh" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
    <div><h3 id={titleId}>{title}</h3>{description&&<p id={descriptionId} className="muted" style={{marginTop:4}}>{description}</p>}</div>
    <IconButton icon="close" label="Close" shortcut="Esc" style={{marginRight:-6,marginTop:-2}} onClick={onClose}/>
   </div>
   <div className="db">{children}</div>
   {footer&&<div className="df">{footer}</div>}
  </div>
 </>;
}
