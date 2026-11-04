import {useEffect,useRef} from 'react';
import {FIND_IDEA,GLOSSARY,PLACES,SHORTCUTS,STEPS_SENTENCE,VIDEO_STEPS} from './labels';
import {Dialog,Icon} from '../ui';

const mark=(topic:string|undefined,key:string)=>topic===key?' on':'';

/**
 * Help: what each step is, the words the app uses, where things live and the keyboard shortcuts. The words come from `steps.ts`, the same ones
 * Home, the video's tabs, the Board's tip and search use. `topic` (from search) scrolls to one step, word or the shortcuts and marks it.
 */
export function Help({topic,onClose}:{topic?:string;onClose():void}){
 const body=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!topic)return;
  [...(body.current?.querySelectorAll<HTMLElement>('[data-topic]')??[])].find(element=>element.dataset.topic===topic)?.scrollIntoView?.({block:'nearest'});
 },[topic]);
 return <Dialog title="How Creator Compiler works" onClose={onClose} width={720}>
  <div className="help-body" ref={body}>
   <h4>Where to start</h4>
   <p className="muted" style={{margin:0,lineHeight:1.55}}>Every video is one card that goes from idea to published. Start in {FIND_IDEA.name}: {FIND_IDEA.does.charAt(0).toLowerCase()+FIND_IDEA.does.slice(1)} Already know the title? Choose New video and type it.</p>

   <h4>The four steps of every video</h4>
   <div className="help-steps four">{VIDEO_STEPS.map(step=><div key={step.tab} className={`hs topic${mark(topic,`step:${step.tab}`)}`} data-topic={`step:${step.tab}`}>
    <Icon name={step.icon} size={18}/><b>{step.name}</b><span>{step.does}</span>
   </div>)}</div>
   <p className="small muted" style={{margin:'8px 0 0'}}>{STEPS_SENTENCE} They are the tabs at the top of a video, and the only way between steps.</p>

   <h4>Words Creator Compiler uses</h4>
   <dl>{GLOSSARY.map(item=><div key={item.term} className={`topic${mark(topic,`term:${item.term}`)}`} data-topic={`term:${item.term}`} style={{display:'contents'}}><dt>{item.term}</dt><dd>{item.means}</dd></div>)}</dl>

   <h4>Where things live</h4>
   <dl>{PLACES.map(place=><div key={place.name} style={{display:'contents'}}><dt>{place.name}</dt><dd>{place.where}</dd></div>)}</dl>

   <h4 data-topic="shortcuts">Keyboard shortcuts</h4>
   <dl className={`topic${mark(topic,'shortcuts')}`}>{SHORTCUTS.map(item=><div key={item.keys} style={{display:'contents'}}><dt>{item.keys}</dt><dd>{item.what}</dd></div>)}</dl>

   <p className="small faint" style={{margin:'16px 0 0'}}>Open this again with Help at the top right, or press ⌘K and type help.</p>
  </div>
 </Dialog>;
}
