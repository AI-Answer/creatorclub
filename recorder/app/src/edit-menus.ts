import type {MenuItem} from './club/ui';

/** What the timeline's "…" menu and its right-click menu can run. */
export interface TimelineMenuActions {
 split():void;deleteClose():void;deleteKeepGap():void;duplicate():void;copy():void;paste():void;selectAll():void;
 addMarker():void;previousCut():void;nextCut():void;toggleLink():void;linked:boolean;
 blade:boolean;toggleBlade():void;waveforms:boolean;toggleWaveforms():void;addVideoLayer():void;addAudioLayer():void;
}
/** What the timeline bar already has as buttons: Play, Split, Delete, Snap, Follow, the zoom slider and Fit. The "…" menu never repeats them. */
export const TIMELINE_BAR=['Split','Delete and close the gap','Magnetic snapping','Follow','Zoom in','Zoom out','Fit the whole video'] as const;
/** The "…" menu: only what the timeline bar does not offer. */
export function timelineMoreItems(a:TimelineMenuActions):MenuItem[]{
 return [{label:'Duplicate · ⌘D',icon:'Copy',fn:a.duplicate},{label:'Copy · ⌘C',fn:a.copy},{label:'Paste at playhead · ⌘V',fn:a.paste},{label:'Delete, keep the gap · ⇧⌫',fn:a.deleteKeepGap},'-',
  {label:'Add marker at playhead · M',icon:'Bookmark',fn:a.addMarker},{label:a.linked?'Unlink screen, camera and audio · ⌘G':'Link selected clips · ⌘G',icon:'Link',fn:a.toggleLink},{label:'Blade tool · B',check:a.blade,fn:a.toggleBlade},{label:'Waveforms · E',check:a.waveforms,fn:a.toggleWaveforms},'-',
  {label:'Add video layer',icon:'Layers',fn:a.addVideoLayer},{label:'Add audio layer',icon:'Music',fn:a.addAudioLayer}];
}
/** Right-click on the timeline: the actions at the pointer first (split, delete), then the "…" menu. */
export function timelineContextItems(a:TimelineMenuActions):MenuItem[]{
 return [{label:'Split at playhead · S',icon:'Scissors',fn:a.split},{label:'Delete and close the gap · ⌫',icon:'Trash2',fn:a.deleteClose},'-',...timelineMoreItems(a),'-',{label:'Select all · ⌘A',fn:a.selectAll},{label:'Previous cut · ↑',fn:a.previousCut},{label:'Next cut · ↓',fn:a.nextCut}];
}
