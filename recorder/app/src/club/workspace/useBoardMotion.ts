import {useCallback,useEffect,useLayoutEffect,useRef,useState,type SetStateAction} from 'react';
import {DEFAULT_VIEW,dotGrid,loadView,saveView,type View} from './board-view';

/** Paints one canvas layer per animation frame; React and storage catch up after the gesture settles. */
export function useBoardMotion(board:string){
 const [view,settle]=useState(()=>loadView(board)??DEFAULT_VIEW);
 const active=useRef(board),viewNow=useRef(view),canvasEl=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null);
 const onMotion=useRef<((view:View)=>void)|null>(null),frame=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const paint=useCallback(()=>{
  frame.current=0;const now=viewNow.current,grid=dotGrid(now);
  if(canvasEl.current)canvasEl.current.style.transform=`translate3d(${now.x}px,${now.y}px,0) scale(${now.z})`;
  if(scroller.current){scroller.current.style.backgroundSize=`${grid.size}px ${grid.size}px`;scroller.current.style.backgroundPosition=`${grid.x}px ${grid.y}px`;}
  onMotion.current?.(now);
 },[]);
 const setView=useCallback((action:SetStateAction<View>)=>{
  viewNow.current=typeof action==='function'?action(viewNow.current):action;
  if(!frame.current)frame.current=requestAnimationFrame(paint);
  clearTimeout(timer.current);timer.current=setTimeout(()=>settle(viewNow.current),120);
 },[paint]);
 useLayoutEffect(()=>{
  if(active.current===board)return;
  cancelAnimationFrame(frame.current);clearTimeout(timer.current);saveView(active.current,viewNow.current);
  active.current=board;viewNow.current=loadView(board)??DEFAULT_VIEW;settle(viewNow.current);paint();
 },[board,paint]);
 useEffect(()=>{if(view===viewNow.current)saveView(board,view);},[board,view]);
 useEffect(()=>()=>{cancelAnimationFrame(frame.current);clearTimeout(timer.current);saveView(active.current,viewNow.current);},[]);
 return {view,viewNow,setView,canvasEl,scroller,onMotion};
}
