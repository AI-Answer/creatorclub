/*
 * The kinds of things a video is made of, each with one fixed colour (defined in `tokens.css` as `--kind-<kind>`).
 * The timeline, the scene chips and the take chips use these and nothing else, so a kind looks the same everywhere.
 * The editor's stylesheet (`editing-club.css`) paints the timeline from the same `--kind-*` tokens; the take chips on Record show `takeKinds`.
 */
export const KINDS=['screen','camera','audio','graphics','captions','zoom','marker'] as const;
export type Kind=(typeof KINDS)[number];

export const KIND_LABEL:Record<Kind,string>={screen:'Screen',camera:'Camera',audio:'Audio',graphics:'Graphics',captions:'Captions',zoom:'Zoom',marker:'Marker'};

/** `color` fills a clip or a dot, `soft` is a chip's background, `ink` is text on `color`. All are token references. */
export const KIND_COLOR:Record<Kind,{color:string;soft:string;ink:string}>=Object.fromEntries(KINDS.map(kind=>[kind,{
 color:`var(--kind-${kind})`,
 soft:kind==='marker'?'var(--cc-bg-sunk)':`var(--kind-${kind}-soft)`,
 ink:kind==='marker'?'var(--cc-surface)':'var(--kind-ink)',
}])) as Record<Kind,{color:string;soft:string;ink:string}>;

/** The kind a recording track belongs to: music is audio, and an overlay is graphics. */
export const trackKind=(track:'screen'|'camera'|'audio'|'music'|'overlay'):Kind=>track==='music'?'audio':track==='overlay'?'graphics':track;

/** The distinct kinds a take holds, in the order of the timeline (screen, camera, audio, then the rest). */
export const takeKinds=(tracks:readonly ('screen'|'camera'|'audio'|'music'|'overlay')[]):Kind[]=>{
 const held=new Set(tracks.map(trackKind));
 return KINDS.filter(kind=>held.has(kind));
};
