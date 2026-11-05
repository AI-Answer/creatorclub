import {isEditableTarget,type ShortcutInput} from '../../shortcuts';
import type {Route} from '../routes';

export type ShellShortcut='new-video'|'next-tab'|'previous-tab'|'close-tab'|'shortcuts';
/** Record and Edit own their keys. Dialogs, text entry and composition also keep every key. */
export function shellShortcut(event:ShortcutInput,route:Route,modal=false):ShellShortcut|null{
 if(event.defaultPrevented||event.repeat||event.isComposing||event.keyCode===229||modal||isEditableTarget(event.target))return null;
 if(route.name==='video'&&(!route.tab||route.tab==='record'||route.tab==='edit'))return null;
 const mod=event.metaKey||event.ctrlKey,key=event.key?.toLowerCase();
 if(event.altKey)return null;
 if(mod&&event.shiftKey){
  if(event.code==='BracketRight'||key===']'||key==='}')return 'next-tab';
  if(event.code==='BracketLeft'||key==='['||key==='{')return 'previous-tab';
 }
 if(mod&&!event.shiftKey&&key==='w')return route.name==='video'?'close-tab':null;
 if(mod)return null;
 if(!event.shiftKey&&key==='n')return 'new-video';
 return key==='?'?'shortcuts':null;
}
export function adjacentVideoTab(ids:readonly string[],current:string|null,direction:1|-1):string|undefined{
 if(!ids.length)return;
 const at=current?ids.indexOf(current):-1;
 return ids[(at<0?(direction===1?0:ids.length-1):(at+direction+ids.length)%ids.length)];
}
