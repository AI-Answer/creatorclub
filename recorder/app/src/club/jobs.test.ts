import test from 'node:test';
import assert from 'node:assert/strict';
import {failureMessage,isStartedJob,LOST_JOB,progressLine,watchJob,type JobMessage} from './jobs';
import {FakeEventSource} from './test-fakes';

test('watchJob follows progress, then closes the connection on every terminal event',()=>{
 for(const type of ['done','failed','cancelled']){
  FakeEventSource.install();
  const seen:JobMessage[]=[];
  watchJob('j_1',event=>seen.push(event));
  const source=FakeEventSource.last();
  assert.equal(source.url,'/api/club/jobs/j_1/events');
  source.emit('progress',{line:'one'});
  assert.equal(source.closed,false,'progress keeps it open');
  source.emit(type,{message:'end'});
  assert.equal(source.closed,true,`${type} closes it, so the browser never reconnects to a finished stream`);
  source.emit('progress',{line:'late'});
  assert.deepEqual(seen,[{type:'progress',data:{line:'one'}},{type,data:{message:'end'}}]);
 }
});

test('the returned function stops following',()=>{
 FakeEventSource.install();
 const seen:JobMessage[]=[];
 const stop=watchJob('j_1',event=>seen.push(event));
 stop();
 FakeEventSource.last().emit('progress',{line:'x'});
 assert.equal(FakeEventSource.last().closed,true);
 assert.deepEqual(seen,[]);
});

test('a job that cannot be reached fails once; a dropped connection that is retrying does not',()=>{
 FakeEventSource.install();
 const seen:JobMessage[]=[];
 watchJob('j_1',event=>seen.push(event));
 const source=FakeEventSource.last();
 source.readyState=0;source.emit('error');
 assert.deepEqual(seen,[],'the browser is reconnecting');
 source.readyState=2;source.emit('error');source.emit('error');
 assert.deepEqual(seen,[{type:'failed',data:{message:LOST_JOB}}]);
 assert.equal(source.closed,true);
});

test('helpers read the shapes jobs send',()=>{
 assert.equal(failureMessage({message:'No.'}),'No.');
 assert.equal(failureMessage(null),'That did not work.');
 assert.equal(progressLine('Reading your last 10 videos…'),'Reading your last 10 videos…');
 assert.equal(progressLine({message:'a'}),'a');
 assert.equal(progressLine({line:'b'}),'b');
 assert.equal(progressLine({percent:5}),undefined);
 assert.equal(isStartedJob({id:'j_1',status:'running'}),true);
 assert.equal(isStartedJob({slug:'samin'}),false);
 assert.equal(isStartedJob(null),false);
});
