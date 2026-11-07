import {beginGesture} from './timeline-gesture';
import {useLayoutEffect,useRef} from 'react';
import type {Transform} from '../shared/types';

export type Box=Pick<Transform,'x'|'y'|'width'|'height'>;
type Grip='move'|'nw'|'ne'|'sw'|'se';

const SNAP=.02,MIN=.06;
/** Snaps an edge or centre to the frame's edges and centre when it is within 2% of one. */
const snap=(v:number,size:number)=>{for(const target of [0,.5-size/2,1-size])if(Math.abs(v-target)<SNAP)return target;return v;};
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));

/** Where a box goes after a drag of `dx`,`dy` (fractions of the picture) on one grip. Corners keep the box's shape. */
export function dragBox(start:Box,grip:Grip,dx:number,dy:number):Box{
 if(grip==='move')return {...start,x:snap(clamp(start.x+dx,-start.width+MIN,1-MIN),start.width),y:snap(clamp(start.y+dy,-start.height+MIN,1-MIN),start.height)};
 const ratio=start.height/start.width,sx=grip==='nw'||grip==='sw'?-1:1;
 const width=clamp(start.width+sx*dx,MIN,2),height=width*ratio;
 const x=sx<0?start.x+start.width-width:start.x,y=grip==='nw'||grip==='ne'?start.y+start.height-height:start.y;
 return {x,y,width,height};
}

/**
 * A frame with handles on the picture: drag inside to move it, drag a corner to resize it, snapping to the edges and centre.
 * Used for the selected camera or screen (its place on the picture) and for a selected zoom (where it looks and how close).
 */
export function StageHandles({box:t,itemKey,onChange,className='',title='Drag to move · drag a corner to resize'}:{box:Box;itemKey?:string;onChange(box:Box,phase:'move'|'end'):void;className?:string;title?:string}){
 const frame=useRef<HTMLDivElement>(null),gesture=useRef<ReturnType<typeof beginGesture>|null>(null),latest=useRef(itemKey);latest.current=itemKey;useLayoutEffect(()=>()=>gesture.current?.cancel(),[]);
 const begin=(event:React.PointerEvent,grip:Grip)=>{
  if(event.button!==0)return;gesture.current?.cancel();event.preventDefault();event.stopPropagation();
  const stage=frame.current?.parentElement?.getBoundingClientRect();if(!stage)return;
  const start:Box={x:t.x,y:t.y,width:t.width,height:t.height},from={x:event.clientX,y:event.clientY};
  let last=start;const valid=()=>Boolean(frame.current?.isConnected)&&latest.current===itemKey;
  const move=(ev:PointerEvent)=>{if(!valid()){gesture.current?.cancel();return;}last=dragBox(start,grip,(ev.clientX-from.x)/stage.width,(ev.clientY-from.y)/stage.height);onChange(last,'move');};
  gesture.current=beginGesture(event,{move,drop:()=>{gesture.current=null;onChange(last,'end');},cancel:()=>{gesture.current=null;},valid});
 };
 return <div ref={frame} className={`stage-handles ${className}`.trim()} style={{left:`${t.x*100}%`,top:`${t.y*100}%`,width:`${t.width*100}%`,height:`${t.height*100}%`}}
  onPointerDown={event=>begin(event,'move')} title={title}>
  {(['nw','ne','sw','se'] as const).map(grip=><span key={grip} className={`stage-grip ${grip}`} onPointerDown={event=>begin(event,grip)}/>)}
 </div>;
}
