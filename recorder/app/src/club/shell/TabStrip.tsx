import {useEffect,useRef,useState} from 'react';
import {BrandMark} from '../../BrandMark';
import {videoHumanId,type VideoStage} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {routePath,type Route} from '../routes';
import {Icon,Menu,Tooltip,cn,type MenuItem} from '../ui';

export type OpenTab={id:string;title:string;number?:number;stage?:VideoStage};

/** Home, Discover, Videos and Research share the first tab, the way Borumi's start page has a tab of its own. */
export const isHomeTab=(route:Route)=>route.name==='home'||route.name==='discover'||route.name==='videos'||route.name==='research';

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
  <Tooltip text="Help · ?"><button ref={button} type="button" className={cn('ts-icon',open&&'on')} onClick={()=>setOpen(value=>!value)} aria-label="Help" aria-haspopup="dialog" aria-expanded={open}><Icon name="help" size={16}/></button></Tooltip>
  {open&&<><div className="help-scrim" aria-hidden/>
   <div ref={panel} className="help-pop" role="dialog" aria-label="Need help?">
    <h2>Need help?</h2>
    <button type="button" className="help-card" onClick={()=>choose()}><b><Icon name="help" size={16}/>How Creator Compiler works</b><span>The four steps, the words we use and where everything lives.</span></button>
    <button type="button" className="help-card" onClick={()=>choose('shortcuts')}><b><Icon name="keyboard" size={16}/>Keyboard shortcuts</b><span>Every shortcut in one list.</span></button>
   </div></>}
 </>;
}

/**
 * The window's top bar, laid out like Borumi's: room for the traffic lights, the app menu, then the tabs. The first tab is always Home and never closes.
 * One tab follows per open video (each can be closed), then `+` for a new video, as Borumi's `+` starts a new project. Help and Settings sit on the right.
 */
export function TabStrip({route,tabs,onClose,onNewVideo,onSearch,onHelp}:{route:Route;tabs:readonly OpenTab[];onClose(id:string):void;onNewVideo():void;onSearch():void;onHelp(topic?:string):void}){
 const go=(hash:string)=>{location.hash=hash;};
 const active=route.name==='video'?route.id:null;
 const selected=useRef<HTMLDivElement>(null);
 useEffect(()=>{selected.current?.scrollIntoView?.({block:'nearest',inline:'nearest'});},[active,tabs.length]);
 const onHome=isHomeTab(route)||route.name==='settings';
 const sidebarPage=useRef({label:'Video board',icon:'production' as 'production'|'research'|'whiteboard'|'settings',href:'#/home'});
 if(onHome)sidebarPage.current=route.name==='settings'?{label:'Settings',icon:'settings',href:routePath(route)}:route.name==='discover'?{label:'Research',icon:'research',href:'#/discover'}:route.name==='research'?{label:'Channel board',icon:'whiteboard',href:'#/research'}:{label:'Video board',icon:'production',href:route.name==='videos'?routePath(route):'#/home'};
 const page=sidebarPage.current;
 const menu:MenuItem[]=[
  {label:'Video board',icon:'production',fn:()=>go('#/home')},
  {label:'Research',icon:'research',fn:()=>go('#/discover')},
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
    <BrandMark size={16}/><Icon name="expand" size={12}/>
   </button>}/>
  <nav className="ts-tabs" aria-label="Open videos">
   <div className={cn('ts-tab home',onHome&&'on')}><a href={page.href} aria-label={page.label} className="ts-label" aria-current={onHome?'page':undefined}><Icon name={page.icon} size={16}/>{page.label}</a></div>
   {tabs.map(tab=>{
    const on=tab.id===active,title=tab.title||'Untitled';
    return <div key={tab.id} ref={on?selected:undefined} className={cn('ts-tab',on&&'on')}>
     <a href={`#/video/${encodeURIComponent(tab.id)}`} className="ts-label" aria-current={on?'page':undefined} title={[videoHumanId(tab),title].filter(Boolean).join(' · ')}>{tab.stage&&<span className={`col-dot ts-stage st-${tab.stage}`} role="img" aria-label={STAGE_LABEL[tab.stage]}/>}{videoHumanId(tab)&&<span className="ts-id">{videoHumanId(tab)}</span>}<span className="ts-title">{title}</span></a>
     <button type="button" className="ts-close" onClick={()=>onClose(tab.id)} aria-label={`Close ${title}`} title="Close video · ⌘W"><Icon name="close" size={12} stroke={2.2}/></button>
    </div>;
   })}
  </nav>
  <Tooltip text="New video · N"><button type="button" className="ts-new" onClick={onNewVideo} aria-label="New video"><Icon name="add" size={15}/></button></Tooltip>
  <span className="grow"/>
  <HelpPopover onHelp={onHelp}/>
  <Tooltip text="Settings"><a href="#/settings" className={cn('ts-icon',route.name==='settings'&&'on')} aria-label="Settings" aria-current={route.name==='settings'?'page':undefined}><Icon name="settings" size={16}/></a></Tooltip>
 </header>;
}
