/*
 * The angle as a viewer reads it. A package's angle is the one sentence that promises what the viewer gets, but the planning step has
 * sometimes written its own working notes after it ("Brief was empty, so I chose title, viewer, format and proof myself. The format is …").
 * Those notes are for the maker, so a YouTube description never carries them.
 */
const OWN_NOTES=/\bbrief (?:was|is|says|said|had|asked)\b|\b(?:the|this|your|no|an empty) brief\b|\bI (?:chose|picked|decided|assumed|made up)\b/i;

/** The angle up to the first sentence that talks about the brief or about the planner's own choices, and nothing after it. */
export function describeAngle(angle:string):string{
 const sentences=angle.replace(/\s+/g,' ').trim().match(/[^.!?]+(?:[.!?]+|$)/g)??[];
 const notes=sentences.findIndex(sentence=>OWN_NOTES.test(sentence));
 return (notes<0?sentences:sentences.slice(0,notes)).join('').trim();
}
