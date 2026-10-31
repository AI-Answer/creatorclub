import type {ComponentProps} from 'react';
import {cn} from './cn';

/** Shared white surface, a hairline border, and subtle elevation. Callers add padding. */
export function Card({className,...props}:ComponentProps<'div'>){
 return <div className={cn('card',className)} {...props}/>;
}
