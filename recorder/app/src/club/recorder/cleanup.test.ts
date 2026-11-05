import test from 'node:test';
import assert from 'node:assert/strict';
import {act,createElement} from 'react';
import {mountUI,button} from '../../test-dom';
import {deviceLabel} from './device-label';
import {validYouTubeLink} from '../workspace/PublishParts';
const {takeReviewTime}=await import('../../TakeReview');
import {createProject} from '../../../shared/types';
import type {AutomationJob} from '../../../shared/automation';
import {EditAutoSheet} from './EditAutoSheet';

test('device labels never fall back to stream or device IDs',()=>{
 const devices=[{kind:'videoinput' as const,deviceId:'VZr+bWZ123',label:'FaceTime HD Camera (Built-in)'}];
 assert.equal(deviceLabel(devices,'camera','VZr+bWZ123'),'FaceTime HD Camera');
 assert.equal(deviceLabel(devices,'camera','unknown'),'Default camera');
 assert.equal(deviceLabel([{...devices[0],label:devices[0].deviceId}],'camera',devices[0].deviceId),'Default camera');
 assert.equal(deviceLabel([{...devices[0],label:''}],'camera',devices[0].deviceId),'Default camera');
});

test('manual completion accepts video URLs only, including shared and Shorts links',()=>{
 for(const value of ['https://youtu.be/dQw4w9WgXcQ?si=share','youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com/shorts/dQw4w9WgXcQ'])assert.ok(validYouTubeLink(value),value);
 for(const value of ['', 'https://vimeo.com/1','https://youtube.com/@someone','https://youtube.com/watch?v=123','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'])assert.equal(validYouTubeLink(value),false,value);
});

test('take review keeps tenths and rolls minutes over correctly',()=>{
 assert.deepEqual([0,8.4,59.96,68.4].map(takeReviewTime),['0:00.0','0:08.4','1:00.0','1:08.4']);
});

test('pause status distinguishes an unchecked or failed scan from an empty completed scan',async()=>{
 const project=createProject(),props={project,jobs:[] as AutomationJob[],merge(){},async reload(){},async flush(){return project},change(){},async refresh(){},onPreview(){},onClose(){},notify(){},async onMakeCaptions(){}};
 const ui=await mountUI(createElement(EditAutoSheet,props));
 try{
  assert.ok(ui.container.querySelector('[data-option=pauses]')?.textContent?.includes('Not checked yet'));
  const job={id:'scan',projectId:project.id,kind:'auto-cut',status:'failed',createdAt:'',updatedAt:'',progress:1,message:'',automatic:false,applied:false,undone:false} as AutomationJob;
  await ui.render(createElement(EditAutoSheet,{...props,jobs:[job]}));
  assert.ok(ui.container.querySelector('[data-option=pauses]')?.textContent?.includes('Not checked yet'));
  await ui.render(createElement(EditAutoSheet,{...props,jobs:[{...job,status:'complete'}]}));
  assert.ok(ui.container.querySelector('[data-option=pauses]')?.textContent?.includes('No pauses found'));
  await act(async()=>ui.container.querySelector<HTMLButtonElement>('[data-option=pauses] [aria-label="More options"]')!.click());
  assert.ok(button(ui.container,'Find pauses'));
 }finally{await ui.close();}
});
