import {useEffect,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import type {Outline,OutlineScene,VideoScene} from '../../../shared/club';
import {toProgress} from '../scenes';
import {Button,Ed,Icon,IconButton,Menu,SceneStatus,cn,useToast,type MenuItem} from '../ui';
import {clockTime} from '../video-plan';
import {ReplaceScenes} from '../workspace/ReplaceScenes';
import {SAVE_DELAY_MS} from '../usePlan';
import {blankScene,editPoint,insertScene,moveScene,parseClock,removeScene,sceneCardId,totalSeconds,TARGET_SECONDS} from './plan-logic';

/**
 * The right column of Plan: the outline's scenes as rows (number, title, status, length). One scene is open at a time, and the open one
 * shows its talking points, what to show, its script and what is left to decide, all editable in place. Drag a row, press Alt+↑/↓ on it,
 * or use the scene's menu to reorder; add, remove with Undo, and write a scene's script from the same menu. With no scenes the column is
 * one sentence and Draft scenes from the board; with scenes its heading's "Write with Claude" menu writes the full script or redrafts
 * the scenes (asking first, since a redraft replaces them).
 */
export function ScenesColumn({target,onTarget,hasRecording,outline,known,focusId,drafting,draftLine,scriptingScene,scripting,onEdit,onFocus,onDraft,onWriteScene,onWriteAll,onSceneScript,onRecord,onSaveNow}:{
 target:number;onTarget(seconds:number):void;hasRecording:boolean;outline:Outline|null;known:readonly VideoScene[]|undefined;focusId:string|null;
 drafting:boolean;draftLine?:string;
 /** The scene a script run is writing, or none while it writes the whole script. */
 scriptingScene?:string;scripting:boolean;
 onEdit(next:Outline):void;onFocus(sceneId:string):void;onDraft():void;onWriteScene(sceneId:string):void;onSceneScript(sceneId:string,text:string):void;onRecord(sceneId:string):void;
 /** Writes the script of every scene. Without it the menu offers only the redraft. */
 onWriteAll?():void;
 /** Saves what is waiting now: a field was left. */
 onSaveNow?():void;
}){
 const toast=useToast();
 const scenes=outline?.scenes??[];
 const [dragIndex,setDragIndex]=useState<number|null>(null),[overIndex,setOverIndex]=useState<number|null>(null);
 const [added,setAdded]=useState<string|null>(null);
 const [redraft,setRedraft]=useState(false);
 // Every field saves as it is typed. A scene's script has its own save, sent a moment after the last keystroke and at once when it is left.
 const scriptWait=useRef<{id:string;text:string;timer:ReturnType<typeof setTimeout>}|null>(null);
 const sendScript=()=>{const wait=scriptWait.current;if(!wait)return;clearTimeout(wait.timer);scriptWait.current=null;onSceneScript(wait.id,wait.text);};
 const scriptSoon=(id:string,text:string)=>{if(scriptWait.current&&scriptWait.current.id!==id)sendScript();if(scriptWait.current)clearTimeout(scriptWait.current.timer);scriptWait.current={id,text,timer:setTimeout(sendScript,SAVE_DELAY_MS)};};
 const sendRef=useRef(sendScript);sendRef.current=sendScript;
 useEffect(()=>()=>sendRef.current(),[]);
 const leave=()=>{sendScript();onSaveNow?.();};
 // One scene open at a time: the focused one (picked in the strip, the companion, or here), until it is closed.
 const [openId,setOpenId]=useState<string|null>(focusId);
 useEffect(()=>{if(focusId)setOpenId(focusId);},[focusId]);
 const cards=useRef<Record<number,HTMLElement|null>>({});
 const total=totalSeconds(scenes),over=target>0&&total>target;
 const knownById=new Map((known??[]).map(scene=>[scene.id,scene]));

 // Picking a scene in the strip brings its row into view.
 useEffect(()=>{
  if(focusId)document.getElementById(sceneCardId(focusId))?.scrollIntoView?.({behavior:'smooth',block:'center'});
 },[focusId]);

 const open=(id:string)=>{setOpenId(id);onFocus(id);};
 const setScene=(index:number,next:Partial<OutlineScene>)=>outline&&onEdit({...outline,scenes:scenes.map((scene,i)=>i===index?{...scene,...next}:scene)});
 const setScenes=(next:OutlineScene[])=>outline&&onEdit({...outline,scenes:next});
 const move=(from:number,to:number)=>setScenes(moveScene(scenes,from,to));
 const add=(at:number)=>{
  const scene=blankScene();
  if(outline)onEdit({...outline,scenes:insertScene(scenes,at,scene)});
  setAdded(scene.id!);open(scene.id!);
 };
 const remove=(index:number)=>{
  const before=scenes;
  setScenes(removeScene(scenes,index));
  toast(`Deleted "${before[index].title}"`,{undo:()=>outline&&onEdit({...outline,scenes:before})});
 };
 /** Alt+↑ and Alt+↓ move the scene (a row, or the open scene's grip without Alt). */
 const moveKeys=(event:KeyboardEvent<HTMLElement>,i:number,needAlt:boolean)=>{
  if(needAlt&&!event.altKey)return;
  if(event.key==='ArrowUp'&&i>0){event.preventDefault();move(i,i-1);}
  if(event.key==='ArrowDown'&&i<scenes.length-1){event.preventDefault();move(i,i+2);}
 };

 const onGrip=(event:PointerEvent<HTMLElement>,index:number)=>{
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();setDragIndex(index);setOverIndex(index);
  let to=index;
  const middles=()=>scenes.map((_,i)=>{const box=cards.current[i]?.getBoundingClientRect();return box?box.top+box.height/2:0;});
  const onMove=(pointer:globalThis.PointerEvent)=>{const ys=middles();to=ys.findIndex(y=>pointer.clientY<y);if(to<0)to=ys.length;setOverIndex(to);};
  const onUp=()=>{window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);setDragIndex(null);setOverIndex(null);move(index,to);};
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);
 };

 const menuFor=(scene:OutlineScene,i:number,id:string):MenuItem[]=>[
  {label:scene.script?'Write the script again':'Write script for this scene',icon:'script',fn:()=>onWriteScene(id)},
  ...(hasRecording?[{label:'Record this scene',icon:'microphone' as const,fn:()=>onRecord(id)}]:[]),
  '-',
  ...(i>0?[{label:'Move up',icon:'move-up' as const,fn:()=>move(i,i-1)}]:[]),
  ...(i<scenes.length-1?[{label:'Move down',icon:'move-down' as const,fn:()=>move(i,i+2)}]:[]),
  {label:'Add scene before',icon:'add',fn:()=>add(i)},
  {label:'Add scene after',icon:'add',fn:()=>add(i+1)},
  '-',
  {label:'Delete scene',icon:'delete',danger:true,fn:()=>remove(i)},
 ];

 const writes:MenuItem[]=drafting||scripting?[]:[
  ...(onWriteAll?[{label:outline?.fullScript||scenes.every(scene=>scene.script)?'Write the full script again':'Write the full script',icon:'script' as const,fn:onWriteAll}]:[]),
  {label:'Redraft the scenes',icon:'draft',fn:()=>setRedraft(true)},
 ];
 const busy=drafting||scripting;
 return <section className="scn" aria-label="Scenes">
  <div className="doc-h"><h2>Scenes</h2>{scenes.length>0&&<span className="chip">{scenes.length}</span>}
   <span className="grow"/>
   {scenes.length>0&&<Menu align="right" label="Write with Claude" items={writes} button={(toggle,open)=><Button size="sm" aria-expanded={open} aria-haspopup="menu" disabled={!writes.length} onClick={toggle}>
    {busy?<span className="spin" role="status" aria-label="Writing"/>:<Icon name="ai" size={14}/>}Write with Claude<Icon name="expand" size={13}/></Button>}/>}
  </div>
  {scenes.length>0&&<div className="row" style={{marginBottom:14,gap:'8px 14px',flexWrap:'wrap'}}>
   <span className="doc-sub" style={{margin:0}}>Talk through each one when you record.</span><span className="grow"/>
   <div className="len" style={{whiteSpace:'nowrap'}}><span className="tnum"><b style={{color:over?'var(--cc-warn)':'var(--cc-text)'}}>{clockTime(total)}</b>{target>0?' of':''}</span>
    <select className="select" style={{height:26,fontSize:12.5}} value={target} onChange={event=>onTarget(Number(event.target.value))} aria-label="Target length">
     <option value={0}>No target</option>{TARGET_SECONDS.map(seconds=><option key={seconds} value={seconds}>{seconds/60} min</option>)}</select>
    {target>0&&<span className="bar" style={{width:110}}><i className={over?'over':''} style={{width:`${Math.min(100,total/target*100)}%`}}/></span>}</div>
  </div>}
  {redraft&&<ReplaceScenes scenes={known?.length?known:scenes.map((scene,i)=>({id:scene.id??String(i),title:scene.title,seconds:scene.seconds,takes:[],status:''}))} action="Drafting again" undoLine="You can undo it from the line above the scenes."
   onKeep={()=>setRedraft(false)} onReplace={()=>{setRedraft(false);onDraft();}}/>}

  {!scenes.length
   ?(drafting
    ?<div className="card" style={{padding:16,display:'flex',flexDirection:'column',gap:10}} role="status" aria-label={draftLine??'Drafting scenes'}>{[0,1,2,3].map(i=><div key={i} className="shimmer" style={{height:74}}/>)}{draftLine&&<span className="faint small">{draftLine}</span>}</div>
    :<div className="plan-empty">
      <p>Claude reads the board and writes the scenes you will talk through, and you can edit every word.</p>
      <Button variant="primary" onClick={onDraft}><Icon name="draft" size={15}/>Draft scenes from the board</Button></div>)
   :scenes.map((scene,i)=>{
    const id=scene.id??String(i);
    const progress=knownById.get(id);
    const status=progress?<SceneStatus scene={toProgress([progress])[0]}/>:null;
    const writing=scripting&&scriptingScene===id;
    const decide=scene.decide??[];
    const isOpen=openId===id;
    const place=cn('card scene',isOpen?'open':'closed',focusId===id&&'focus',dragIndex===i&&'dragging',overIndex===i&&dragIndex!==null&&dragIndex!==i&&'drop-before');
    if(!isOpen)return <div key={id} id={sceneCardId(id)} ref={element=>{cards.current[i]=element;}} className={place}>
     <span className="grip" aria-hidden onPointerDown={event=>onGrip(event,i)}><Icon name="drag" size={15}/></span>
     <button type="button" className="scene-open" aria-expanded={false} aria-label={`Scene ${i+1}: ${scene.title}`} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onClick={()=>open(id)} onKeyDown={event=>moveKeys(event,i,true)}>
      <span className="n">{i+1}</span><span className="t ellipsis">{scene.title||'Untitled'}</span>
      {decide.length>0&&<span className="faint small decide-count">{decide.length} to decide</span>}
      {writing&&<span className="spin" role="status" aria-label="Writing the script"/>}
      {status}<span className="tnum small muted">{clockTime(scene.seconds)}</span>
     </button>
    </div>;
    return <div key={id} id={sceneCardId(id)} ref={element=>{cards.current[i]=element;}} aria-label={`Scene ${i+1}`} className={place} onClick={()=>onFocus(id)}>
     <div className="scene-h">
      <button type="button" className="grip" aria-label="Drag to reorder, or use the arrow keys" onPointerDown={event=>onGrip(event,i)} onClick={event=>event.stopPropagation()} onKeyDown={event=>moveKeys(event,i,false)}><Icon name="drag" size={15}/></button>
      <span className="n">{i+1}</span>
      <Ed live onLeave={leave} className="t" value={scene.title} ph="Scene title" onChange={title=>setScene(i,{title})}/>
      {status}
      <input className="dur" key={`${id}-${scene.seconds}`} defaultValue={clockTime(scene.seconds)} aria-label="Scene length" onClick={event=>event.stopPropagation()}
       onBlur={event=>{const seconds=parseClock(event.target.value);if(seconds)setScene(i,{seconds});else event.target.value=clockTime(scene.seconds);}} onKeyDown={event=>event.key==='Enter'&&event.currentTarget.blur()}/>
      <span onClick={event=>event.stopPropagation()}><Menu align="right" label="Scene options" button={toggle=><IconButton icon="more" label="Scene options" onClick={toggle}/>} items={menuFor(scene,i,id)}/></span>
      <span onClick={event=>event.stopPropagation()}><IconButton icon="collapse" label="Close scene" onClick={()=>setOpenId(null)}/></span>
     </div>
     <ul className="pts">{scene.talkingPoints.map((point,k)=><li key={k}><Ed live onLeave={leave} value={point} ph="Talking point" autoFocus={point===''&&added===id}
      onChange={text=>setScene(i,{talkingPoints:editPoint(scene.talkingPoints,k,text)})}
      onEnter={()=>{const points=[...scene.talkingPoints];points.splice(k+1,0,'');setScene(i,{talkingPoints:points});}}/></li>)}</ul>
     <div className="scene-show"><Icon name="screen" size={14}/><span className="faint" style={{flex:'none'}}>Show</span><Ed live onLeave={leave} value={scene.show} ph="What's on screen" onChange={show=>setScene(i,{show})} style={{flex:1}}/></div>
     {(scene.script||writing)&&<div className="script">{writing?<div className="shimmer" style={{height:44}}/>:<Ed multiline live onLeave={leave} value={scene.script} ph="Script" onChange={text=>scriptSoon(id,text)}/>}</div>}
     {decide.length>0&&<details className="decide" onClick={event=>event.stopPropagation()}>
      <summary>To decide ({decide.length})</summary>
      <ul>{decide.map((item,k)=><li key={k}><span>{item}</span><Button variant="quiet" size="sm" onClick={()=>setScene(i,{decide:decide.filter((_,n)=>n!==k)})}>Mark decided</Button></li>)}</ul>
      <p className="faint small">Choices for you. They are not read out and never show in the teleprompter.</p>
     </details>}
    </div>;
   })}
  {scenes.length>0&&<button type="button" className="addscene" style={dragIndex!==null&&overIndex===scenes.length?{boxShadow:'0 -3px 0 0 var(--cc-accent)'}:undefined} onClick={()=>add(scenes.length)}><Icon name="add" size={15}/>Add scene</button>}
 </section>;
}
