import type {CSSProperties} from 'react';
import {
 AArrowDown,AArrowUp,ArrowDown,ArrowLeft,ArrowRight,ArrowUp,ArrowUpRight,AudioLines,BetweenHorizontalStart,Bookmark,Bot,Calendar,Camera,Captions,Check,ChevronDown,ChevronLeft,ChevronRight,ChevronUp,ChevronsUpDown,
 Circle,CircleCheck,CircleDot,CircleHelp,Clapperboard,Clock,Code,Copy,CornerDownRight,Download,Expand,Eye,EyeOff,FileText,Film,Flag,Folder,FolderOpen,GripVertical,Heading1,Heading2,Heading3,Heart,History,House,Image,Keyboard,Layers,LayoutTemplate,Lightbulb,
 Link,List,ListChecks,ListOrdered,LoaderCircle,Lock,Magnet,Maximize2,MessageCircle,MessagesSquare,Mic,Minus,Monitor,MoreHorizontal,MoveHorizontal,Music,Package,PanelLeftClose,PanelLeftOpen,PanelRightClose,PanelRightOpen,Pause,Pencil,Pilcrow,Play,Plus,Quote,Redo2,RotateCcw,
 Frame,Scissors,Search,Send,Settings,Settings2,SlidersHorizontal,Sparkles,Spline,Sprout,Square,SquareKanban,SquareSplitHorizontal,StickyNote,Sun,Table,Trash2,TrendingUp,TriangleAlert,Type,Undo2,Upload,Video,Wand2,X,Youtube,Waypoints,ZoomIn,ZoomOut,
 type LucideIcon,
} from 'lucide-react';
import {CompanionMark} from './CompanionMark';

/**
 * The one icon registry. Components ask for an icon by what it means (`add`, `close`, `record`, `split`, `companion`), never by
 * its picture, and nothing in `src/club` imports lucide-react except this file (a test checks both). Change a picture here and it
 * changes everywhere the meaning is used.
 */
const glyphs={
 // Actions
 add:Plus,close:X,check:Check,more:MoreHorizontal,delete:Trash2,copy:Copy,link:Link,edit:Pencil,search:Search,send:Send,
 upload:Upload,download:Download,retry:RotateCcw,undo:Undo2,redo:Redo2,history:History,save:Bookmark,'open-external':ArrowUpRight,
 ai:Sparkles,draft:Wand2,drag:GripVertical,fit:Maximize2,fullscreen:Expand,'zoom-in':ZoomIn,'zoom-out':ZoomOut,
 'text-smaller':AArrowDown,'text-bigger':AArrowUp,'move-up':ArrowUp,'move-down':ArrowDown,next:ArrowRight,previous:ArrowLeft,
 back:ChevronLeft,forward:ChevronRight,expand:ChevronDown,collapse:ChevronUp,choose:ChevronsUpDown,reply:CornerDownRight,
 // Recording and editing
 record:CircleDot,stop:Square,play:Play,pause:Pause,cut:Scissors,split:SquareSplitHorizontal,ripple:BetweenHorizontalStart,snap:Magnet,marker:Flag,
 microphone:Mic,camera:Video,snapshot:Camera,screen:Monitor,audio:AudioLines,music:Music,captions:Captions,film:Film,image:Image,text:Type,
 slide:MoveHorizontal,adjust:SlidersHorizontal,'take-settings':Settings2,layout:LayoutTemplate,
 // Places and things
 home:House,idea:Lightbulb,trending:TrendingUp,signals:MessagesSquare,production:SquareKanban,video:Clapperboard,scenes:Layers,script:FileText,
 research:Waypoints,frame:Frame,connect:Spline,
 package:Package,note:StickyNote,folder:Folder,'folder-open':FolderOpen,table:Table,calendar:Calendar,duration:Clock,settings:Settings,
 help:CircleHelp,keyboard:Keyboard,theme:Sun,youtube:Youtube,comment:MessageCircle,like:Heart,assistant:Bot,'first-steps':Sprout,code:Code,
 preview:Eye,hide:EyeOff,'sidebar-close':PanelLeftClose,'sidebar-open':PanelLeftOpen,'panel-close':PanelRightClose,'panel-open':PanelRightOpen,
 // States
 done:CircleCheck,pending:Circle,warning:TriangleAlert,loading:LoaderCircle,locked:Lock,
 // Writing (the Markdown editor's commands)
 'heading-1':Heading1,'heading-2':Heading2,'heading-3':Heading3,list:List,'list-numbered':ListOrdered,checklist:ListChecks,quote:Quote,paragraph:Pilcrow,divider:Minus,
} satisfies Record<string,LucideIcon>;

type GlyphName=keyof typeof glyphs;

/**
 * The prototype's picture names, kept only so screens another task is rewriting (Discover, Videos, the companion) keep compiling
 * until they move to the semantic names. `icons.test.ts` lists the files still allowed to use them; do not use them in new code.
 */
const legacy={
 AArrowDown:'text-smaller',AArrowUp:'text-bigger',ArrowDown:'move-down',ArrowLeft:'previous',ArrowRight:'next',ArrowUp:'move-up',ArrowUpRight:'open-external',Bookmark:'save',Bot:'assistant',
 Calendar:'calendar',Camera:'snapshot',Captions:'captions',Check:'check',ChevronDown:'expand',ChevronLeft:'back',ChevronRight:'forward',ChevronsUpDown:'choose',Circle:'pending',CircleCheck:'done',
 CircleHelp:'help',Clapperboard:'video',Clock:'duration',Code:'code',Copy:'copy',CornerDownRight:'reply',Download:'download',Expand:'fullscreen',Eye:'preview',EyeOff:'hide',FileText:'script',
 Film:'film',Folder:'folder',FolderOpen:'folder-open',GripVertical:'drag',Heading1:'heading-1',Heading2:'heading-2',Heading3:'heading-3',Heart:'like',House:'home',Image:'image',Layers:'scenes',
 LayoutTemplate:'layout',Lightbulb:'idea',Link:'link',List:'list',ListChecks:'checklist',ListOrdered:'list-numbered',Maximize2:'fit',MessageCircle:'comment',MessagesSquare:'signals',Mic:'microphone',
 Minus:'divider',Monitor:'screen',MoreHorizontal:'more',Music:'music',Package:'package',PanelLeftClose:'sidebar-close',PanelLeftOpen:'sidebar-open',PanelRightClose:'panel-close',PanelRightOpen:'panel-open',
 Pause:'pause',Pilcrow:'paragraph',Play:'play',Plus:'add',Quote:'quote',RotateCcw:'retry',Scissors:'cut',Search:'search',Send:'send',Settings:'settings',Sparkles:'ai',Sprout:'first-steps',Square:'stop',
 SquareKanban:'production',StickyNote:'note',Sun:'theme',Table:'table',Trash2:'delete',TrendingUp:'trending',TriangleAlert:'warning',Type:'text',Undo2:'undo',Upload:'upload',Video:'camera',Wand2:'draft',
 X:'close',Youtube:'youtube',ZoomIn:'zoom-in',ZoomOut:'zoom-out',
} as const satisfies Record<string,GlyphName>;

export type LegacyIconName=keyof typeof legacy;
/** An icon by meaning. `companion` is CreatorClub's own mark (see `CompanionMark`). */
export type SemanticIconName=GlyphName|'companion';
export type IconName=SemanticIconName|LegacyIconName;

export const iconNames=[...Object.keys(glyphs),'companion'] as SemanticIconName[];
export const legacyIconNames=Object.keys(legacy) as LegacyIconName[];
const resolve=(name:IconName):SemanticIconName=>name in legacy?legacy[name as LegacyIconName]:name as SemanticIconName;

/** An icon by meaning, 16px with a 1.8 stroke. Decorative: the button around it carries the label (see `IconButton`). */
export function Icon({name,size=16,stroke=1.8,className='',style,spin}:{name:IconName;size?:number;stroke?:number;className?:string;style?:CSSProperties;spin?:boolean}){
 const key=resolve(name);
 if(key==='companion')return <CompanionMark size={size} className={className} style={style}/>;
 const Glyph=glyphs[key];
 // SceneForge's global CSS sets `svg.lucide{stroke-width:1.5}`; an inline style wins over it.
 return <Glyph aria-hidden size={size} className={`icon${spin?' animate-spin':''} ${className}`.trim()} style={{strokeWidth:stroke,...style}}/>;
}
