import type {ComponentProps} from 'react';
import {cn} from './cn';

export type ButtonVariant='primary'|'secondary'|'ghost';
export type ButtonSize='sm'|'md';

const variants:Record<ButtonVariant,string>={
 primary:'bg-primary text-primary-ink hover:bg-primary/85',
 secondary:'border border-line bg-card text-ink hover:bg-subtle',
 ghost:'bg-transparent text-ink hover:bg-subtle',
};
const sizes:Record<ButtonSize,string>={
 sm:'h-8 gap-1.5 rounded-md px-3 text-sm',
 md:'h-10 gap-2 rounded-md px-4 text-base',
};

/** Verb-first label, 1–3 words. At most one `primary` per screen. */
export function Button({variant='secondary',size='md',type='button',className,...props}:ComponentProps<'button'>&{variant?:ButtonVariant;size?:ButtonSize}){
 return <button type={type} className={cn('inline-flex shrink-0 cursor-pointer items-center justify-center font-sans font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',variants[variant],sizes[size],className)} {...props}/>;
}
