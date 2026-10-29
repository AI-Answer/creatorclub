import type {CSSProperties} from 'react';
import {
 AArrowDown,AArrowUp,ArrowDown,ArrowLeft,ArrowRight,ArrowUp,ArrowUpRight,Bookmark,Bot,Calendar,Camera,Captions,Check,ChevronDown,ChevronLeft,ChevronRight,ChevronsUpDown,
 Circle,CircleCheck,CircleHelp,Clapperboard,Clock,Code,Copy,CornerDownRight,Download,Expand,Eye,EyeOff,FileText,Film,Folder,FolderOpen,GripVertical,Heading1,Heading2,Heading3,Heart,House,Image,Layers,LayoutTemplate,Lightbulb,
 Link,List,ListChecks,ListOrdered,Maximize2,MessageCircle,MessagesSquare,Mic,Minus,Monitor,MoreHorizontal,Music,Package,PanelLeftClose,PanelLeftOpen,Pause,Pilcrow,Play,Plus,Quote,RotateCcw,Scissors,Search,Send,Settings,
 Sparkles,Sprout,SquareKanban,StickyNote,Sun,Table,Trash2,TrendingUp,TriangleAlert,Type,Undo2,Upload,Video,Wand2,X,Youtube,ZoomIn,ZoomOut,
 type LucideIcon,
} from 'lucide-react';

/**
 * The icons the prototype uses, by its own names. Every prototype name exists in lucide-react 0.468, so none is substituted.
 * A screen adds an icon here before using it, which keeps the bundle to the icons that are shown.
 */
const icons={
 AArrowDown,AArrowUp,ArrowDown,ArrowLeft,ArrowRight,ArrowUp,ArrowUpRight,Bookmark,Bot,Calendar,Camera,Captions,Check,ChevronDown,ChevronLeft,ChevronRight,ChevronsUpDown,
 Circle,CircleCheck,CircleHelp,Clapperboard,Clock,Code,Copy,CornerDownRight,Download,Expand,Eye,EyeOff,FileText,Film,Folder,FolderOpen,GripVertical,Heading1,Heading2,Heading3,Heart,House,Image,Layers,LayoutTemplate,Lightbulb,
 Link,List,ListChecks,ListOrdered,Maximize2,MessageCircle,MessagesSquare,Mic,Minus,Monitor,MoreHorizontal,Music,Package,PanelLeftClose,PanelLeftOpen,Pause,Pilcrow,Play,Plus,Quote,RotateCcw,Scissors,Search,Send,Settings,
 Sparkles,Sprout,SquareKanban,StickyNote,Sun,Table,Trash2,TrendingUp,TriangleAlert,Type,Undo2,Upload,Video,Wand2,X,Youtube,ZoomIn,ZoomOut,
} satisfies Record<string,LucideIcon>;

export type IconName=keyof typeof icons;
export const iconNames=Object.keys(icons) as IconName[];

/** A lucide icon by name, 16px with a 1.8 stroke like the prototype. Decorative: label the button around it. */
export function Icon({name,size=16,stroke=1.8,className='',style}:{name:IconName;size?:number;stroke?:number;className?:string;style?:CSSProperties}){
 const Glyph=icons[name];
 // SceneForge's global CSS sets `svg.lucide{stroke-width:1.5}`; an inline style wins over it.
 return <Glyph aria-hidden size={size} className={`icon ${className}`.trim()} style={{strokeWidth:stroke,...style}}/>;
}
