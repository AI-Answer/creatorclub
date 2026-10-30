import test from 'node:test';
import assert from 'node:assert/strict';
import {TIMELINE_BAR,timelineContextItems,timelineMoreItems,type TimelineMenuActions} from './edit-menus';

const none=()=>{};
const actions:TimelineMenuActions={split:none,deleteClose:none,deleteKeepGap:none,duplicate:none,copy:none,paste:none,selectAll:none,addMarker:none,previousCut:none,nextCut:none,toggleLink:none,linked:false,blade:false,toggleBlade:none,waveforms:true,toggleWaveforms:none,addVideoLayer:none,addAudioLayer:none};
const labels=(items:ReturnType<typeof timelineMoreItems>)=>items.flatMap(i=>typeof i==='object'&&'label' in i?[i.label]:[]);

test('Task 14: the timeline "…" menu keeps only what the bar does not offer',()=>{
 const more=labels(timelineMoreItems(actions));
 assert.ok(more.length<=10,`${more.length} items`);
 for(const bar of TIMELINE_BAR)assert.ok(!more.some(l=>l.startsWith(bar)),`"${bar}" is on the bar already`);
 assert.ok(labels(timelineContextItems(actions)).some(l=>l.startsWith('Split')),'right-click still splits at the pointer');
});
