import {useEffect,useRef,useState} from 'react';

/** Calls `onClose` on Escape for as long as the component is mounted. */
export function useEscape(onClose:()=>void){
 const latest=useRef(onClose);latest.current=onClose;
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();latest.current();}};
  document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
 },[]);
}

const FOCUSABLE='a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]';

/** What Tab can reach inside a panel, in order: enabled, visible, and not taken out of the order with tabindex -1. */
export function focusableIn(panel:HTMLElement):HTMLElement[]{
 return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element=>
  !element.hasAttribute('disabled')&&element.getAttribute('tabindex')!=='-1'&&element.getAttribute('aria-hidden')!=='true'&&!element.closest('[hidden]'));
}

/** Where Tab goes from `active` inside `panel`: the last one wraps to the first and the first (or the panel itself) back to the last. Null leaves it to the browser. */
export function trapTab(panel:HTMLElement,active:Element|null,shift:boolean):HTMLElement|null{
 const items=focusableIn(panel);
 if(!items.length)return panel;
 const first=items[0],last=items[items.length-1];
 if(!active||!panel.contains(active)||active===panel)return shift?last:first;
 if(shift&&active===first)return last;
 if(!shift&&active===last)return first;
 return null;
}

/**
 * Moves focus into the panel when it opens (unless something inside already took it), keeps Tab and Shift Tab inside it while it is open,
 * and gives focus back to what had it before when it closes.
 */
export function useFocusPanel(){
 const panel=useRef<HTMLDivElement>(null);
 // Read while rendering: a field inside with `autoFocus` takes focus before effects run, and would be remembered instead of what opened the panel.
 const [before]=useState(()=>document.activeElement as HTMLElement|null);
 useEffect(()=>{
  if(panel.current&&!panel.current.contains(document.activeElement))panel.current.focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Tab'||!panel.current)return;
   // Another dialog on top owns Tab: only the panel that holds focus traps it.
   if(document.activeElement&&!panel.current.contains(document.activeElement)&&document.activeElement!==document.body)return;
   const target=trapTab(panel.current,document.activeElement,event.shiftKey);
   if(target){event.preventDefault();target.focus({preventScroll:true});}
  };
  document.addEventListener('keydown',key);
  const node=panel.current;
  return()=>{
   document.removeEventListener('keydown',key);
   // Only when focus was still ours (or lost): another panel that opened as this one closed (search handing over to New video) keeps the focus it took.
   const now=document.activeElement;
   if(before?.isConnected&&(!now||now===document.body||!!node?.contains(now)))before.focus?.({preventScroll:true});
  };
 },[before]);
 return panel;
}
