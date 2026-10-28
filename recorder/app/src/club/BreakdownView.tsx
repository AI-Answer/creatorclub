import {useState,type ReactNode} from 'react';
import type {Breakdown,ConceptLevel,ConceptRating} from '../../shared/club';
import {ClubApiError,errorMessage} from './api';
import {PLATFORM_LABEL,formatAge,formatCount} from './breakdown';
import {ErrorLine} from './ErrorLine';
import {Badge,Button,Card,OutlierChip,type BadgeTone} from './ui';

const LEVEL_TONE:Record<ConceptLevel,BadgeTone>={high:'success',mid:'neutral',low:'danger'};
const LEVEL_LABEL:Record<ConceptLevel,string>={high:'High',mid:'Mid',low:'Low'};

function Section({title,children}:{title:string;children:ReactNode}){
 return <section aria-label={title} className="flex flex-col gap-3">
  <h3 className="text-base font-semibold text-ink">{title}</h3>
  {children}
 </section>;
}

const Part=({label,children}:{label:string;children:ReactNode})=><div>
 <dt className="text-sm font-medium text-muted">{label}</dt>
 <dd className="mt-0.5 text-base text-ink">{children}</dd>
</div>;

function Rating({label,rating}:{label:string;rating:ConceptRating}){
 return <div className="flex items-baseline gap-2 text-sm">
  <dt className="w-24 shrink-0 text-muted">{label}</dt>
  <dd className="flex min-w-0 items-baseline gap-2"><Badge tone={LEVEL_TONE[rating.level]}>{LEVEL_LABEL[rating.level]}</Badge><span className="min-w-0 text-ink">{rating.note}</span></dd>
 </div>;
}

/** One concept. `Add to board` puts it in Ideas; it stays a plain suggestion until that is pressed. */
function ConceptCard({concept,added,onAdd}:{concept:Breakdown['concepts'][number];added:boolean;onAdd():Promise<void>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const add=async()=>{
  setBusy(true);setError('');
  try{await onAdd();}catch(reason){setError(errorMessage(reason,"Couldn't add that."));}finally{setBusy(false);}
 };
 return <Card className="flex flex-col gap-3 p-4">
  <div className="flex items-start justify-between gap-3">
   <h4 className="min-w-0 text-base font-semibold text-ink">{concept.title}</h4>
   {added?<Badge tone="success" className="shrink-0">On the board</Badge>:<Button size="sm" disabled={busy} onClick={add}>Add to board</Button>}
  </div>
  <dl className="flex flex-col gap-2">
   <Part label="Angle">{concept.angle}</Part>
   <Part label="Your twist">{concept.twist}</Part>
   <Part label="Hook"><q>{concept.hook}</q></Part>
  </dl>
  <dl className="flex flex-col gap-1.5 border-t border-line pt-3">
   <Rating label="Demand" rating={concept.demand}/>
   <Rating label="Gap" rating={concept.gap}/>
   <Rating label="Easy to show" rating={concept.show}/>
  </dl>
  <p className="text-sm text-muted">{concept.why}</p>
  {error&&<ErrorLine message={error} onRetry={add}/>}
 </Card>;
}

/** The finished breakdown: stat row, why it worked, the reusable outline, what viewers asked and the concepts. */
export function BreakdownView({breakdown,added,onAdd}:{breakdown:Breakdown;added:ReadonlySet<number>;onAdd(index:number):Promise<void>}){
 const {video,whyItWorked:why,concepts}=breakdown;
 const known=breakdown.platform!=='file';
 const stats=[
  known&&video.views>0&&[formatCount(video.views),'views'],
  video.likes>0&&[formatCount(video.likes),'likes'],
  video.comments>0&&[formatCount(video.comments),'comments'],
 ].filter((stat):stat is string[]=>Array.isArray(stat));
 return <div className="flex flex-col gap-6">
  <header className="flex flex-col gap-1">
   <h3 className="text-lg font-semibold text-ink">{video.title}</h3>
   <p className="text-sm text-muted">{[video.channel,PLATFORM_LABEL[breakdown.platform]??breakdown.platform].filter(Boolean).join(' · ')}</p>
  </header>
  {(video.multiplier!==undefined||stats.length>0||known)&&<div role="group" aria-label="Video stats" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base text-ink">
   {video.multiplier!==undefined&&<OutlierChip multiplier={video.multiplier} label="usual views"/>}
   {stats.map(([value,label])=><span key={label}><strong className="font-semibold tabular-nums">{value}</strong> <span className="text-muted">{label}</span></span>)}
   {known&&<span className="text-muted">{formatAge(video.ageDays)}</span>}
  </div>}
  {breakdown.watchedWith==='gemini'&&<p className="text-sm text-muted">Watched with Gemini</p>}

  <Section title="Why it worked">
   <ul className="list-disc space-y-1 pl-5 text-base text-ink">{why.short.map((point,index)=><li key={index}>{point}</li>)}</ul>
   <dl className="flex flex-col gap-3 rounded-lg bg-subtle p-4">
    <Part label="Title and packaging">{why.titlePackaging}</Part>
    <Part label="How fast the opening hooks">{why.hookSpeed}</Part>
    <Part label="Structure"><ol className="list-decimal space-y-1 pl-5">{why.structure.map((beat,index)=><li key={index}>{beat}</li>)}</ol></Part>
    <Part label="What keeps people watching">{why.retention}</Part>
    <Part label="Payoff">{why.payoff}</Part>
   </dl>
  </Section>

  <Section title="Reusable outline">
   <ol className="list-decimal space-y-1.5 pl-5 text-base text-ink">{breakdown.reusableOutline.map((beat,index)=><li key={index}>{beat}</li>)}</ol>
  </Section>

  {breakdown.viewerQuestions.length>0&&<Section title="What viewers asked">
   <ul className="flex flex-col gap-1.5 text-base text-ink">{breakdown.viewerQuestions.map((item,index)=><li key={index} className="flex items-baseline justify-between gap-3"><span>{item.question}</span>{item.likes>0&&<span className="shrink-0 text-sm text-muted tabular-nums">{formatCount(item.likes)} likes</span>}</li>)}</ul>
  </Section>}

  <Section title={`${concepts.length} ${concepts.length===1?'concept':'concepts'} with your twist`}>
   <div className="flex flex-col gap-3">{concepts.map((concept,index)=><ConceptCard key={index} concept={concept} added={added.has(index)} onAdd={()=>onAdd(index)}/>)}</div>
  </Section>
 </div>;
}

/** The server answers 409 when a concept is already on the board. For the screen that is the same as added. */
export const alreadyAdded=(reason:unknown)=>reason instanceof ClubApiError&&reason.status===409;
