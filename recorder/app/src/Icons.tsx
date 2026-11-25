import type {SVGProps} from 'react';
import {AlignCenter as LAlignCenter,ArrowLeft as LArrowLeft,ArrowRight as LArrowRight,AudioLines as LAudioLines,Camera as LCamera,Captions as LCaptions,Check as LCheck,ChevronDown as LChevronDown,ChevronLeft as LChevronLeft,ChevronRight as LChevronRight,CircleCheck as LCircleCheck,Clapperboard as LClapperboard,Clock3 as LClock3,Copy as LCopy,Download as LDownload,Ellipsis as LEllipsis,FileText as LFileText,Film as LFilm,FlipHorizontal as LFlipHorizontal,FolderOpen as LFolderOpen,Grid2x2 as LGrid2x2,GripVertical as LGripVertical,History as LHistory,House as LHouse,Image as LImage,Info as LInfo,Layers as LLayers,LayoutTemplate as LLayoutTemplate,List as LList,LoaderCircle as LLoaderCircle,Magnet as LMagnet,Maximize2 as LMaximize2,Mic as LMic,Minus as LMinus,Monitor as LMonitor,MousePointer2 as LMousePointer2,Music as LMusic,Pause as LPause,Play as LPlay,Plus as LPlus,Redo2 as LRedo2,RotateCcw as LRotateCcw,Scissors as LScissors,Search as LSearch,Settings as LSettings,SkipBack as LSkipBack,SkipForward as LSkipForward,Square as LSquare,Trash2 as LTrash2,Type as LType,Undo2 as LUndo2,Upload as LUpload,Video as LVideo,Workflow as LWorkflow,PenLine as LPenLine,X as LX,ZoomIn as LZoomIn,ZoomOut as LZoomOut,type LucideIcon} from 'lucide-react';

/**
 * The editor's and recorder's icons. They come from lucide, the same set as the club screens (`club/ui/icons.tsx`), at the same
 * 1.75 stroke, so the embedded editor and the rest of the app draw one family. A thin adapter keeps the `size` interface.
 */
type Props=SVGProps<SVGSVGElement>&{size?:number|string};
export const ICON_STROKE=1.75;
function icon(Glyph:LucideIcon){return function Icon({size=24,strokeWidth=ICON_STROKE,style,...props}:Props){return <Glyph size={size} aria-hidden={props['aria-label']?undefined:true} {...props as object} style={{strokeWidth,...style}}/>;};}
export const ArrowLeft=icon(LArrowLeft);
export const ArrowRight=icon(LArrowRight);
export const AudioLines=icon(LAudioLines);
export const Camera=icon(LCamera);
export const Check=icon(LCheck);
export const ChevronDown=icon(LChevronDown);
export const ChevronLeft=icon(LChevronLeft);
export const ChevronRight=icon(LChevronRight);
export const Clock3=icon(LClock3);
export const Clapperboard=icon(LClapperboard);
export const Copy=icon(LCopy);
export const Download=icon(LDownload);
export const FileText=icon(LFileText);
export const Film=icon(LFilm);
export const FolderOpen=icon(LFolderOpen);
export const Grid2X2=icon(LGrid2x2);
export const History=icon(LHistory);
export const Home=icon(LHouse);
export const Image=icon(LImage);
export const Layers=icon(LLayers);
export const LayoutTemplate=icon(LLayoutTemplate);
export const LoaderCircle=icon(LLoaderCircle);
export const Magnet=icon(LMagnet);
export const Maximize2=icon(LMaximize2);
export const Mic=icon(LMic);
export const Minus=icon(LMinus);
export const MoreHorizontal=icon(LEllipsis);
export const MousePointer2=icon(LMousePointer2);
export const Music=icon(LMusic);
export const Pause=icon(LPause);
export const Play=icon(LPlay);
export const Plus=icon(LPlus);
export const Redo2=icon(LRedo2);
export const Scissors=icon(LScissors);
export const Search=icon(LSearch);
export const Settings2=icon(LSettings);
export const SkipBack=icon(LSkipBack);
export const SkipForward=icon(LSkipForward);
export const Subtitles=icon(LCaptions);
export const Trash2=icon(LTrash2);
export const Type=icon(LType);
export const Undo2=icon(LUndo2);
export const Upload=icon(LUpload);
export const Video=icon(LVideo);
export const Wand=icon(LWorkflow);
export const PenLine=icon(LPenLine);
export const X=icon(LX);
export const ZoomIn=icon(LZoomIn);
export const ZoomOut=icon(LZoomOut);
export const GripVertical=icon(LGripVertical);
export const AlignCenter=icon(LAlignCenter);
export const Monitor=icon(LMonitor);
export const Square=icon(LSquare);
export const CheckCircle2=icon(LCircleCheck);
export const Info=icon(LInfo);
export const RotateCcw=icon(LRotateCcw);
export const FlipHorizontal=icon(LFlipHorizontal);
export const Structured=icon(LList);
// Independently drawn geometric symbols matching the observed control vocabulary.
export function Elements({size=18,...props}:Props){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="M4 10.5 7.2 4l3.3 6.5M5.1 8.3h4.2M4 16.5h6M7 13.5v6"/><circle cx="17.4" cy="6.7" r="2.6"/><rect x="13.3" y="13.3" width="6.7" height="6.7" rx=".25"/></svg>;}
export function QuickRecord({size=18,...props}:Props){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><rect x="3" y="7" width="12" height="10" rx=".6"/><path d="m15 12 6-4.7v9.4L15 12M6 10l2 2-2 2m4-4 2 2-2 2"/></svg>;}
