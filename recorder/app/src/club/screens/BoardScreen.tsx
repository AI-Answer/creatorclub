import {LayoutGrid} from 'lucide-react';
import {Button,EmptyState} from '../ui';
import {ScreenHeader} from './ScreenHeader';

/** Placeholder until the board task: one way into the example video. */
export function BoardScreen({onOpenExample}:{onOpenExample():void}){
 return <>
  <ScreenHeader title="Board"/>
  <EmptyState icon={<LayoutGrid/>} title="Your board" description="Videos you add show up here, from idea to published." action={<Button onClick={onOpenExample}>Open example</Button>}/>
 </>;
}
