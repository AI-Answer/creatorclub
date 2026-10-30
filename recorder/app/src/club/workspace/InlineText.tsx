import {useEffect,useRef,useState} from 'react';
import {errorMessage} from '../api';
import {MarkdownEditor} from '../markdown/MarkdownEditor';

const SAVE_AFTER_MS=700;

/**
 * Text you write right on a card, in the same rich editor as a note (headings, lists, bold, links, checklists, "/" commands).
 * It saves a moment after you stop and when you click away; a failed save says so and offers to try again. Nothing else on the card moves while you type.
 */
export function InlineText({value,label,placeholder,save}:{value:string;label:string;placeholder?:string;save(text:string):Promise<unknown>}){
 const [state,setState]=useState<'saved'|'saving'|'failed'>('saved'),[problem,setProblem]=useState('');
 const latest=useRef(value),dirty=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const saveRef=useRef(save);saveRef.current=save;
 const flush=()=>{
  clearTimeout(timer.current);
  if(!dirty.current)return;
  const text=latest.current;
  dirty.current=false;setState('saving');
  saveRef.current(text).then(()=>setState(dirty.current?'saving':'saved'),reason=>{dirty.current=true;setProblem(errorMessage(reason,"Couldn't save this text."));setState('failed');});
 };
 const change=(markdown:string)=>{
  latest.current=markdown;dirty.current=true;setState('saving');setProblem('');
  clearTimeout(timer.current);timer.current=setTimeout(flush,SAVE_AFTER_MS);
 };
 // Leaving the card with writing not yet saved saves it.
 useEffect(()=>()=>{clearTimeout(timer.current);if(dirty.current)void saveRef.current(latest.current).catch(()=>{});},[]);
 return <div className="inline-text">
  <MarkdownEditor value={value} onChange={change} onBlur={flush} label={label} placeholder={placeholder}/>
  {state==='failed'&&<div className="small inline-text-err" role="alert">{problem} <button type="button" className="linkish" onClick={flush}>Try again</button></div>}
 </div>;
}
