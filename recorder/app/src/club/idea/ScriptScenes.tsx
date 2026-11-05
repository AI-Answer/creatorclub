import {useEffect,useRef,useState,type ClipboardEvent,type DragEvent,type KeyboardEvent,type MouseEvent,type PointerEvent} from 'react';
import type {Outline,OutlineScene,VideoScene} from '../../../shared/club';
import {AI_CONNECT_HINT,useAiAvailable} from '../ai-status';
import {BrandLogo} from '../../BrandLogo';
import {Button,Icon,cn,useToast} from '../ui';
import {SAVE_DELAY_MS} from '../usePlan';
import {blankScene,insertScene,moveScene,removeScene,sceneCardId} from '../plan/plan-logic';
import {CARD_DRAG} from './idea-logic';
import {hasSceneBoundary,splitScript,type PastedScene} from './script-paste';
import './script-scenes.css';

/** A scene as it is added here: Borumi's new scene has no name ("Scene N" by its place) and no text. */
const newScene=(from?:PastedScene):OutlineScene=>({...blankScene(),title:from?.title??'',talkingPoints:[]});
const textId=(id:string)=>`script-text-${id}`;
const focusText=(id:string,at:'start'|'end'|number)=>requestAnimationFrame(()=>{
 const area=document.getElementById(textId(id)) as HTMLTextAreaElement|null;if(!area)return;
 area.focus();const position=at==='start'?0:at==='end'?area.value.length:at;area.setSelectionRange(position,position);
});
/**
 * What a scene says, as one text: its script, or its talking points as bullet lines while it has no script. There is one place to
 * write per scene (Borumi's Script step has one editor per scene); typing in it makes it the scene's script.
 */
export const sceneText=(scene:Pick<OutlineScene,'script'|'talkingPoints'>)=>scene.script?.trim()?scene.script:scene.talkingPoints.filter(point=>point.trim()).map(point=>`• ${point}`).join('\n');

type Drag={from:number;to:number;dy:number;startY:number;tops:number[];heights:number[];moved:boolean};

/**
 * The Idea step's script, built to Borumi's Script step (main bundle yD/xD/FP; spec-script-step.md): every scene open in one column,
 * the scene's name in an 80px gutter (12px, 60%, "Scene N" until it is named), a 4px bar that turns green once the scene is recorded,
 * and one text per scene at 16/24px. "Add scene" under the last one; right-click for Add scene before / after and Delete scene.
 * Backspace at the start of a scene merges it into the one above (an empty one is deleted); ↑ at the start and ↓ at the end move between
 * scenes. A pasted script splits into scenes at headings and --- lines.
 *
 * A scene is dragged by its name: it lifts and follows the pointer while the others slide out of its way, and lands where it is dropped
 * (Escape puts it back). A click on the name, without moving, renames it. What CreatorClub adds: the connected AI writes a scene's script
 * from its menu, and a board card dropped on a scene is added to its text.
 */
export function ScriptScenes({aiName,aiBrand,hasRecording,outline,known,focusId,drafting,draftLine,scriptingScene,scripting,
 onEdit,onFocus,onDraft,onWriteScene,onSceneScript,onRecord,onSaveNow,onStartRecording}:{
 aiName:string;aiBrand:'claude'|'chatgpt';hasRecording:boolean;outline:Outline|null;known:readonly VideoScene[]|undefined;focusId:string|null;
 drafting:boolean;draftLine?:string;scriptingScene?:string;scripting:boolean;
 onEdit(next:Outline):void;onFocus(sceneId:string):void;onDraft():void;onWriteScene(sceneId:string):void;
 onSceneScript(sceneId:string,text:string):void;onRecord(sceneId:string):void;
 /** Saves the outline now (new scenes must exist before their text is saved). */
 onSaveNow():Promise<void>;
 /** Borumi's "Start Recording right away". */
 onStartRecording():void;
}){
 const toast=useToast(),aiAvailable=useAiAvailable();
 const scenes=outline?.scenes??[];
 const knownById=new Map((known??[]).map(scene=>[scene.id,scene]));
 const [dropOn,setDropOn]=useState<string|null>(null),[renaming,setRenaming]=useState<string|null>(null);
 const [drag,setDrag]=useState<Drag|null>(null);
 const [menuAt,setMenuAt]=useState<{index:number;x:number;y:number}|null>(null);
 const items=useRef<Record<number,HTMLElement|null>>({});

 // A scene's text saves a moment after the last keystroke, and at once when it is left (the outline does not carry scripts).
 const wait=useRef<{id:string;text:string;timer:ReturnType<typeof setTimeout>}|null>(null);
 const send=()=>{const now=wait.current;if(!now)return;clearTimeout(now.timer);wait.current=null;onSceneScript(now.id,now.text);};
 const soon=(id:string,text:string)=>{if(wait.current&&wait.current.id!==id)send();if(wait.current)clearTimeout(wait.current.timer);wait.current={id,text,timer:setTimeout(send,SAVE_DELAY_MS)};};
 const sendRef=useRef(send);sendRef.current=send;
 useEffect(()=>()=>sendRef.current(),[]);

 const base=outline??{scenes:[]};
 const setScenes=(next:OutlineScene[])=>onEdit({...base,scenes:next});
 const setScene=(index:number,patch:Partial<OutlineScene>)=>setScenes(scenes.map((scene,at)=>at===index?{...scene,...patch}:scene));
 const add=(at:number)=>{const scene=newScene();setScenes(insertScene(scenes,at,scene));onFocus(scene.id!);focusText(scene.id!,'start');};
 const remove=(index:number)=>{const before=scenes;setScenes(removeScene(scenes,index));toast(`Deleted ${before[index].title||`scene ${index+1}`}`,{undo:()=>setScenes([...before])});};
 const textOf=(scene:OutlineScene)=>scene.id&&wait.current?.id===scene.id?wait.current.text:sceneText(scene);
 /** The text typed into a scene becomes its script; talking points it was showing are now part of that text. */
 const write=(index:number,text:string)=>{
  const scene=scenes[index],id=scene.id??String(index);
  if(scene.talkingPoints.some(point=>point.trim()))setScene(index,{talkingPoints:[]});
  soon(id,text);
 };

 /** Several scenes from a paste: in place of `replace` (an empty scene) or at `at`. Their text is saved once they exist. */
 const insertPasted=async(parts:PastedScene[],at:number,replace?:number)=>{
  const made=parts.map(part=>newScene(part));
  const next=[...scenes];next.splice(replace??at,replace===undefined?0:1,...made);
  setScenes(next);
  try{await onSaveNow();}catch{/* the outline save reports its own failure */}
  for(const [index,scene] of made.entries())if(parts[index].script)onSceneScript(scene.id!,parts[index].script);
  if(made.length){onFocus(made[made.length-1].id!);focusText(made[made.length-1].id!,'end');}
 };

 const menuItems=(scene:OutlineScene,index:number):Array<'-'|{label:string;enabled?:boolean;run():void}>=>{
  const id=scene.id??String(index);
  return [
   {label:scene.script?.trim()?`Rewrite the script with ${aiName}`:`Write the script with ${aiName}`,enabled:aiAvailable,run:()=>onWriteScene(id)},
   ...(hasRecording?[{label:'Record this scene',run:()=>onRecord(id)}]:[]),
   '-',
   {label:'Add scene before',run:()=>add(index)},
   {label:'Add scene after',run:()=>add(index+1)},
   '-',
   {label:'Delete scene',run:()=>remove(index)},
  ];
 };
 // Borumi's scene menu is the system's own (request.context_menu.show); without the desktop app it opens in the page.
 const openMenu=async(event:MouseEvent,scene:OutlineScene,index:number)=>{
  event.preventDefault();
  const list=menuItems(scene,index),native=window.sceneForge?.contextMenu;
  if(!native){setMenuAt({index,x:event.clientX,y:event.clientY});return;}
  const chosen=await native(list.map(item=>item==='-'?'-':{label:item.label,enabled:item.enabled}));
  const item=list[chosen];if(item&&item!=='-')item.run();
 };
 useEffect(()=>{
  if(!menuAt)return;
  const close=()=>setMenuAt(null),key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')close();};
  window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};
 },[menuAt]);

 const onKey=(event:KeyboardEvent<HTMLTextAreaElement>,index:number)=>{
  const area=event.currentTarget,start=area.selectionStart,end=area.selectionEnd;
  if(event.key==='Backspace'&&start===0&&end===0&&index>0){
   event.preventDefault();
   const above=scenes[index-1],aboveId=above.id??String(index-1),aboveText=textOf(above),text=area.value;
   send();
   if(!text.trim()){setScenes(removeScene(scenes,index));focusText(aboveId,'end');return;}
   const joined=aboveText?`${aboveText}\n${text}`:text;
   setScenes(removeScene(scenes,index).map(each=>each.id===above.id?{...each,talkingPoints:[]}:each));
   onSceneScript(aboveId,joined);onFocus(aboveId);focusText(aboveId,aboveText?aboveText.length+1:0);
   return;
  }
  if(event.key==='ArrowUp'&&start===0&&end===0&&index>0){event.preventDefault();focusText(scenes[index-1].id??String(index-1),'end');return;}
  if(event.key==='ArrowDown'&&start===area.value.length&&end===start&&index<scenes.length-1){event.preventDefault();focusText(scenes[index+1].id??String(index+1),'start');}
 };
 const onPaste=(event:ClipboardEvent<HTMLTextAreaElement>,index:number)=>{
  const text=event.clipboardData.getData('text/plain');
  if(!hasSceneBoundary(text))return;
  const parts=splitScript(text);if(!parts.length)return;
  event.preventDefault();
  void insertPasted(parts,index+1,!event.currentTarget.value.trim()?index:undefined);
 };

 /** A board card dropped on a scene: its words are added as a new line of the scene's text. */
 const dropProps=(id:string,index:number)=>({
  onDragOver:(event:DragEvent)=>{if(!event.dataTransfer.types.includes(CARD_DRAG))return;event.preventDefault();event.dataTransfer.dropEffect='copy';setDropOn(id);},
  onDragLeave:()=>setDropOn(now=>now===id?null:now),
  onDrop:(event:DragEvent)=>{
   const text=event.dataTransfer.getData(CARD_DRAG).trim();setDropOn(null);
   if(!text)return;event.preventDefault();
   const now=textOf(scenes[index]);write(index,now?`${now}\n• ${text}`:`• ${text}`);send();
   toast(`Added to ${scenes[index].title||`scene ${index+1}`}`);
  },
 });

 // Dragging a scene by its name. The others slide by the dragged scene's height as it passes them.
 const targetOf=(state:Drag,dy:number)=>{const center=state.tops[state.from]+state.heights[state.from]/2+dy;let to=0;state.tops.forEach((top,j)=>{if(j!==state.from&&top+state.heights[j]/2<center)to++;});return to;};
 const beginDrag=(event:PointerEvent<HTMLElement>,index:number,id:string)=>{
  if(event.button!==0)return;
  const tops:number[]=[],heights:number[]=[];
  scenes.forEach((_,j)=>{const box=items.current[j]?.getBoundingClientRect();tops.push(box?.top??0);heights.push(box?.height??0);});
  const start:Drag={from:index,to:index,dy:0,startY:event.clientY,tops,heights,moved:false};
  let state=start;
  const move=(pointer:globalThis.PointerEvent)=>{
   const dy=pointer.clientY-start.startY;
   if(!state.moved&&Math.abs(dy)<4)return;
   if(!state.moved)window.getSelection()?.removeAllRanges();
   state={...state,dy,moved:true,to:targetOf(state,dy)};setDrag(state);
  };
  const finish=(drop:boolean)=>{
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('keydown',key);
   setDrag(null);
   if(!state.moved){if(drop)setRenaming(id);return;}
   if(drop&&state.to!==state.from)setScenes(moveScene(scenes,state.from,state.to>state.from?state.to+1:state.to));
  };
  const up=()=>finish(true);
  const key=(keyEvent:globalThis.KeyboardEvent)=>{if(keyEvent.key==='Escape')finish(false);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('keydown',key);
 };
 const shiftOf=(index:number)=>{
  if(!drag?.moved)return 0;
  if(index===drag.from)return drag.dy;
  const size=drag.heights[drag.from];
  if(drag.to>drag.from&&index>drag.from&&index<=drag.to)return -size;
  if(drag.to<drag.from&&index>=drag.to&&index<drag.from)return size;
  return 0;
 };

 if(!scenes.length)return <div className="bs-root">
  {drafting?<div className="bs-col" role="status" aria-label={draftLine??'Drafting scenes'}>{[0,1,2].map(i=><div key={i} className="bs-shimmer"/>)}{draftLine&&<p className="bs-note">{draftLine}</p>}</div>
   :<div className="bs-col">
    {/* Borumi's empty Script step (bD): one place to start typing, at 50%; the first keystroke makes the first scene. */}
    <div className="bs-empty">
     <textarea className="bs-empty-input" aria-label="Script" spellCheck={false}
      onChange={event=>{const text=event.target.value;if(!text)return;const scene=newScene();setScenes([scene]);void onSaveNow().then(()=>onSceneScript(scene.id!,text),()=>{});onFocus(scene.id!);focusText(scene.id!,'end');}}
      onPaste={event=>{const text=event.clipboardData.getData('text/plain');if(!hasSceneBoundary(text))return;const parts=splitScript(text);if(!parts.length)return;event.preventDefault();void insertPasted(parts,0);}}/>
     <p className="bs-empty-h">Start writing your amazing video...</p>
     <p className="bs-empty-p">You can also paste your script from Notion, Google Docs, or your favorite editor, or <button type="button" className="bs-empty-link" onClick={onStartRecording}>Start Recording</button> right away.</p>
    </div>
    <div className="bs-empty-ai"><Button size="sm" title={!aiAvailable?AI_CONNECT_HINT:undefined} disabled={!aiAvailable} onClick={onDraft}><BrandLogo brand={aiBrand} size={16}/>Write the scenes with {aiName}</Button></div>
   </div>}
 </div>;

 return <div className={cn('bs-root',drag?.moved&&'is-dragging')}>
  <div className="bs-col">
   {scenes.map((scene,index)=>{
    const id=scene.id??String(index),recorded=!!knownById.get(id)?.takes.length,selected=focusId===id,writing=scripting&&scriptingScene===id;
    const name=scene.title.trim()||`Scene ${index+1}`,lifted=drag?.moved&&drag.from===index;
    return <div key={id} className={cn('bs-item',lifted&&'is-lifted')} ref={element=>{items.current[index]=element;}} style={{transform:`translateY(${shiftOf(index)}px)`}}>
     <div id={sceneCardId(id)} data-scene-id={id} aria-label={`Scene ${index+1}`}
      className={cn('bs-row',selected&&'is-selected',recorded&&'is-recorded',dropOn===id&&'is-drop-on')}
      onContextMenu={event=>void openMenu(event,scene,index)} {...dropProps(id,index)}>
      <div className="bs-gutter">{renaming===id
       ?<input className="bs-name-input" autoFocus defaultValue={scene.title} aria-label="Scene name" onFocus={event=>event.currentTarget.select()}
         onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){event.currentTarget.value=scene.title;event.currentTarget.blur();}}}
         onBlur={event=>{const title=event.currentTarget.value.trim();setRenaming(null);if(title&&title!==scene.title)setScene(index,{title});}}/>
       :<button type="button" className="bs-name" title="Drag to move the scene. Click to rename it." aria-label={name}
         onPointerDown={event=>beginDrag(event,index,id)} onClick={event=>{if(event.detail===0)setRenaming(id);}}
         onKeyDown={event=>{if(event.altKey&&event.key==='ArrowUp'&&index>0){event.preventDefault();setScenes(moveScene(scenes,index,index-1));}if(event.altKey&&event.key==='ArrowDown'&&index<scenes.length-1){event.preventDefault();setScenes(moveScene(scenes,index,index+2));}}}>
         <Icon name="drag" size={14}/><span>{name}</span></button>}</div>
      <div className="bs-bar"/>
      <div className="bs-body">
       {writing?<div className="bs-shimmer" role="status" aria-label="Writing the script"/>
        :<SceneText id={id} value={sceneText(scene)} label={`${name} script`} onChange={text=>write(index,text)} onLeave={send}
          onFocus={()=>onFocus(id)} onKeyDown={event=>onKey(event,index)} onPaste={event=>onPaste(event,index)}/>}
      </div>
     </div>
    </div>;
   })}
   <div className="bs-add"><button type="button" className="bs-add-btn" onClick={()=>add(scenes.length)}><Icon name="add" size={16}/>Add scene</button></div>
  </div>
  {menuAt&&<div className="bs-menu" role="menu" style={{left:menuAt.x,top:menuAt.y}} onPointerDown={event=>event.stopPropagation()}>
   {menuItems(scenes[menuAt.index],menuAt.index).map((item,at)=>item==='-'?<div key={at} className="bs-menu-sep" role="separator"/>
    :<button key={at} type="button" role="menuitem" disabled={item.enabled===false} onClick={()=>{setMenuAt(null);item.run();}}>{item.label}</button>)}
  </div>}
 </div>;
}

/** A scene's text, growing with what is written. It keeps its own value while typing; a new saved value shows when it is not being typed in. */
function SceneText({id,value,label,onChange,onLeave,onFocus,onKeyDown,onPaste}:{id:string;value:string;label:string;onChange(text:string):void;onLeave():void;onFocus():void;
 onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>):void;onPaste(event:ClipboardEvent<HTMLTextAreaElement>):void}){
 const [text,setText]=useState(value),area=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{if(document.activeElement!==area.current)setText(value);},[value]);
 return <textarea ref={area} id={textId(id)} className="bs-text" value={text} rows={1} spellCheck={false} aria-label={label} placeholder="What you say in this scene"
  onChange={event=>{setText(event.target.value);onChange(event.target.value);}} onBlur={onLeave} onFocus={onFocus} onKeyDown={onKeyDown} onPaste={onPaste}/>;
}
