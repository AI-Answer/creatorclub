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

## Current implementation (shared intersection, non-destructive revision of `e29ff6c`)

- `src/recording-samples.ts` still relays the same samples to MediaRecorder that it timestamps. Pre-roll is discarded while native capture prepares; first-sample epochs, source timestamps and native CMSampleBuffer provenance are preserved.
- `server/recording-sync.ts` only probes timing and returns the original media IDs and paths. MP4 video sample-table duration (`duration_ts * time_base`) and PCM/AAC stream timing avoid a frame scan. Unindexed video uses streaming packet PTS/duration bounds. Opus audio uses packet TOC sample counts minus pre-skip/discard-padding, avoiding millisecond container rounding and audio decoding even for live WebM without Duration. Older ffprobe versions (including the bundled 4.4.1) cannot expose Opus skip/discard packet side data, so they use the bounded-memory decoded-audio fallback. Other audio codecs lacking exact stream timing use that fallback too; video is never decoded frame by frame.
- The microphone supplies the clock; without a microphone, the screen, then the first source supplies it. For each original source, `offset = (firstSampleAtMs - clockFirstSampleAtMs) / 1000` and coverage is `[offset, offset + decodedDuration]`. Healthy sources share the intersection: `rawStart = max(offsets)`, `rawEnd = min(offset + decodedDuration)`.
- A source is excluded from that intersection if its missing coverage within the microphone's decoded range exceeds **either 1.0 second or 25% of the microphone length** (the clock source is never excluded). The version 3 synchronization record marks that source with `intersectionExclusion: {reason: 'insufficient-coverage', lostDuration}`. This comparison is per source against the clock, before frame rounding. Excluded sources still use their original clock placement within the resulting take: a failed camera ends early; a very late source can also start late. Other tracks retain the healthy intersection. Sources with no overlap with the recording range are explicitly rejected, preserving the existing error behavior.
- Round the common start **up** and end **down** to the highest-fps video's frame grid on the microphone clock. Use the nominal stream rate (`r_frame_rate`, average rate as fallback), avoiding small timestamp variations turning a nominal 30 fps camera into a 30.0027 fps grid. Fractional rates such as 30000/1001 remain fractional. Audio-only takes have no frame rounding. Reject a range with no complete frame. Source offsets and audio trim values keep full precision; source trims are not rounded independently to frames or milliseconds.
- For every included source, `start = 0`, `sourceIn = takeStart - offset`, `sourceOut = sourceIn + (takeEnd - takeStart)`; all clip lengths and the take duration equal `takeEnd - takeStart`. Excluded sources are clamped to their available samples and are the documented exception to even ends. No freezing, synthetic silence, stretching, re-encoding, asset registration or file writes occur after Stop.
- The route keeps its `{media, offsets, synchronization}` response. `offsets` contains editable nonnegative timeline starts; healthy sources start at zero. Version 3 `TakeSynchronization` retains signed original offsets, provenance, decoded durations, `takeStart`, `takeEnd`, `frameRate`, source trims and guardrail exclusions. Returned media durations are probe-corrected without rewriting catalog entries. The record persists through the existing project save flow, with validation in `server/storage.ts`.
- `shared/take-timing.ts` supplies the same source ranges to `scene-takes.ts`, `recorded-takes.ts` preview and take duration cards. Take review seeks within those ranges and hides/pauses sources outside them. Newly initialized version 3 takes receive one shared `Clip.linkId`, matching the existing move/trim/split/delete editing model. Saved timelines preserve their link IDs and explicit unlinking; version 1, version 2 and unsynchronized legacy takes retain their original timing and link behavior. Nothing migrates or reinitializes existing edited timelines.
- Caption generation maps the original microphone through its new `sourceIn`, shifting transcript times by the common head trim. For version 3 takes, words and caption segments without word timestamps crossing a retained boundary are clipped to the same take range; words wholly outside it disappear. Existing caption mapping behavior remains unchanged for legacy takes.
- The keep-both self-append fix remains intact. Existing edited timelines are never reinitialized or migrated.

## Verification

Synthetic FFmpeg regressions cover earlier/later source epochs, nonzero video PTS, unequal start/stop times yielding equal zero-start clip lengths, guardrail exclusions for the one-second and 25% thresholds separately, a camera failing at 0.3 seconds, modest camera stop latency, 30/60 fps and fractional-frame grids, audio-only sample precision, visual events within one frame, shifted/clipped captions and words, keep-both idempotence, metadata persistence and unchanged original hashes. Timeline regressions cover a newly installed take moving/trimming as one link group, archive/restore preserving the group, explicit unlinking, and unchanged staggered version 2 takes. Filesystem snapshots before/after synchronization verify that no new assets, aligned folders or catalog entries appear. Live Opus tests cover 2.5, 20 and 60 ms packets, pre-skip and end-discard without Duration. Related take tests cover version 1 normalized-file compatibility and version 2 trims through manual sync, archive and restore.

The automated long-take regression creates a 600-second 3840×2160 H.264 MP4 by stream-copy looping a one-second synthetic seed, plus 600 seconds of live Opus audio. Fixture generation/import are outside the measured interval. Only `synchronizeRecording` is timed, with a 2.5-second guard and unchanged filesystem assertion. This tests duration scaling without spending minutes generating a complex 4K source; compressed picture content does not affect sample-table probing.

Prior investigation evidence in `/tmp/cc-sync-debug/` describes the superseded normalized-file implementation and must not be treated as acceptance of this revision. Physical camera/microphone/screen capture, driver latency and long-duration device-clock drift remain untested. Browser epochs describe the first forwarded sample's delivery boundary; device-internal capture latency and renderer stalls are not calibrated. Existing pause-transition skew warnings remain applicable.

## Real-take replay (copies only)

The latest saved take at verification was `d0b1280e-52fb-415c-bb64-ac2e9809e725`, created 2026-11-03 20:16:41 Eastern, in project `6b096411-4fab-4716-a415-c7c6e4da43b1`. Its media and browser metadata were copied to `/tmp/cc-sync-even/`. The alignment ran with a catalog and project created only under `/tmp/cc-sync-even/scratch-studio`.

This take came from the old build: it has no persisted first-sample epochs. Replay uses its saved relative offsets `[0, 0.05398486328125, 0]` on an arbitrary absolute epoch, preserving the available timing evidence. It cannot retroactively verify physical device latency. Exact probed durations are camera 2.566433333333333 s, microphone 2.52 s, screen 3.033333333333334 s. The microphone-relative intersection before frame rounding is `[0, 2.512448470052083]`; at 30 fps the retained range is `[0, 2.5]`. No source triggers the guardrail.

| Source | Timeline start | sourceIn | sourceOut | Clip length |
| --- | --- | --- | --- | --- |
| Camera | 0 | 0.05398486328125 | 2.55398486328125 | 2.5 |
| Microphone | 0 | 0 | 2.5 | 2.5 |
| Screen | 0 | 0.05398486328125 | 2.55398486328125 | 2.5 |

Every clip shares one `linkId`. The original project JSON and three original media hashes matched before and after replay. Reproduction script: `/tmp/cc-sync-even/check.mts`; full timing/hash evidence: `/tmp/cc-sync-even/result.json`. The Application Support studio was only read.

Validation on 2026-11-03: `npm run build` passed (TypeScript and Vite; existing chunk-size advisory). Focused sync/take/card regressions passed **41/41**. The final isolated serial `npm test` run passed: **1,679 passed, 0 failed, 1 skipped (1,680 total)**. The skipped test requires a local consented portrait fixture. The 600-second 4K + live Opus alignment took **848.8 ms** in that full suite, below the 2.5-second guard.

An earlier build/test attempt caught in-progress concurrent Kanban syntax/assertions and one transient history-ordering assertion in `server/storage.test.ts:79`. No Kanban or history behavior was changed here. The isolated storage recheck passed 9/9 and the final full suite passed after the concurrent Kanban edits settled. Logs: `/tmp/cc-sync-even-build.log`, `/tmp/cc-sync-even-focused.log`, `/tmp/cc-sync-even-storage-recheck.log`, `/tmp/cc-sync-even-test-first.log` and `/tmp/cc-sync-even-test.log`.

No app was packaged or installed, and no changes were committed or pushed for this revision. Concurrent Kanban files were not edited by this implementation.
