# Recording synchronization investigation

Investigated 2026-11-03 on `samin/recording-sync`, based on `085a763`. The production studio was read only. Project, capture metadata, media, history and probes were copied to `/tmp/cc-sync-debug/`; experiments and output stayed there or in test-created temporary directories.

## Evidence from the reported take

Project `856ab215-af8c-4c37-b076-aee32217fc0c`, take `d2829a3a-7655-4b85-9d99-2a316f646d09`:

| Source | Container duration | Stream duration | Format / stream start | First packet / decoded PTS | Time base | Rate | Payload |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Camera, H.264 MP4 | 0.233433 s | 0.233433 s | 0 / 0 | 0 / 0 | 1/30000 | nominal 30; average 210000/7003 = 29.987148 fps | 7 frames |
| Microphone, Opus WebM | 0.180000 s | absent; DURATION tag 0.18 s | 0 / 0 | 0 / 0 | 1/1000 | 48000 Hz, mono | 3 x 2880 samples = 8640 samples |
| Screen, H.264 MP4 | 0.391667 s | 0.391667 s | 0 / 0 | 0 / 0 | 1/600 | 30/1 fps | 12 frames |

No audio stream exists in either video file. Packet durations are about 33.33 ms for video and 60 ms for microphone audio. The camera varies slightly between frame intervals; its project duration rounds to 0.234 s. That sub-millisecond difference cannot explain the visible discrepancy. Full stream/format/first-and-last-frame evidence is in `/tmp/cc-sync-debug/probes.json`.

The final JSON contains:

| Source | Clip start | sourceIn | sourceOut | Timeline end |
| --- | --- | --- | --- | --- |
| Camera | 0.3919770586 | 0 | 0.234 | 0.6259770586 |
| Microphone | 0.4499770586 | 0 | 0.18 | 0.6299770586 |
| Screen | 0.391667 | 0 | 0.391667 | 0.783334 |

The caption starts at 0.4499770586 s, matching the microphone clip. It is not a fourth independent capture. Its words run through 0.5699770586 s. There is no evidence of a separate transcription-clock error in this take.

The earlier history snapshot `1793752452264-7d932977-f9b3-4256-a99c-cb24a68d829a.json` has the same clip IDs starting at 0.0003100586, 0.0583100586 and 0 respectively, with scene duration 0.391667. The later snapshot has all clips shifted by exactly 0.391667 and scene duration doubled. Calling `activateSceneTake(..., 'keep-both')` on an already active take reproduced that placement error; it appended the take to itself.

## Causes

1. Native screen capture starts first. Browser recording starts only after the native first-frame response. Old browser anchors used the `start()` call for MP4 and the asynchronous `start` event for WebM. Neither establishes the first sample actually sent to the encoder. The saved source offsets were camera +0.310 ms, microphone +58.310 ms, screen zero. The old metadata does not retain enough sample-level timing to establish actual physical-device latency retrospectively.
2. Each clip used its own file duration and positive offset; the take used their maximum endpoint. No import stage removed startup skew or padded missing media to a common interval. The actual short payloads above prove that missing container duration is not the cause of this particular take.
3. Active-take activation through keep-both could shift the same take and its captions to the old scene end. The history demonstrates this happened after the initial confirmation, rather than the recorder inserting the original leading gap.

## Current implementation (non-destructive revision of `2dcf3fc`)

- `src/recording-samples.ts` still relays the same samples to MediaRecorder that it timestamps. Pre-roll is discarded while native capture prepares; first-sample epochs, source timestamps and native CMSampleBuffer provenance are preserved.
- `server/recording-sync.ts` only probes timing and returns the original media IDs and paths. MP4 video sample-table duration (`duration_ts * time_base`) and PCM/AAC stream timing avoid a frame scan. Unindexed video uses streaming packet PTS/duration bounds. Opus audio uses packet TOC sample counts minus pre-skip/discard-padding, avoiding millisecond container rounding and audio decoding even for live WebM without Duration. Older ffprobe versions (including the bundled 4.4.1) cannot expose Opus skip/discard packet side data, so they use the bounded-memory decoded-audio fallback. Other audio codecs lacking exact stream timing use that fallback too; video is never decoded frame by frame.
- The microphone supplies the clock; without a microphone, the screen, then the first source supplies it. Its decoded duration is the take duration. For each source, `offset = (firstSampleAtMs - clockFirstSampleAtMs) / 1000`, `start = max(0, offset)`, `sourceIn = max(0, -offset)`, and `sourceOut = min(decodedDuration, sourceIn + clockDuration - start)`.
- Late sources start late; early sources trim their heads. Long sources end at the microphone endpoint, and short sources end early. There is no freeze-frame, synthetic silence, stretching or re-encoding after Stop. Sources with no samples overlapping the clock are rejected explicitly, as before.
- The route keeps its `{media, offsets, synchronization}` response. `offsets` contains nonnegative clip starts for the existing client, while the version 2 `TakeSynchronization` record retains signed offsets, original provenance and per-source `sourceIn`/`sourceOut`. Returned media durations are corrected by the probe (including live WebM with no Duration); no media files, manifest folders or catalog entries are written by synchronization. The record persists with the project take through the existing save flow.
- `shared/take-timing.ts` supplies the ranges consumed by `scene-takes.ts` initialization and `recorded-takes.ts` preview. Take review seeks inside those source ranges, pauses audio outside them and hides video outside its clip interval. The initial take duration stays on the microphone clock. Version 1 records continue to reference the previously normalized files; legacy takes and manual offset edits retain their existing behavior.
- Caption generation uses the existing narration source-to-timeline mapping on the original microphone, whose start and sourceIn are zero. Captions and word timestamps therefore remain on the microphone clock without a second adjustment.
- The keep-both self-append fix remains intact. Existing edited timelines are never reinitialized or migrated.

## Verification

Synthetic FFmpeg regressions cover earlier/later source epochs, nonzero video PTS, unequal source lengths, exact clip start/sourceIn/sourceOut, common microphone endpoints for sufficiently long sources, early endings for short sources, fractional-frame tails, visual events within one frame, caption/word mapping, keep-both idempotence, metadata persistence and unchanged original hashes. Filesystem snapshots before/after synchronization verify that no new assets, aligned folders or catalog entries appear. Live Opus tests cover 2.5, 20 and 60 ms packets, pre-skip and end-discard without Duration. Related take tests cover version 1 normalized-file compatibility and version 2 trims through manual sync, archive and restore.

The automated long-take regression creates a 600-second 3840×2160 H.264 MP4 by stream-copy looping a one-second synthetic seed, plus 600 seconds of live Opus audio. Fixture generation/import are outside the measured interval. Only `synchronizeRecording` is timed, with a 2.5-second guard and unchanged filesystem assertion. This tests duration scaling without spending minutes generating a complex 4K source; compressed picture content does not affect sample-table probing.

Prior investigation evidence in `/tmp/cc-sync-debug/` describes the superseded normalized-file implementation and must not be treated as acceptance of this revision. Physical camera/microphone/screen capture, driver latency and long-duration device-clock drift remain untested. Browser epochs describe the first forwarded sample's delivery boundary; device-internal capture latency and renderer stalls are not calibrated. Existing pause-transition skew warnings remain applicable.

Validation on 2026-11-03: `npm run build` passed (TypeScript and Vite; existing chunk-size advisory). The focused sync/take/card regressions passed 37/37. The six sync regressions also passed using bundled ffprobe 4.4.1. The 600-second 4K + live Opus synchronization took 497.2 ms in the full serial suite and 398.6 ms with bundled ffprobe; simultaneous focused verification measured 929.9 ms, all below the 2.5-second guard.

`npm test` ran serially with an isolated temporary `SCENEFORGE_DATA_DIR`: 1,664 passed, two failed, one skipped, 1,667 total. Both failures belong to concurrent source-picker work and were left untouched: `src/capture-preview-picker.test.ts:62` (resume-last-source unexpectedly selects `screen:1:0`) and `src/club/design-system.test.ts:122` (new `src/capture-preview-picker.css` contains raw font sizes and border radii instead of tokens). The earlier transient picker test TypeScript error cleared before the final build. Logs: `/tmp/cc-nondestructive-sync-build.log`, `/tmp/cc-nondestructive-sync-test.log`, `/tmp/cc-nondestructive-sync-focused.log`, and `/tmp/cc-nondestructive-sync-bundled-probe.log`.

No app was packaged or installed, and no changes were committed or pushed for this revision. The concurrent source-picker files were not edited by this implementation.
