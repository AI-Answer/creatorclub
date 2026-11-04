import {mountUI} from './test-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import type {AutomationJob} from '../shared/automation';
const {TranscriptionStatus}=await import('./QuickActions');

const failed={id:'j',kind:'transcription',status:'failed',progress:0,message:'',error:'The whisper model file is missing',projectId:'p',createdAt:'',updatedAt:''} as unknown as AutomationJob;
const props=(captionCount:number)=>({jobs:[failed],enabled:true,onRetry:async()=>{},onCancel:async()=>{},onSetup:()=>{},captionCount});

test('Task 14: "Captions are not set up yet" is hidden when the video already has captions',async()=>{
 const without=await mountUI(createElement(TranscriptionStatus,props(0)));
 try{assert.match(without.container.textContent??'',/Captions are not set up yet/);assert.ok([...without.container.querySelectorAll('button')].some(b=>b.textContent==='Choose a speech engine'),'the Settings button says what it does, not "Set up"');}finally{await without.close();}
 const ui=await mountUI(createElement(TranscriptionStatus,props(42)));
 try{const text=ui.container.textContent??'';assert.doesNotMatch(text,/not set up/);assert.match(text,/42 captions/);}finally{await ui.close();}
});

test('Task 14: the Captions panel button says what it does',async()=>{
 const {readFile}=await import('node:fs/promises'),source=await readFile(new URL('./Inspector.tsx',import.meta.url),'utf8');
 assert.match(source,/Generate captions/);assert.doesNotMatch(source,/>Create transcript</);
});
