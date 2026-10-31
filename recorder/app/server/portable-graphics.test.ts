import test from 'node:test';
import assert from 'node:assert/strict';
import {portableGraphics} from './portable-graphics.js';
import {createHash} from 'node:crypto';
test('portable native renderer draws deterministic text and shapes without Swift',()=>{
 const base={width:640,height:360,type:'text',text:'A <clear> & useful title',x:.1,y:.2,boxWidth:.8,boxHeight:.5,color:'#fff9ee',background:'#de5738',fontSize:32,opacity:1};
 const png=portableGraphics(base);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),640);assert.equal(png.readUInt32BE(20),360);
 assert.deepEqual(png,portableGraphics(base));
 const hashes=new Set(['text','ellipse','arrow','highlight','mask','cursor'].map(type=>createHash('sha256').update(portableGraphics({...base,type})).digest('hex')));assert.equal(hashes.size,6);
});
