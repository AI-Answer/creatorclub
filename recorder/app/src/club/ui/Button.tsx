import type {ComponentProps} from 'react';
import {cn} from './cn';

export type ButtonVariant='primary'|'secondary'|'ghost';
export type ButtonSize='sm'|'md';

const variants:Record<ButtonVariant,string|false>={primary:'primary',secondary:false,ghost:'ghost'};

/** Verb-first label, 1–3 words. At most one `primary` per view. Styled by the design system's `.btn` classes. */
export function Button({variant='secondary',size='md',type='button',className,...props}:ComponentProps<'button'>&{variant?:ButtonVariant;size?:ButtonSize}){
 return <button type={type} className={cn('btn',variants[variant],size==='sm'&&'sm','[&_svg]:size-4 [&_svg]:shrink-0',className)} {...props}/>;
}
