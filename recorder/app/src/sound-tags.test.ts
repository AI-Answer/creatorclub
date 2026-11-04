import test from 'node:test';
import assert from 'node:assert/strict';
import {isSoundTag} from '../shared/sound-tags';

test('Whisper\'s non-speech tags are never shown as words, even when they arrive split across words',()=>{
 for(const tag of ['[BLANK_AUDIO]','(music)','[',']','--','BLANK_AUDIO]','[BLANK','_AUDIO]','[MUSIC'])assert.equal(isSoundTag(tag),true,tag);
 for(const word of ['Hello','I','OK','25,','1-2-3-4-5,','Claude','it\'s','A.I.'])assert.equal(isSoundTag(word),false,word);
});
