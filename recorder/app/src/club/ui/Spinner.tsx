import {LoaderCircle} from 'lucide-react';
import {cn} from './cn';

/** Indeterminate progress. `label` is read by screen readers. */
export function Spinner({size=16,label='Loading',className}:{size?:number;label?:string;className?:string}){
 return <span role="status" aria-label={label} className={cn('inline-flex text-muted',className)}><LoaderCircle aria-hidden size={size} className="animate-spin"/></span>;
}
