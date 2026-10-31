import type {DiskSpace} from '../../../shared/club';
import type {DesktopMediaAccessStatus} from '../../desktop';

/** The recorder's sources, in the order the sources column shows them. */
export type SourceKind='camera'|'microphone'|'screen'|'systemAudio';
/**
 * What one included source is doing right now:
 * `ready` sends picture or sound; `starting` is opening; `off` has no preview yet (nothing chosen, or not enabled);
 * `blocked` macOS does not allow it; `no-picture` opened but sends no frames; `error` failed to start; `disconnected` stopped.
 */
export type SourceState='ready'|'starting'|'off'|'blocked'|'no-picture'|'error'|'disconnected';
export type SourceCheck={kind:SourceKind;state:SourceState};

/** What the recorder knows about one source, gathered from its preview and from macOS. */
export type SourceSnapshot={
 kind:SourceKind;
 /** Its switch is on. A source that is off is never checked and never warned about. */
 included:boolean;
 /** macOS's answer for this source (computer audio uses screen recording's). */
 permission?:DesktopMediaAccessStatus;
 /** The preview failed because access was not granted. */
 accessDenied?:boolean;
 /** The preview, or choosing the screen or window, failed for another reason. */
 failed?:boolean;
 /** The source stopped sharing. */
 ended?:boolean;
 /** Picture or sound is arriving. */
 receiving:boolean;
 /** A preview is opening, or open and waiting for its first frame. */
 opening?:boolean;
 /** The camera opened but sent no frame for a while. */
 stalled?:boolean;
};

/** Reads one source's state. Null for a source that is switched off. Permission comes first: nothing else can be fixed until macOS allows it. */
export function sourceState(source:SourceSnapshot):SourceState|null{
 if(!source.included)return null;
 if(source.permission==='denied'||source.permission==='restricted'||source.accessDenied)return 'blocked';
 if(source.stalled&&!source.receiving)return 'no-picture';
 if(source.failed&&!source.receiving)return 'error';
 if(source.ended)return 'disconnected';
 return source.receiving?'ready':source.opening?'starting':'off';
}
export function sourceChecks(sources:readonly SourceSnapshot[]):SourceCheck[]{
 return sources.flatMap(source=>{const state=sourceState(source);return state?[{kind:source.kind,state}]:[];});
}

const NAMES:Record<SourceKind,string>={camera:'camera',microphone:'microphone',screen:'screen',systemAudio:'computer audio'};
const GB=1024**3;
const LOW_DISK_BYTES=10*GB;

/** The one button a card line may carry: open the Mac recording setup, open the source again, or choose the screen or window again. */
export type ProblemAction='setup'|'retry-camera'|'retry-microphone'|'choose-source';
export const PROBLEM_ACTION_LABELS:Record<ProblemAction,string>={setup:'Open Mac setup','retry-camera':'Try again','retry-microphone':'Try again','choose-source':'Choose source'};
export type ProblemLine={text:string;action?:ProblemAction};

const captured=(kind:SourceKind)=>kind==='screen'||kind==='systemAudio';
/** One plain sentence per failing source, naming it and what to do, and at most one button. `off` and `starting` are not problems: the pre-flight line covers them. */
function problemLine({kind,state}:SourceCheck):ProblemLine|null{
 const name=NAMES[kind],retry:ProblemAction=captured(kind)?'choose-source':kind==='camera'?'retry-camera':'retry-microphone';
 switch(state){
  case 'blocked':return {text:`macOS isn't allowing the ${name}: open Mac setup to allow it.`,action:'setup'};
  case 'no-picture':return {text:`The ${name} isn't sending a picture: allow it in Mac setup or choose another camera.`,action:'setup'};
  case 'error':return captured(kind)
   ?{text:`The ${name} can't be captured: choose the screen or window again.`,action:retry}
   :{text:`The ${name} can't start: check that it's connected and not in use by another app.`,action:retry};
  case 'disconnected':return captured(kind)
   ?{text:`The ${name} stopped sharing: choose the screen or window again.`,action:retry}
   :{text:`The ${name} was disconnected: plug it back in, then try again.`,action:retry};
  default:return null;
 }
}

export type Problems={tone:'danger'|'warning';lines:ProblemLine[]};

/**
 * Everything that would spoil a take, for the one coloured card at the top of the sources column.
 * Source problems come first and make the card red; low disk space alone makes it amber. Null when all is well.
 * A button is shown once: a later line that needs the same action as an earlier one carries none.
 */
export function recorderProblems(sources:readonly SourceCheck[],disk:DiskSpace|null):Problems|null{
 const seen=new Set<ProblemAction>();
 const lines:ProblemLine[]=sources.flatMap(source=>{const line=problemLine(source);if(!line)return[];if(line.action&&seen.has(line.action))return [{text:line.text}];if(line.action)seen.add(line.action);return [line];});
 const sourceProblem=lines.length>0;
 if(disk?.low){const needed=Math.max(1,Math.ceil((LOW_DISK_BYTES-disk.freeBytes)/GB));lines.push({text:`Your disk is almost full: free up at least ${needed} GB before recording.`});}
 return lines.length?{tone:sourceProblem?'danger':'warning',lines}:null;
}

const TITLES:Record<SourceKind,string>={camera:'Camera',microphone:'Microphone',screen:'Screen',systemAudio:'Computer audio'};

/**
 * The one line above the Record button, naming the sources that are on: "Camera, microphone and screen are ready."
 * A source still opening, or not opened yet (recording opens it), says so. With no source on it says to choose one.
 * Problems are not told here: they replace this line (see `recorderProblems`).
 */
export function readinessLine(sources:readonly SourceCheck[]):{text:string;ready:boolean}{
 if(!sources.length)return {text:'No source is on. Choose one under Change.',ready:false};
 const words=sources.map((source,i)=>i?TITLES[source.kind].toLowerCase():TITLES[source.kind]);
 const names=words.length>1?`${words.slice(0,-1).join(', ')} and ${words[words.length-1]}`:words[0];
 const plural=sources.length>1;
 if(sources.every(source=>source.state==='ready'))return {text:`${names} ${plural?'are':'is'} ready.`,ready:true};
 return {text:sources.some(source=>source.state==='off')?`${names} will start when you press Record.`:`Starting ${names.toLowerCase()}…`,ready:false};
}

/** The scene to record after `from`: the next one without a take, else the first earlier one without a take, else null (all recorded). */
export function nextSceneToRecord(sceneIds:readonly string[],recorded:(id:string)=>boolean,from:string):string|null{
 const index=sceneIds.indexOf(from);
 const after=sceneIds.slice(index+1).find(id=>id!==from&&!recorded(id));
 return after??sceneIds.slice(0,Math.max(0,index)).find(id=>!recorded(id))??null;
}

/** "Take 1 (00:07)", as on Borumi's take thumbnails. */
export function takeThumbnailLabel(name:string,seconds:number){
 const whole=Math.max(0,Math.floor(seconds));
 return `${name} (${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')})`;
}
