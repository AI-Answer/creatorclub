'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');

// The voice follower's helper (speech-follower.swift): one process for the app, started when the island first asks and kept for later takes.
// Its events go to onEvent as they come; a helper that exits is started again by the next request.
const EVENTS=new Set(['status','started','reset','words','stopped','error']);
function createSpeechFollower({helperPath=path.resolve(__dirname,'../server-dist/sceneforge-speech-follower'),spawnProcess=spawn,platform=process.platform,exists=file=>fs.existsSync(file),onEvent=()=>{}}={}){
 let child=null,buffer='';
 const available=()=>platform==='darwin'&&exists(helperPath);
 function clean(message){
  if(!message||typeof message!=='object'||!EVENTS.has(message.type))return null;
  if(message.type==='status')return {type:'status',authorization:['authorized','denied','restricted','notDetermined'].includes(message.authorization)?message.authorization:'notDetermined',available:true};
  if(message.type==='words')return typeof message.text==='string'?{type:'words',text:message.text.slice(0,20000)}:null;
  if(message.type==='started')return {type:'started',locale:typeof message.locale==='string'?message.locale.slice(0,40):''};
  if(message.type==='error')return {type:'error',message:typeof message.message==='string'?message.message.slice(0,500):'Voice follow stopped.'};
  return {type:message.type};
 }
 function ensure(){
  if(child)return child;
  const current=spawnProcess(helperPath,[],{stdio:['pipe','pipe','ignore']});child=current;buffer='';
  current.stdout.on('data',data=>{if(child!==current)return;buffer+=data.toString();if(buffer.length>1000000)buffer='';let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);let message=null;try{message=clean(JSON.parse(line));}catch{/* not a follower event */}if(message)onEvent(message);}});
  current.stdin.on('error',()=>{});
  current.on('error',()=>{if(child===current){child=null;onEvent({type:'error',message:'Voice follow could not start.'});}});
  // A helper that dies (macOS ends it when the app lacks a usage description, for one) says so, rather than leaving the island waiting.
  current.once('close',(code,signal)=>{if(child===current){child=null;onEvent(code===0?{type:'stopped'}:{type:'error',message:signal==='SIGABRT'?'Voice follow could not ask for Speech Recognition permission in this build of the app.':'Voice follow stopped unexpectedly.'});}});
  return current;
 }
 function send(command){if(!available())return false;ensure().stdin.write(JSON.stringify(command)+'\n');return true;}
 return {
  available,
  status:()=>available()?send({command:'status'}):(onEvent({type:'status',authorization:'notDetermined',available:false}),false),
  authorize:()=>send({command:'authorize'}),
  start:({microphone='',text=''}={})=>send({command:'start',microphone:String(microphone).slice(0,240),text:String(text).slice(0,100000)}),
  stop:()=>{if(child)child.stdin.write(JSON.stringify({command:'stop'})+'\n');},
  dispose(){const current=child;child=null;if(current){try{current.stdin.end();}catch{}const timer=setTimeout(()=>{try{current.kill('SIGKILL');}catch{}},1500);timer.unref?.();}}
 };
}
module.exports={createSpeechFollower};
