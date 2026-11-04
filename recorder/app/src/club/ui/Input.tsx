import type {ComponentProps} from 'react';
import {cn} from './cn';

export function Input({className,type='text',...props}:ComponentProps<'input'>){
 return <input type={type} className={cn('input rounded-[var(--cc-r)] border-[var(--cc-line-strong)] bg-card text-ink placeholder:text-muted focus:border-accent aria-invalid:border-warn',className)} {...props}/>;
}

export function Textarea({className,rows=4,...props}:ComponentProps<'textarea'>){
 return <textarea rows={rows} className={cn('input min-h-24 rounded-[var(--cc-r)] border-[var(--cc-line-strong)] bg-card text-ink placeholder:text-muted focus:border-accent aria-invalid:border-warn',className)} {...props}/>;
}
