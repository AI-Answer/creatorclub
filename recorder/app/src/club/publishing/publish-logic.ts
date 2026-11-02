import type {PublishProgress,PublishRecord,PublishVisibility} from '../../../shared/club';

/** The words and rules of Publish that need no screen. */

export const VISIBILITY_OPTIONS:readonly {value:PublishVisibility;label:string}[]=[
 {value:'public',label:'Public'},
 {value:'unlisted',label:'Unlisted: only people with the link'},
 {value:'private',label:'Private: only you'},
];
export const visibilityWord=(value:PublishVisibility)=>value==='public'?'Public':value==='unlisted'?'Unlisted':'Private';

/** YouTube allows 500 characters of tags in all. */
export const TAGS_MAX_CHARS=500;
export const TITLE_MAX=100;

/** Adds the tags in `text` (split on commas and new lines) to the list. Repeats are skipped whatever their case, and nothing goes past YouTube's 500 characters. */
export function addTags(list:readonly string[],text:string):string[]{
 const next=[...list];
 let used=next.reduce((sum,tag)=>sum+tag.length+1,0);
 for(const part of text.split(/[,\n]/)){
  const tag=part.trim().replace(/^#/,'').slice(0,60);
  if(!tag||next.some(known=>known.toLowerCase()===tag.toLowerCase())||used+tag.length+1>TAGS_MAX_CHARS)continue;
  next.push(tag);used+=tag.length+1;
 }
 return next;
}

const pad=(n:number)=>String(n).padStart(2,'0');
/** The value of a `datetime-local` input for a date, in the person's own time zone. */
export const localInputValue=(date:Date)=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
/** Tomorrow at 15:00, where Schedule for later starts. */
export function defaultSchedule(now:Date):string{
 const next=new Date(now);next.setDate(next.getDate()+1);next.setHours(15,0,0,0);
 return localInputValue(next);
}

const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** "Fri 31 Oct, 15:00". */
export const whenText=(date:Date)=>`${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const IN_THE_FUTURE='Pick a time in the future.';
/** The ISO time for a `datetime-local` value, or the sentence to show when it is empty or not at least a minute ahead. */
export function scheduleTime(value:string,now:Date):{iso:string;date:Date}|{message:string}{
 const date=new Date(value);
 if(!value||Number.isNaN(date.getTime())||date.getTime()<now.getTime()+60_000)return {message:IN_THE_FUTURE};
 return {iso:date.toISOString(),date};
}

/** What stands between the person and Publish, as one short sentence, or null when nothing does. The first problem wins. */
export function publishProblem(input:{connected:boolean;channel:boolean;exported:boolean;stale?:boolean;kids:'yes'|'no'|null;title:string}):string|null{
 if(!input.connected)return 'Set up publishing first.';
 if(!input.channel)return 'Choose the YouTube channel first.';
 if(!input.exported)return input.stale?'Export the video again first, because it was edited after the last export.':'Export the video first.';
 if(!input.title.trim())return 'Add a title first.';
 if(!input.kids)return "Choose whether it's made for kids, which YouTube requires.";
 return null;
}

/** The warning when some scenes have no kept take, so they are not in the exported video. Null when every scene is recorded. */
export function unrecordedWarning(total:number,recorded:number):string|null{
 const missing=total-recorded;
 if(missing<=0)return null;
 if(missing===total)return total===1?"The scene isn't recorded yet, so the video has nothing in it.":`None of the ${total} scenes is recorded yet, so the video has nothing in it.`;
 return missing===1?`1 of ${total} scenes isn't recorded yet, so it isn't in the video.`:`${missing} of ${total} scenes aren't recorded yet, so they aren't in the video.`;
}

export const progressOf=(data:unknown):PublishProgress|null=>{
 if(typeof data!=='object'||data===null)return null;
 const {step,message,percent}=data as Partial<PublishProgress>;
 if((step!=='check'&&step!=='upload'&&step!=='post'&&step!=='wait')||typeof message!=='string')return null;
 return {step,message,...(typeof percent==='number'?{percent}:{})};
};

export type StepState='done'|'on'|'todo'|'fail';
export interface StepRow{label:string;state:StepState;percent?:number}

/**
 * The rows of the progress card: the export (done before Publish starts), the upload to Postiz, and Postiz putting it on YouTube.
 * `failed` marks the step that was running as stopped.
 */
export function progressRows(progress:PublishProgress|null,failed:boolean,scheduled:boolean):StepRow[]{
 const stage=!progress||progress.step==='check'?0:progress.step==='upload'?1:2;
 const row=(index:number,label:string,percent?:number):StepRow=>({label,percent,state:index<stage?'done':index===stage?(failed?'fail':'on'):'todo'});
 return [
  {label:'Exported the video',state:'done'},
  row(1,stage===1&&progress?.percent!==undefined&&progress.percent<100?`Sending the video to Postiz, ${progress.percent}%`:stage>1?'Sent the video to Postiz':'Sending the video to Postiz',stage===1?progress?.percent:undefined),
  row(2,scheduled?(stage===2?'Scheduling it in Postiz':'Scheduled in Postiz'):(stage===2?'Postiz is putting it on YouTube':'Live on YouTube')),
 ];
}

/** The title and the sentence under it on the result card. */
export type ResultInfo={state:PublishRecord['state'];visibility:PublishVisibility;scheduledFor?:string;url?:string;postizUrl?:string;unconfirmed?:boolean};
export function resultWords(record:ResultInfo):{title:string;line:string;done:boolean}{
 if(record.unconfirmed)return {title:"Postiz didn't confirm it",line:"It may or may not be there, so check again or open Postiz to see.",done:false};
 if(record.state==='published')return {title:"It's on YouTube",line:`It is live as ${visibilityWord(record.visibility).toLowerCase()}. YouTube may take a few minutes to show it in HD.`,done:true};
 if(record.scheduledFor)return {title:"It's scheduled",line:`Postiz will put it on YouTube on ${whenText(new Date(record.scheduledFor))}. Your laptop can be closed.`,done:true};
 return {title:'Postiz has it',line:'Postiz is sending it to YouTube. This can take a few minutes, and your laptop can be closed.',done:false};
}

const REMINDER_KEY='creatorclub.postizCheckReminder';
/** The reminder to check the first Postiz publish on YouTube is shown until it is dismissed or a Postiz publish has gone through. */
export function reminderSeen():boolean{
 try{return localStorage.getItem(REMINDER_KEY)==='seen';}catch{return false;}
}
export function markReminderSeen():void{
 try{localStorage.setItem(REMINDER_KEY,'seen');}catch{/* The reminder shows again next time. */}
}
