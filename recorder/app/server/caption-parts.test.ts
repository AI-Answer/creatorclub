import test from 'node:test';
import assert from 'node:assert/strict';
import {captionPartAt,captionParts} from '../shared/caption-parts.ts';

test('preview and export split a caption into the same word groups at the same times',()=>{
 const caption={text:'one two three four five',start:10,end:15};
 assert.deepEqual(captionParts(caption,2).map(part=>part.text),['one two','three four','five']);
 assert.deepEqual(captionParts(caption,2).map(part=>[part.start,part.end]),[[10,11.666666667],[11.666666667,13.333333333],[13.333333333,15]]);
 assert.equal(captionPartAt(caption,2,10)?.text,'one two','the preview shows the first group at the caption start');
 assert.equal(captionPartAt(caption,2,14.9)?.text,'five','and the last group at its end');
 assert.equal(captionPartAt(caption,1,10)?.text,'one','"One word" shows a single word, as the export burns it');
 assert.equal(captionPartAt(caption,7,12)?.text,caption.text,'a caption within maxWords shows whole');
 assert.equal(captionPartAt(caption,2,15),null,'nothing after the caption ends');
});
