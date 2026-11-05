/** A device's name as people know it: "Default - MacBook Air Microphone (Built-in)" is "MacBook Air Microphone", as Borumi shows it. */
export const deviceName=(label:string)=>label.replace(/^Default\s*-\s*/,'').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i,'').replace(/\s*\(Built-in\)\s*$/i,'').trim();

/** Device identifiers belong in selection values, never in visible copy. */
export function deviceLabel(devices:readonly Pick<MediaDeviceInfo,'kind'|'deviceId'|'label'>[],kind:'camera'|'microphone',deviceId=''){
 const candidates=devices.filter(d=>d.kind===(kind==='camera'?'videoinput':'audioinput'));
 const device=candidates.find(d=>d.deviceId===deviceId)||(!deviceId?candidates.find(d=>d.deviceId==='default'):undefined);
 const label=device?.label.trim();
 if(!label||devices.some(d=>d.deviceId===label))return `Default ${kind}`;
 return deviceName(label)||`Default ${kind}`;
}
