import type {FollowedChannel} from '../../shared/club';

/** What is shown for a followed channel. */
export const followedLabel=(channel:FollowedChannel)=>channel.handle||channel.name;

const HANDLE=/@[\w.-]+/;

/** A followed channel from what was typed: `@name`, or a channel link (the server turns either into the channel page). Null for nothing. */
export function followedFromInput(text:string):FollowedChannel|null{
 const input=text.trim();
 if(!input||/\s/.test(input))return null;
 const handle=input.match(HANDLE)?.[0];
 if(handle&&!input.includes('/'))return {name:handle,handle};
 if(handle)return {name:handle,handle,url:input};
 return {name:input.replace(/^[a-z]+:\/\//i,'').replace(/^www\./i,'').replace(/\/+$/,''),url:input};
}

const keyOf=(channel:FollowedChannel)=>(channel.handle??channel.url??channel.channelId??channel.name).toLowerCase().replace(/^https?:\/\/(www\.)?youtube\.com\//,'').replace(/\/+$/,'');

/** The list with the typed channel added, or as it was when nothing was typed or the channel is already followed. */
export function withFollowed(list:readonly FollowedChannel[],text:string):FollowedChannel[]{
 const added=followedFromInput(text);
 return !added||list.some(channel=>keyOf(channel)===keyOf(added))?[...list]:[...list,added];
}

/** A comma or new-line separated list, trimmed, with empty and repeated entries dropped (ignoring case). */
export function parseList(text:string):string[]{
 const seen=new Set<string>();
 return text.split(/[,\n]/).map(item=>item.trim()).filter(item=>{
  const key=item.toLowerCase();
  if(!item||seen.has(key))return false;
  seen.add(key);return true;
 });
}

/** Adds a typed entry to a list unless it is empty or already there (ignoring case). */
export function withEntry(list:readonly string[],text:string):string[]{
 const entry=text.trim();
 return !entry||list.some(item=>item.toLowerCase()===entry.toLowerCase())?[...list]:[...list,entry];
}
