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
/** The section at the reading edge of the actual plan scroller, including nested studio results. */
export function visibleIdeaSection(scroller:HTMLElement){
 const viewport=scroller.getBoundingClientRect();
 const sections=[...scroller.querySelectorAll<HTMLElement>('.doc-part, .thumbnail-studio')];
 let current=sections[0],mostVisible=-1;
 for(let index=0;index<sections.length;index++){
  const node=sections[index],bounds=node.getBoundingClientRect();
  const end=Math.min(bounds.bottom,sections[index+1]?.getBoundingClientRect().top??bounds.bottom);
  const visible=Math.max(0,Math.min(end,viewport.bottom)-Math.max(bounds.top,viewport.top));
  if(visible>mostVisible){current=node;mostVisible=visible;}
 }
 return current?.matches('.thumbnail-studio')?'Thumbnails':current?.getAttribute('aria-label')||current?.querySelector('h3')?.textContent||"What it's about";
}
