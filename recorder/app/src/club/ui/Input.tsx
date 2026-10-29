import type {ComponentProps} from 'react';
import {cn} from './cn';

export function Input({className,type='text',...props}:ComponentProps<'input'>){
 return <input type={type} className={cn('input','aria-invalid:border-danger',className)} {...props}/>;
}

export function Textarea({className,rows=4,...props}:ComponentProps<'textarea'>){
 return <textarea rows={rows} className={cn('input','min-h-24 aria-invalid:border-danger',className)} {...props}/>;
}
