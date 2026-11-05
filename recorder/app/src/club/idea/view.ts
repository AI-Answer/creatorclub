import {useSyncExternalStore} from 'react';

export type IdeaView='page'|'board';
const KEY='cc.idea.view',CHANGE='cc:idea-view';
let fallback:IdeaView='page';
const read=():IdeaView=>{try{return localStorage.getItem(KEY)==='board'?'board':'page';}catch{return fallback;}};
const subscribe=(onChange:()=>void)=>{
 window.addEventListener(CHANGE,onChange);window.addEventListener('storage',onChange);
 return()=>{window.removeEventListener(CHANGE,onChange);window.removeEventListener('storage',onChange);};
};
function choose(view:IdeaView){
 fallback=view;
 try{localStorage.setItem(KEY,view);}catch{/* The current view still changes when storage is unavailable. */}
 window.dispatchEvent(new Event(CHANGE));
}
/** The Idea page and its companion read the same view without changing the workspace frame. */
export function useIdeaView(){return [useSyncExternalStore(subscribe,read,()=> 'page' as const),choose] as const;}

const SECTION_CHANGE='cc:idea-section';
let section:string|null=null;
const subscribeSection=(onChange:()=>void)=>{window.addEventListener(SECTION_CHANGE,onChange);return()=>window.removeEventListener(SECTION_CHANGE,onChange);};
export function publishIdeaSection(next:string|null){if(section!==next){section=next;window.dispatchEvent(new Event(SECTION_CHANGE));}}
export function useIdeaSection(){return useSyncExternalStore(subscribeSection,()=>section,()=>null);}
/** The Idea page is one part now, Borumi's Script step: the companion always sees the script there. */
export function visibleIdeaSection(_scroller:HTMLElement){return 'Script';}
