import type {Ref} from 'react';
import {Badge,Button,Icon,cn} from '../ui';

export type TakeStatus='confirmed'|'archived'|'new';

/** The badge beside the take's name: green once the take is on the timeline. */
export function TakeStatusBadge({status}:{status:TakeStatus}){
 return status==='confirmed'?<Badge tone="success">Used in this scene</Badge>:status==='archived'?<Badge>Archived</Badge>:<Badge tone="accent">New take</Badge>;
}

export type TakeMenuItem={label:string;hint?:string;onSelect():void};

/** The gear beside the take's name. It holds every take option that is not one of the three main choices. */
export function TakeGearMenu({items,open,disabled,onOpenChange,menuRef}:{items:TakeMenuItem[];open:boolean;disabled:boolean;onOpenChange(open:boolean):void;menuRef?:Ref<HTMLDivElement>}){
 return <div ref={menuRef} className="relative">
  <button type="button" aria-label="Take options" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>onOpenChange(!open)}
   className="flex size-8 items-center justify-center rounded-[var(--cc-r)] text-muted hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45"><Icon name="take-settings" size={18}/></button>
  {open&&<div role="menu" aria-label="Take options" className="absolute top-full left-0 z-20 mt-1 flex w-72 flex-col gap-0.5 rounded-[var(--cc-r-lg)] border border-line bg-card p-1 font-sans shadow-[var(--cc-shadow-3)]">
   {items.map(item=><button key={item.label} type="button" role="menuitem" disabled={disabled} onClick={()=>{onOpenChange(false);item.onSelect();}}
    className="flex flex-col items-start gap-0.5 rounded-[var(--cc-r)] px-3 py-2 text-left text-base text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45">
    {item.label}{item.hint&&<span className="text-xs text-muted">{item.hint}</span>}
   </button>)}
  </div>}
 </div>;
}

/** Delete stays quiet; a new take can be used once, then its confirmation is shown in place. */
export function TakePreviewFooter({busy,confirmed=false,deleteArmed,onDelete,onRetake,onContinue}:{busy:boolean;confirmed?:boolean;deleteArmed:boolean;onDelete?():void;onRetake():void;onContinue():void}){
 return <footer className="club-take-footer flex shrink-0 items-center gap-3 border-t border-line bg-card px-6 py-4 font-sans">
  {onDelete&&<Button variant="ghost" disabled={busy} onClick={onDelete} className={cn('club-take-delete',deleteArmed&&'is-armed')}><Icon name="delete"/>{deleteArmed?'Click again to delete':'Delete take'}</Button>}
  <div className="ml-auto flex items-center gap-3">
   <Button variant="ghost" disabled={busy} onClick={onRetake}><Icon name="undo"/>Record another take</Button>
   <Button variant="primary" disabled={busy} onClick={onContinue}>{confirmed?'Done':<>Use this take<Icon name="check"/></>}</Button>
  </div>
 </footer>;
}
