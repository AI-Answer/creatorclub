import {useId,useMemo,useState} from 'react';
import type {Video} from '../../../shared/club';
import {searchOptions,type SearchOption} from '../search';
import type {Route} from '../routes';
import {Icon} from '../ui';
import {useFocusPanel} from '../ui/overlay';

/**
 * ⌘K: type to find a video, a step, a place, a settings group, an action or a word of Help; arrow keys to move, Enter to open.
 * It is a modal: Tab stays inside it, and focus goes back to where it was when it closes.
 * `openId` is the video that is open, so a step (Record, Publish…) opens on it.
 */
export function Palette({videos,openId,onClose,onOpen,onNewVideo,onHelp}:{videos:readonly Video[];openId?:string|null;onClose():void;onOpen(route:Route):void;onNewVideo():void;onHelp(topic?:string):void}){
 const [query,setQuery]=useState(''),[index,setIndex]=useState(0);
 const options=useMemo(()=>searchOptions(videos,query,openId),[videos,query,openId]);
 const panel=useFocusPanel();
 const listId=useId();
 const pick=(option:SearchOption)=>{
  onClose();
  const {target}=option;
  if('route' in target)onOpen(target.route);
  else if(target.action==='new-video')onNewVideo();
  else onHelp(target.topic);
 };
 const optionId=(at:number)=>`${listId}-${at}`;
 return <>
  <div className="scrim" onClick={onClose}/>
  <div ref={panel} tabIndex={-1} className="palette" role="dialog" aria-modal="true" aria-label="Search">
   <div className="pi">
    <Icon name="search" size={17} className="faint"/>
    <input autoFocus value={query} onChange={event=>{setQuery(event.target.value);setIndex(0);}} placeholder="Search videos, steps, settings and help" aria-label="Search"
     role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={options[index]?optionId(index):undefined}
     onKeyDown={event=>{
      if(event.key==='ArrowDown'){event.preventDefault();setIndex(Math.min(options.length-1,index+1));}
      if(event.key==='ArrowUp'){event.preventDefault();setIndex(Math.max(0,index-1));}
      if(event.key==='Enter'&&options[index])pick(options[index]);
      if(event.key==='Escape')onClose();
     }}/>
    <span className="kbd">Esc</span>
   </div>
   <div className="pl" id={listId} role="listbox" aria-label="Results">
    {options.length?options.map((option,at)=><div key={option.id} id={optionId(at)} role="option" aria-selected={at===index} className={`po${at===index?' on':''}`} ref={element=>{if(at===index)element?.scrollIntoView?.({block:'nearest'});}} onMouseEnter={()=>setIndex(at)} onClick={()=>pick(option)}>
     <Icon name={option.icon} size={16} className="faint"/><span className="lbl">{option.label}</span>{option.hint&&<span className="hint ellipsis">{option.hint}</span>}<span className="k">{option.kind}</span>
    </div>):<div className="po faint">Nothing matches "{query}". Try a step, a setting or a word from the title.</div>}
   </div>
  </div>
 </>;
}
