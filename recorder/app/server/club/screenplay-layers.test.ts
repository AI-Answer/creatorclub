import test from 'node:test';
import assert from 'node:assert/strict';
import { layerPlan, sourceTime } from './screenplay-layers.js';

test('screenplay scenes become back-to-back blocks on the recording\'s time: each dissolve in the incoming block, no block for a bare face', () => {
  const fps = 30;
  const t = {
    fps,
    durationInFrames: 300,
    scenes: [
      { id: 's0', kind: 'stage', from: 0, duration: 90, transitionIn: 'cut', title: 'What a *skill* is' },
      { id: 's1', kind: 'app', app: 'browser', from: 90, duration: 60, transitionIn: 'blur' },
      { id: 't', kind: 'talking', from: 150, duration: 60, transitionIn: 'cut', elements: [] },
      { id: 'ch', kind: 'chapter', index: 0, from: 210, duration: 90, transitionIn: 'cut' },
    ],
    webcam: [{ frame: 0, mode: 'tile' }, { frame: 150, mode: 'full' }, { frame: 210, mode: 'tile' }],
    chapters: [{ index: 0, title: 'Superpowers' }],
  };
  const aroll = { segments: [{ srcStart: 0.067, outStart: 0 }] };
  const { blocks, stages } = layerPlan(t, aroll);
  // s1 dissolves in over 0.33 s (10 frames): its block starts there and s0's ends there.
  assert.deepEqual(blocks.map((b) => [b.id, b.f0, b.f1, b.title]), // named by what each shows
    [['s0', 0, 80, 'What a skill is'], ['s1', 80, 150, 'Browser scene'], ['ch', 210, 300, 'Chapter: Superpowers']]);
  assert.equal(+blocks[1].start.toFixed(3), +(80 / fps + 0.067).toFixed(3), 'on the recording\'s time, after the silence screenplay trimmed');
  assert.deepEqual(stages.map((s) => [+s.start.toFixed(3), +s.end.toFixed(3)]), [[0.067, 5.067], [7.067, 10.067]], 'the face is full frame where screenplay shows it full');
  assert.equal(sourceTime({ segments: [{ srcStart: 0, outStart: 0 }, { srcStart: 12, outStart: 10 }] }, 11), 13, 'through a cut');
});
