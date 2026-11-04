/** Whisper writes non-speech as bracketed tags ("[BLANK_AUDIO]", "(music)") and stray punctuation ("[", "]"). They are never shown or burned in. */
/** A tag can also arrive split across words ("[BLANK", "_AUDIO]", "BLANK_AUDIO]"): an upper-case or underscored piece with a bracket on one side. */
export const isSoundTag=(text:string)=>{const t=text.trim();return !/[\p{L}\p{N}]/u.test(t)||/^[[(][^\])]*[\])]$/.test(t)||/[[\]()_]/.test(t)&&/^[[(]?_?[A-Z][A-Z_ ]*[\])]?$/.test(t);};
