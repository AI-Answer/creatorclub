import type {ReactNode} from 'react';
import {ChevronsUpDown,LayoutGrid,Plus,Settings} from 'lucide-react';
import {cn} from './ui';
import type {Route} from './routes';

/** Left sidebar, 240px: channel switcher, `Board` and `Settings`, and `?` at the bottom. */
export function Sidebar({route,navigate,onHelp}:{route:Route;navigate(route:Route):void;onHelp():void}){
 return <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-page">
  <div className="club-drag club-window-top h-3 shrink-0"/>
  <div className="px-3">
   {/* Placeholder until channels exist (Task 4): leads to "Add your channel". */}
   <button type="button" onClick={()=>navigate({name:'onboarding'})} className="flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent">
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted"><Plus size={14}/></span>
    <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">Add your channel</span>
    <ChevronsUpDown aria-hidden size={14} className="text-muted"/>
   </button>
  </div>
  <nav aria-label="Main" className="flex flex-col gap-0.5 px-3 pt-4">
   <NavItem icon={<LayoutGrid/>} active={route.name==='board'} onClick={()=>navigate({name:'board'})}>Board</NavItem>
   <NavItem icon={<Settings/>} active={route.name==='settings'} onClick={()=>navigate({name:'settings'})}>Settings</NavItem>
  </nav>
  <div className="mt-auto p-3">
   <button type="button" aria-label="How CreatorClub works" title="How CreatorClub works" onClick={onHelp} className="flex size-8 items-center justify-center rounded-full border border-line bg-card text-sm font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">?</button>
  </div>
 </aside>;
}

function NavItem({icon,active,onClick,children}:{icon:ReactNode;active:boolean;onClick():void;children:ReactNode}){
 return <button type="button" aria-current={active?'page':undefined} onClick={onClick}
  className={cn('flex h-9 items-center gap-2.5 rounded-md px-2 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4',active?'bg-accent-soft text-accent':'text-muted hover:bg-subtle hover:text-ink')}>{icon}{children}</button>;
}
