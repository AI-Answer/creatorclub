import {type Video} from '../../shared/club';
import {STAGE_LABEL} from './board';
import {defaultTab,type Route} from './routes';
import {FIND_IDEA,GLOSSARY,SHORTCUTS,VIDEO_STEPS} from './steps';
import type {IconName} from './ui';

/** What ⌘K can do with a result: open a place, start New video, or open Help at a topic. */
export type SearchTarget=
 |{route:Route}
 |{action:'new-video'}
 |{action:'help';topic?:string};

/** One result. `words` are extra words that find it without being shown; `hint` is the faint line after the label. */
export interface SearchOption{id:string;label:string;kind:string;icon:IconName;hint?:string;words?:string;target:SearchTarget}

/** The videos a step result opens: the one that is open, else the one worked on last. None when nothing is in production. */
export function workingVideo(videos:readonly Video[],openId?:string|null):Video|undefined{
 const open=openId?videos.find(video=>video.id===openId):undefined;
 if(open)return open;
 return videos.filter(video=>video.stage!=='ideas'&&video.stage!=='published').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
}

const SETTINGS:ReadonlyArray<{label:string;section:'ai'|'channel'|'followed'|'sources'|'publishing';words:string}>=[
 {label:'Connected AI',section:'ai',words:'claude chatgpt codex account sign in connect gemini key login'},
 {label:'Channel',section:'channel',words:'your channel name topics audience voice guide how you talk rebuild'},
 {label:'Followed channels',section:'followed',words:'follow channels youtube watch creators'},
 {label:'Signal sources',section:'sources',words:'x reddit subreddits posts sources signals'},
 {label:'Publishing and look',section:'publishing',words:'postiz publish youtube visibility theme dark light appearance look'},
];

/** Every result that is not a video: actions, the five steps, places, settings groups and help topics. */
export function fixedOptions(videos:readonly Video[],openId?:string|null):SearchOption[]{
 const target=workingVideo(videos,openId);
 const steps=VIDEO_STEPS.map<SearchOption>(step=>({
  id:`step:${step.tab}`,label:step.name,kind:'Step',icon:step.icon,
  hint:target?`Open it on "${target.title}"`:step.does,
  words:`${step.does} step`,
  target:target?{route:{name:'video',id:target.id,tab:step.tab}}:{action:'help',topic:`step:${step.tab}`},
 }));
 return [
  {id:'action:new-video',label:'New video',kind:'Action',icon:'add',hint:'Start from a title or break down a link',words:'create idea start make',target:{action:'new-video'}},
  {id:'action:add-channel',label:'Add a channel',kind:'Action',icon:'youtube',hint:'Add your YouTube channel or start fresh',words:'setup welcome first launch connect new',target:{route:{name:'welcome'}}},
  {id:'action:help',label:'Help',kind:'Action',icon:'help',hint:'How Creator Compiler works',words:'how guide steps glossary shortcuts where things live learn',target:{action:'help'}},
  {id:'action:shortcuts',label:'Keyboard shortcuts',kind:'Action',icon:'keyboard',hint:SHORTCUTS[0].keys+' and more',words:'help keys hotkeys keyboard',target:{action:'help',topic:'shortcuts'}},
  ...steps,
  {id:'page:home',label:'Home',kind:'Page',icon:'home',hint:'What to do next',words:'overview next',target:{route:{name:'home'}}},
  {id:'page:discover',label:FIND_IDEA.name,kind:'Page',icon:'trending',hint:'What works outside your channel',words:'discover trending signals outliers youtube x reddit find idea',target:{route:{name:'discover'}}},
  {id:'page:videos',label:'Videos',kind:'Page',icon:'video',hint:'Every video from idea to published',words:'board pipeline ideas production',target:{route:{name:'videos',view:'board'}}},
  {id:'page:table',label:'Videos table',kind:'Page',icon:'table',words:'list',target:{route:{name:'videos',view:'table'}}},
  {id:'page:calendar',label:'Videos calendar',kind:'Page',icon:'calendar',words:'schedule publish date',target:{route:{name:'videos',view:'calendar'}}},
  {id:'page:research',label:'Research',kind:'Page',icon:'research',hint:'Your channel\'s own board',words:'canvas board heptabase connect frame notes start video',target:{route:{name:'research'}}},
  {id:'page:settings',label:'Settings',kind:'Page',icon:'settings',hint:'Your AI, channel and publishing',words:'preferences',target:{route:{name:'settings'}}},
  ...SETTINGS.map<SearchOption>(item=>({id:`settings:${item.section}`,label:item.label,kind:'Settings',icon:'settings',words:`settings ${item.words}`,target:{route:{name:'settings',section:item.section}}})),
  ...GLOSSARY.map<SearchOption>(item=>({id:`help:${item.term}`,label:item.term,kind:'Help',icon:'help',hint:item.means,words:'meaning glossary what is',target:{action:'help',topic:`term:${item.term}`}})),
 ];
}

/** An idea opens in its drawer on Videos, any other video on the tab for its stage. */
export const videoOption=(video:Video):SearchOption=>({
 id:`video:${video.id}`,label:video.title,words:video.number?String(video.number):undefined,kind:STAGE_LABEL[video.stage],icon:video.stage==='ideas'?'idea':'film',
 target:{route:video.stage==='ideas'?{name:'videos',view:'board',open:video.id}:{name:'video',id:video.id,tab:defaultTab(video.stage)}},
});

const LIMIT=40;
const norm=(text:string)=>text.toLowerCase();

/**
 * How well an option answers the words typed, or null when it does not. Every word has to appear somewhere (label, hint or extra words);
 * a label that starts with the first word beats one that contains it, which beats a word found only in the hint or extra words.
 */
export function scoreOption(option:SearchOption,query:string):number|null{
 const words=norm(query).split(/\s+/).filter(Boolean);
 if(!words.length)return 0;
 const label=norm(option.label),rest=norm(`${option.hint??''} ${option.words??''}`);
 let score=0;
 for(const [index,word] of words.entries()){
  if(label.startsWith(word)||label.split(/\s+/).some(part=>part.startsWith(word)))score+=index===0&&label.startsWith(word)?30:20;
  else if(label.includes(word))score+=12;
  else if(rest.includes(word))score+=4;
  else return null;
 }
 return score;
}

/**
 * What ⌘K lists. With nothing typed: actions, the steps, places, settings and then videos. With words: everything that answers all of them, best first
 * (ties keep the order above, so "record" finds the Record step before a video that has it in its title), at most forty.
 */
export function searchOptions(videos:readonly Video[],query:string,openId?:string|null):SearchOption[]{
 const all=[...fixedOptions(videos,openId),...videos.map(videoOption)];
 if(!query.trim())return all.filter(option=>!option.id.startsWith('help:')).slice(0,LIMIT);
 return all.flatMap((option,order)=>{const score=scoreOption(option,query);return score===null?[]:[{option,score,order}];})
  .sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,LIMIT).map(item=>item.option);
}
