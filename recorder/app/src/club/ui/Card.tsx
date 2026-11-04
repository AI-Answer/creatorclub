import type {ComponentProps} from 'react';
import {cn} from './cn';

/** Shared theme surface, a hairline border, and token elevation. Cards have an 8px radius. Callers add padding. */
export function Card({className,...props}:ComponentProps<'div'>){
 return <div className={cn('card rounded-[var(--cc-r-lg)] border-line bg-card text-ink shadow-[var(--cc-shadow-1)]',className)} {...props}/>;
}
