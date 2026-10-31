/** Small helpers for the Break down screens: the numbers and ages in the stat row, and what counts as a link or a video file. */

const compact=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1});

/** "7.6M", "140K", "950". */
export const formatCount=(value:number)=>compact.format(value);

/** "today", "yesterday", "3 days ago", "2 months ago", "1 year ago". */
export function formatAge(days:number):string{
 if(days<1)return 'today';
 if(days<2)return 'yesterday';
 if(days<30)return `${Math.floor(days)} days ago`;
 if(days<365){const months=Math.floor(days/30);return `${months} ${months===1?'month':'months'} ago`;}
 const years=Math.floor(days/365);
 return `${years} ${years===1?'year':'years'} ago`;
}

export const NOT_A_VIDEO='Paste a YouTube or Instagram link, or drop a video file.';
export const NOT_A_FILE='Drop a video file, like an mp4 or a mov.';

const LINK_HOSTS=new Set(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com','instagram.com','www.instagram.com','m.instagram.com','instagr.am','www.instagr.am']);

/** A quick look before anything starts. The server checks the link properly. */
export function looksLikeVideoLink(input:string):boolean{
 const text=input.trim();
 if(!text||/\s/.test(text))return false;
 try{
  const url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text)?text:`https://${text}`);
  return (url.protocol==='https:'||url.protocol==='http:')&&LINK_HOSTS.has(url.hostname.toLowerCase());
 }catch{return false;}
}

const EXTENSIONS=/\.(mp4|mov|m4v|webm|mkv|avi)$/i;
export const isVideoFile=(file:{name:string})=>EXTENSIONS.test(file.name);

/** What Break down was asked to read. */
export type BreakdownSource={kind:'link';url:string}|{kind:'file';file:File};

export const PLATFORM_LABEL:Record<string,string>={youtube:'YouTube',instagram:'Instagram',file:'Video file'};

/** The four steps shown while a breakdown runs. */
export const BREAKDOWN_STEPS=['Reading the video','Reading the transcript','Reading the comments','Writing concepts'] as const;

/** The step a progress line from the server belongs to, or -1 for lines that do not move the list (tool set-up, "how it did against the channel"). */
export function breakdownStep(line:string):number{
 if(/finding what made/i.test(line))return 3;
 if(/comment/i.test(line))return 2;
 if(/transcript|transcrib|caption/i.test(line))return 1;
 if(/video details/i.test(line))return 0;
 return -1;
}

/** How many comments a progress line says were read ("Reading 40 comments…"). */
export const commentsRead=(line:string)=>{const found=line.match(/Reading (\d+) comments?/i);return found?Number(found[1]):undefined;};
