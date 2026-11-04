import type {ComponentProps} from 'react';
import {cn} from './cn';
import {KIND_COLOR,type Kind} from './kinds';

/**
 * A small label. `neutral` for facts, `accent` for what is selected, `ok` for done, `warn` for a problem, `rec` only while recording.
 * With `kind`, the chip takes that kind's fixed colour as a dot (screen, camera, audio…), the same as on the timeline.
 */
export type ChipTone='neutral'|'accent'|'ok'|'warn'|'rec';
const tones:Record<ChipTone,string>={neutral:'bg-subtle text-[var(--cc-text-2)]',accent:'b-blue bg-accent-soft text-[var(--cc-accent-text)]',ok:'b-green bg-ok-soft text-ok',warn:'c-warn bg-warn-soft text-warn',rec:'c-rec bg-[var(--cc-rec-soft)] text-[var(--cc-rec)]'};

export function Chip({tone='neutral',kind,outline,className,children,...props}:ComponentProps<'span'>&{tone?:ChipTone;kind?:Kind;outline?:boolean}){
 return <span className={cn('chip rounded-[var(--cc-r-sm)]',tones[tone],outline&&'outline border-line bg-card',className)} {...props}>
  {kind&&<span aria-hidden className="chip-kind" style={{borderRadius:'50%',background:KIND_COLOR[kind].color}}/>}{children}
 </span>;
}
