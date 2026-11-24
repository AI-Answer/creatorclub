import {memo,useEffect,useRef,type RefObject} from 'react';
import type {Project} from '../shared/types';
import {linkGroups} from './timeline-edit';

/**
 * Where the pointer is on the timeline: a faint line with its time in a small dark chip, so it never reads as a second playhead (no pin, no frame box).
 * It is a DOM overlay: neither moving it nor highlighting a related take renders clips.
 */
export const TimelineHover=memo(function TimelineHover({project:p,scale,height,scroll,zooming}:{project:Project;scale:number;height:number;scroll:RefObject<HTMLDivElement|null>;zooming:RefObject<boolean>}){
 const line=useRef<HTMLDivElement>(null),label=useRef<HTMLElement>(null);
 useEffect(()=>{
  const el=scroll.current;if(!el)return;
  let raf=0,x=0,inside=false,hovered:HTMLElement|null=null;
  // The take package outlines of PR #22, on the DOM: the hovered clip's link group solid, the rest of its take dashed.
  const groups=linkGroups(p.clips),owner=(node:HTMLElement)=>groups.get(node.dataset.clipId!);
  const highlight=(clip:HTMLElement|null)=>{if(clip===hovered)return;hovered=clip;const group=clip&&owner(clip);for(const node of el.querySelectorAll<HTMLElement>('[data-clip-id]')){const take=!!clip&&(node===clip||!!clip.dataset.takeId&&node.dataset.takeId===clip.dataset.takeId),linked=take&&owner(node)===group;node.classList.toggle('club-hover-related',take);node.classList.toggle('take-related',take&&!!clip!.dataset.takeId);node.classList.toggle('take-related-linked',linked&&!!clip!.dataset.takeId);node.classList.toggle('take-related-take',take&&!linked);}};
  const draw=()=>{raf=0;const node=line.current;if(!node)return;if(!inside||zooming.current){node.hidden=true;return;}
   const screen=x-el.getBoundingClientRect().left,time=Math.max(0,(el.scrollLeft+screen)/scale),seconds=Math.floor(time);node.hidden=false;node.style.transform=`translateX(${time*scale}px)`;node.classList.toggle('flip',screen>el.clientWidth-170);if(label.current)label.current.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  };
  const schedule=()=>{raf||=requestAnimationFrame(draw);};
  const move=(e:PointerEvent)=>{inside=!e.buttons;x=e.clientX;highlight((e.target as HTMLElement).closest<HTMLElement>('[data-clip-id]'));schedule();};
  const leave=()=>{inside=false;highlight(null);if(line.current)line.current.hidden=true;};
  el.addEventListener('pointermove',move);el.addEventListener('pointerover',move);el.addEventListener('pointerleave',leave);el.addEventListener('pointerdown',leave);el.addEventListener('scroll',schedule);
  return()=>{cancelAnimationFrame(raf);highlight(null);el.removeEventListener('pointermove',move);el.removeEventListener('pointerover',move);el.removeEventListener('pointerleave',leave);el.removeEventListener('pointerdown',leave);el.removeEventListener('scroll',schedule);};
 },[p.clips,scale,scroll,zooming]);
 return <div className="club-hover club-hover-playhead" ref={line} hidden style={{height}} aria-hidden><b ref={label}/></div>;
});
