import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePartialJSON } from './partial-json.js';

test('a structured answer reads while it is written: open parts close, a key with no value yet is left out', () => {
  assert.equal(parsePartialJSON(''), undefined);
  assert.deepEqual(parsePartialJSON('{"title": "I taught Cl'), { title: 'I taught Cl' });
  assert.deepEqual(parsePartialJSON('{"title": "Done", "backupTi'), { title: 'Done' });
  assert.deepEqual(parsePartialJSON('{"title": "Done", "logline":'), { title: 'Done' });
  assert.deepEqual(parsePartialJSON('{"skeleton": [{"label": "Intro", "line": "We see'), { skeleton: [{ label: 'Intro', line: 'We see' }] });
  assert.deepEqual(parsePartialJSON('{"skeleton": [{"label": "Intro", "line": "A"}, {"lab'), { skeleton: [{ label: 'Intro', line: 'A' }, {}] });
  assert.deepEqual(parsePartialJSON('{"a": "quote \\"in'), { a: 'quote "in' });
  assert.deepEqual(parsePartialJSON('{"a": "slash \\'), { a: 'slash ' });
  assert.deepEqual(parsePartialJSON('{"a": 1, "b": [1, 2'), { a: 1, b: [1, 2] });
  assert.deepEqual(parsePartialJSON('{"title": "Done"}'), { title: 'Done' });
});
