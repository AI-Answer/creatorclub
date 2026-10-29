import {useMemo,useState} from 'react';
import type {Video} from '../../../shared/club';
import {STAGE_LABEL} from '../board';
import {defaultTab,type Route} from '../routes';
import {Icon,type IconName} from '../ui';

/** A page or video to open (`route`), or the New video action. */
type Option={label:string;route?:Route;icon:IconName;kind:string};

const PAGES:ReadonlyArray<Option>=[
 {label:'New video',icon:'Plus',kind:'Action'},
 {label:'Home',route:{name:'home'},icon:'House',kind:'Page'},
 {label:'Discover',route:{name:'discover'},icon:'TrendingUp',kind:'Page'},
 {label:'Videos',route:{name:'videos',view:'board'},icon:'Clapperboard',kind:'Page'},
 {label:'Videos calendar',route:{name:'videos',view:'calendar'},icon:'Calendar',kind:'Page'},
 {label:'Settings',route:{name:'settings'},icon:'Settings',kind:'Page'},
 {label:'First launch setup',route:{name:'welcome'},icon:'Sparkles',kind:'Page'},
];

/** Pages first, then every video: an idea opens in its drawer on Videos, any other video on the tab for its stage. */
export function paletteOptions(videos:readonly Video[],query:string):Option[]{
 const all=[...PAGES,...videos.map<Option>(video=>({
  label:video.title,
  route:video.stage==='ideas'?{name:'videos',view:'board',open:video.id}:{name:'video',id:video.id,tab:defaultTab(video.stage)},
  icon:video.stage==='ideas'?'Lightbulb':'Film',
  kind:STAGE_LABEL[video.stage],
 }))];
 const text=query.trim().toLowerCase();
 return (text?all.filter(option=>option.label.toLowerCase().includes(text)):all).slice(0,40);
}

/** ⌘K: type to find a page, a video or an idea, arrow keys to move, Enter to open. */
export function Palette({videos,onClose,onOpen,onNewVideo}:{videos:readonly Video[];onClose():void;onOpen(route:Route):void;onNewVideo():void}){
 const [query,setQuery]=useState(''),[index,setIndex]=useState(0);
 const options=useMemo(()=>paletteOptions(videos,query),[videos,query]);
 const pick=(option:Option)=>{onClose();if(option.route)onOpen(option.route);else onNewVideo();};
 return <>
  <div className="scrim" onClick={onClose}/>
  <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
   <div className="pi">
    <Icon name="Search" size={17} className="faint"/>
    <input autoFocus value={query} onChange={event=>{setQuery(event.target.value);setIndex(0);}} placeholder="Search videos, ideas and pages" aria-label="Search"
     onKeyDown={event=>{
      if(event.key==='ArrowDown'){event.preventDefault();setIndex(Math.min(options.length-1,index+1));}
      if(event.key==='ArrowUp'){event.preventDefault();setIndex(Math.max(0,index-1));}
      if(event.key==='Enter'&&options[index])pick(options[index]);
      if(event.key==='Escape')onClose();
     }}/>
    <span className="kbd">Esc</span>
   </div>
   <div className="pl" role="listbox" aria-label="Results">
    {options.length?options.map((option,at)=><div key={`${at}-${option.label}`} role="option" aria-selected={at===index} className={`po${at===index?' on':''}`} onMouseEnter={()=>setIndex(at)} onClick={()=>pick(option)}>
     <Icon name={option.icon} size={16} className="faint"/><span className="ellipsis">{option.label}</span><span className="k">{option.kind}</span>
    </div>):<div className="po faint">Nothing matches "{query}". Try a word from the title.</div>}
   </div>
  </div>
 </>;
}
