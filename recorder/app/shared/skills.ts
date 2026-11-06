/** Writing skills from the person's own Claude Code setup that the companion can use. The chips on Plan and Record send the phrase; typing the skill's name works too. */
export const WRITING_SKILLS=[
  {name:'write-hook',phrase:'Write a stronger hook'},
  {name:'write-setup',phrase:'Write the setup'},
  {name:'build-points',phrase:'Build the talking points'},
  {name:'write-cta',phrase:'Write the call to action'}] as const;
export type WritingSkill=(typeof WRITING_SKILLS)[number]['name'];
/** The skills a message asks for: it starts with a chip phrase, or it names the skill. */
export function skillsAsked(text:string):WritingSkill[]{
  const lower=text.trim().toLowerCase();
  return WRITING_SKILLS.filter(s=>lower.startsWith(s.phrase.toLowerCase())||lower.includes(s.name)).map(s=>s.name);
}

/** One of the person's installed skills, as the picker lists it. */
export type InstalledSkill={name:string;description:string;/** Files inside the skill that show what it makes (a page, a GIF, an image, a short video), best first. */previews:string[];/** Its SKILL.md front matter says `creatorclub: edit`: it is made for Edit. */forEdit?:boolean};
/** The kinds of file a skill's preview can be. */
export const PREVIEW_EXT=/\.(html?|gif|webp|png|jpe?g|mp4|webm)$/i;
/** A skill name is a folder name: letters, digits, dashes, underscores. Anything else never reaches the disk. */
export const SKILL_NAME=/^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** While the message is only "/" and a few letters, what was typed after the slash; otherwise undefined (the picker is closed). */
export function slashQuery(text:string):string|undefined{
  const match=/^\/([A-Za-z0-9_-]*)$/.exec(text);
  return match?match[1].toLowerCase():undefined;
}
/** The skills that fit what was typed after the slash: names that start with it first, then names or descriptions that contain it. */
export function matchSkills(skills:readonly InstalledSkill[],query:string):InstalledSkill[]{
  if(!query)return [...skills];
  const starts=skills.filter(s=>s.name.toLowerCase().startsWith(query));
  const rest=skills.filter(s=>!starts.includes(s)&&(s.name.toLowerCase().includes(query)||s.description.toLowerCase().includes(query)));
  return [...starts,...rest];
}
/** The skill a message runs when it starts with "/name" (then a space or the end). */
export function slashSkill(text:string):string|undefined{
  const match=/^\/([A-Za-z0-9][A-Za-z0-9_-]*)(?:\s|$)/.exec(text.trim());
  return match?.[1];
}

/**
 * On Edit, a plain request to add graphics or to polish the video runs the bundled proof-edit skill, as "/proof-edit" would: that is where
 * the editing style, the word timing and the short answers live. A request to change, move or remove something already there is a small
 * edit the companion makes itself.
 */
const STYLE_ASK=/\b(motion[- ]?graph(?:ic|ics|s)?|graphics?|animations?|animate|diagrams?|infographics?|on-screen text|polish|edit (?:the|my|this) (?:whole |full )?video|make (?:it|the video|this) (?:look |feel )?(?:more |a lot more |much )?(?:pro|professional|polished|better|engaging))\b/i;
const SMALL_EDIT=/\b(remove|delete|take (?:out|off)|get rid|move|shift|nudge|earlier|later|shorter|longer|rename|reword|change|fix|replace|swap|undo|instead)\b/i;
export function editSkillAsked(text:string):'proof-edit'|undefined{
  return !slashSkill(text)&&STYLE_ASK.test(text)&&!SMALL_EDIT.test(text)?'proof-edit':undefined;
}

/**
 * Whether a skill edits or makes video, judged by what its own description says (HyperFrames, Remotion, b-roll, motion graphics,
 * video effects, a video editor, explainers, talking-head edits). Plain "render" is not enough: other skills render diagrams or pages. Only these are listed and run on Edit; writing skills
 * and skills about other things (transcripts, thumbnails, scraping) are not, even when they mention videos.
 */
const VIDEO_WORK=/\b(hyperframes|remotion|b-roll|motion[- ]graphics?|motion[- ]design|showreel|video effects?|video[- ]edit(or|ing)?|video creation|talking-head|explainer|mp4)\b/i;
export const isVideoSkill=(skill:{name:string;description:string})=>VIDEO_WORK.test(`${skill.name} ${skill.description}`);

/** The person's own choices for Edit: skills they added and skills they took away. These win over everything else. */
export type EditSkillChoices={on:string[];off:string[]};
/** Why a skill is or is not on Edit: you chose, the skill says it is for Edit, it was picked from its description, or none of these. */
export type EditSkillReason='added'|'removed'|'declared'|'auto'|'none';
export type EditSkill=InstalledSkill&{on:boolean;reason:EditSkillReason};
/** Whether a skill shows and runs on Edit, and why: your choice first, then the skill's own `creatorclub: edit`, then the automatic pick. */
export function editSkill(skill:InstalledSkill,choices:EditSkillChoices):EditSkill{
  if(choices.off.includes(skill.name))return {...skill,on:false,reason:'removed'};
  if(choices.on.includes(skill.name))return {...skill,on:true,reason:'added'};
  if(skill.forEdit)return {...skill,on:true,reason:'declared'};
  return isVideoSkill(skill)?{...skill,on:true,reason:'auto'}:{...skill,on:false,reason:'none'};
}
/** One plain line on why, for Settings. */
export const EDIT_SKILL_WHY:Record<EditSkillReason,string>={added:'You added it',removed:'You took it off',declared:'The skill says it is for Edit',auto:'Picked because it edits or makes video',none:'Not a video skill'};

/** The few skills the "/" list shows first: the writing skills from the chips and the video and motion skills. Typing a name finds any other installed skill. */
export const FEATURED_SKILLS=['write-hook','write-setup','build-points','write-cta','reel-editor','motion-graphics','motion-showreel'] as const;
/** The featured skills that are installed, in the order above. */
export const featuredSkills=(skills:readonly InstalledSkill[]):InstalledSkill[]=>FEATURED_SKILLS.flatMap(name=>skills.filter(s=>s.name===name));
