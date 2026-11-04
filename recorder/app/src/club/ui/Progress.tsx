import {cn} from './cn';

/** Indeterminate progress bar for work with no known length (installs, reading a channel). `label` is read by screen readers. */
export function Progress({label,className}:{label:string;className?:string}){
 return <div role="progressbar" aria-label={label} className={cn('club-progress h-1.5 w-full overflow-hidden rounded-[var(--cc-r-pill)] bg-subtle',className)}/>;
}
