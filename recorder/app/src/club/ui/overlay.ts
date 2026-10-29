import {useEffect,useRef} from 'react';

/** Calls `onClose` on Escape for as long as the component is mounted. */
export function useEscape(onClose:()=>void){
 const latest=useRef(onClose);latest.current=onClose;
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();latest.current();}};
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[]);
}

/** Moves focus into the panel when it opens (unless something inside already took it) and gives it back when it closes. */
export function useFocusPanel(){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const before=document.activeElement as HTMLElement|null;
  if(panel.current&&!panel.current.contains(document.activeElement))panel.current.focus({preventScroll:true});
  return()=>{if(before?.isConnected)before.focus?.({preventScroll:true});};
 },[]);
 return panel;
}
