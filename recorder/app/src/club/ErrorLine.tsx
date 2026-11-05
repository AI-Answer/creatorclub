import {GENERIC,isUserMessage} from './api';
import {Button} from './ui';

/** The one way errors look: a single sentence and a `Try again` button. */
export function ErrorLine({message,onRetry,primary=false,fallback=GENERIC}:{message:string;fallback?:string;onRetry():void;primary?:boolean}){
 const copy=message===GENERIC?fallback:isUserMessage(message)?message:fallback;
 return <div role="alert" className="flex flex-wrap items-center gap-3">
  <p className="text-base text-[var(--cc-warn-text)]">{copy}</p>
  <Button size="sm" variant={primary?'primary':'secondary'} onClick={onRetry}>Try again</Button>
 </div>;
}
