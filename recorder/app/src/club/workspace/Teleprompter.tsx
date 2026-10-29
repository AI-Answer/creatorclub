import {useEffect,useState} from 'react';
import type {OutlineScene} from '../../../shared/club';
import {clockTime} from '../video-plan';
import {Button,Icon} from '../ui';

const MIN=16,MAX=30;

/** The scene's talking points, large, beside the recorder: click one to mark where you are. The show line and the scene's script are under them. */
export function Teleprompter({index,scene}:{index:number;scene:OutlineScene}){
 const [size,setSize]=useState(21),[at,setAt]=useState(0);
 useEffect(()=>setAt(0),[scene.id,index]);
 return <aside className="prompter" aria-label="Talking points">
  <div className="ph">
   <span className="n" style={{width:26,height:26,borderRadius:7,background:'var(--cc-bg-sunk)',display:'inline-flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12.5}}>{index+1}</span>
   <div className="grow" style={{minWidth:0}}><div style={{fontWeight:650}} className="ellipsis">{scene.title}</div><div className="small faint">Talking points{scene.seconds?` · about ${clockTime(scene.seconds)}`:''}</div></div>
   <Button variant="ghost" size="sm" aria-label="Smaller text" onClick={()=>setSize(value=>Math.max(MIN,value-2))}><Icon name="text-smaller" size={16}/></Button>
   <Button variant="ghost" size="sm" aria-label="Bigger text" onClick={()=>setSize(value=>Math.min(MAX,value+2))}><Icon name="text-bigger" size={16}/></Button>
  </div>
  <div className="pb">
   {scene.talkingPoints.length?scene.talkingPoints.map((point,i)=><div key={i} className={`tp${i===at?' cur':i<at?' done':''}`} style={{fontSize:size}} onClick={()=>setAt(i)}>{point}</div>)
    :<p className="small muted">This scene has no talking points. Add them in Plan.</p>}
   {scene.show&&<div className="tp-show"><Icon name="screen" size={15} style={{marginTop:2,flex:'none'}}/><span><b style={{color:'var(--cc-text)'}}>Show:</b> {scene.show}</span></div>}
   {scene.script&&<details style={{marginTop:14}}><summary className="small muted" style={{cursor:'pointer'}}>Full script for this scene</summary><div className="script" style={{margin:'8px 0 0'}}>{scene.script}</div></details>}
  </div>
 </aside>;
}
