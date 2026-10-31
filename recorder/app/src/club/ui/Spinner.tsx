import {cn} from './cn';
import {Icon} from './icons';

/** Indeterminate progress. `label` is read by screen readers. */
export function Spinner({size=16,label='Loading',className}:{size?:number;label?:string;className?:string}){
 return <span role="status" aria-label={label} className={cn('inline-flex text-muted',className)}><Icon name="loading" size={size} stroke={2} spin/></span>;
}
