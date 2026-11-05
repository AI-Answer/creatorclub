import type {OnePager} from '../../../shared/club';

/** Each call gets its own fields so typing into an empty slide never changes a shared template. */
export const emptyOnePager=():OnePager=>({title:'',backupTitle:'',logline:'',thumbnail:{headline:'',visual:'',closer:''},skeleton:['Intro','Where it started','How it works','The twist','Do it yourself','Ending'].map(label=>({label,line:''})),whys:['','','']});
const sentence=(text:string)=>text.replace(/\s+/g,' ').trim();

/** A generator can read the sketch without depending on the slide UI or its Markdown layout. */
export function thumbnailBrief(onepager:OnePager):string{
 const {headline,visual,closer,template}=onepager.thumbnail;
 return [headline.trim()&&`Headline: ${sentence(headline).replace(/[.!?]$/,'')}.`,visual.trim()&&`Visual: ${sentence(visual).replace(/[.!?]$/,'')}.`,closer.trim()&&`Closer: ${sentence(closer).replace(/[.!?]$/,'')}.`,template?.trim()&&`Layout: ${sentence(template).replace(/[.!?]$/,'')}.`].filter(Boolean).join(' ');
}

const md=(text:string)=>sentence(text).replace(/([\\`*_{}\[\]<>#|])/g,'\\$1');
/** The template order, ready to paste into a note: sketch, titles, logline, labeled skeleton, three whys, references and flags. */
export function onepagerMarkdown(value:OnePager):string{
 return [`# One-pager · ${md(value.title)||'Untitled'}`,'','## Thumbnail sketch',`**Headline:** ${md(value.thumbnail.headline)}`,`**Visual:** ${md(value.thumbnail.visual)}`,`**Closer:** ${md(value.thumbnail.closer)}`,'','## Title(s)',md(value.title),`Backup: ${md(value.backupTitle)}`,'','## Logline',md(value.logline),'','## Skeleton',...value.skeleton.map(beat=>`**${md(beat.label)}:** ${md(beat.line)}`),'','## Why?',...value.whys.map((why,index)=>`${index+1}. ${md(why)}`),...(value.thumbnail.template?.trim()?['','## Packaging reference',md(value.thumbnail.template)]:[]),...(value.flags?.some(flag=>flag.trim())?['','## Flags',...value.flags.filter(flag=>flag.trim()).map(flag=>`- ${md(flag)}`)]:[])].join('\n')+'\n';
}
