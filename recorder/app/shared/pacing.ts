import { clipDuration, projectDuration, type Project } from './types.js';

/*
 * The pacing check (screenplay's rules): a viewer should see something change on screen every few seconds. Changes are cuts in the
 * picture, graphics, text, blurs, zooms and overlays coming or going; captions are not counted, since they change all the time.
 * Pure, so the skill's brief, the reply under a plan and the MCP tool all read the same verdict.
 */

/** Longer than this with nothing changing on screen is flagged. */
export const STATIC_MAX_S = 6;
/** A graphic shorter than this cannot be read. */
export const GRAPHIC_MIN_S = 1;

export interface PacingIssue {
  kind: 'static' | 'overlap' | 'short';
  start: number;
  end: number;
  text: string;
}

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const EPS = 1e-3;

/** What draws over the picture for a while: motion graphics, text and blur elements, overlay clips. */
function graphics(p: Project) {
  return [
    ...(p.motion ?? []).map((m) => ({ start: m.start, end: m.start + m.duration, name: 'a graphic' })),
    ...p.elements.map((e) => ({ start: e.start, end: e.start + e.duration, name: e.type === 'blur' ? 'a blur' : 'a text' })),
    ...p.clips.filter((c) => c.track === 'overlay').map((c) => ({ start: c.start, end: c.start + clipDuration(c), name: 'an overlay' })),
  ];
}

export function pacingIssues(p: Project): PacingIssue[] {
  const length = projectDuration(p);
  if (length <= 0) return [];
  const shown = graphics(p);
  // Every moment the picture changes: a clip starts or ends on a picture row, a graphic or a zoom comes or goes.
  const moments = new Set<number>([0, length]);
  for (const c of p.clips) if (c.track === 'screen' || c.track === 'camera' || c.track === 'overlay') {
    moments.add(c.start);
    moments.add(c.start + clipDuration(c));
  }
  for (const g of shown) { moments.add(g.start); moments.add(g.end); }
  for (const z of p.zooms) { moments.add(z.start); moments.add(z.start + z.duration); }
  const times = [...moments].filter((t) => t >= 0 && t <= length + EPS).sort((a, b) => a - b);
  const issues: PacingIssue[] = [];
  for (let i = 1; i < times.length; i++) {
    const [a, b] = [times[i - 1], times[i]];
    if (b - a > STATIC_MAX_S + EPS) issues.push({ kind: 'static', start: a, end: b, text: `${clock(a)}–${clock(b)}: ${Math.round(b - a)} s with nothing changing on screen` });
  }
  const sorted = [...shown].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end - EPS; j++)
      issues.push({ kind: 'overlap', start: sorted[j].start, end: Math.min(sorted[i].end, sorted[j].end), text: `${clock(sorted[j].start)}: ${sorted[i].name} and ${sorted[j].name} on screen together` });
  for (const g of shown) if (g.end - g.start < GRAPHIC_MIN_S - EPS) issues.push({ kind: 'short', start: g.start, end: g.end, text: `${clock(g.start)}: ${g.name} on screen for under ${GRAPHIC_MIN_S} s` });
  return issues.sort((a, b) => a.start - b.start);
}

/** The verdict in a few lines for a reply or a brief; empty when the pacing is fine. */
export function pacingText(p: Project, max = 8): string {
  const issues = pacingIssues(p);
  if (!issues.length) return '';
  const shown = issues.slice(0, max).map((issue) => `- ${issue.text}`);
  return [`Pacing: ${issues.length} ${issues.length === 1 ? 'spot' : 'spots'} to look at`, ...shown, ...(issues.length > max ? [`- and ${issues.length - max} more`] : [])].join('\n');
}
