import test from 'node:test';
import assert from 'node:assert/strict';
import {accumulatePeaks,frameActivity,sliceProject,type ActivityState,type PeakState} from './media.ts';
import {project} from '../scripts/hot-paths-bench.ts';

test('a render window keeps only its own timed items, rebased, and the rest of the project as an independent copy',()=>{
 const p=project();p.motion=[{id:'m1',template:'title-card',style:'clean',start:100,duration:4,props:{title:'Hi'}}];
 const q=sliceProject(p,100,110);
 assert.deepEqual(Object.keys(q),Object.keys(p),'same fields in the same order');
 assert.deepEqual(q.scenes.map(s=>[s.id,s.duration]),[['render-window',10]]);
 assert.ok(q.captions.length>0&&q.captions.every(c=>c.start>=0&&c.end<=10));
 assert.equal(q.captions.length,p.captions.filter(c=>Math.min(c.end,110)-Math.max(c.start,100)>1e-6).length);
 assert.ok(q.clips.length>0&&q.clips.every(c=>c.start>=0&&c.start<10));
 assert.deepEqual(q.motion!.map(m=>[m.id,m.start]),[['m1',0]]);
 assert.equal(q.zooms.length,p.zooms.filter(z=>Math.min(110,z.start+z.duration)-Math.max(100,z.start)>1e-6).length);
 // About ten cursor points a second inside the window, plus the interpolated points at its edges.
 assert.equal(q.cursor.points.length,p.cursor.points.filter(c=>c.time>100&&c.time<110).length+2);
 assert.deepEqual([q.cursor.points[0].time,q.cursor.points.at(-1)!.time],[0,10]);
 assert.deepEqual({...q.cursor,points:[]},{...p.cursor,points:[]});
 assert.deepEqual(q.media,p.media);assert.notEqual(q.media,p.media);assert.notEqual(q.media[0],p.media[0]);assert.notEqual(q.canvas,p.canvas);
 q.media[0].name='changed';q.canvas.width=1;q.captionStyle.maxWords=1;
 assert.notEqual(p.media[0].name,'changed');assert.notEqual(p.canvas.width,1);assert.notEqual(p.captionStyle.maxWords,1);
 assert.equal(p.scenes.length,14,'the source project is not changed');
 const plain=structuredClone(p);delete plain.motion;
 assert.equal('motion' in sliceProject(plain,0,10),false,'a project without motion blocks gets none');
});

test('waveform peaks are the same however the decoder splits its output',()=>{
 const channels=2,duration=3,frames=duration*8000,pcm=Buffer.alloc(frames*channels*4);
 for(let i=0;i<frames*channels;i++)pcm.writeFloatLE(Math.sin(i*.37)*(i%5000)/5000*1.2,i*4);
 pcm.writeFloatLE(Number.NaN,40);pcm.writeFloatLE(-Infinity,80);
 const run=(piece:number)=>{const bins=new Array<number>(duration*50).fill(0),state:PeakState={sample:0,pending:Buffer.alloc(0)};for(let i=0;i<pcm.length;i+=piece)accumulatePeaks(bins,state,pcm.subarray(i,i+piece),channels,duration);return {bins,state};};
 const whole=run(pcm.length);
 assert.equal(whole.state.sample,frames);assert.equal(whole.state.pending.length,0);
 assert.ok(whole.bins.every(n=>n>=0&&n<=1));assert.equal(Math.max(...whole.bins),1,'clipped to 1');
 for(const piece of [3,7,64,65536]){const split=run(piece);assert.deepEqual(split.bins,whole.bins);assert.equal(split.state.sample,frames);}
});

test('screen activity is the same however the decoder splits its output',()=>{
 const size=64*36,count=20,frames=Buffer.alloc(size*count);
 for(let f=0;f<count;f++)for(let i=0;i<size;i++)frames[f*size+i]=(i<f*100?200:10)+(f%2);
 const run=(piece:number)=>{const values:number[]=[],state:ActivityState={pending:Buffer.alloc(0)};for(let i=0;i<frames.length;i+=piece)frameActivity(values,state,frames.subarray(i,i+piece),size,12);return values;};
 const whole=run(frames.length);
 assert.equal(whole.length,count);assert.equal(whole[0],0);assert.equal(whole[1],Math.round(100/size*10000)/10000);
 for(const piece of [1,1000,size+1])assert.deepEqual(run(piece),whole);
});
