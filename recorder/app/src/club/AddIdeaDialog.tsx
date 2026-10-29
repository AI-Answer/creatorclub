import {useState} from 'react';
import type {Video} from '../../shared/club';
import {clubFetch,errorMessage} from './api';
import {Button,Dialog,useToast} from './ui';

/** Add an idea by its working title. It lands on Ideas, highlighted. */
export function AddIdeaDialog({onClose,onAdded}:{onClose():void;onAdded(videoId:string):void}){
 const [title,setTitle]=useState(''),[busy,setBusy]=useState(false);
 const toast=useToast();
 const add=async()=>{
  const text=title.trim();
  if(!text||busy)return;
  setBusy(true);
  try{
   const video=await clubFetch<Video>('/videos',{body:{title:text}});
   onClose();onAdded(video.id);
  }catch(reason){toast(errorMessage(reason,"Couldn't add that idea."));}
  finally{setBusy(false);}
 };
 return <Dialog title="Add idea" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!title.trim()||busy} onClick={()=>void add()}>Add idea</Button></>}>
  <label className="field" htmlFor="idea-title">What's the video?</label>
  <input id="idea-title" className="input" autoFocus value={title} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void add();}} placeholder="e.g. Claude does my receipts automatically"/>
  <div className="small muted" style={{marginTop:8}}>A working title is enough. You'll package it properly in Plan.</div>
 </Dialog>;
}
