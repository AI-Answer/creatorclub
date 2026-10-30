import type {TrendingEntry,VoiceAnswers} from '../../shared/club';
import type {AiState} from './ai-status';

/** The four steps of first launch: what each one is called and why it is asked. */
export const WELCOME_STEPS=[
 {title:'Connect your AI',why:'CreatorClub uses your own Claude or ChatGPT account to find ideas and write your talking points. Nothing is billed here.'},
 {title:'Do you have a YouTube channel?',why:'Either is fine. With a channel we learn your topics and how you talk from your videos. Without one, you tell us in a minute.'},
 {title:'How you talk',why:'Talking points get written in your words, so recording feels like you, not like reading.'},
 {title:"Here's what's working in your space",why:"You don't need to know what to make yet. Pick a video that's doing well, see why, and keep the concept you'd make."},
] as const;

/** Rough times, said next to the work they describe. Measured on a first run: the account check takes the AI tools about 15 seconds, the YouTube search about two minutes. */
export const ACCOUNT_CHECK_ESTIMATE='10 to 20 seconds';
export const ADD_CHANNEL_ESTIMATE='1 to 2 minutes';
export const SCAN_ESTIMATE='1 to 2 minutes';

export type WelcomePath='channel'|'fresh';

/** The three optional voice questions. `key` is the voice answer each one fills. */
export const WELCOME_QUESTIONS:readonly {key:keyof VoiceAnswers;q:string;why:string;ph?:string;options?:readonly string[]}[]=[
 {key:'audience',q:'How would you explain what your channel is about to a friend?',ph:"I show people who aren't technical how to get real work done with AI…",why:'This becomes the one line Claude uses to pick ideas for you.'},
 {key:'voice',q:'How do you sound on camera?',options:['Calm and clear, like a teacher','Upbeat and fast','Dry and honest, a bit funny',"I don't know yet"],why:'Talking points get written the way you speak.'},
 {key:'moves',q:'Which creators do you like watching, and why?',ph:'e.g. A creator who builds live, because it feels real…',why:'It tells Claude what kind of delivery you like.'},
];
const NOT_SURE="I don't know yet";

export type VoiceDraft=Partial<Record<keyof VoiceAnswers,string>>;

/** The answers worth sending: filled in, and not "I don't know yet". */
export function voiceFromDraft(draft:VoiceDraft):Partial<VoiceAnswers>{
 const out:Partial<VoiceAnswers>={};
 for(const {key} of WELCOME_QUESTIONS){
  const value=draft[key]?.trim();
  if(value&&value!==NOT_SURE)out[key]=value;
 }
 return out;
}

/** A channel that was added from its link but is short on captions can only write a voice guide from the first two answers. */
export const canWriteVoice=(answers:Partial<VoiceAnswers>)=>Boolean(answers.voice&&answers.audience);

/** The channel the person is setting up: what Add channel or Start fresh produced. */
export interface WelcomeChannel{slug:string;name:string;handle:string;about:string;voice:'built'|'needs-answers'|'none'}

/** Adds or removes a choice, keeping the order they were picked in. */
export const toggle=(list:readonly string[],value:string):string[]=>list.includes(value)?list.filter(item=>item!==value):[...list,value];

/** Adds a typed topic unless it is empty or already there (ignoring case). */
export function addTopic(list:readonly string[],text:string):string[]{
 const topic=text.trim();
 return !topic||list.some(item=>item.toLowerCase()===topic.toLowerCase())?[...list]:[...list,topic];
}

export const freshReady=(name:string,topics:readonly string[],audience:readonly string[])=>Boolean(name.trim()&&topics.length&&audience.length);

/** What Welcome knows when it decides where you can go. */
export interface WelcomeState{ai:AiState;path:WelcomePath|null;channelAdded:boolean;fresh:boolean}

/**
 * Whether Continue works on a step. The last step has none. On step 1 it works unless no AI is signed in: while the accounts are still being checked,
 * or when the check itself failed, you can go on, because nothing on step 2 needs the AI until you add a channel.
 */
export function canContinue(step:number,state:WelcomeState):boolean{
 if(step===0)return state.ai!=='missing';
 if(step===1)return state.path==='channel'?state.channelAdded:state.path==='fresh'?state.fresh:false;
 return step===2;
}

/** Why Add channel waits, or null when it can go: reading a channel writes its voice guide with the AI, so that needs a signed-in account. */
export function addChannelBlock(ai:AiState):'checking'|'missing'|null{return ai==='checking'||ai==='missing'?ai:null;}

/**
 * The furthest step (0-based) the address may open: a step is reachable once what it needs exists. Step 2 needs an AI that is not known to be missing,
 * step 3 a channel or a filled-in fresh start, step 4 a channel. A link to a step beyond that opens the furthest one instead.
 * `passedConnect` is true once step 1 was left on purpose.
 */
export function reachableStep(state:WelcomeState&{channelMade:boolean;passedConnect?:boolean}):number{
 // Once you pressed Continue on step 1 the answer of the check arriving later does not pull you back out of what you are typing: step 2 says what is missing instead.
 if(!state.passedConnect&&!canContinue(0,state))return 0;
 if(!state.channelMade&&!canContinue(1,state))return 1;
 return state.channelMade?3:2;
}

/** The videos to start from: the ones that fit the channel's topics, outliers first. Empty when none fit, so the step says so instead of listing the others. */
export function startingVideos(items:readonly TrendingEntry[],limit=6):TrendingEntry[]{
 return items.filter(item=>item.fit&&(item.mult===null||item.mult>=1)).sort((a,b)=>(b.mult??-1)-(a.mult??-1)||b.vpd-a.vpd).slice(0,limit);
}
