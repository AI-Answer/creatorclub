/** A video's filmstrip is one JPEG sprite of evenly spaced frames, each FILMSTRIP_WIDTH x FILMSTRIP_HEIGHT, side by side; frame i shows the source at i / count of its duration. */
export const FILMSTRIP_WIDTH=160,FILMSTRIP_HEIGHT=90;
/** About one frame every two seconds, between 8 and 120 frames. */
export function filmstripCount(duration:number){return Number.isFinite(duration)&&duration>0?Math.max(8,Math.min(120,Math.ceil(duration/2))):0;}
