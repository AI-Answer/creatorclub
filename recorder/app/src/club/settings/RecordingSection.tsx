import {useState} from 'react';
import {Card} from '../ui';
import {countdownSound,setCountdownSound,type CountdownSound} from '../../recording-countdown';

// Borumi's Settings > Recording, "Countdown sound" (main bundle M:76370-76410): Disabled by default. Every take counts down; this only
// chooses whether you hear it. Borumi also offers Drum Sticks; Creator Compiler has one sound, its beep.
const SOUNDS:ReadonlyArray<readonly [CountdownSound,string]>=[['Disabled','Disabled'],['Beep','Beep']];

export function RecordingSection(){
 const [sound,setSound]=useState<CountdownSound>(countdownSound);
 return <section className="set-group" id="set-recording" aria-labelledby="set-recording-title"><h2 id="set-recording-title">Recording</h2><p>How takes start.</p>
  <Card><div className="srow2"><div className="grow"><div className="st">Countdown sound</div><div className="sd">The sound that will be played during the countdown.</div></div>
   <select aria-label="Countdown sound" value={sound} onChange={event=>{const next=event.target.value as CountdownSound;setSound(next);setCountdownSound(next);}}>{SOUNDS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></Card>
 </section>;
}
