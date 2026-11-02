import {useEffect,useRef,useState} from 'react';
import {BrandMark} from '../../BrandMark';
import type {Route} from '../routes';
import {Icon,Menu,Tooltip,cn,type MenuItem} from '../ui';

export type OpenTab={id:string;title:string};

/** Home, Discover, Videos and Research share the Home tab, like Borumi's New Project tab. */
export const isHomeTab=(route:Route)=>route.name==='home'||route.name==='discover'||route.name==='videos'||route.name==='research';

/**
 * The window's top bar, laid out like Borumi's: room for the traffic lights, the app menu, one tab per open video (the active one
 * can be closed), then the Home tab while a home screen is showing or `+` to get back to it, and Help and Settings on the right.
 */
/**
 * Borumi's help popover: the window dims, and a 320px panel under the Help button offers two cards. Escape or a press outside closes it.
 */
function HelpPopover({onHelp}:{onHelp(topic?:string):void}){
 const [open,setOpen]=useState(false),panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
  const away=(event:MouseEvent)=>{if(!panel.current?.contains(event.target as Node)&&!button.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('keydown',key);document.addEventListener('mousedown',away);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('mousedown',away);};
 },[open]);
 const choose=(topic?:string)=>{setOpen(false);onHelp(topic);};
 return <>
  <Tooltip text="Help"><button ref={button} type="button" className={cn('ts-icon',open&&'on')} onClick={()=>setOpen(value=>!value)} aria-label="Help" aria-haspopup="dialog" aria-expanded={open}><Icon name="help" size={17}/></button></Tooltip>
  {open&&<><div className="help-scrim" aria-hidden/>
   <div ref={panel} className="help-pop" role="dialog" aria-label="Need help?">
    <h2>Need help?</h2>
    <button type="button" className="help-card" onClick={()=>choose()}><b><Icon name="help" size={16}/>How Creator Compiler works</b><span>The five steps, the words we use and where everything lives.</span></button>
    <button type="button" className="help-card" onClick={()=>choose('shortcuts')}><b><Icon name="keyboard" size={16}/>Keyboard shortcuts</b><span>Every shortcut in one list.</span></button>
   </div></>}
 </>;
}

export function TabStrip({route,tabs,onClose,onNewVideo,onSearch,onHelp}:{route:Route;tabs:readonly OpenTab[];onClose(id:string):void;onNewVideo():void;onSearch():void;onHelp(topic?:string):void}){
 const go=(hash:string)=>{location.hash=hash;};
 const active=route.name==='video'?route.id:null;
 const menu:MenuItem[]=[
  {label:'Home',icon:'home',fn:()=>go('#/home')},
  {label:'Discover',icon:'trending',fn:()=>go('#/discover')},
  {label:'Videos',icon:'video',fn:()=>go('#/videos')},
  {label:'Research',icon:'research',fn:()=>go('#/research')},
  '-',
  {label:'New video',icon:'add',fn:onNewVideo},
  {label:'Search',icon:'search',fn:onSearch},
  '-',
  {label:'Settings',icon:'settings',fn:()=>go('#/settings')},
  {label:'How Creator Compiler works',icon:'help',fn:()=>onHelp()},
 ];
 return <header className="tabstrip club-drag" aria-label="Window">
  <div className="ts-traffic" aria-hidden/>
  <Menu label="Creator Compiler" width={230} items={menu} restoreFocus button={(toggle,open)=>
   <button type="button" className={cn('ts-logo',open&&'on')} onClick={toggle} aria-label="Creator Compiler menu" aria-haspopup="menu" aria-expanded={open}>
    <BrandMark size={16}/><Icon name="expand" size={12} stroke={2.2}/>
   </button>}/>
  <nav className="ts-tabs" aria-label="Open videos">
   {tabs.map(tab=>{
    const on=tab.id===active,title=tab.title||'Untitled';
    return <div key={tab.id} className={cn('ts-tab',on&&'on')}>
     <a href={`#/video/${encodeURIComponent(tab.id)}`} className="ts-label" aria-current={on?'page':undefined} title={title}>{title}</a>
     <button type="button" className="ts-close" onClick={()=>onClose(tab.id)} aria-label={`Close ${title}`}><Icon name="close" size={12} stroke={2.2}/></button>
    </div>;
   })}
   {isHomeTab(route)
    ?<div className="ts-tab on home"><a href="#/home" className="ts-label" aria-current="page">Home</a></div>
    :<Tooltip text="Home"><a href="#/home" className="ts-new" aria-label="Home"><Icon name="add" size={15}/></a></Tooltip>}
  </nav>
  <span className="grow"/>
  <HelpPopover onHelp={onHelp}/>
  <Tooltip text="Settings"><a href="#/settings" className={cn('ts-icon',route.name==='settings'&&'on')} aria-label="Settings" aria-current={route.name==='settings'?'page':undefined}><Icon name="settings" size={17}/></a></Tooltip>
 </header>;
}
