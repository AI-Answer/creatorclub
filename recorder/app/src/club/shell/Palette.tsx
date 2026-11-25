import {clearWelcomeProgress} from '../welcome-progress';
import {useMemo,useState} from 'react';
import {Command,CommandEmpty,CommandGroup,CommandGroupLabel,CommandInput,CommandItem,CommandList} from '@ui-sdk/react/command';
import {Dialog,DialogBackdrop,DialogContent} from '@ui-sdk/react/dialog';
import type {Video} from '../../../shared/club';
import type {SearchOption} from '../search';
import {SEARCH_INPUT_LABEL,SEARCH_PLACEHOLDER,shellOptions} from './labels';
import type {Route} from '../routes';
import {Icon,StageBadge} from '../ui';
import {STAGE_LABEL} from '../board';

/**
 * ⌘K: type to find a video, a step, a place, a settings group, an action or a word of Help; arrow keys to move, Enter to open.
 * ui-sdk's Command in a modal Dialog: focus stays in the field while the highlight moves, Tab stays inside, Escape closes, and focus goes back to where it was.
 * `openId` is the video that is open, so a step (Record, Publish…) opens on it.
 */
export function Palette({videos,openId,onClose,onOpen,onNewVideo,onHelp}:{videos:readonly Video[];openId?:string|null;onClose():void;onOpen(route:Route):void;onNewVideo():void;onHelp(topic?:string):void}){
 const [query,setQuery]=useState('');
 const options=useMemo(()=>{
  const all=shellOptions(videos,query,openId);if(query.trim())return all;
  const recent=videos.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,3).map(video=>all.find(option=>option.id===`video:${video.id}`)!).filter(Boolean);
  return [...all.filter(option=>!option.id.startsWith('video:')),...recent,...(videos.length>3?[{id:'videos:more',label:'Show all videos',kind:'Videos',icon:'video' as const,target:{route:{name:'videos' as const,view:'board' as const}}}]:[])];
 },[videos,query,openId]);
 const byId=useMemo(()=>new Map(videos.map(video=>[video.id,video])),[videos]);
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
 const byOption=new Map(ordered.map(option=>[option.id,option]));
 return <Dialog open onOpenChange={next=>{if(!next)onClose();}}>
  <DialogBackdrop className="scrim"/>
  <DialogContent className="palette" aria-label="Search" initialFocus="input">
   <Command query={query} onQueryChange={next=>setQuery(next)} filter={false} autoHighlight loop={false} onAction={id=>{const option=byOption.get(id);if(option)pick(option);}}>
    <div className="pi">
     <Icon name="search" size={17} className="faint"/>
     <CommandInput placeholder={SEARCH_PLACEHOLDER} aria-label={SEARCH_INPUT_LABEL} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onClose();}}}/>
     <kbd className="key-chip">Esc</kbd>
    </div>
    <CommandList className="pl" aria-label="Results">
     {groups.map(group=><CommandGroup key={group.label}>
      <CommandGroupLabel className="palette-group">{group.label}</CommandGroupLabel>
      {group.options.map(option=>{
       const video=byId.get(option.id.replace(/^video:/,''));
       return <CommandItem key={option.id} value={option.id} label={option.label} className="po">
        {option.id!=='videos:more'&&<Icon name={option.icon} size={16} className="faint"/>}<span className="po-copy"><span className="po-label">{option.label}</span>{(video||option.hint)&&<span className={`po-hint${video?' po-stage':''}`}>{video?<><StageBadge stage={video.stage} dotOnly decorative/>{STAGE_LABEL[video.stage]}</>:option.hint}</span>}</span>{shortcuts[option.id]&&<kbd className="key-chip">{shortcuts[option.id]}</kbd>}
       </CommandItem>;
      })}
     </CommandGroup>)}
    </CommandList>
    <CommandEmpty className="po faint">Nothing matches "{query}". Try a video title, page or action.</CommandEmpty>
   </Command>
   <footer className="palette-footer">↑↓ Choose · ↵ Open · Esc Close</footer>
  </DialogContent>
 </Dialog>;
}
