import {useCallback,useEffect,useState} from 'react';
import type {Video,Workspace} from '../../shared/club';
import {clubFetch} from './api';
import {statusLine,youtubeId} from './board';
import {defaultTab,type Route,type RouteName} from './routes';
import {Avatar,Icon,Menu,Thumb,useToast,type IconName,type MenuItem} from './ui';

type Channels={current:string|null;workspaces:Workspace[]};

const NAV:ReadonlyArray<{name:Extract<RouteName,'overview'|'ideas'|'trending'|'signals'|'production'>;label:string;icon:IconName}>=[
 {name:'overview',label:'Overview',icon:'House'},
 {name:'ideas',label:'Ideas',icon:'Lightbulb'},
 {name:'trending',label:'Working now',icon:'TrendingUp'},
 {name:'signals',label:'Signals',icon:'MessagesSquare'},
 {name:'production',label:'Production',icon:'SquareKanban'},
];

const IN_PRODUCTION:ReadonlyArray<Video['stage']>=['planning','recording','editing','publishing'];

/** Videos being made, the ones touched last first. */
export const inProduction=(videos:readonly Video[])=>videos.filter(video=>IN_PRODUCTION.includes(video.stage)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
/** Ideas you haven't put off or skipped. */
export const openIdeas=(videos:readonly Video[])=>videos.filter(video=>video.stage==='ideas'&&!video.hidden);

/**
 * Left sidebar: the channel switcher, search, the five places, the videos in production, then Settings, How it works and the collapse button.
 * Collapsed, it is an icon rail with the same places.
 */
export function Sidebar({route,collapsed,onToggle,onSearch,onHelp,onSwitched,onAdd,videos,epoch}:{route:Route;collapsed:boolean;onToggle():void;onSearch():void;onHelp():void;onSwitched():void;onAdd():void;videos:readonly Video[];epoch:number}){
 const active=inProduction(videos),ideas=openIdeas(videos).length;
 const counts:Partial<Record<RouteName,number>>={ideas,production:active.length};
 return <nav className={`sidebar${collapsed?' collapsed':''}`} aria-label="Main">
  <div className="club-drag club-window-top"/>
  <div className="sb-top">
   <ChannelSwitcher collapsed={collapsed} epoch={epoch} onSwitched={onSwitched} onAdd={onAdd}/>
  </div>
  <button type="button" className="sb-search" onClick={onSearch} title="Search"><Icon name="Search" size={15}/><span>Search</span><span className="kbd">⌘K</span></button>
  <div className="nav">
   {NAV.map(({name,label,icon})=>{
    const here=route.name===name,count=counts[name];
    return <a key={name} href={`#/${name}`} className={`nav-item${here?' active':''}`} title={collapsed?label:undefined} aria-label={collapsed?label:undefined} aria-current={here?'page':undefined}>
     <Icon name={icon} size={17}/><span className="label">{label}</span>{count?<span className="count">{count}</span>:null}
    </a>;
   })}
  </div>
  {active.length>0&&<div className="sb-videos">
   <div className="sb-label">In production</div>
   <div className="nav" style={{paddingTop:0}}>
    {active.slice(0,5).map(video=><a key={video.id} href={`#/video/${encodeURIComponent(video.id)}/${defaultTab(video.stage)}`} className={`sb-video${route.name==='video'&&route.id===video.id?' active':''}`} title={statusLine(video)}>
     <span className="mini" style={{position:'relative'}}><Thumb videoId={youtubeId(video.youtubeUrl)} text={video.title} seed={video.id} style={{borderRadius:4,aspectRatio:'auto',height:20}}/></span>
     <span className="t">{video.title}</span>
    </a>)}
   </div>
  </div>}
  <div className="sb-bottom">
   <a href="#/settings" className={`nav-item${route.name==='settings'?' active':''}`} title={collapsed?'Settings':undefined} aria-label={collapsed?'Settings':undefined} aria-current={route.name==='settings'?'page':undefined}>
    <Icon name="Settings" size={17}/><span className="label">Settings</span>
   </a>
   <button type="button" className="nav-item" onClick={onHelp} title={collapsed?'How CreatorClub works':undefined} aria-label="How CreatorClub works"><Icon name="CircleHelp" size={17}/><span className="label">How it works</span></button>
   <button type="button" className="nav-item" onClick={onToggle} title={collapsed?'Expand sidebar':'Collapse sidebar'} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}>
    <Icon name={collapsed?'PanelLeftOpen':'PanelLeftClose'} size={17}/><span className="label">{collapsed?'Expand':'Collapse'}</span>
   </button>
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
 if(channels&&!current)return <a href="#/welcome?step=2" className="channel-btn" title={collapsed?'Add a channel':undefined} aria-label="Add a channel">
  <span className="avatar lg sq" aria-hidden style={{background:'var(--cc-bg-sunk)',color:'var(--cc-text-2)'}}><Icon name="Plus" size={16}/></span>
  <span className="meta"><div className="name ellipsis">Add a channel</div></span>
 </a>;
 const name=current?.name??'';
 const items:MenuItem[]=[{header:'Channels'},...(channels?.workspaces??[]).map(workspace=>({label:workspace.name,check:workspace.slug===channels?.current,fn:()=>choose(workspace.slug)})),'-',{label:'Add a channel',icon:'Plus',fn:onAdd}];
 return <Menu width={240} label="Channels" items={items} button={toggle=><button type="button" className="channel-btn" onClick={toggle} disabled={!channels} title={collapsed?name:undefined} aria-label="Switch channel" aria-haspopup="menu">
  {channels?<Avatar name={name} size="lg" sq/>:<span aria-hidden style={{width:38,height:38,flex:'none',borderRadius:10,background:'var(--cc-bg-sunk)'}}/>}
  <span className="meta"><div className="name ellipsis">{name}</div><div className="sub">{channels?(current?.handle||'Starting fresh'):''}</div></span>
  <Icon name="ChevronsUpDown" size={15} className="chev faint"/>
 </button>}/>;
}
