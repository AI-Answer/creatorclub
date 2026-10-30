import type {ComponentProps} from 'react';
import {cn} from './cn';

/**
 * `primary`: the one main action of a view (accent). `secondary`: an ordinary action (outlined). `quiet`: a low-key action in a toolbar or a row
 * (no border until hover). `danger`: an action that deletes or discards (red text). `ghost` is the old name of `quiet`.
 */
export type ButtonVariant='primary'|'secondary'|'quiet'|'danger'|'ghost';
export type ButtonSize='sm'|'md';

const variants:Record<ButtonVariant,string|false>={primary:'primary',secondary:false,quiet:'ghost',ghost:'ghost',danger:'danger'};

/** Verb-first label, 1–3 words. At most one `primary` per view. Styled by the design system's `.btn` classes. */
export function Button({variant='secondary',size='md',type='button',className,...props}:ComponentProps<'button'>&{variant?:ButtonVariant;size?:ButtonSize}){
 return <button type={type} className={cn('btn',variants[variant],size==='sm'&&'sm','[&_svg]:size-4 [&_svg]:shrink-0',className)} {...props}/>;
}
