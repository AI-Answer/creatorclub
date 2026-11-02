# Eden reference

Source: Samin's workspace at `app.eden.so/w/samin`, looked at on 2026-10-28 in the app's built-in browser, plus Eden's help center (`eden.so/help`). I only looked: I opened views and closed dialogs, and created nothing.

## Look

- Warm off-white background, white cards with soft rounded corners, black primary buttons.
- One bold condensed display heading per page ("Good evening", "Content planner"). Small grey sidebar text.
- Very few controls on each screen. This is close to the cal.com/Notion direction we chose.

## Layout

- **Sidebar:**
  - `New`, `Library`, `Discover`, `Strategy` (Beta), `Planner`, `Publish`
  - `Your access`
  - `Team Boards`: one entry per project board
  - Workspace switcher at the bottom
- **Home:**
  - Greeting
  - Four start cards, each with a one-line description: Capture an idea ("Jot a quick thought or note"), Start a document, Chat with Eve, Start a table
  - Then `Recents` (empty state: "Your recent docs, boards, and store work will show up here."), `Reading` and `My lists`
- **New menu:** Capture (⌘⇧K), New document, New chat, Paste link, New card, New board, New folder.

## Planner (their content board)

- **Views:** `Board` · `Table` · `Calendar` · `List`. Toolbar: `All items`, `Edit view`, `Group: Status`, `Add property`, and a black `+ New`.
- **Columns:** default statuses `Potential idea` · `Next up` · `In progress` · `Done`. You can rename them (`Add status`). Each column has `+ Add item`.
- **First-visit dialog "How your planner works":**
  - Opening line: "Every idea is a planner item. Plan it on the board, then open it to write it and post it, all in one place."
  - Three numbered steps, each with a small picture: **1 Plan it**, **2 Research and write**, **3 Write and schedule posts**.
  - Ends with "Open this again with the ? next to New." and a `Start planning` button.
- **Items open as a side panel**, not a new page. Tabs: `Plan` · `Research` · `Content` · `Posts`.
  - **Plan:** Status chips, Notes, Platform chips (YouTube, Reels, TikTok, X, LinkedIn, Threads, Newsletter), Post day, Assigned to, `Add property`.
  - **Research:** "Gather what this needs before you write. Make a board for links, posts, and notes, or keep it in a doc." Buttons: `Make a board` (primary), `Write a doc`, `Link from Library`.
  - **Posts:** "Add the video or photos, pick a time, and the item moves itself." **Eden moves the card for you when the work is done.**

## Boards (their research canvas, Poppy-like)

- A free canvas of cards: video cards and note cards.
- **Video card:** thumbnail, title, channel avatar, age, views, an **outlier chip** ("2.6×"), and a platform icon.
- **Floating bottom toolbar:** add, chat, AI, share. **Right rail:** view modes and settings.
- **First-visit tip:**
  - Title: "Capture ideas, outline, and write on boards"
  - "Add cards, documents, or items to the board"
  - "Paste links to social posts"
  - "Chat with the items on your board"
  - "Get post variations and more"
- **Opening a video card** shows:
  - author and date
  - `Copy text`, `Thumbnail`, `Open on YouTube`
  - a stat row: **2.84× vs views**, 7.6M views, 140K likes, 12K comments
  - `Note`, title, description
  - **Transcript** in reader mode, split into chapters

## Reverse-engineer a video (from the help center)

- Open a video, click the sparkle **Send to Eve**, then pick:
  - **Reverse engineer it.** Eve writes a breakdown document covering:
    - title and packaging
    - how fast the opening hooks
    - the structure beat by beat
    - what keeps people watching
    - the payoff
    - what to steal
    - **a reusable outline** at the end
  - **Write my version.** You type your topic, audience and platform. Eve writes your video "in the same shape. It borrows the structure, never the words."
  - **Give me title ideas.** Takes on its title.
- The work runs in the background. The finished breakdown appears under Updates with an `Open doc` button.

## Outlier multiplier (exact method, from the help center)

1. Take the creator's last 30 posts of the same kind, or every post from the past 7 days if that's more.
2. Find the median of those posts.
3. Divide each post's views by that median. YouTube and TikTok use views; X uses likes.

Adjustments:
- New posts get a projected final count, so they don't look like flops.
- Fast-growing accounts are compared on views per follower.

"Top N%" ranks a post against every post Eden has from that creator, needs at least 20 posts, and only shows for the top 10%.

Colour bands:

| Multiplier | Colour |
|---|---|
| Under 1× | grey |
| 1–3× | blue |
| 3–5× | green |
| 5–10× | amber |
| 10–50× | orange |
| 50× and up | red |

Under 10× shows two decimals; from 10× up it rounds.

## Discover and Strategy

- **Discover:** tabs `Discover` · `Creators` · `Brands` · `Lists`. A search box, then filters ("6 platforms · Last 6 months · 5× · Top 10%"), `Posts` / `Ads`, shelves `Breakouts` · `Hidden gems` · `Viral now` · `All-time greats`, and topic chips. This maps to our v1.1 Signals.
- **Strategy:** "Let's build your content strategy." A guided flow of about three minutes that returns your main themes, the topics getting views in your space, and ideas to post this week. This maps to our "Add your channel" step.

## What Creator Compiler takes

1. **Card moves itself** when the work is done ("the item moves itself"). This settles the open question in PLAN.md: the "Continue to …" buttons move the card, and you can still drag.
2. **Break down output** in Eden's shape, plus our viewer questions and 3 concepts. It ends with a **reusable outline**. "Create outline" can then follow that outline's shape: the structure, never the words.
3. **Outlier chip** on every video tile and breakdown, calculated exactly as above and coloured by the same bands. The data comes free from yt-dlp (the channel's last 30 uploads).
4. **First-visit dialog** on the board: three numbered steps with small pictures and one button. It doesn't come back unless you open it again from `?`.
5. **Research step buttons** in Eden's style: one primary action and two quiet ones.
6. **Video detail view:** a stat row, then a transcript split into chapters.

We don't copy the side-panel item view. Our video page is full screen because recording and editing need the room.
