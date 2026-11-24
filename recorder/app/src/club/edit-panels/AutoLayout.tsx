import {useState} from 'react';
import type {Project} from '../../../shared/types';
import {applyAutoLayout,autoLayoutProblem,autoLayoutSummary,type AutoLayoutStretch,type MediaActivity,type ScreenActivity} from '../../../shared/auto-layout';
import {api} from '../../api';
import type {Change} from '../../Inspector';
import {BrEmpty,BrSection} from './br';

/** How much each screen recording on the timeline changes, measured by the server (once per file). A file it cannot read is left out. */
async function readScreenActivity(p:Project):Promise<ScreenActivity>{
 const ids=[...new Set(p.clips.filter(c=>c.track==='screen').map(c=>c.mediaId))].filter(id=>p.media.find(m=>m.id===id)?.kind==='video');
 const out:ScreenActivity={};
 await Promise.all(ids.map(async id=>{try{out[id]=await api<MediaActivity>(`/media/${encodeURIComponent(id)}/screen-activity`);}catch{/* The words decide there. */}}));
 return out;
}

/**
 * Auto layout in the Layout panel: reads the screen recordings, then writes the Layout row in one change (one Undo puts it back). The
 * screen alone while you demo, you full screen while you just talk, both otherwise; stretches you set by hand stay.
 */
export function AutoLayoutSection({project:p,change}:{project:Project;change:Change}){
 const [busy,setBusy]=useState(false),[said,setSaid]=useState('');
 const problem=autoLayoutProblem(p);
 const run=async()=>{
  setBusy(true);setSaid('');
  try{
   const screenActivity=await readScreenActivity(p);
   let plan:AutoLayoutStretch[]=[];
   change(d=>{plan=applyAutoLayout(d,{screenActivity});});
   setSaid(autoLayoutSummary(plan));
  }finally{setBusy(false);}
 };
 return <BrSection title="Auto layout">
  <BrEmpty text="Shows the screen alone while you demo, you full screen while you just talk, and both otherwise. Layouts you set by hand stay."/>
  <button type="button" className="br-btn layout-auto" disabled={busy||!!problem} onClick={()=>void run()}>{busy?'Reading the screen…':'Auto layout'}</button>
  {problem?<BrEmpty className="layout-hint" text={problem}/>:said&&<p className="br-empty layout-hint" role="status">{said}. Undo puts the layouts back.</p>}
 </BrSection>;
}
