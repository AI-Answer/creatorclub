import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Check,ChevronsUpDown,LayoutGrid,Plus,Settings} from 'lucide-react';
import type {Workspace} from '../../shared/club';
import {clubFetch} from './api';
import {cn} from './ui';
import type {Route} from './routes';

type Channels={current:string|null;workspaces:Workspace[]};

/** Left sidebar, 240px: channel switcher, `Board` and `Settings`, and `?` at the bottom. */
export function Sidebar({route,navigate,onHelp,onSwitch}:{route:Route;navigate(route:Route):void;onHelp():void;onSwitch?(slug:string):void}){
 return <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-page">
  <div className="club-drag club-window-top h-3 shrink-0"/>
  <div className="relative px-3">
   <ChannelSwitcher onAdd={()=>navigate({name:'onboarding'})} onSwitch={onSwitch}/>
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

/** Shows the current channel; opens a list of channels with `Add channel` at the end. */
function ChannelSwitcher({onAdd,onSwitch}:{onAdd():void;onSwitch?(slug:string):void}){
 const [channels,setChannels]=useState<Channels|null>(null);
 const [open,setOpen]=useState(false);
 const [error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let live=true;clubFetch<Channels>('/workspaces').then(next=>live&&setChannels(next),()=>{});return()=>{live=false;};},[]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 const choose=useCallback((slug:string)=>{
  if(slug===channels?.current){setOpen(false);return;}
  setError('');
  clubFetch(`/workspaces/${encodeURIComponent(slug)}/current`,{method:'POST'}).then(()=>{
   setChannels(current=>current&&{...current,current:slug});setOpen(false);onSwitch?.(slug);
  },()=>setError("Couldn't switch channels."));
 },[channels?.current,onSwitch]);
 const current=channels?.workspaces.find(workspace=>workspace.slug===channels.current);
 if(channels&&!current)return <button type="button" onClick={onAdd} className="flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent">
  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted"><Plus size={14}/></span>
  <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">Add channel</span>
 </button>;
 return <div ref={root}>
  <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} disabled={!channels} onClick={()=>setOpen(!open)} className="flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent">
   <Avatar name={current?.name??''}/>
   <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">{current?.name??''}</span>
   <ChevronsUpDown aria-hidden size={14} className="text-muted"/>
  </button>
  {open&&channels&&<div role="menu" aria-label="Channels" className="absolute inset-x-3 top-full z-20 mt-1 flex flex-col gap-0.5 rounded-lg border border-line bg-card p-1 shadow-lg">
   {channels.workspaces.map(workspace=><MenuItem key={workspace.slug} role="menuitemradio" checked={workspace.slug===channels.current} onClick={()=>choose(workspace.slug)}>
    <Avatar name={workspace.name}/><span className="min-w-0 flex-1 truncate">{workspace.name}</span>{workspace.slug===channels.current&&<Check aria-hidden size={14} className="text-accent"/>}
   </MenuItem>)}
   <div className="my-1 border-t border-line"/>
   <MenuItem role="menuitem" onClick={()=>{setOpen(false);onAdd();}}>
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted"><Plus size={14}/></span>Add channel
   </MenuItem>
   {error&&<p role="alert" className="px-2 py-1 text-sm text-danger">{error}</p>}
  </div>}
 </div>;
}

function MenuItem({role,checked,onClick,children}:{role:'menuitem'|'menuitemradio';checked?:boolean;onClick():void;children:ReactNode}){
 return <button type="button" role={role} aria-checked={checked} onClick={onClick} className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-base text-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent">{children}</button>;
}

function Avatar({name}:{name:string}){
 return <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{name.trim().charAt(0).toUpperCase()}</span>;
}

function NavItem({icon,active,onClick,children}:{icon:ReactNode;active:boolean;onClick():void;children:ReactNode}){
 return <button type="button" aria-current={active?'page':undefined} onClick={onClick}
  className={cn('flex h-9 items-center gap-2.5 rounded-md px-2 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-4',active?'bg-accent-soft text-accent':'text-muted hover:bg-subtle hover:text-ink')}>{icon}{children}</button>;
}
