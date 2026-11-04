# Recording synchronization

How the camera, screen, microphone and computer-audio captures of one take are lined up on the timeline.

## What went wrong before

A short test take showed staggered tracks: each clip started at a different time and ended at a different time. Three causes:

1. **Start offsets were measured at the wrong moment.** Native screen capture starts first, and browser recording starts after it. The old anchors were the `start()` call (MP4) or the asynchronous `start` event (WebM). Neither marks the first sample actually sent to the encoder.
2. **Each clip kept its own length.** Every clip used its own file duration plus its own positive offset, and the take used the maximum endpoint. Nothing trimmed startup skew or stop latency to a common interval.
3. **"Keep both" could append an active take to itself**, shifting the take and its captions to the old scene end.

## How a take is aligned now

- `src/recording-samples.ts` timestamps the first sample forwarded to each MediaRecorder and keeps native capture provenance. Pre-roll is discarded while native capture prepares.
- `server/recording-sync.ts` only **probes** each original file; it never re-encodes or writes media:
  - MP4 video uses the sample-table duration.
  - PCM/AAC uses stream timing.
  - Opus counts packet samples minus pre-skip/discard padding, so live WebM without a Duration still gets an exact length.
  - Other formats use a bounded-memory fallback. Video is never decoded frame by frame.
- **Clock source:** the microphone, else the screen, else the first source. For each source, `offset = (firstSampleAtMs - clockFirstSampleAtMs) / 1000` and its coverage is `[offset, offset + decodedDuration]`.
- **Shared range:** the take keeps only what every included source covers: `start = max(starts)`, `end = min(ends)`.
- **Guardrail:** a source is left out of that intersection when it misses more than **1.0 s or 25 % of the clock source's length**. This catches a camera that failed early. The clock source is never excluded.
  - The excluded source keeps its original media and is marked `intersectionExclusion: {reason: 'insufficient-coverage', lostDuration}`.
  - It plays only where it has samples. If it has none inside the take range, it gets no timeline clip, and the healthy tracks still save.
- **Frame grid:** the common start rounds **up** and the end rounds **down** to the frame grid of the highest-fps video, on the clock source's timeline.
  - The nominal rate is used, so fractional rates such as 30000/1001 stay fractional.
  - Audio-only takes keep sample precision.
- **Clip placement:** every included clip gets `start = 0`, `sourceIn = takeStart - offset`, and `sourceOut = sourceIn + (takeEnd - takeStart)`. All clips therefore start together and have the same length. Nothing is frozen, padded, stretched or re-encoded.
- **What's stored:** a version 3 `TakeSynchronization` record keeps the signed offsets, decoded durations, `takeStart`, `takeEnd`, `frameRate`, source trims and any exclusions. `server/storage.ts` validates it. `shared/take-timing.ts` gives the same ranges to installation, preview and duration display.
- **Linking:** a newly installed version 3 take's clips share one `linkId`, so they move, trim and split together. Version 1, version 2 and unsynchronized takes keep their original timing; existing edited timelines are never re-initialized.
- **Captions:** they map through the clock source's `sourceIn` and are clipped to the take range. A word that crosses a split between contiguous clips of one take appears once.

## Pre-roll

Before, every source started only after the 3-2-1 countdown ended: storage sessions opened and ScreenCaptureKit started after "go", so the take began a few hundred milliseconds late and clipped a first word spoken on the beat.

- **Capture arms during the countdown**, when it shows 2 (`ARM_AT_COUNT` in `src/recording-countdown.ts`). Storage sessions, recorders and native capture start then, in the same order as before, so the sources still start together.
- **The take keeps half a second before go** (`PRE_ROLL_MS`). The renderer sends `keepFromMs = go − 500 ms` to `/recordings/synchronize`, and the common start becomes `max(keepFrom, starts)`. Everything earlier, including the 2 and 1 chimes, stays in the original files outside the take range; nothing is cut or re-encoded.
- **The guardrail is judged on the kept window**, `[keepFrom, clock end]`. A source that began after the clock but before the pre-roll misses nothing.
- With the countdown off or skipped, capture arms at go; `keepFrom` then falls before every first sample and changes nothing.
- **A cancelled countdown keeps nothing.** Armed recorders stop without saving another chunk, `DELETE /recordings/:id` removes their sessions, and native capture is discarded with its take folder. A source that fails while arming cancels the start and reports why.
- The recording clock counts the take itself, from the pre-roll.

## Verification

Synthetic FFmpeg sources in `server/recording-sync.test.ts` cover:
- earlier and later source epochs, and nonzero video PTS;
- unequal starts and stops producing equal clips that start at zero;
- the 1.0 s and 25 % guardrails separately, including a camera that failed early or before the take range;
- modest camera stop latency, and 30/60 fps and fractional frame grids;
- audio-only sample precision, and takes without a microphone (screen clock, guardrail and frame rounding);
- shifted and clipped captions, keep-both idempotence, and unchanged original file hashes.

A 600-second 3840×2160 H.264 take with live Opus audio aligns in under the test's 2.5-second limit, because only probing happens.

A real 2.5-second test take with a camera, microphone and screen was re-aligned from copies of its files. All three tracks came out at timeline start 0 with equal 2.5-second clips sharing one link. The originals were unchanged.

## Not covered

Physical device latency, renderer stalls and long-duration device-clock drift are not calibrated. The browser timestamp marks when the first sample is delivered, not when the hardware captured it.
