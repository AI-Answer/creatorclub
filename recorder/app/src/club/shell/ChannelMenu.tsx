import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {Workspace} from '../../../shared/club';
import {Avatar,Icon} from '../ui';
import {useClickAway} from '../ui/useClickAway';

/** The channel picker, with the same cached picture in its trigger and every menu row. */
export function ChannelMenu({channels,current,onChoose,onAdd,button}:{channels:{workspaces:Workspace[]}|null;current?:Workspace;onChoose(slug:string):void;onAdd():void;button(toggle:()=>void,open:boolean):ReactNode}){
 const [open,setOpen]=useState(false),[place,setPlace]=useState<CSSProperties>({}),[host,setHost]=useState<Element|null>(null);
 const anchor=useRef<HTMLSpanElement>(null),menu=useRef<HTMLDivElement>(null);
 const close=()=>setOpen(false);
 useClickAway([anchor,menu],close,open);
 useEffect(()=>{
  if(!open)return;
  const dismiss=(event:Event)=>{if(!(event.target instanceof Node&&menu.current?.contains(event.target)))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')anchor.current?.querySelector('button')?.focus();};
  window.addEventListener('resize',dismiss);window.addEventListener('scroll',dismiss,true);document.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',dismiss,true);document.removeEventListener('keydown',escape);};
 },[open]);
 const toggle=()=>{
  if(!open&&anchor.current){const box=anchor.current.getBoundingClientRect();setHost(anchor.current.closest('.club-root'));setPlace({top:box.bottom+6,left:box.left,width:240,maxWidth:'calc(100vw - 16px)',maxHeight:Math.max(120,window.innerHeight-box.bottom-14),overflowY:'auto'});}
  setOpen(value=>!value);
 };
 const choose=(action:()=>void)=>{close();action();anchor.current?.querySelector('button')?.focus();};
 const key=(event:ReactKeyboardEvent)=>{
  const items=[...(menu.current?.querySelectorAll<HTMLButtonElement>('button')??[])];
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const at=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='ArrowDown'?at+1:at-1;items[(next+items.length)%items.length]?.focus();}
  if(event.key==='Tab'&&!menu.current?.contains(event.target as Node)&&open){event.preventDefault();items[0]?.focus();}
 };
 const content=<div ref={menu} role="menu" aria-label="Channels" className="menu" style={{position:'fixed',...place}} onKeyDown={key}>
  <div className="hd">Channels</div>
  {channels?.workspaces.map(workspace=><button type="button" key={workspace.slug} role="menuitemradio" aria-checked={workspace.slug===current?.slug} onClick={()=>choose(()=>onChoose(workspace.slug))}>
   <Avatar name={workspace.name} src={workspace.avatarUrl} size="sm" sq/><span className="grow ellipsis">{workspace.name}</span>{workspace.slug===current?.slug&&<Icon name="check" size={16}/>}
  </button>)}
  <div className="sep"/><button type="button" role="menuitem" onClick={()=>choose(onAdd)}><Icon name="add" size={16}/><span>Add a channel</span></button>
 </div>;
 return <span ref={anchor} style={{position:'relative',display:'inline-flex',width:'100%'}} onKeyDown={key}>{button(toggle,open)}{open&&(host?createPortal(content,host):content)}</span>;
}
