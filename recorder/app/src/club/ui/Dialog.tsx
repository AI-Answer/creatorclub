import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {cn} from './cn';

/**
 * Modal on the native `<dialog>`. Escape, the close button and a click on the backdrop all call `onClose`;
 * the parent owns `open`. `footer` holds the buttons, primary last.
 */
export function Dialog({open,onClose,title,description,children,footer,className}:{open:boolean;onClose():void;title:string;description?:string;children?:ReactNode;footer?:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;
  if(open&&!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
  else if(!open&&dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
 },[open]);
 return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined}
  onCancel={e=>{e.preventDefault();onClose();}}
  onClick={e=>{if(e.target===e.currentTarget)onClose();}}
  className={cn('m-auto w-[calc(100%-32px)] max-w-lg rounded-lg border border-line bg-card p-0 font-sans text-ink shadow-xl backdrop:bg-scrim',className)}>
  <div className="flex items-start justify-between gap-4 px-6 pt-5">
   <div className="flex flex-col gap-1">
    <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
    {description&&<p id={descriptionId} className="text-base text-muted">{description}</p>}
   </div>
   <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"><X size={16} aria-hidden/></button>
  </div>
  {children&&<div className="px-6 pt-4">{children}</div>}
  {footer?<div className="flex justify-end gap-2 px-6 pt-6 pb-5">{footer}</div>:<div className="pb-5"/>}
 </dialog>;
}
