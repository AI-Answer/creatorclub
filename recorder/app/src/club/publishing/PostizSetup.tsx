import {useCallback,useEffect,useState,type FormEvent} from 'react';
import type {PostizConnectResult,PublishChannel,PublishingState} from '../../../shared/club';
import {clubFetch,errorMessage} from '../api';
import {Button,Input} from '../ui';

export const PASTE_KEY_FIRST='Paste your key first.';
export const NO_YOUTUBE_CHANNEL='Postiz has no YouTube channel yet, so connect one in Postiz and check again.';

/**
 * Connect Postiz once: paste the API key and pick the YouTube channel. Used in Publish and in Settings.
 * The key goes to the server and is not shown again; the screen only learns that one is saved.
 */
export function PostizSetup({state,onState}:{state:PublishingState;onState(next:PublishingState):void}){
 const {connected,address,channel}=state.postiz;
 const [key,setKey]=useState(''),[server,setServer]=useState(address??''),[ownServer,setOwnServer]=useState(Boolean(address));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [channels,setChannels]=useState<PublishChannel[]|null>(null);

 const loadChannels=useCallback(()=>{
  setError('');
  clubFetch<{channels:PublishChannel[]}>('/publishing/postiz/channels').then(result=>setChannels(result.channels),reason=>setError(errorMessage(reason)));
 },[]);
 useEffect(()=>{if(connected)loadChannels();else setChannels(null);},[connected,loadChannels]);

 const connect=async(event?:FormEvent)=>{
  event?.preventDefault();
  if(busy)return;
  if(!key.trim()){setError(PASTE_KEY_FIRST);return;}
  setBusy(true);setError('');
  try{
   const result=await clubFetch<PostizConnectResult>('/publishing/postiz',{method:'PUT',body:{key:key.trim(),...(ownServer&&server.trim()?{address:server.trim()}:{})}});
   setKey('');setChannels(result.channels);onState(result.state);
  }catch(reason){setError(errorMessage(reason));}
  finally{setBusy(false);}
 };
 const disconnect=async()=>{
  setBusy(true);setError('');
  try{onState(await clubFetch<PublishingState>('/publishing/postiz',{method:'DELETE'}));setChannels(null);}
  catch(reason){setError(errorMessage(reason,"Couldn't disconnect Postiz."));}
  finally{setBusy(false);}
 };
 const choose=async(id:string)=>{
  setBusy(true);setError('');
  try{onState(await clubFetch<PublishingState>('/publishing',{method:'PUT',body:{channelId:id}}));}
  catch(reason){setError(errorMessage(reason));}
  finally{setBusy(false);}
 };

 if(!connected)return <form className="pz" onSubmit={event=>void connect(event)}>
  <label className="field" htmlFor="postiz-key">Postiz key</label>
  <div className="row">
   <Input id="postiz-key" type="password" autoComplete="off" spellCheck={false} placeholder="Paste it once. It stays on this computer." value={key} aria-invalid={error?true:undefined} onChange={event=>{setKey(event.target.value);setError('');}}/>
   <Button type="submit" disabled={busy}>Connect</Button>
  </div>
  {error&&<p role="alert" className="small pz-err">{error}</p>}
  <p className="small muted pz-hint">In Postiz, open Settings, then Public API, and copy the key.</p>
  <details className="postiz-advanced" open={ownServer||undefined}><summary>Advanced</summary>{ownServer?<div style={{marginTop:10}}><label className="field" htmlFor="postiz-address">Your Postiz address</label><Input id="postiz-address" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://postiz.example.com" value={server} onChange={event=>{setServer(event.target.value);setError('');}}/></div>:<button type="button" className="btn sm ghost" onClick={()=>setOwnServer(true)}>Use your own Postiz server</button>}</details>
 </form>;

 const noChannel=channels!==null&&channels.length===0;
 return <div className="pz">
  <div className="row">
   <span className="dotok"/><span className="small"><b>Postiz connected.</b>{channel&&channels?.length===1&&<> Posts to {channel.name} on YouTube.</>}</span>
   {channels&&channels.length>1&&<>
    <label className="sr-only" htmlFor="postiz-channel">YouTube channel</label>
    <select id="postiz-channel" className="select" value={channel?.id??''} disabled={busy} onChange={event=>void choose(event.target.value)}>
     {!channel&&<option value="" disabled>Choose a channel</option>}
     {channels.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select></>}
   <button type="button" className="linkish" style={{marginLeft:'auto'}} disabled={busy} onClick={()=>void disconnect()}>Disconnect</button>
  </div>
  {channels===null&&!error&&<p className="small muted" role="status">Loading your YouTube channels…</p>}
  {noChannel&&<p role="alert" className="small pz-err">{NO_YOUTUBE_CHANNEL} <button type="button" className="linkish" onClick={loadChannels}>Check again</button></p>}
  {!noChannel&&error&&<p role="alert" className="small pz-err">{error} <button type="button" className="linkish" onClick={loadChannels}>Try again</button></p>}
 </div>;
}
