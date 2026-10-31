import {cloneElement,isValidElement,useCallback,useEffect,useId,useRef,useState,type CSSProperties,type ReactElement,type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';

/** How long the pointer rests on a control before its tooltip shows. Keyboard focus shows it at once. */
export const TOOLTIP_DELAY_MS=450;

type Handlers={onPointerEnter?(event:SyntheticEvent):void;onPointerLeave?(event:SyntheticEvent):void;onFocus?(event:SyntheticEvent):void;onBlur?(event:SyntheticEvent):void;'aria-describedby'?:string};

/**
 * A short label under (or above) one control, with its keyboard shortcut when it has one: `Split at playhead  S`.
 * It wraps exactly one element and shows on hover (after a short rest) and on keyboard focus; Escape or leaving hides it.
 * Drawn in the club's root with `position:fixed`, like the menu, so no parent's overflow clips it.
 */
export function Tooltip({text,shortcut,children,side='bottom'}:{text:string;shortcut?:string;children:ReactElement<Handlers>;side?:'top'|'bottom'}){
 const id=useId();
 const [box,setBox]=useState<{rect:DOMRect;host:Element|null}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const hide=useCallback(()=>{clearTimeout(timer.current);setBox(null);},[]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useEffect(()=>{
  if(!box)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
  document.addEventListener('keydown',key);window.addEventListener('scroll',hide,true);
  return()=>{document.removeEventListener('keydown',key);window.removeEventListener('scroll',hide,true);};
 },[box,hide]);
 if(!isValidElement(children))return children;
 const show=(target:Element,delay:number)=>{
  clearTimeout(timer.current);
  timer.current=setTimeout(()=>setBox({rect:target.getBoundingClientRect(),host:target.closest('.club-root')}),delay);
 };
 const own=children.props;
 const trigger=cloneElement(children,{
  'aria-describedby':box?id:own['aria-describedby'],
  onPointerEnter:event=>{own.onPointerEnter?.(event);show(event.currentTarget as Element,TOOLTIP_DELAY_MS);},
  onPointerLeave:event=>{own.onPointerLeave?.(event);hide();},
  onFocus:event=>{own.onFocus?.(event);if((event.currentTarget as Element).matches?.(':focus-visible'))show(event.currentTarget as Element,0);},
  onBlur:event=>{own.onBlur?.(event);hide();},
 });
 let tip=null;
 if(box){
  const {rect}=box,center=rect.left+rect.width/2;
  const place:CSSProperties=side==='top'||rect.bottom+40>window.innerHeight?{bottom:window.innerHeight-rect.top+6}:{top:rect.bottom+6};
  const node=<span id={id} role="tooltip" className="cc-tooltip" style={{position:'fixed',left:Math.max(8,Math.min(center,window.innerWidth-8)),...place}}>{text}{shortcut&&<kbd>{shortcut}</kbd>}</span>;
  tip=box.host?createPortal(node,box.host):node;
 }
 return <>{trigger}{tip}</>;
}
