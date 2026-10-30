# Tella vs CreatorClub Edit — findings (2026-10-30)

Structure and wording only. No Tella code or assets were copied.

## What was and was not observed

| Target | Status |
|---|---|
| Tella macOS app, pre-record window (`/Applications/Tella.app`, screenshot) | **Observed.** The window was minimized; it was brought back, nothing was clicked, no recording started. |
| Tella macOS app, island while recording | **Not observed.** It only appears once recording starts, which would use the camera and write a recording to the account. |
| Tella web editor and its chat with skills | **Not observed.** The Chrome window the tools control is not signed in to Tella (tella.com shows "Log in / Sign up"). Signing in means entering credentials, which stays with the user. |
| Tella binary (Ghidra) | Not done: Ghidra is not installed. |

## 1. Recorder window (observed)

- **Tella does:** one small window, the camera preview fills it. Top bar: two quality pills (both "1080p"), a cursor-effects toggle, a music toggle, a burst toggle, a "…" menu. Bottom: one large red record button, with three pickers under it (microphone, camera, display), each labelled with the device name.
- **We do:** Record is a page: camera preview top-left, a status line ("Starting camera and microphone…"), a "Record scene 1 again" button, a Takes list, and the scene's talking points on the right.
- **Change (inference):** our page is richer because of scenes and talking points; the part worth borrowing is the three device pickers as one row under the record button. We already have "Change" for devices; a row of three named pickers would show the current mic, camera and screen at a glance. Not built yet.

## 2. Chat with skills (web: not observed)

No Tella observation. The skills picker below follows what the user asked for, not Tella.

- **We do (before):** the companion loaded only four writing skills, and only from chips or from typing the skill's name.
- **Changed:** typing "/" in the chat lists the person's installed skills (`~/.claude/skills`) with a one-line description. Arrow keys and Enter choose, Esc closes. Sending a message that starts with `/name` adds that skill's instructions to the reply. Skill names are checked as plain folder names before anything is read.

## 3. Editor layout (web: not observed)

Nothing to compare against Tella. Our Edit stays as it is: left tool rail, one black "Continue to publishing" button, Export video as the outline button.

## Open items
- Sign in to Tella in the Chrome window the tools control (or tell me to use another), then the editor and chat comparison can be done passively.
- Start a recording in Tella yourself and leave the island up, and I can screenshot it.
