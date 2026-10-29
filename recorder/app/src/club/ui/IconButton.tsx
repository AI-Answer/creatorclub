import {forwardRef,type ComponentProps} from 'react';
import {cn} from './cn';
import {Icon,type IconName} from './icons';
import {Tooltip} from './Tooltip';

type Props=Omit<ComponentProps<'button'>,'children'|'aria-label'|'title'>&{
 icon:IconName;
 /** What the button does, verb first ("Close", "Split at playhead"). Required: it is the accessible name and the tooltip. */
 label:string;
 /** The key that does the same, shown in the tooltip and announced (`aria-keyshortcuts`). */
 shortcut?:string;
 variant?:'quiet'|'secondary';
 size?:'sm'|'md';
 iconSize?:number;
};

/** A button that shows only an icon. The type requires a label: screen readers read it and the tooltip shows it, with the shortcut. */
export const IconButton=forwardRef<HTMLButtonElement,Props>(function IconButton({icon,label,shortcut,variant='quiet',size='sm',iconSize,className,type='button',...props},ref){
 return <Tooltip text={label} shortcut={shortcut}>
  <button ref={ref} type={type} aria-label={label} aria-keyshortcuts={shortcut} className={cn('btn icon-only',variant==='quiet'&&'ghost',size==='sm'&&'sm',className)} {...props}>
   <Icon name={icon} size={iconSize??(size==='sm'?15:16)}/>
  </button>
 </Tooltip>;
});
