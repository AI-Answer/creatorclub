import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSceneToRecord, preflightLine, recorderProblems, takeThumbnailLabel, type SourceCheck} from './recorder-checks';

const GB = 1024 ** 3;
const ready: SourceCheck[] = [{ kind: 'camera', state: 'ready' }, { kind: 'microphone', state: 'ready' }];

test('no problems when every source is ready and the disk has room', () => {
  assert.equal(recorderProblems(ready, { freeBytes: 200 * GB, low: false }), null);
});

test('low disk alone makes an amber card that says how much to free', () => {
  const problems = recorderProblems(ready, { freeBytes: 2 * GB, low: true });
  assert.equal(problems?.tone, 'warning');
  assert.deepEqual(problems?.lines, ['Your disk is almost full: free up at least 8 GB before recording.']);
});

test('a failed source makes a red card, and its line comes before the disk line', () => {
  const problems = recorderProblems([{ kind: 'camera', state: 'disconnected' }, { kind: 'screen', state: 'no-picture' }], { freeBytes: 9 * GB, low: true });
  assert.equal(problems?.tone, 'danger');
  assert.deepEqual(problems?.lines, [
    "The camera was disconnected: plug it back in or choose another one.",
    "The screen isn't sending a picture: allow it in System Settings or choose another one.",
    'Your disk is almost full: free up at least 1 GB before recording.',
  ]);
});

test('a source still opening or not started is not a problem', () => {
  assert.equal(recorderProblems([{ kind: 'camera', state: 'starting' }, { kind: 'microphone', state: 'off' }], null), null);
});

test('the pre-flight line names every included source that is not ready, before the first take only', () => {
  assert.equal(preflightLine([{ kind: 'camera', state: 'off' }], true), 'Fix the camera above before recording');
  assert.equal(preflightLine([{ kind: 'camera', state: 'off' }, { kind: 'microphone', state: 'error' }], true), 'Fix the camera and microphone above before recording');
  assert.equal(preflightLine([{ kind: 'camera', state: 'off' }], false), null, 'after the first take the line is gone');
  assert.equal(preflightLine(ready, true), null);
});

test('the next scene to record comes after the current one, then wraps to the earlier ones', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(nextSceneToRecord(ids, id => id === 'a', 'a'), 'b');
  assert.equal(nextSceneToRecord(ids, id => id !== 'a', 'c'), 'a');
  assert.equal(nextSceneToRecord(ids, () => true, 'b'), null);
});

test('take thumbnails read "Take 1 (00:07)"', () => {
  assert.equal(takeThumbnailLabel('Take 1', 7.9), 'Take 1 (00:07)');
  assert.equal(takeThumbnailLabel('Intro', 125), 'Intro (02:05)');
});
