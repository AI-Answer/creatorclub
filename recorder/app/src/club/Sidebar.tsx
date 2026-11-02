import {useCallback,useEffect,useState} from 'react';
import type {Video,Workspace} from '../../shared/club';
import {clubFetch} from './api';
import type {Route,RouteName} from './routes';
import {Avatar,Icon,Menu,Tooltip,useToast,type IconName,type MenuItem} from './ui';

type Channels={current:string|null;workspaces:Workspace[]};

/** The places, in order. */
const NAV:ReadonlyArray<{name:Extract<RouteName,'home'|'discover'|'videos'|'research'>;label:string;icon:IconName;href:string}>=[
 {name:'home',label:'Home',icon:'home',href:'#/home'},
 {name:'discover',label:'Discover',icon:'trending',href:'#/discover'},
 {name:'videos',label:'Videos',icon:'video',href:'#/videos'},
 {name:'research',label:'Research',icon:'research',href:'#/research'},
];

const IN_PRODUCTION:ReadonlyArray<Video['stage']>=['planning','recording','editing','publishing'];

/** Videos being made, the ones touched last first. */
export const inProduction=(videos:readonly Video[])=>videos.filter(video=>IN_PRODUCTION.includes(video.stage)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));

/**
 * The Home tab's left nav, laid out like Borumi's Settings nav (256px, one row per place): the channel switcher, search, then
 * Home, Discover, Videos (with the number of videos in progress) and Research. Settings and Help live in the tab strip.
 */
export function Sidebar({route,onSearch,onSwitched,onAdd,videos,epoch}:{route:Route;onSearch():void;onSwitched():void;onAdd():void;videos:readonly Video[];epoch:number}){
 const counts:Partial<Record<RouteName,number>>={videos:inProduction(videos).length};
 const collapsed=false;
 return <nav className="sidebar" aria-label="Main">
  <div className="sb-top">
   <ChannelSwitcher collapsed={collapsed} epoch={epoch} onSwitched={onSwitched} onAdd={onAdd}/>
  </div>
  <button type="button" className="sb-search" onClick={onSearch} title="Search (⌘K)" aria-label="Search"><Icon name="search" size={15}/><span>Search</span><span className="kbd">⌘K</span></button>
  <div className="nav">
   {NAV.map(({name,label,icon,href})=>{
    const here=route.name===name,count=counts[name];
    const link=<a key={name} href={href} className={`nav-item${here?' active':''}`} aria-label={collapsed?label:undefined} aria-current={here?'page':undefined}>
     <Icon name={icon} size={17}/><span className="label">{label}</span>{count?<span className="count" title={`${count} in progress`}>{count}</span>:null}
    </a>;
    return link;
   })}
  </div>
 </nav>;
}

/** Shows the current channel and lists the others. Choosing one makes it the current channel; Add a channel opens first launch. */
function ChannelSwitcher({collapsed,epoch,onSwitched,onAdd}:{collapsed:boolean;epoch:number;onSwitched():void;onAdd():void}){
 const [channels,setChannels]=useState<Channels|null>(null);
 const toast=useToast();
 useEffect(()=>{let live=true;clubFetch<Channels>('/workspaces').then(next=>live&&setChannels(next),()=>{});return()=>{live=false;};},[epoch]);
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
 const items:MenuItem[]=[{header:'Channels'},...(channels?.workspaces??[]).map(workspace=>({label:workspace.name,check:workspace.slug===channels?.current,fn:()=>choose(workspace.slug)})),'-',{label:'Add a channel',icon:'add',fn:onAdd}];
 return <Menu width={240} label="Channels" items={items} button={toggle=><button type="button" className="channel-btn" onClick={toggle} disabled={!channels} title={collapsed?name:undefined} aria-label="Switch channel" aria-haspopup="menu">
  {channels?<Avatar name={name} size="lg" sq/>:<span aria-hidden style={{width:38,height:38,flex:'none',borderRadius:10,background:'var(--cc-bg-sunk)'}}/>}
  <span className="meta"><div className="name ellipsis">{name}</div><div className="sub">{channels?(current?.handle||'Starting fresh'):''}</div></span>
  <Icon name="choose" size={15} className="chev faint"/>
 </button>}/>;
}
