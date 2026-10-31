import type {ComponentProps} from 'react';
import {cn} from './cn';
import {KIND_COLOR,type Kind} from './kinds';

/**
 * A small label. `neutral` for facts, `accent` for what is selected, `ok` for done, `warn` for a problem, `rec` only while recording.
 * With `kind`, the chip takes that kind's fixed colour as a dot (screen, camera, audio…), the same as on the timeline.
 */
export type ChipTone='neutral'|'accent'|'ok'|'warn'|'rec';
const tones:Record<ChipTone,string>={neutral:'',accent:'b-blue',ok:'b-green',warn:'c-warn',rec:'c-rec'};

export function Chip({tone='neutral',kind,outline,className,children,...props}:ComponentProps<'span'>&{tone?:ChipTone;kind?:Kind;outline?:boolean}){
 return <span className={cn('chip',tones[tone],outline&&'outline',className)} {...props}>
  {kind&&<span aria-hidden className="chip-kind" style={{background:KIND_COLOR[kind].color}}/>}{children}
 </span>;
}
