import {useState} from 'react';
import type {FollowedChannel,TrendingEntry} from '../../shared/club';
import {clubFetch} from './api';
import {followTarget} from './trending-view';
import {Icon} from './ui';

/** Adds a channel to the ones Working now reads, unless it is there already. */
async function follow(target:{name:string;channelId:string}){
 const list=await clubFetch<FollowedChannel[]>('/followed');
 if(!list.some(channel=>channel.channelId===target.channelId))await clubFetch('/followed',{method:'PUT',body:[...list,target]});
}

/** "Follow this channel" under a video from a search. Nothing for a video from a channel you follow, or one whose channel is not known. */
export function FollowChannel({item}:{item:Pick<TrendingEntry,'kind'|'channel'|'channelId'>}){
 const target=followTarget(item);
 const [state,setState]=useState<'idle'|'busy'|'done'|'failed'>('idle');
 if(!target)return null;
 if(state==='done')return <span className="small muted follow-channel" role="status"><Icon name="check" size={12}/> Following {item.channel}</span>;
 const click=(event:{stopPropagation():void})=>{
  event.stopPropagation();
  setState('busy');
  follow(target).then(()=>setState('done'),()=>setState('failed'));
 };
 return <button type="button" className="linkish small follow-channel" disabled={state==='busy'} onClick={click}>{state==='failed'?"Couldn't follow. Try again":'Follow this channel'}</button>;
}
