import {memo,useLayoutEffect,useMemo,useRef} from 'react';
import type {MotionBlock} from '../shared/types';
import {MOTION_CSS,motionMarkup,seekAnimations} from '../shared/motion/templates';

/*
 * The stage's motion blocks. The markup and stylesheet are the export's own (`shared/motion/templates.ts`), drawn on a layer the size of
 * the stage in container units, so the preview shows what the export renders. Every animation is paused and set from the playhead on each
 * render, never left to run on its own clock, so scrubbing, playing and the export frame at the same time all agree.
 */

const STYLE_ID='creatorclub-motion-templates';
function useMotionStyles(){
 useLayoutEffect(()=>{if(typeof document==='undefined'||document.getElementById(STYLE_ID))return;const style=document.createElement('style');style.id=STYLE_ID;style.textContent=MOTION_CSS;document.head.append(style);},[]);
}

const Block=memo(function Block({block,time}:{block:MotionBlock;time:number}){
 const ref=useRef<HTMLDivElement>(null),html=useMemo(()=>motionMarkup(block),[block]);
 useLayoutEffect(()=>{const el=ref.current;if(el)seekAnimations(el.getAnimations({subtree:true}),Math.max(0,time-block.start)*1000);});
 return <div ref={ref} className="motion-block" data-motion-id={block.id} dangerouslySetInnerHTML={{__html:html}}/>;
});

/** The blocks under the playhead, at their time. */
export const MotionLayer=memo(function MotionLayer({blocks,time}:{blocks:readonly MotionBlock[]|undefined;time:number}){
 useMotionStyles();
 const active=(blocks??[]).filter(b=>time>=b.start&&time<b.start+b.duration);
 if(!active.length)return null;
 return <div className="motion-layer" aria-hidden style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none'}}>{active.map(b=><Block key={b.id} block={b} time={time}/>)}</div>;
});
