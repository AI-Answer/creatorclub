import {useCallback,useRef,useState} from 'react';
import {AudioMeter} from '../../AudioMeter';
import type {MeterAudio} from '../../recording-meter';

/** The recorder always shows the microphone's actual level, including silence. */
export function MicLevel({stream,audio,live,background,onLevel,onPeak}:{stream:MediaStream|null;audio:MeterAudio;live:boolean;background:boolean;onLevel(level:number|null):void;onPeak?:(level:number)=>void}){
 const fill=useRef<HTMLSpanElement>(null),[heard,setHeard]=useState(false);
 const receive=useCallback((value:number|null)=>{const level=value??0;if(fill.current)fill.current.style.width=`${Math.round(level*100)}%`;setHeard(level>.025);onLevel(value);},[onLevel]);
 return <div className="rec-mic-level"><div className="rec-meter-heading"><span>Mic level</span><span>{heard?'Sound detected':'No sound yet'}</span></div><div className="rec-meter-well" aria-hidden><span ref={fill}/></div><div className="rec-meter-sampler"><AudioMeter stream={stream} label="Microphone" audio={audio} live={live} background={background} onLevel={receive} onPeak={onPeak} emptyHint="No sound yet"/></div></div>;
}
