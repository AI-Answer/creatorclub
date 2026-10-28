import {Fragment} from 'react';
import {Check,ChevronLeft,ChevronRight} from 'lucide-react';
import {Button,cn} from './ui';

export type BottomBarStep<T extends string=string>={id:T;label:string};

/**
 * The bar at the bottom of every video page (Borumi's layout).
 * - `steps`: shown in the centre, in order, separated by `›`. Every step can be clicked (`onStep(id)`).
 * - `current`: the highlighted step. `done`: steps shown with a tick.
 * - `backLabel` + `onBack`: the quiet `‹ Back to …` link on the left. Left empty when either is missing.
 * - `continueLabel` + `onContinue`: the `Continue to … ›` button on the right. Left empty when either is missing.
 *   It is the screen's one primary button, unless `continuePrimary` is false because the screen has its own primary (Record, before the last scene).
 */
export type VideoBottomBarProps<T extends string=string>={
 steps:readonly BottomBarStep<T>[];
 current:T;
 done?:readonly T[];
 onStep(id:T):void;
 backLabel?:string;
 onBack?():void;
 continueLabel?:string;
 onContinue?():void;
 continueDisabled?:boolean;
 continuePrimary?:boolean;
};

export function VideoBottomBar<T extends string>({steps,current,done=[],onStep,backLabel,onBack,continueLabel,onContinue,continueDisabled,continuePrimary=true}:VideoBottomBarProps<T>){
 return <footer className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-line bg-card px-4">
  <div className="flex min-w-0 justify-start">
   {backLabel&&onBack&&<Button variant="ghost" size="md" className="px-2 text-muted hover:text-ink" onClick={onBack}><ChevronLeft aria-hidden/>{backLabel}</Button>}
  </div>
  <nav aria-label="Video steps" className="flex items-center gap-1">
   {steps.map((step,index)=>{const isCurrent=step.id===current,isDone=done.includes(step.id);return <Fragment key={step.id}>
    {index>0&&<ChevronRight aria-hidden size={14} className="text-muted"/>}
    <button type="button" aria-current={isCurrent?'step':undefined} onClick={()=>onStep(step.id)}
     className={cn('flex h-9 items-center gap-2 rounded-md px-2.5 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent',isCurrent?'text-ink':'text-muted hover:bg-subtle hover:text-ink')}>
     <span aria-hidden className={cn('flex size-6 items-center justify-center rounded-full text-xs font-semibold',isCurrent?'bg-accent text-accent-ink':isDone?'bg-success-soft text-success':'bg-subtle text-muted')}>{isDone&&!isCurrent?<Check size={14} strokeWidth={2.5}/>:index+1}</span>
     {step.label}{isDone&&<span className="sr-only"> (done)</span>}
    </button>
   </Fragment>;})}
  </nav>
  <div className="flex min-w-0 justify-end">
   {continueLabel&&onContinue&&<Button variant={continuePrimary?'primary':'secondary'} size="md" disabled={continueDisabled} onClick={onContinue}>{continueLabel}<ChevronRight aria-hidden/></Button>}
  </div>
 </footer>;
}
