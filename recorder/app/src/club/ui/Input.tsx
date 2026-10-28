import type {ComponentProps} from 'react';
import {cn} from './cn';

const field='w-full rounded-md border border-line bg-card font-sans text-base text-ink placeholder:text-muted transition-colors focus:outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-soft disabled:opacity-50 aria-invalid:border-danger';

export function Input({className,type='text',...props}:ComponentProps<'input'>){
 return <input type={type} className={cn(field,'h-10 px-3',className)} {...props}/>;
}

export function Textarea({className,rows=4,...props}:ComponentProps<'textarea'>){
 return <textarea rows={rows} className={cn(field,'min-h-24 resize-y px-3 py-2 leading-relaxed',className)} {...props}/>;
}
