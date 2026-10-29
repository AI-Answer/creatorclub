import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {Outline,OutlineScene,VideoScene} from '../../../shared/club';
import {toProgress} from '../scenes';
import {Button,Ed,Icon,Menu,SceneStatus,cn,useToast} from '../ui';
import {clockTime} from '../video-plan';
import {blankScene,editPoint,insertScene,moveScene,parseClock,removeScene,sceneCardId,totalSeconds,TARGET_SECONDS} from './plan-logic';

/** The right column of Plan: the outline's scenes as cards. Edit in place, drag or use arrow keys to reorder, add, remove with Undo, and write scripts. */
export function ScenesColumn({target,onTarget,hasRecording,outline,known,focusId,drafting,draftLine,scriptingScene,scripting,onEdit,onFocus,onDraft,onWriteFull,onWriteScene,onSceneScript,onRecord}:{
 target:number;onTarget(seconds:number):void;hasRecording:boolean;outline:Outline|null;known:readonly VideoScene[]|undefined;focusId:string|null;
 drafting:boolean;draftLine?:string;
 /** The scene a script run is writing, or none while it writes the whole script. */
 scriptingScene?:string;scripting:boolean;
 onEdit(next:Outline):void;onFocus(sceneId:string):void;onDraft():void;onWriteFull():void;onWriteScene(sceneId:string):void;onSceneScript(sceneId:string,text:string):void;onRecord(sceneId:string):void;
}){
 const toast=useToast();
 const scenes=outline?.scenes??[];
 const [dragIndex,setDragIndex]=useState<number|null>(null),[overIndex,setOverIndex]=useState<number|null>(null);
 const [added,setAdded]=useState<string|null>(null);
 const cards=useRef<Record<number,HTMLElement|null>>({});
 const total=totalSeconds(scenes),over=target>0&&total>target;
 const knownById=new Map((known??[]).map(scene=>[scene.id,scene]));

 // Picking a scene in the strip brings its card into view.
 useEffect(()=>{
  if(focusId)document.getElementById(sceneCardId(focusId))?.scrollIntoView?.({behavior:'smooth',block:'center'});
 },[focusId]);

 const setScene=(index:number,next:Partial<OutlineScene>)=>outline&&onEdit({...outline,scenes:scenes.map((scene,i)=>i===index?{...scene,...next}:scene)});
 const setScenes=(next:OutlineScene[])=>outline&&onEdit({...outline,scenes:next});
 const move=(from:number,to:number)=>setScenes(moveScene(scenes,from,to));
 const add=(at:number)=>{
  const scene=blankScene();
  if(outline)onEdit({...outline,scenes:insertScene(scenes,at,scene)});
  setAdded(scene.id!);onFocus(scene.id!);
 };
 const remove=(index:number)=>{
  const before=scenes;
  setScenes(removeScene(scenes,index));
  toast(`Deleted "${before[index].title}"`,{undo:()=>outline&&onEdit({...outline,scenes:before})});
 };

 const onGrip=(event:PointerEvent<HTMLButtonElement>,index:number)=>{
  if(event.button!==0)return;
  event.preventDefault();setDragIndex(index);setOverIndex(index);
  let to=index;
  const middles=()=>scenes.map((_,i)=>{const box=cards.current[i]?.getBoundingClientRect();return box?box.top+box.height/2:0;});
  const onMove=(pointer:globalThis.PointerEvent)=>{const ys=middles();to=ys.findIndex(y=>pointer.clientY<y);if(to<0)to=ys.length;setOverIndex(to);};
  const onUp=()=>{window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);setDragIndex(null);setOverIndex(null);move(index,to);};
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);
 };

 return <section className="scn" aria-label="Scenes">
  <div className="doc-h"><Icon name="scenes" size={18}/><h2>Scenes</h2>{scenes.length>0&&<span className="chip">{scenes.length}</span>}
   <span className="grow"/>
   {scenes.length>0&&<Button size="sm" className="ai" disabled={scripting||drafting} onClick={onWriteFull}>{scripting&&!scriptingScene?<span className="spin" role="status" aria-label="Writing the script"/>:<Icon name="script" size={14}/>}Write full script</Button>}
  </div>
  <div className="row" style={{marginBottom:18,gap:14}}>
   <span className="doc-sub" style={{margin:0,whiteSpace:'nowrap'}}>Talk through each one when you record.</span><span className="grow"/>
   {scenes.length>0&&<div className="len" style={{whiteSpace:'nowrap'}}><span className="tnum"><b style={{color:over?'var(--cc-warn)':'var(--cc-text)'}}>{clockTime(total)}</b>{target>0?' of':''}</span>
    <select className="select" style={{height:26,fontSize:12.5}} value={target} onChange={event=>onTarget(Number(event.target.value))} aria-label="Target length">
     <option value={0}>No target</option>{TARGET_SECONDS.map(seconds=><option key={seconds} value={seconds}>{seconds/60} min</option>)}</select>
    {target>0&&<span className="bar" style={{width:110}}><i className={over?'over':''} style={{width:`${Math.min(100,total/target*100)}%`}}/></span>}</div>}
  </div>

  {!scenes.length
   ?<div className="card">{drafting
    ?<div style={{padding:16,display:'flex',flexDirection:'column',gap:10}} role="status" aria-label={draftLine??'Drafting scenes'}>{[0,1,2,3].map(i=><div key={i} className="shimmer" style={{height:74}}/>)}{draftLine&&<span className="faint small">{draftLine}</span>}</div>
    :<div className="empty"><div className="ic"><Icon name="scenes" size={20}/></div><h3>No scenes yet</h3>
      <p>Claude reads the board and the package, then writes 4 to 7 scenes with talking points. You can edit every word.</p>
      <Button variant="primary" onClick={onDraft}><Icon name="draft" size={15}/>Draft scenes from board</Button></div>}</div>
   :scenes.map((scene,i)=>{
    const id=scene.id??String(i);
    const progress=knownById.get(id);
    const writing=scripting&&scriptingScene===id;
    return <div key={id} id={sceneCardId(id)} ref={element=>{cards.current[i]=element;}} aria-label={`Scene ${i+1}`}
     className={cn('card scene',focusId===id&&'focus',dragIndex===i&&'dragging',overIndex===i&&dragIndex!==null&&dragIndex!==i&&'drop-before')} onClick={()=>onFocus(id)}>
     <div className="scene-h">
      <button type="button" className="grip" aria-label="Drag to reorder, or use the arrow keys" onPointerDown={event=>onGrip(event,i)} onClick={event=>event.stopPropagation()}
       onKeyDown={event=>{
        if(event.key==='ArrowUp'&&i>0){event.preventDefault();move(i,i-1);}
        if(event.key==='ArrowDown'&&i<scenes.length-1){event.preventDefault();move(i,i+2);}
       }}><Icon name="drag" size={15}/></button>
      <span className="n">{i+1}</span>
      <Ed className="t" value={scene.title} ph="Scene title" onChange={title=>setScene(i,{title})}/>
      {progress&&<SceneStatus scene={toProgress([progress])[0]}/>}
      <input className="dur" key={`${id}-${scene.seconds}`} defaultValue={clockTime(scene.seconds)} aria-label="Scene length" onClick={event=>event.stopPropagation()}
       onBlur={event=>{const seconds=parseClock(event.target.value);if(seconds)setScene(i,{seconds});else event.target.value=clockTime(scene.seconds);}} onKeyDown={event=>event.key==='Enter'&&event.currentTarget.blur()}/>
      <span onClick={event=>event.stopPropagation()}><Menu align="right" label="Scene options" button={toggle=><Button variant="ghost" size="sm" className="icon-only" onClick={toggle} aria-label="Scene options"><Icon name="more" size={15}/></Button>}
       items={[
        {label:scene.script?'Write the script again':'Write script for this scene',icon:'script',fn:()=>onWriteScene(id)},
        {label:'Add scene before',icon:'move-up',fn:()=>add(i)},
        {label:'Add scene after',icon:'move-down',fn:()=>add(i+1)},
        ...(hasRecording?[{label:'Record this scene',icon:'microphone' as const,fn:()=>onRecord(id)}]:[]),
        '-',
        {label:'Delete scene',icon:'delete',danger:true,fn:()=>remove(i)},
       ]}/></span>
     </div>
     <ul className="pts">{scene.talkingPoints.map((point,k)=><li key={k}><Ed value={point} ph="Talking point" autoFocus={point===''&&added===id}
      onChange={text=>setScene(i,{talkingPoints:editPoint(scene.talkingPoints,k,text)})}
      onEnter={()=>{const points=[...scene.talkingPoints];points.splice(k+1,0,'');setScene(i,{talkingPoints:points});}}/></li>)}</ul>
     <div className="scene-show"><Icon name="screen" size={14}/><span className="faint" style={{flex:'none'}}>Show</span><Ed value={scene.show} ph="What's on screen" onChange={show=>setScene(i,{show})} style={{flex:1}}/></div>
     {(scene.script||writing)&&<div className="script">{writing?<div className="shimmer" style={{height:44}}/>:<Ed multiline value={scene.script} ph="Script" onChange={text=>onSceneScript(id,text)}/>}</div>}
    </div>;
   })}
  {scenes.length>0&&<button type="button" className="addscene" style={dragIndex!==null&&overIndex===scenes.length?{boxShadow:'0 -3px 0 0 var(--cc-accent)'}:undefined} onClick={()=>add(scenes.length)}><Icon name="add" size={15}/>Add scene</button>}
 </section>;
}
