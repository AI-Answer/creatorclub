import {Sparkles} from 'lucide-react';
import {Button,Card,EmptyState} from '../ui';

/** Placeholder for the three first-launch screens. */
export function OnboardingScreen({onBoard}:{onBoard():void}){
 return <div className="club-drag flex flex-1 items-center justify-center p-6">
  <Card className="w-full max-w-lg">
   <EmptyState icon={<Sparkles/>} title="Connect your AI" description="CreatorClub uses your own Claude or ChatGPT account." action={<Button onClick={onBoard}>Open board</Button>}/>
  </Card>
 </div>;
}
