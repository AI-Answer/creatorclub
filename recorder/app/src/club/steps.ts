import {videoTabs,type VideoTab} from './routes';
import type {IconName} from './ui';
import {TAB_LABEL} from './workspace/rules';

/*
 * The one set of words for how a video is made, read by Help, the first Home, the Board's tip and search.
 * The names are the tabs of a video's page (`TAB_LABEL`), so no screen can name a step differently from the page that has it.
 * Finding what to make is not a tab: it is Discover in the sidebar, and `FIND_IDEA` says so in the same words everywhere.
 */

/** What the paid publisher is, in one sentence, wherever publishing is first mentioned. */
export const POSTIZ_LINE='Postiz is the paid service that uploads your video to YouTube for you, from $29 a month.';

export interface StepInfo{tab:VideoTab;name:string;icon:IconName;does:string}

const DOES:Record<VideoTab,{icon:IconName;does:string}>={
 board:{icon:'note',does:'Gather links, notes and screenshots, ask Claude about them, then draft the scenes.'},
 plan:{icon:'scenes',does:'Choose the title, the thumbnail text and the hook, and check the scenes.'},
 record:{icon:'microphone',does:'Say each scene to the camera with its talking points beside you.'},
 edit:{icon:'cut',does:'Cut the pauses, add captions and music, then export.'},
 publish:{icon:'upload',does:`Send it to YouTube, now or at a time you pick. ${POSTIZ_LINE}`},
};

/** The five steps of every video, in order, named as the tabs of its page are. */
export const VIDEO_STEPS:readonly StepInfo[]=videoTabs.map(tab=>({tab,name:TAB_LABEL[tab],...DOES[tab]}));

/** The step that comes before the five: finding what to make. */
export const FIND_IDEA={name:'Discover',does:'See which videos in your topics are doing well and keep the concept you would make.'};

/** One sentence naming the five steps, for places that only have room for that. */
export const STEP_NAMES=VIDEO_STEPS.map(step=>step.name).join(', ');
export const STEPS_SENTENCE=`Every video goes through five steps: ${STEP_NAMES}.`;

export interface Term{term:string;means:string}

/** The words the app uses, in the order a beginner meets them. */
export const GLOSSARY:readonly Term[]=[
 {term:'Channel',means:'The YouTube channel you make videos for. CreatorClub learns its topics and how you talk, then looks for ideas that fit.'},
 {term:'Idea',means:'A video you might make. It waits in the first column of Videos until you start planning it.'},
 {term:'Video',means:'One card that goes from idea to published. It has a board, a plan, scenes, takes and an export.'},
 {term:'Board',means:'A canvas for one video where you gather links, notes, screenshots and files, and ask Claude about them.'},
 {term:'Research',means:'Your channel\'s own board, before any video: put Discover cards, ideas, links and notes on it, connect and group them, and start a video from the ones that belong together.'},
 {term:'Package',means:'The title, the thumbnail text and the hook that make people click and keep watching.'},
 {term:'Hook',means:'The first line you say. It decides whether people stay.'},
 {term:'Scene',means:'One part of the video with its own talking points. You plan the scenes, then record them one at a time.'},
 {term:'Talking points',means:'What you want to say in a scene, as short lines rather than a script.'},
 {term:'Take',means:'One recording of a scene. Record a scene again and keep the take you like best.'},
 {term:'Breakdown',means:'Why a video worked: what viewers asked and three concepts you could make. Claude writes it from the video.'},
 {term:'Views a day',means:'How many views a video gets each day since it went up. It shows which videos are taking off now.'},
 {term:'3× chip',means:"How many times a video beats its channel's usual views. 3× is three times as many. A dash means that usual is not tracked yet."},
 {term:'Follow',means:'Keeps a channel in the list CreatorClub reads for new videos, so they show up in Discover.'},
];

/** The plain-words help for a trend card, said once where cards first appear. */
export const TREND_HELP=[
 ['Views a day','how many views the video gets each day since it went up.'],
 ['The 3× chip',"how many times the video beats its channel's usual views. No chip means that usual is not tracked yet."],
 ['Break this down','shows why it worked and gives you three concepts you could make.'],
 ['Follow this channel','adds it to the channels CreatorClub reads, so its new videos show up in Discover.'],
] as const;

export interface Place{name:string;where:string}

/** Where things live, from docs/v2/UI-MAP.md in the words a beginner needs. */
export const PLACES:readonly Place[]=[
 {name:'Sidebar',where:'Your channel and its menu, Search (⌘K), then Home, Discover, Videos and Research. Settings, Help and Collapse are the three icons at the bottom.'},
 {name:'Home',where:'What to do next on the video you worked on last, and the first-video checklist for a new channel.'},
 {name:'Discover',where:'What works outside: YouTube videos beating their usual and posts from X and Reddit. Turn any of them into an idea.'},
 {name:'Videos',where:'Every video from idea to published, as a board, a table or a calendar. New video is here.'},
 {name:'Research',where:'Your channel\'s own board: put Discover cards, your ideas, links and notes on it, connect and group them, and start a video from a selection.'},
 {name:'Step tabs',where:`The top of a video: ${VIDEO_STEPS.map(step=>step.name).join(', ')}. They are the only way between steps.`},
 {name:'Ask Claude',where:'The panel on the right of a video. It sees the step you are on and answers with changes you can apply and undo.'},
 {name:'Settings',where:'Your connected AI, your channel and its voice, the channels you follow, and Postiz.'},
];

export interface Shortcut{keys:string;what:string}

export const SHORTCUTS:readonly Shortcut[]=[
 {keys:'⌘K',what:'Search videos, steps, settings and actions'},
 {keys:'Esc',what:'Close a dialog, a sheet or search'},
 {keys:'Enter',what:'Open the highlighted search result, or send a message to Claude'},
 {keys:'Shift Enter',what:'Start a new line in a message to Claude'},
 {keys:'Space',what:'Play or pause, in Edit'},
 {keys:'S',what:'Split at the playhead, in Edit'},
 {keys:'M',what:'Add a marker, in Edit'},
 {keys:'⌘Z / ⇧⌘Z',what:'Undo and redo, in Edit'},
 {keys:'?',what:'Every shortcut of Edit, while you are in Edit'},
];
