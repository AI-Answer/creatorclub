import type {ReactNode} from 'react';
import {Button,Dialog} from './ui';

const frame={viewBox:'0 0 96 64',width:96,height:64,fill:'none',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,className:'stroke-ink'} as const;

/** A pasted link becomes an idea. */
const FindPicture=()=><svg {...frame}>
 <rect x="8" y="14" width="64" height="36" rx="6" className="fill-card stroke-ink"/>
 <path d="M24 26l10 6-10 6z" className="fill-accent-soft stroke-accent"/>
 <path d="M42 28h22M42 36h14" className="stroke-muted"/>
 <path d="M80 8v10M75 13h10" className="stroke-accent"/>
</svg>;

/** A short checklist with the first two done. */
const PlanPicture=()=><svg {...frame}>
 <rect x="14" y="8" width="68" height="48" rx="6" className="fill-card stroke-ink"/>
 <path d="M24 20l3 3 6-6M24 32l3 3 6-6" className="stroke-accent"/>
 <rect x="24" y="43" width="9" height="9" rx="2" className="stroke-muted"/>
 <path d="M42 20h28M42 32h22M42 47h16" className="stroke-muted"/>
</svg>;

/** Record, cut, then send up. */
const MakePicture=()=><svg {...frame}>
 <circle cx="18" cy="32" r="11" className="fill-card stroke-ink"/>
 <circle cx="18" cy="32" r="4" className="fill-accent stroke-accent"/>
 <rect x="36" y="26" width="26" height="12" rx="3" className="fill-card stroke-ink"/>
 <path d="M49 20v24" className="stroke-accent"/>
 <path d="M80 44V20M72 28l8-8 8 8" className="stroke-ink"/>
 <path d="M70 52h20" className="stroke-muted"/>
</svg>;

const steps:{title:string;body:string;picture:ReactNode}[]=[
 {title:'Find the idea',body:'Paste a video you like and pick a concept that fits your channel.',picture:<FindPicture/>},
 {title:'Plan it',body:'Collect research, package the video and write the outline.',picture:<PlanPicture/>},
 {title:'Record, edit, publish',body:'Record each scene, remove the pauses, then export and paste your YouTube link.',picture:<MakePicture/>},
];

/** The first-visit dialog (Eden's pattern): three numbered steps with a small picture each, and one button. It reopens from `?` in the sidebar. */
export function HowItWorksDialog({open,onClose}:{open:boolean;onClose():void}){
 return <Dialog open={open} onClose={onClose} title="How CreatorClub works" footer={<Button variant="primary" onClick={onClose}>Start</Button>}>
  <ol className="flex flex-col gap-3">
   {steps.map((step,index)=><li key={step.title} className="flex items-center gap-4 rounded-lg border border-line p-3">
    <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md bg-subtle">{step.picture}</span>
    <span className="flex min-w-0 flex-col gap-0.5">
     <span className="text-base font-semibold text-ink"><span className="text-muted">{index+1}</span> {step.title}</span>{' '}
     <span className="text-base text-muted">{step.body}</span>
    </span>
   </li>)}
  </ol>
 </Dialog>;
}
