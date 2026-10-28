import type {ComponentProps} from 'react';
import {cn} from './cn';

/** White surface, 12px radius, 1px hairline border. Callers add padding. */
export function Card({className,...props}:ComponentProps<'div'>){
 return <div className={cn('rounded-lg border border-line bg-card text-ink',className)} {...props}/>;
}
