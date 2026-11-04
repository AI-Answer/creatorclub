import type {DesktopCaptureSource} from './desktop';
/** IDs alone can be recycled for windows. Restore validates the saved title and geometry in main. */
export function defaultCaptureSource(sources:readonly DesktopCaptureSource[]):DesktopCaptureSource|null{
 return sources.find(source=>source.kind==='display'&&source.primary)??sources.find(source=>source.kind==='display')??null;
}
export const captureSourceDetail=(source:DesktopCaptureSource)=>source.pixelSize?`${source.pixelSize.width} × ${source.pixelSize.height}${source.primary?' · Main display':''}`:source.kind==='display'?'Entire display':'Application window';
