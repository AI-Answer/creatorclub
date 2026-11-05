import type {CaptionStyle} from '../shared/types';

/**
 * Caption looks to pick from, as tiles like Borumi's Captions panel. Each is a whole caption style the renderer draws as it is
 * (text colour, box, size, place, words per caption), so the tile shows exactly what the video will show.
 */
export type CaptionPreset={id:string;name:string;style:Omit<CaptionStyle,'enabled'>};
export const CAPTION_PRESETS:readonly CaptionPreset[]=[
 {id:'classic',name:'Classic',style:{fontSize:48,color:'#ffffff',background:'#10131ccc',position:'bottom',maxWords:7}},
 {id:'bold',name:'Bold',style:{fontSize:64,color:'#ffffff',background:'#00000000',position:'bottom',maxWords:4}},
 {id:'yellow',name:'Yellow',style:{fontSize:64,color:'#facc15',background:'#00000000',position:'bottom',maxWords:4}},
 {id:'big',name:'One word',style:{fontSize:96,color:'#ffffff',background:'#00000000',position:'center',maxWords:1}},
 {id:'boxed',name:'Boxed',style:{fontSize:52,color:'#0a0a0a',background:'#ffffffee',position:'bottom',maxWords:5}},
 {id:'top',name:'At the top',style:{fontSize:48,color:'#ffffff',background:'#10131ccc',position:'top',maxWords:7}},
];

const same=(a:Omit<CaptionStyle,'enabled'>,b:CaptionStyle)=>a.fontSize===b.fontSize&&a.color.toLowerCase()===b.color.toLowerCase()&&a.background.toLowerCase()===b.background.toLowerCase()&&a.position===b.position&&a.maxWords===b.maxWords;
/** The preset the project's captions use now: `none` when they are hidden, undefined when the style was changed by hand. */
export function currentPreset(style:CaptionStyle):string|undefined{
 if(!style.enabled)return 'none';
 return CAPTION_PRESETS.find(preset=>same(preset.style,style))?.id;
}

/** The sample a tile shows: as many words as the style puts in one caption, up to two. */
export const captionSample=(maxWords:number)=>maxWords<=1?'Hey':'Hey there';
/** How much a card shrinks the caption's size: the card is a small picture of the video. */
export const CAPTION_CARD_SCALE=.32;

export function CaptionPresetGrid({style,onPick}:{style:CaptionStyle;onPick(next:CaptionStyle):void}){
 const chosen=currentPreset(style);
 return <div className="caption-presets" role="radiogroup" aria-label="Caption style">
  <button type="button" role="radio" aria-checked={chosen==='none'} className={`caption-tile none${chosen==='none'?' on':''}`} onClick={()=>onPick({...style,enabled:false})}><span>No captions</span></button>
  {CAPTION_PRESETS.map(preset=>{const s=preset.style,scale=CAPTION_CARD_SCALE;
   return <button key={preset.id} type="button" role="radio" aria-checked={chosen===preset.id} aria-label={preset.name} title={preset.name} className={`caption-tile${chosen===preset.id?' on':''}`} onClick={()=>onPick({...s,enabled:true})}>
    <span className={`caption-sample at-${s.position}`} style={{color:s.color,background:s.background,fontSize:Math.max(11,Math.round(s.fontSize*scale))}}>{captionSample(s.maxWords)}</span>
   </button>;})}
 </div>;
}
