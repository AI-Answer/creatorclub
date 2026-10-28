import type {ReactNode} from 'react';
import {cn} from './cn';

/** Centred title, one help line and at most one action. */
export function EmptyState({icon,title,description,action,className}:{icon?:ReactNode;title:string;description?:string;action?:ReactNode;className?:string}){
 return <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',className)}>
  {icon&&<div className="mb-1 flex size-12 items-center justify-center rounded-full bg-subtle text-muted [&_svg]:size-5">{icon}</div>}
  <h2 className="text-lg font-semibold text-ink">{title}</h2>
  {description&&<p className="max-w-md text-base text-muted">{description}</p>}
  {action&&<div className="mt-2">{action}</div>}
 </div>;
}
