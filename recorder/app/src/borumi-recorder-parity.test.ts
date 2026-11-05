import test from 'node:test';
import assert from 'node:assert/strict';
import {peakLevel} from './recording-meter';
import {takeEffects} from '../shared/types';
import {defaultRecordingSettings,settingsFrom} from './recording-presets';

test('the island level is Borumi\'s: the peak in dBFS from -50 to 0, straight',()=>{
 assert.equal(peakLevel(new Float32Array([0,0])),0);
 assert.equal(peakLevel(new Float32Array([1,-.2])),1);
 assert.ok(Math.abs(peakLevel(new Float32Array([0,-Math.pow(10,-25/20)]))-.5)<1e-9,'-25 dB is half');
 assert.equal(peakLevel(new Float32Array([Math.pow(10,-60/20)])),0,'below -50 dB is empty');
});

test('Mirror camera is on by default and mirrors the camera clip a take makes, as Borumi\'s mirror_camera_recording',()=>{
 assert.equal(defaultRecordingSettings().mirror,true);
 const take={tracks:['camera','screen','audio'] as const,mirrored:true};
 assert.equal(takeEffects({...take,tracks:[...take.tracks]},0).flipX,true);assert.equal(takeEffects({...take,tracks:[...take.tracks]},1).flipX,false,'only the camera');
 assert.equal(takeEffects({tracks:['camera']},0).flipX,false,'a take recorded without it is not mirrored');
});

test('a save from before Mirror camera starts with it on; a save since keeps the choice',()=>{
 assert.equal(settingsFrom({mirror:false}).mirror,true,'"Mirror preview only" off was never a choice about the camera');
 assert.equal(settingsFrom({mirror:false,mirrorCamera:true}).mirror,false);
});
