import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, defaultEffects, defaultTransform, type Clip } from '../shared/types.js';
import { pacingIssues, pacingText } from '../shared/pacing.js';

const clip = (id: string, track: Clip['track'], start: number, length: number): Clip => ({ id, mediaId: 'm', name: id, track, start, sourceIn: 0, sourceOut: length, speed: 1, gain: 1, muted: false, transform: defaultTransform(), effects: defaultEffects() });

test('a long stretch with nothing changing on screen is flagged; a graphic in it breaks it up', () => {
  const p = createProject('Pacing');
  p.clips = [clip('cam', 'camera', 0, 20)];
  assert.deepEqual(pacingIssues(p).map((i) => [i.kind, i.start, i.end]), [['static', 0, 20]]);
  p.motion = [{ id: 'm1', template: 'title-card', style: 'clean', start: 5, duration: 4, props: { title: 'Hi' } }];
  assert.deepEqual(pacingIssues(p).map((i) => [i.kind, i.start, i.end]), [['static', 9, 20]]);
  p.zooms = [{ id: 'z', start: 13, duration: 3, scale: 1.4, x: 0.5, y: 0.5, target: 'camera', easing: 'smooth' } as never];
  assert.deepEqual(pacingIssues(p), [], 'every stretch is now under 6 s');
});

test('graphics on screen together, and one too short to read, are flagged with their times', () => {
  const p = createProject('Pacing');
  p.clips = [clip('cam', 'camera', 0, 10), clip('proof', 'overlay', 2, 3)];
  p.motion = [{ id: 'm1', template: 'title-card', style: 'clean', start: 3, duration: 0.6, props: { title: 'Hi' } }];
  const kinds = pacingIssues(p).map((i) => i.kind);
  assert.ok(kinds.includes('overlap') && kinds.includes('short'));
  assert.match(pacingText(p), /0:03: an overlay and a graphic on screen together/);
  assert.match(pacingText(p), /under 1 s/);
});
