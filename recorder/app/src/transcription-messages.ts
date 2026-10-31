/** Plain-language wording for transcription failures. The engine's messages name files and environment variables;
 * a creator needs to know what still works and what, if anything, they can do. */
export interface TranscriptionNotice{
 title:string;
 message:string;
 /** Running it again can only help when the cause was temporary. */
 retryHelps:boolean;
 /** The fix lives in Settings, so the panel offers to open it. */
 setup:boolean;
}

const STILL_WORKS='Recording, editing and exporting still work.';

export function describeTranscriptionError(raw?:string):TranscriptionNotice|null{
 const text=raw?.trim();
 if(!text)return null;
 if(/ggml|SCENEFORGE_WHISPER_MODEL|whisper model file is missing/i.test(text))
  return {title:'Captions are not set up yet',message:`Choose a local speech model in Settings to transcribe new recordings. Your existing captions remain available. ${STILL_WORKS}`,retryHelps:false,setup:true};
 if(/whisper-cli is not installed/i.test(text))
  return {title:'Captions are not available',message:`Install the local speech tool to transcribe new recordings. ${STILL_WORKS}`,retryHelps:false,setup:true};
 if(/ffmpeg is required/i.test(text))
  return {title:'A media tool is missing',message:`Creator Compiler could not find FFmpeg, which it needs to prepare audio. Reinstalling Creator Compiler restores it. ${STILL_WORKS}`,retryHelps:false,setup:false};
 if(/no audio track/i.test(text))
  return {title:'Nothing to transcribe',message:'This clip has no sound, so there are no words to caption.',retryHelps:false,setup:false};
 return {title:'Transcription did not finish',message:text,retryHelps:true,setup:false};
}
