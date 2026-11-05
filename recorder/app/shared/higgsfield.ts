export const HIGGSFIELD_MODELS=[
 {id:'nano_banana_pro',name:'Nano Banana Pro',references:14},
 {id:'gpt_image_2_6',name:'GPT Image 2.6',references:14},
 {id:'text2image_soul_v2',name:'Soul 2 · your face',references:1},
 {id:'seedream_v5_pro',name:'Seedream 5 Pro',references:10},
] as const;
export type HiggsfieldModel=typeof HIGGSFIELD_MODELS[number]['id'];
export interface HiggsfieldStatus{installed:boolean;signedIn:boolean;email?:string;plan?:string;credits?:number;hint?:string;}
export interface SoulId{id:string;name:string;}
export type ThumbnailReference={kind:'tile';id:string}|{kind:'upload';path:string}|{kind:'current'}|{kind:'candidate';id:string};
export interface ThumbnailRequest{prompt:string;model:HiggsfieldModel;count:number;references?:ThumbnailReference[];soulId?:string;parentId?:string;}
export interface ThumbnailCandidate{id:string;prompt:string;model:HiggsfieldModel;params:Record<string,string>;file:string;createdAt:string;parentId?:string;removedAt?:string;}
export const thumbnailImageUrl=(videoId:string,id:string)=>`/api/club/videos/${encodeURIComponent(videoId)}/thumbnails/${encodeURIComponent(id)}/image`;
/** Prefill with at most three words; the creator can edit the prompt before spending credits. */
export function thumbnailPrompt(title:string,thumbnailText:string,brief?:string):string{
 const headline=thumbnailText.trim().split(/\s+/).slice(0,3).join(' ');
 return [`Create a 16:9 YouTube thumbnail for a video titled ${JSON.stringify(title.trim())}.`,
  'Use one clear subject, a simple composition, high contrast and a readable silhouette at small YouTube feed sizes.',
  headline?`Use a single 1–3 word headline, spelled exactly ${JSON.stringify(headline)}.`:'Use no headline.',
  'No other text, logos, watermarks or tiny details.',brief?.trim()?`Creative brief: ${brief.trim()}`:''].filter(Boolean).join('\n');
}
