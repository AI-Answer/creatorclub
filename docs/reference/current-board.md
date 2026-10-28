# Current board: screens, labels, problems

Source: `/Users/danizal/dani/youtube-knowledge-vault/clients/samin/board` (paths relative to this root). Read from code; the running app on :3101 was not driven.

## Status labels

| Stored (`lib/types.ts`) | Shown as |
|---|---|
| `new` | New |
| `picked` | This week |
| `outline` / `recorded` / `edited` / `published` | Outline ready / Recorded / Edited / Published |
| `parked` | Later |
| `dropped` | Skipped |

## Shell (`components/BoardApp.tsx`)

- Nav: **Overview**, **Ideas**, **Trending**, **Signals**, **Production**. Badges: Ideas = New + Later; Production = all in-production (includes This week).
- Titles: Signals page is titled **X and Reddit**.
- Search box (placeholder **Search**). Ignored on Overview.
- Header icons: **Update now** (refresh trending), **Share** menu: **Copy where things stand**, **Download a snapshot**.
- Client switcher (`ClientSwitcher.tsx`): subtitle **Video ideas**; **New client**.

## Overview (`components/views.tsx`)

Stat cards **New ideas**, **In production**, **Published**, **Later**. Sections **In production** (**Open**), **Next up** (**Generate ideas**, **All ideas**; 4 newest New), **Trending now** (**See all**).

## Ideas (`IdeasBoard`)

- Toolbar: **Generate ideas** menu (**From what is trending**, **From a video**, "Or type a topic"); info icon "How ideas are chosen"; **Add an idea** form ("Working title", **Type**: Evergreen / Timely / Both, **Add**, **Cancel**); **In production** pill; **Skipped** toggle.
- Columns **New**, **This week**, **Later** (+ **Skipped**). Drag between columns.
- Card icon buttons (hover tooltips): New → "Make this one", "Later", "Skip". Staged → "Next: {stage}", "Back to {prev}" / "Back to New", "Later". Later → "Make this one", "Skip". Skipped → "Restore".

## Idea drawer (`IdeaDrawer.tsx`)

- Sections: **Production** stepper; **Outline file** (path input); **YouTube link**; signals **Demand**, **Gap**, **Easy to show**; **The video**, **His twist**, **Opening line**; **Sources**; **Your note**.
- Footer: **Make this**; next-stage name (e.g. "Outline ready"); **Back** / **Back to ideas**; **Later**; **Skip** (hidden when staged) or **Restore**; **Write the video**; **Copy request**.
- Skip opens "Why skip it?": **Too generic**, **Not their style**, **Already covered**, **Can't show it**, **Bad timing**, **Cancel**, **Skip**.

## Write the video (`WriteDialog.tsx`, title "Write: {idea}")

- Tabs **Brief**, **Outline**, **Script**, **Review**. Buttons: **Suggest a brief** / **Suggest again**, **Write the outline**, **Write the script**, **Review the script**, **Next: the outline**, **Build the voice guide**.
- Brief fields: **Working title**, **Thumbnail idea**, **Promise**, **Who it is for**, **What to show**; **Format** (**Three levels**, **Opinion with demos**, **Tour and setup**); **Length** (**Short (8 min)**, **Medium (15 min)**, **Long (30 min)**).
- Stage pages: **Your direction, optional**; **Full script** / **Talking points**; **Counted against {firstName}'s real videos**.
- Footer: **Copy**/**Copied**, **Edit**, **Write again**, **Save**, **Cancel**.

## Trending (`Trending`, `TrendCard.tsx`)

**Show**: **For {firstName}**, **Followed**, **News**, **All**. **Sort by**: **Per day**, **Total**, **Growth**. Card button **Get ideas from this video**; tooltips "Total views", "Views per day since it went up"; **New** chip.

## Signals (`SignalsView.tsx`, nav "Signals", title "X and Reddit")

**Source**: All / X / Reddit; **Choose sources**; post button **Get ideas from this**.

## Choose sources (`SourcesDialog.tsx`)

Fields **X handle**, **Topics, separated by commas**, **What the channel is about, one line**; **Find** (busy **Looking**); sections **YouTube channels in this niche**, **Accounts @{handle} follows**, **Maybe**, **Subreddits, with last week's activity**; footer **Cancel**, **Save** (busy **Saving and reading posts**).

## Ideas from a video (`VideoIdeasModal.tsx`)

Input "Paste a YouTube link", **Get ideas** (busy **Working**). Steps: "Reading the video", "Reading the transcript", "Reading the comments", "Writing concepts". Results: **Why it worked**, **What viewers ask**, **Concepts for {firstName}, added to your board**, **Add to board** / **On the board**, **Add all**.

## Production (`ProductionBoard`)

Columns **This week**, **Outline ready**, **Recorded**, **Edited**, **Published**. Drag between them. No Later or Skipped.

## Confusing

1. **Three counts for "in production."** Overview and Production count This week; the Ideas pill does not.
2. **Ideas badge ≠ "New ideas" card.** Badge = New + Later.
3. **Search is dead on Overview.** `Overview` ignores `query`.
4. **Five names for generating ideas**: Generate ideas, Find, Get ideas, Get ideas from this, "the check" ("press the check" points at no control). README says "Find new ideas".
5. **Wrong path in criteria dialog.** It says `data/criteria.md`; the file is `workspaces/<client>/criteria.md`.
6. **Primary button names a state.** **Outline ready** moves the idea into that state. **Back to ideas** actually sends it to New.
7. **Same action, three names**: Make this / Make this one / This week.
8. **Skip is hidden while This week**; the user must press Back first, with no hint.
9. **"Outline" means three things**: stage, tab, and a manual **Outline file** path that duplicates what Write the video creates.
10. **Write again overwrites with no confirm** (`WriteDialog.run`; `scripts/write-video.py` writes `{stage}.md`). Manual edits are lost.
11. **Concepts land without a choice.** `VideoIdeasModal` auto-adds every concept, so "Add to board" is mostly dead.
12. **Jargon**: Brief, Type (code: lane), "For {firstName}" (code: fit), "/d", usual views, voice guide, habit phrases, decisive rows, criteria, Copy request (pastes "Build the outline for: ..." into Claude).
13. **Three names for one area**: Signals / X and Reddit / Choose sources. "Sources" also means the drawer's link list.
14. **Icon-only card actions** that show labels only on hover. Invisible on touch.
15. **Dead or hidden data**: the Top pick star has no setter in the UI; skip reasons are never shown back.

## Keep

- **Data model** (`lib/types.ts`): demand/gap/show signals (high/mid/low + note), `stageDates`, `outlinePath`, `videoUrl`, `angle`/`twist`/`hook`, `dropReason`, per-video `day7` vs `usualViews`, trending history.
- **Flows**: video or trend → concepts → New → This week → outline → recorded → edited → Published with link → views → 7-day result (`ResultChip`).
- **Undo toast** on every stage move (`lib/useBoard.ts`, 6 s).
- **Skip reasons** feed the next check.
- **Brief and script metrics** against the creator's own transcripts.
- **Share**: plain-text status plus one HTML snapshot for the client.
- **Banners and empty states** with one action each.
- **Local-first** (README).
