import {Button,Dialog} from './ui';

const steps=['Find the idea','Plan it','Record, edit, publish'];

/** Eden's first-visit pattern: three numbered steps and one button. Opened from `?` in the sidebar. */
export function HowItWorksDialog({open,onClose}:{open:boolean;onClose():void}){
 return <Dialog open={open} onClose={onClose} title="How CreatorClub works" footer={<Button variant="primary" onClick={onClose}>Start</Button>}>
  <ol className="flex flex-col gap-2">
   {steps.map((step,index)=><li key={step} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
    <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-ink">{index+1}</span>
    <span className="text-base font-medium">{step}</span>
   </li>)}
  </ol>
 </Dialog>;
}
