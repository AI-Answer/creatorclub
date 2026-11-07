import type {Workspace} from '../../shared/club';
import type {FreshDraft} from './welcome/ChannelStep';
import type {VoiceDraft,WelcomeChannel,WelcomePath} from './welcome';
const KEY='cc.welcome.progress';
export type WelcomeProgress={path?:WelcomePath|null;fresh?:FreshDraft;voice?:VoiceDraft;channel?:WelcomeChannel|null;created?:Workspace|null;savedFresh?:FreshDraft|null;savedVoice?:VoiceDraft|null};
export function readWelcomeProgress():WelcomeProgress{try{return JSON.parse(window.sessionStorage.getItem(KEY)??'{}') as WelcomeProgress;}catch{return {};}}
export function saveWelcomeProgress(patch:WelcomeProgress){try{window.sessionStorage.setItem(KEY,JSON.stringify({...readWelcomeProgress(),...patch}));}catch{/* The current flow still retains its channel. */}}
export function clearWelcomeProgress(){try{window.sessionStorage.removeItem(KEY);}catch{/* no stored flow */}}

/** A created channel always resumes until completion clears the journal. */
export function restoreWelcomeProgress(step?:number):WelcomeProgress{const stored=readWelcomeProgress();return stored.created||step!==undefined&&step>1&&step<=4?stored:{};}
