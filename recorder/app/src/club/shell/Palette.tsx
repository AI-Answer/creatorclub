import {clearWelcomeProgress} from '../welcome-progress';
import {useId,useMemo,useState} from 'react';
import type {Video} from '../../../shared/club';
import type {SearchOption} from '../search';
import {SEARCH_PLACEHOLDER,shellOptions} from './labels';
import type {Route} from '../routes';
import {Icon,StageBadge} from '../ui';
import {STAGE_LABEL} from '../board';
import {useFocusPanel} from '../ui/overlay';

/**
 * ⌘K: type to find a video, a step, a place, a settings group, an action or a word of Help; arrow keys to move, Enter to open.
 * It is a modal: Tab stays inside it, and focus goes back to where it was when it closes.
 * `openId` is the video that is open, so a step (Record, Publish…) opens on it.
 */
export function Palette({videos,openId,onClose,onOpen,onNewVideo,onHelp}:{videos:readonly Video[];openId?:string|null;onClose():void;onOpen(route:Route):void;onNewVideo():void;onHelp(topic?:string):void}){
 const [query,setQuery]=useState(''),[index,setIndex]=useState(0);
 const options=useMemo(()=>{
  const all=shellOptions(videos,query,openId);if(query.trim())return all;
  const recent=videos.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3).map(video=>all.find(option=>option.id===`video:${video.id}`)!).filter(Boolean);
  return [...all.filter(option=>!option.id.startsWith('video:')),...recent,...(videos.length>3?[{id:'videos:more',label:'Show all videos',kind:'Videos',icon:'video' as const,target:{route:{name:'videos' as const,view:'board' as const}}}]:[])];
 },[videos,query,openId]);
 const byId=useMemo(()=>new Map(videos.map(video=>[video.id,video])),[videos]);
 const panel=useFocusPanel();
 const listId=useId();
 const pick=(option:SearchOption)=>{
  onClose();
  const {target}=option;
  if('route' in target){if(option.id==='action:add-channel')clearWelcomeProgress();onOpen(target.route);}
  else if(target.action==='new-video')onNewVideo();
  else onHelp(target.topic);
 };
 const groups=[
  {label:'Actions',match:(option:SearchOption)=>option.kind==='Action'},
  {label:'Video steps',match:(option:SearchOption)=>option.kind==='Step'},
  {label:'Pages',match:(option:SearchOption)=>!option.id.startsWith('video:')&&option.id!=='videos:more'&&!['Action','Step'].includes(option.kind)},
  {label:'Videos',match:(option:SearchOption)=>option.id.startsWith('video:')||option.id==='videos:more'},
 ].map(group=>({...group,options:options.filter(group.match)})).filter(group=>group.options.length);
 const ordered=groups.flatMap(group=>group.options);
 const shortcuts:Record<string,string>={'action:new-video':'N','action:shortcuts':'?'};
 const optionId=(at:number)=>`${listId}-${at}`;
 return <>
  <div className="scrim" onClick={onClose}/>
  <div ref={panel} tabIndex={-1} className="palette" role="dialog" aria-modal="true" aria-label="Search">
   <div className="pi">
    <Icon name="search" size={17} className="faint"/>
    <input autoFocus value={query} onChange={event=>{setQuery(event.target.value);setIndex(0);}} placeholder={SEARCH_PLACEHOLDER} aria-label="Search"
     role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={ordered[index]?optionId(index):undefined}
     onKeyDown={event=>{
      if(event.key==='ArrowDown'){event.preventDefault();setIndex(Math.min(ordered.length-1,index+1));}
      if(event.key==='ArrowUp'){event.preventDefault();setIndex(Math.max(0,index-1));}
      if(event.key==='Enter'&&ordered[index])pick(ordered[index]);
      if(event.key==='Escape')onClose();
     }}/>
    <kbd className="key-chip">Esc</kbd>
   </div>
   <div className="pl" id={listId} role="listbox" aria-label="Results">
    {ordered.length?groups.map(group=><div key={group.label} role="group" aria-labelledby={`${listId}-${group.label.replaceAll(' ','-')}`}>
     <div className="palette-group" id={`${listId}-${group.label.replaceAll(' ','-')}`}>{group.label}</div>
     {group.options.map(option=>{
      const at=ordered.indexOf(option),video=byId.get(option.id.replace(/^video:/,''));
      return <div key={option.id} id={optionId(at)} role="option" aria-selected={at===index} className={`po${at===index?' on':''}`} ref={element=>{if(at===index)element?.scrollIntoView?.({block:'nearest'});}} onMouseEnter={()=>setIndex(at)} onClick={()=>pick(option)}>
       {option.id!=='videos:more'&&<Icon name={option.icon} size={16} className="faint"/>}<span className="po-copy"><span className="po-label">{option.label}</span>{(video||option.hint)&&<span className={`po-hint${video?' po-stage':''}`}>{video?<><StageBadge stage={video.stage} dotOnly decorative/>{STAGE_LABEL[video.stage]}</>:option.hint}</span>}</span>{shortcuts[option.id]&&<kbd className="key-chip">{shortcuts[option.id]}</kbd>}
      </div>;
     })}
    </div>):<div className="po faint">Nothing matches "{query}". Try a video title, page or action.</div>}

   </div>
   <footer className="palette-footer">↑↓ Choose · ↵ Open · Esc Close</footer>
  </div>
 </>;
}
