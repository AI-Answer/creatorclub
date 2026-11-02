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
export type InstalledSkill={name:string;description:string;/** Files inside the skill that show what it makes (a page, a GIF, an image, a short video), best first. */previews:string[]};
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
 * Whether a skill edits or makes video, judged by what its own description says (HyperFrames, Remotion, b-roll, motion graphics,
 * video effects, a video editor, rendering, explainers, talking-head edits). Only these are listed and run on Edit; writing skills
 * and skills about other things (transcripts, thumbnails, scraping) are not, even when they mention videos.
 */
const VIDEO_WORK=/\b(hyperframes|remotion|b-roll|motion[- ]graphics?|motion[- ]design|showreel|video effects?|video[- ]edit(or|ing)?|video creation|talking-head|explainer|render(s|ing)?|mp4)\b/i;
export const isVideoSkill=(skill:{name:string;description:string})=>VIDEO_WORK.test(`${skill.name} ${skill.description}`);

/** The few skills the "/" list shows first: the writing skills from the chips and the video and motion skills. Typing a name finds any other installed skill. */
export const FEATURED_SKILLS=['write-hook','write-setup','build-points','write-cta','reel-editor','motion-graphics','motion-showreel'] as const;
/** The featured skills that are installed, in the order above. */
export const featuredSkills=(skills:readonly InstalledSkill[]):InstalledSkill[]=>FEATURED_SKILLS.flatMap(name=>skills.filter(s=>s.name===name));
