import type {ReactNode} from 'react';
import type {ConceptLevel,ConceptRating,Package} from '../../../shared/club';
import {Input,Textarea} from '../ui';

const LEVELS:{value:ConceptLevel;label:string}[]=[{value:'high',label:'High'},{value:'mid',label:'Mid'},{value:'low',label:'Low'}];

function Field({label,hint,children}:{label:string;hint?:string;children:ReactNode}){
 return <label className="flex flex-col gap-1.5">
  <span className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">{label}{hint&&<span className="font-normal text-muted tabular-nums">{hint}</span>}</span>
  {children}
 </label>;
}

/** A rating that was never judged shows "Not rated" until a level is picked. */
function Rating({label,value,onChange}:{label:string;value?:ConceptRating;onChange(value:ConceptRating):void}){
 return <div className="grid grid-cols-[104px_88px_1fr] items-center gap-2">
  <span className="text-sm font-medium text-ink">{label}</span>
  <select aria-label={`${label} level`} value={value?.level??''} onChange={event=>onChange({note:'',...value,level:event.target.value as ConceptLevel})}
   className="h-10 rounded-md border border-line bg-card px-2 font-sans text-base text-ink focus-visible:outline-2 focus-visible:outline-accent">
   {!value&&<option value="" disabled>Not rated</option>}
   {LEVELS.map(level=><option key={level.value} value={level.value}>{level.label}</option>)}
  </select>
  <Input aria-label={`${label} note`} value={value?.note??''} disabled={!value} onChange={event=>value&&onChange({...value,note:event.target.value})}/>
 </div>;
}

/** Every field of the package, editable. Changes go to `onChange` as the whole package. */
export function PackageForm({value,onChange,disabled}:{value:Package;onChange(next:Package):void;disabled?:boolean}){
 const set=<K extends keyof Package>(key:K,next:Package[K])=>onChange({...value,[key]:next});
 return <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-5">
  <div className="flex flex-col gap-2">
   <Rating label="Demand" value={value.demand} onChange={next=>set('demand',next)}/>
   <Rating label="Gap" value={value.gap} onChange={next=>set('gap',next)}/>
   <Rating label="Easy to show" value={value.show} onChange={next=>set('show',next)}/>
  </div>
  <Field label="Angle"><Textarea rows={2} className="min-h-0" value={value.angle} onChange={event=>set('angle',event.target.value)}/></Field>
  <Field label="Twist"><Textarea rows={2} className="min-h-0" value={value.twist} onChange={event=>set('twist',event.target.value)}/></Field>
  <div className="flex flex-col gap-2">
   {value.titles.map((title,index)=><Field key={index} label={`Title option ${index+1}`} hint={`${[...title].length}/60`}>
    <Input value={title} onChange={event=>{const titles=[...value.titles] as Package['titles'];titles[index]=event.target.value;set('titles',titles);}}/>
   </Field>)}
  </div>
  <Field label="Thumbnail text" hint="2–5 words"><Input value={value.thumbnailText} onChange={event=>set('thumbnailText',event.target.value)}/></Field>
  <div className="flex flex-col gap-2">
   <span className="text-sm font-semibold text-ink">Hook</span>
   <Field label="What's on screen"><Input value={value.hook.visual} onChange={event=>set('hook',{...value.hook,visual:event.target.value})}/></Field>
   <Field label="Spoken line"><Textarea rows={2} className="min-h-0" value={value.hook.spoken} onChange={event=>set('hook',{...value.hook,spoken:event.target.value})}/></Field>
   <Field label="On-screen text"><Input value={value.hook.text} onChange={event=>set('hook',{...value.hook,text:event.target.value})}/></Field>
  </div>
 </fieldset>;
}
