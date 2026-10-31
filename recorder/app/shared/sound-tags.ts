/** Whisper writes non-speech as bracketed tags ("[BLANK_AUDIO]", "(music)") and stray punctuation ("[", "]"). They are never shown or burned in. */
export const isSoundTag=(text:string)=>{const t=text.trim();return !/[\p{L}\p{N}]/u.test(t)||/^[[(][^\])]*[\])]$/.test(t);};
