import {BrandLogo} from '../../BrandLogo';
import {Button,EmptyState,Icon} from '../ui';

/** What every screen that needs a channel shows until there is one: what a channel is, and the one way to add it. */
export function NoChannel({onStart}:{onStart():void}){
 return <EmptyState className="flex-1" icon={<BrandLogo brand="youtube" size={22}/>} title="Add your channel or start fresh"
  description="A channel is the YouTube channel you make videos for. Creator Compiler learns its topics and how you talk, then finds ideas that fit it. No channel yet? Start fresh and tell us what you want to make."
  action={<Button variant="primary" onClick={onStart}>Add your channel</Button>}/>;
}
