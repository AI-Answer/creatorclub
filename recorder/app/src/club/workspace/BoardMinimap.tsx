import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {Box} from './board-layout';
import {centreView,minimapLayout,minimapPoint,viewportBox,type View} from './board-view';

/** A small map; press or drag anywhere to centre that point in the viewport. */
export function BoardMinimap({boxes,sections=[],view,holder,onMotion,onView}:{boxes:readonly Box[];sections?:readonly Box[];view:View;holder:RefObject<HTMLDivElement|null>;onMotion:RefObject<((view:View)=>void)|null>;onView(view:View):void}){
 const [size,setSize]=useState({w:1000,h:700});
 const svg=useRef<SVGSVGElement>(null),viewport=useRef<SVGRectElement>(null),drag=useRef<ReturnType<typeof minimapLayout>|null>(null);
 useLayoutEffect(()=>{const el=holder.current;if(!el)return;const read=()=>setSize({w:el.clientWidth,h:el.clientHeight});read();const observer=new ResizeObserver(read);observer.observe(el);return()=>observer.disconnect();},[holder]);
 const map=minimapLayout([...sections,...boxes],view,size.w,size.h),live=useRef(view);live.current=view;
 const project=(box:Box)=>({x:map.ox+(box.x-map.x)*map.scale,y:map.oy+(box.y-map.y)*map.scale,width:box.w*map.scale,height:box.h*map.scale});
 useEffect(()=>{
  const paint=(next:View)=>{live.current=next;const box=project(viewportBox(next,size.w,size.h));for(const [key,value] of Object.entries(box))viewport.current?.setAttribute(key,String(value));};
  onMotion.current=paint;return()=>{if(onMotion.current===paint)onMotion.current=null;};
 });
 const go=(clientX:number,clientY:number)=>{const rect=svg.current?.getBoundingClientRect();if(!rect)return;const point=minimapPoint(drag.current??map,(clientX-rect.left)*180/rect.width,(clientY-rect.top)*112/rect.height);onView(centreView(live.current,point,size.w,size.h));};
 return <div className="board-minimap" role="group" aria-label="Board minimap">
  <svg ref={svg} viewBox="0 0 180 112" role="application" aria-label="Minimap. Click or drag to navigate; arrow keys pan." tabIndex={0}
   onPointerDown={event=>{event.preventDefault();drag.current=map;event.currentTarget.setPointerCapture(event.pointerId);go(event.clientX,event.clientY);}}
   onPointerMove={event=>{if(drag.current)go(event.clientX,event.clientY);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
   onKeyDown={event=>{const d=event.shiftKey?200:60;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();onView({...live.current,x:live.current.x+(event.key==='ArrowLeft'?d:event.key==='ArrowRight'?-d:0),y:live.current.y+(event.key==='ArrowUp'?d:event.key==='ArrowDown'?-d:0)});}}>
   {sections.map((box,index)=><rect key={index} {...project(box)} className="minimap-section" rx={1}/>)}
   {boxes.map((box,index)=><rect key={index} {...project(box)} className="minimap-card" rx={1}/>)}
   <rect ref={viewport} {...project(map.viewport)} className="minimap-view" rx={2}/>
  </svg>
 </div>;
}
