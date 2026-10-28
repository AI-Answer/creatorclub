import {videoSteps,type VideoStep} from './routes';

/** Labels for a video's bottom bar, copied from PLAN.md ("‹ Back to plan", "Continue to editing ›"). */
export const videoStepLabels:Record<VideoStep,string>={plan:'Plan',record:'Record',edit:'Edit',publish:'Publish'};
const backLabels:Record<VideoStep,string>={plan:'Back to board',record:'Back to plan',edit:'Back to recording',publish:'Back to editing'};
const continueLabels:Partial<Record<VideoStep,string>>={plan:'Continue to recording',record:'Continue to editing',edit:'Continue to publishing'};

export const videoStepList=videoSteps.map(id=>({id,label:videoStepLabels[id]}));

/** The previous step, or `'board'` from the first one. */
export function previousStep(step:VideoStep):VideoStep|'board'{const i=videoSteps.indexOf(step);return i>0?videoSteps[i-1]:'board';}
/** The next step, or nothing after Publish. */
export function nextStep(step:VideoStep):VideoStep|undefined{return videoSteps[videoSteps.indexOf(step)+1];}
export function backLabel(step:VideoStep){return backLabels[step];}
export function continueLabel(step:VideoStep){return continueLabels[step];}
