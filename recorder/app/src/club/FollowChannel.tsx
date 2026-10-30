import {useState} from 'react';
import type {FollowedChannel,TrendingEntry} from '../../shared/club';
import {clubFetch} from './api';
import {followTarget} from './trending-view';

/** Adds a channel to the ones Working now reads, unless it is there already. */
async function follow(target:{name:string;channelId:string}){
 const list=await clubFetch<FollowedChannel[]>('/followed');
 if(!list.some(channel=>channel.channelId===target.channelId))await clubFetch('/followed',{method:'PUT',body:[...list,target]});
}

/**
 * "Follow this channel" under a video from a search. Nothing for a video whose channel is not known; for one from a channel you follow, nothing,
 * or "Following <channel>" with `showFollowing` (Discover, where the row says so). `onFollowed` runs once the channel is saved, so the lists can read again.
 */
export function FollowChannel({item,showFollowing,onFollowed}:{item:Pick<TrendingEntry,'kind'|'channel'|'channelId'>;showFollowing?:boolean;onFollowed?():void}){
 const target=followTarget(item);
 const [state,setState]=useState<'idle'|'busy'|'done'|'failed'>('idle');
 const following=<span className="small muted follow-channel" role="status">Following {item.channel}</span>;
 if(state==='done')return following;
 if(!target)return showFollowing&&item.kind==='followed'?following:null;
 const click=(event:{stopPropagation():void})=>{
  event.stopPropagation();
  setState('busy');
  follow(target).then(()=>{setState('done');onFollowed?.();},()=>setState('failed'));
 };
 return <button type="button" className="linkish small follow-channel" title="Adds this channel to the ones CreatorClub reads for new videos" disabled={state==='busy'} onClick={click}>{state==='failed'?"Couldn't follow. Try again":'Follow this channel'}</button>;
}
