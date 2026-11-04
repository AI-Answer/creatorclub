import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,useCallback,useState} from 'react';
import {createProject} from '../shared/types';
import type {EditorState,EmbeddedRecorder} from './App';
const {default:App}=await import('./App');

test('an embedded editor settles after its workspace receives the edit summary',async()=>{
 const project=createProject('Embedded editor'),originalFetch=globalThis.fetch;
 let reports=0;
 class Source extends EventTarget{close(){}}
 Object.assign(globalThis,{EventSource:Source});
 globalThis.fetch=async input=>{
  const url=String(input);
  if(url==='/api/projects')return Response.json([project]);
  if(url===`/api/projects/${project.id}`)return Response.json(project,{headers:{ETag:'"test"'}});
  if(url==='/api/health')return Response.json({ffmpeg:true,ffprobe:true,transcription:{local:true,providers:[]},mcp:{},version:'test'});
  if(url==='/api/automation/settings')return Response.json({automaticTranscription:false});
  if(url.includes('/automation')||url.endsWith('/agent-chat'))return Response.json({jobs:[]});
  return Response.json([]);
 };
 const back=()=>{};
 function Workspace(){
  const [summary,setSummary]=useState<EditorState|null>(null);
  const receive=useCallback((next:EditorState)=>{
   if(++reports>8)throw Error('Edit summary keeps updating its workspace');
   setSummary(next);
  },[]);
  return createElement('div',null,createElement('output',null,summary?`${summary.selected} selected`:'Loading'),
   createElement<{embedded?:EmbeddedRecorder}>(App,{embedded:{projectId:project.id,mode:'Edit',onBack:back,onEditState:receive}}));
 }
 let ui:Awaited<ReturnType<typeof mountUI>>|undefined;
 try{
  ui=await mountUI(createElement(Workspace));
  assert.equal(ui.container.querySelector('output')?.textContent,'0 selected');
  assert.ok(reports>0&&reports<4,`summary settled after ${reports} reports`);
 }finally{await ui?.close();globalThis.fetch=originalFetch;}
});
