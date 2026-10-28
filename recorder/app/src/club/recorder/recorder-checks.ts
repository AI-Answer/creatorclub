import type {DiskSpace} from '../../../shared/club';

/** The recorder's sources, in the order the sources column shows them. */
export type SourceKind='camera'|'microphone'|'screen'|'systemAudio';
/**
 * What one included source is doing right now:
 * `ready` sends picture or sound; `starting` is opening; `off` has no preview yet (not allowed, or nothing chosen);
 * `error` failed to start; `disconnected` stopped; `no-picture` opened but sends no frames.
 */
export type SourceState='ready'|'starting'|'off'|'error'|'disconnected'|'no-picture';
export type SourceCheck={kind:SourceKind;state:SourceState};

const NAMES:Record<SourceKind,string>={camera:'camera',microphone:'microphone',screen:'screen',systemAudio:'computer audio'};
const GB=1024**3;
const LOW_DISK_BYTES=10*GB;

/** One sentence per source problem. `off` and `starting` are not problems: the pre-flight line covers them. */
const PROBLEM:Partial<Record<SourceState,(name:string)=>string>>={
 error:name=>`The ${name} can't start: check that it's connected and allowed in System Settings.`,
 disconnected:name=>`The ${name} was disconnected: plug it back in or choose another one.`,
 'no-picture':name=>`The ${name} isn't sending a picture: allow it in System Settings or choose another one.`,
};

export type Problems={tone:'danger'|'warning';lines:string[]};

/**
 * Everything that would spoil a take, for the one coloured card at the top of the sources column.
 * Source problems come first and make the card red; low disk space alone makes it amber. Null when all is well.
 */
export function recorderProblems(sources:readonly SourceCheck[],disk:DiskSpace|null):Problems|null{
 const lines=sources.flatMap(source=>{const line=PROBLEM[source.state];return line?[line(NAMES[source.kind])]:[];});
 const sourceProblem=lines.length>0;
 if(disk?.low){const needed=Math.max(1,Math.ceil((LOW_DISK_BYTES-disk.freeBytes)/GB));lines.push(`Your disk is almost full: free up at least ${needed} GB before recording.`);}
 return lines.length?{tone:sourceProblem?'danger':'warning',lines}:null;
}

/** Before the first take only: "Fix the camera above before recording", naming every included source that isn't ready yet. */
export function preflightLine(sources:readonly SourceCheck[],firstRecording:boolean):string|null{
 if(!firstRecording)return null;
 const names=sources.filter(source=>source.state!=='ready'&&source.state!=='starting').map(source=>NAMES[source.kind]);
 if(!names.length)return null;
 const list=names.length===1?names[0]:`${names.slice(0,-1).join(', ')} and ${names.at(-1)}`;
 return `Fix the ${list} above before recording`;
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
