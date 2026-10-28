import type {ComponentProps} from 'react';
import {cn} from './cn';

export type BadgeTone='neutral'|'accent'|'success'|'danger';
const tones:Record<BadgeTone,string>={
 neutral:'bg-subtle text-muted',
 accent:'bg-accent-soft text-accent',
 success:'bg-success-soft text-success',
 danger:'bg-danger-soft text-danger',
};

export function Badge({tone='neutral',className,...props}:ComponentProps<'span'>&{tone?:BadgeTone}){
 return <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-sans text-xs font-medium whitespace-nowrap',tones[tone],className)} {...props}/>;
}
