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
