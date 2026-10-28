import {Plus,X} from 'lucide-react';
import type {Outline,OutlineScene} from '../../../shared/club';
import {Button,Card,Input,Textarea} from '../ui';
import {clockTime} from '../video-plan';

export const sceneAnchor=(index:number)=>`plan-scene-${index+1}`;

/** The outline's scenes, each editable: title, talking points (one per line) and what to show. */
export function OutlineEditor({value,onChange,disabled}:{value:Outline;onChange(next:Outline):void;disabled?:boolean}){
 const setScene=(index:number,next:Partial<OutlineScene>)=>onChange({...value,scenes:value.scenes.map((scene,i)=>i===index?{...scene,...next}:scene)});
 let at=0;
 return <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-3">
  <ol aria-label="Scenes" className="flex flex-col gap-3">
   {value.scenes.map((scene,index)=>{const start=at;at+=scene.seconds;return <li key={index} id={sceneAnchor(index)} className="scroll-mt-4">
    <Card className="flex flex-col gap-3 p-4">
     <div className="flex items-center gap-3">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-sm font-semibold text-muted">{index+1}</span>
      <Input aria-label={`Scene ${index+1} title`} value={scene.title} onChange={event=>setScene(index,{title:event.target.value})} className="font-medium"/>
      {scene.seconds>0&&<span className="shrink-0 text-sm text-muted tabular-nums">{clockTime(start)}–{clockTime(at)}</span>}
      {value.scenes.length>1&&<Button variant="ghost" size="sm" aria-label={`Remove scene ${index+1}`} className="px-2 text-muted" onClick={()=>onChange({...value,scenes:value.scenes.filter((_,i)=>i!==index)})}><X aria-hidden/></Button>}
     </div>
     <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">Talking points</span>
      <Textarea rows={Math.max(3,scene.talkingPoints.length+1)} className="min-h-0" value={scene.talkingPoints.join('\n')} onChange={event=>setScene(index,{talkingPoints:event.target.value.split('\n')})}/>
     </label>
     <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">What to show</span>
      <Input value={scene.show} onChange={event=>setScene(index,{show:event.target.value})}/>
     </label>
    </Card>
   </li>;})}
  </ol>
  <Button variant="ghost" className="self-start" onClick={()=>onChange({...value,scenes:[...value.scenes,{title:`Scene ${value.scenes.length+1}`,talkingPoints:[],show:'',seconds:0}]})}><Plus aria-hidden/>Add scene</Button>
 </fieldset>;
}

/** The full script, when it was chosen over talking points. */
export function ScriptEditor({value,onChange,disabled}:{value:string;onChange(next:string):void;disabled?:boolean}){
 return <label className="flex flex-col gap-1.5">
  <span className="text-sm font-medium text-ink">Full script</span>
  <Textarea aria-label="Full script" rows={18} disabled={disabled} value={value} onChange={event=>onChange(event.target.value)} className="font-sans"/>
 </label>;
}
