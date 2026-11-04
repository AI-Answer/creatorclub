# Heptabase dark theme

Issue #9 / epic #16. Values read from the installed app's read-only extraction at `/tmp/hepta/extract/build/assets/main-DCrId0Zf.css`, specifically `:root,[data-theme=light]` and `[data-theme=dark]`. The bundle's `.border-active` and `.text-primary` utilities reference `--active-item` and `--text-color`; `useChangeAppTheme-Ch50NDsU.css` uses those variables for editor text, caret and links. These are static bundle observations, not sampled screenshots.

| Heptabase variable | Dark value | Creator Compiler token |
| --- | --- | --- |
| `--background-primary` | `#212121` | `--cc-bg`, global `--background` |
| `--background-secondary` | `#242629` | `--cc-surface`, `--cc-surface-2`, `--cc-card-bg`, global `--surface` / `--secondary` |
| `--whiteboard-background` | `#191919` | `--cc-board-bg`, `--cc-bg-sunk` |
| `--whiteboard-grid-dot` | `rgba(255,255,255,.18)` | `--cc-board-grid` |
| `--menu-bg` | `#3d4046` | `--cc-popover-bg`, `--cc-toast-bg` |
| `--text-color` | `#e1e1e1` | `--cc-text`, global `--foreground` |
| `--middle-hard-grey` | `rgba(255,255,255,.65)` | `--cc-text-2`, `--cc-placeholder`, global `--muted` |
| `--text-gray-editor` | `#b0b0b5` | `--cc-text-3` |
| `--middle-grey` | `rgba(255,255,255,.36)` | `--cc-text-faint`, `--cc-line-hover`, `--cc-card-border-hover` |
| `--light-grey` / `--border-grid` | `rgba(255,255,255,.08)` | `--cc-line`, global `--line` |
| `--light-middle-grey` | `rgba(255,255,255,.12)` | `--cc-line-strong`, `--cc-card-border`, `--cc-scrollbar` |
| `--ultra-light-grey` | `rgba(255,255,255,.06)` | `--cc-hover`, global `--input` |
| `--active-item` | `#61c6fa` | `--cc-selection`, `--cc-accent`, `--cc-accent-text`, global `--focus-ring` / `--accent` |
| `--middle-transparent-blue` | `rgba(35,131,226,.2)` | `--cc-accent-soft`, global `--accent-soft` |
| `--text-selection-background` | `rgba(35,131,226,.3)` | `--cc-selection-bg` |
| `--bg-white-sect` (`--light-grey-rgb: 47,48,49`) | `rgba(47,48,49,.5)` | `--cc-section-bg` |
| `--bg-white-wb-hsl` | `210,2%,19%` | `--cc-section-title-bg: hsl(210 2% 19%)` |
| `--scrim-color` | `rgba(0,0,0,.64)` | `--cc-scrim` |
| `--shadow-float`, `--shadow-card`, `--shadow-main` | Shipped shadow stacks | `--cc-shadow-1`, `--cc-shadow-2`, `--cc-shadow-3` |
| `--bg-red`, `--bg-green`, `--bg-yellow` | `#4a2126`, `#0f3830`, `#403814` | `--cc-danger-soft` / `--cc-rec-soft`, `--cc-ok-soft`, `--cc-warn-soft` / `--cc-note` |

The primary action stays white in dark mode. Text on the lighter accent blue uses Heptabase's `--info-color: #222`, rather than white. Brand/provider artwork and timeline kind colours retain their identities. Neutral section-title colour is an adaptation of Heptabase's whiteboard colour, rather than a separately named Heptabase title variable.

The existing `.menu` and `.help-pop` surfaces receive `--cc-popover-bg` through a dark-only local `--cc-bg` override in `borumi.css`. The inherited text retains enough contrast on that raised surface. Secondary text deliberately uses Heptabase's 65% white or editor grey; the 36% white token is reserved for faint/decorative elements.

## Light board primitives

Existing light declarations are preserved. New board values follow Heptabase light: board `#eeeded`; dots `rgba(0,0,0,.2)`; card `#fff`; card border `rgba(0,0,0,.13)`; hover border `rgba(0,0,0,.32)`; selection outline `#207dff`; text selection `rgba(75,155,230,.3)`; section `rgba(225,225,225,.4)`; section title `hsl(0 0% 88%)`.

## Contrast

WCAG sRGB luminance, with translucent text composited against the background before calculating the ratio. Body target ≥4.5:1; secondary target ≥3:1.

| Background | Body `#e1e1e1` | Secondary 65% white | Tertiary `#b0b0b5` |
| --- | ---: | ---: | ---: |
| Board `#191919` | 13.44:1 | 7.97:1 | 8.14:1 |
| App `#212121` | 12.31:1 | 7.53:1 | 7.46:1 |
| Panel/card `#242629` | 11.60:1 | 7.23:1 | 7.02:1 |
| Popover `#3d4046` | 7.95:1 | 5.48:1 | 4.81:1 |

With the 6% white hover layer, the worst case is the popover: body 6.64:1, secondary 4.78:1, tertiary 4.02:1. `design-system.test.ts` checks all four surfaces with and without hover and checks text on the accent fill.

## Integration boundary

`appearance.ts` contains no colours and needs no change. Both dark root blocks in `original-theme.css` are updated because that file is loaded by `main.tsx`; `creator-theme.css` is also kept consistent, although it is not currently imported there.

The board owner consumes the new board/card/section tokens in `workspace/board.css`. Live headless Chrome verification resolved `.canvas-scroll` to `rgb(25,25,25)` with `rgba(255,255,255,.18)` dots. Existing text-selection rules in `club.css` still synthesize a fill from `--cc-accent` or use `--cc-accent-soft`; their owner can switch those to `--cc-selection-bg`. No component/layout rules were changed here.

### Untouched component colours

- `original-theme.css:17`: preview/stage `#171717`; timeline label `#a3a3a3`; automation/rail hover `#404040`; active rail hover `#e5e5e5`; warning `#422006` / `#fde68a` / `#fef3c7`. These are component rules, beyond this token-only change.
- `original-theme.css:80`, `take-review.css:19`: destructive hover `#fca5a5` and `rgba(127,29,29,.25)`; take review also uses `#7f1d1d`.
- `timeline-interactions.css:50`: dark timeline `#0e0e0e`, row `#181818`, label `#8c8c8c`.
- `transcript.css:20`: selection `hsl(224 50% 26%)`, muted `#8a8a8a`, faint `#6b6b6b`, hover `#1f1f1f`, danger `#fca5a5` / `#450a0a`; focus uses `#3b82f6`.
- `ai-settings.css:20-21`: white/near-black actions and `#e5e5e5` hover.
- `recording.css` and `recording-scene-cards.css`: recorder/capture-specific dark tokens remain owned by the recorder code.
- Concurrent `workspace/board.css` / `workspace/outliner.css`: raw colour fallbacks (including `#4c9aff`, `#779ee8`, `#8eb5ff`, and grey text) remain in those owners' files. The outliner also references `--cc-text-muted` / `--cc-link`, which are not existing club token names (`--cc-text-3` / `--cc-accent-text` are available).
