import {useState} from 'react';
import {Button,Icon,Input} from '../ui';

/** Tags you can remove, and an input that adds one on Enter or Add. Controlled: `onChange` gets the whole new list. */
export function TagEditor({label,values,placeholder,disabled,onChange,onAdd}:{label:string;values:readonly string[];placeholder:string;disabled?:boolean;onChange(next:string[]):void;onAdd(list:readonly string[],text:string):string[]}){
 const [text,setText]=useState('');
 const add=()=>{
  const next=onAdd(values,text);
  if(next.length!==values.length)onChange(next);
  setText('');
 };
 return <div>
  {values.length>0&&<ul aria-label={label} className="row" style={{flexWrap:'wrap',gap:6,marginBottom:8,padding:0,listStyle:'none'}}>{values.map(value=><li key={value} className="tag">{value}
   <button type="button" disabled={disabled} aria-label={`Remove ${value}`} style={{border:0,background:'none',padding:0,cursor:'pointer',color:'var(--cc-text-3)',display:'inline-flex'}} onClick={()=>onChange(values.filter(item=>item!==value))}><Icon name="X" size={13}/></button>
  </li>)}</ul>}
  <div className="row">
   <Input aria-label={label} value={text} disabled={disabled} autoComplete="off" spellCheck={false} placeholder={placeholder} style={{maxWidth:340}} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/>
   <Button size="sm" disabled={disabled||!text.trim()} onClick={add}><Icon name="Plus" size={14}/>Add</Button>
  </div>
 </div>;
}
