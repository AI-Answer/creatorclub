import type {ComponentProps} from 'react';
import {cn} from './cn';

/**
 * `primary`: the one main action of a view (near-black, white in dark). `secondary`: an ordinary action (outlined). `quiet`: a low-key action in a toolbar or a row
 * (no border until hover). `danger`: an action that deletes or discards (red text). `ghost` is the old name of `quiet`.
 */
export type ButtonVariant='primary'|'secondary'|'quiet'|'danger'|'ghost';
export type ButtonSize='sm'|'md';

const quiet='ghost border-transparent bg-transparent text-[var(--cc-text-2)] shadow-none hover:bg-[var(--cc-hover)] hover:text-ink';
const variants:Record<ButtonVariant,string>={
 primary:'primary border-primary bg-primary text-primary-ink hover:bg-[var(--cc-primary-hover)]',
 secondary:'border-[var(--cc-line-strong)] bg-card text-ink hover:bg-[var(--cc-hover)]',
 quiet,ghost:quiet,
 danger:'danger border-[var(--cc-line-strong)] bg-card text-danger hover:bg-danger-soft',
};

/** Verb-first label, 1–3 words. At most one `primary` per view. Styled by the design system's `.btn` classes. */
export function Button({variant='secondary',size='md',type='button',className,...props}:ComponentProps<'button'>&{variant?:ButtonVariant;size?:ButtonSize}){
 return <button type={type} className={cn('btn rounded-[var(--cc-r)] focus-visible:outline-accent',variants[variant],size==='sm'&&'sm','[&_svg]:size-4 [&_svg]:shrink-0',className)} {...props}/>;
}
