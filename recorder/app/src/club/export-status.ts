export type ExportStatus='missing'|'unknown'|'current'|'stale';
/** Only two known, different revisions establish that a completed export is stale. */
export function exportStatus(file:{projectRevision?:string}|null|undefined,revision:string|null|undefined):ExportStatus{
 if(!file)return 'missing';
 const normalize=(value:string|undefined|null)=>value?.replaceAll('"','').trim();
 const saved=normalize(file.projectRevision),current=normalize(revision);
 return !saved||!current?'unknown':saved===current?'current':'stale';
}
/** Older exports and unavailable revision reads remain usable until a mismatch is known. */
export function hasCurrentExport(file:{projectRevision?:string}|null|undefined,revision:string|null|undefined):boolean{
 const status=exportStatus(file,revision);return status==='current'||status==='unknown';
}
