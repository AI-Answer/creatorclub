import {Button} from './ui';

/** The one way errors look: a single sentence and a `Try again` button. */
export function ErrorLine({message,onRetry,primary=false}:{message:string;onRetry():void;primary?:boolean}){
 return <div role="alert" className="flex flex-wrap items-center gap-3">
  <p className="text-base text-warn">{message}</p>
  <Button size="sm" variant={primary?'primary':'secondary'} onClick={onRetry}>Try again</Button>
 </div>;
}
