import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceName} from './device-label';

test('device names drop the system prefix, USB ids and "Built-in", as Borumi shows them',()=>{
 assert.equal(deviceName('Default - MacBook Air Microphone (Built-in)'),'MacBook Air Microphone');
 assert.equal(deviceName('MacBook Air Camera (0000:0001)'),'MacBook Air Camera');
 assert.equal(deviceName('Studio Display Camera (05ac:1112)'),'Studio Display Camera');
 assert.equal(deviceName('Shure MV7'),'Shure MV7');
});
