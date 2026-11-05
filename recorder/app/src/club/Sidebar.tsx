import {useCallback,useEffect,useState} from 'react';
import type {Video,Workspace} from '../../shared/club';
import {clubFetch} from './api';
import type {Route,RouteName} from './routes';
import {Avatar,Icon,useToast,type IconName} from './ui';
import {ChannelMenu} from './shell/ChannelMenu';

type Channels={current:string|null;workspaces:Workspace[]};

/** The places, in order. */
const NAV:ReadonlyArray<{name:Extract<RouteName,'home'|'discover'|'videos'|'research'>;label:string;icon:IconName;href:string}>=[
 {name:'home',label:'Video board',icon:'production',href:'#/home'},
 {name:'discover',label:'Research',icon:'research',href:'#/discover'},
];

const IN_PRODUCTION:ReadonlyArray<Video['stage']>=['planning','recording','editing','publishing'];

/** Videos being made, the ones touched last first. */
export const inProduction=(videos:readonly Video[])=>videos.filter(video=>IN_PRODUCTION.includes(video.stage)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));

/** The channel switcher, search, Video board and Research. */
export function Sidebar({route,onSearch,onSwitched,onAdd,epoch}:{route:Route;onSearch():void;onSwitched():void;onAdd():void;videos:readonly Video[];epoch:number}){
 const collapsed=false;
 return <nav className="sidebar" aria-label="Main">
  <div className="sb-top">
   <ChannelSwitcher collapsed={collapsed} epoch={epoch} onSwitched={onSwitched} onAdd={onAdd}/>
  </div>
  <button type="button" className="sb-search" onClick={onSearch} title="Search (⌘K)" aria-label="Search"><Icon name="search" size={16}/><span>Search</span><span className="kbd">⌘K</span></button>
  <div className="nav">
   {NAV.map(({name,label,icon,href})=>{
    const here=route.name===name||(name==='home'&&route.name==='videos');
    const link=<a key={name} href={href} className={`nav-item${here?' active':''}`} aria-label={collapsed?label:undefined} aria-current={here?'page':undefined}>
     <Icon name={icon} size={16}/><span className="label">{label}</span>
    </a>;
    return link;
   })}
  </div>
 </nav>;
}

/** Shows the current channel and lists the others. Choosing one makes it the current channel; Add a channel opens first launch. */
function ChannelSwitcher({collapsed,epoch,onSwitched,onAdd}:{collapsed:boolean;epoch:number;onSwitched():void;onAdd():void}){
 const [channels,setChannels]=useState<Channels|null>(null),[loadFailed,setLoadFailed]=useState(false);
 const toast=useToast();
 useEffect(()=>{let live=true;setLoadFailed(false);clubFetch<Channels>('/workspaces').then(next=>live&&setChannels(next),()=>{if(live)setLoadFailed(true);});return()=>{live=false;};},[epoch]);
 const choose=useCallback((slug:string)=>{
  if(slug===channels?.current)return;
  clubFetch(`/workspaces/${encodeURIComponent(slug)}/current`,{method:'POST'}).then(()=>{
   setChannels(current=>current&&{...current,current:slug});onSwitched();
  },()=>toast("Couldn't switch channels."));
 },[channels?.current,onSwitched,toast]);
 const current=channels?.workspaces.find(workspace=>workspace.slug===channels.current);
 // With no channel there is nothing to switch: the one way to add one is the button on the screen beside, so this only says there is none.
 if(channels&&!current)return <div className="channel-btn static" title={collapsed?'No channel yet':undefined}>
  <span className="avatar lg sq" aria-hidden style={{background:'var(--cc-bg-sunk)',color:'var(--cc-text-2)'}}><Icon name="video" size={16}/></span>
  <span className="meta"><div className="name ellipsis">No channel yet</div></span>
 </div>;
 const name=current?.name??'';
 return <ChannelMenu channels={channels} current={current} onChoose={choose} onAdd={onAdd} button={(toggle,open)=><button type="button" className="channel-btn" onClick={toggle} disabled={!channels} title={collapsed?name:undefined} aria-label="Switch channel" aria-haspopup="menu" aria-expanded={open}>
  {channels?<Avatar name={name} src={current?.avatarUrl} size="lg" sq/>:<span aria-hidden style={{width:38,height:38,flex:'none',borderRadius:'var(--cc-r-lg)',background:'var(--cc-bg-sunk)'}}/>}
  <span className="meta"><div className="name ellipsis">{name}</div><div className="sub">{channels?(current?.handle||'Starting fresh'):''}</div></span>
  <Icon name="choose" size={16} className="chev faint"/>
 </button>}/>;
}
