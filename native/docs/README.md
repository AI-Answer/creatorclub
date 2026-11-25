# Screenshots

All taken on 2026-11-24 on a Mac Studio (macOS 27, Xcode 27.1) with Exact `1aca3f837`.
Except `release-app.png`, each one comes from Exact's agent driver (`bun exact.mjs agent macos --chrome
platform … "screenshot <png> window"`). That driver runs the development build: the real AppKit window,
with its sidebar, toolbar and native lists. The data is the sample channel from
[`../tools/demo-service.mjs`](../tools/demo-service.mjs), on port 4199.

| File | What it shows |
|---|---|
| `board.png` | The Video board: six lanes, live from `GET /api/club/videos` (Published is off to the right; the board scrolls sideways) |
| `board-after-drag.png` | The same board after `tap grip-v_f0f8e10e77fa drag to list-recording`. "Recording setup under $500" moved from Planning to Recording. The driver's log shows `POST /api/club/videos/v_f0f8e10e77fa/move`, then a reload. Afterwards the service listed it in `recording` at order 2 |
| `board-dark.png` | The same window with `prefer color-scheme dark`. Dark mode needs no extra code: AppKit draws it, and `lane.ground` in `app.forma` has a dark value |
| `research.png` | Research from `GET /api/club/channel/research`, newest first. Tapping the Exact link logged `command openURL("https://github.com/expo/exact")` |
| `editor.png` | A card opened. The existing web editor (timeline, canvas, tools) runs inside the native window as an `iframe`, which is a WKWebView on macOS. The toolbar's share button logged `openURL("http://127.0.0.1:4199/#/video/v_3a2c4741db0d")` |
| `release-app.png` | The **release** `.app` (`bun exact.mjs mac --release`, 24 MB, `trust: production`, signed with an Apple Development identity), launched with `open` and captured with `screencapture -l <window>`. Exact's driver doesn't drive release builds. It opened in dark mode because the Mac was in dark mode |
| `chat-template-mac.png`, `chat-template-mac-open.png` | The `chat` template from `expo/exact-templates`, built for macOS and driven the same way (`tap conversation-priya`). It needed `app.tamber` renamed to `app.forma` and its header changed before current Exact would build it (see FEASIBILITY.md) |
