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

## Changes

- `src/recording-samples.ts` relays the same samples to MediaRecorder that it timestamps. It drains/discards pre-roll while native capture prepares, preserves source sample timestamps and records the first forwarded sample on the renderer's monotonic epoch clock. Preview tracks remain independent. Unsupported sample APIs fail explicitly rather than silently substituting encoder events.
- `Recording.tsx` persists the shared take-start epoch, each first-sample epoch and the browser source timestamp. Native screen capture derives its epoch from the first CMSampleBuffer's source PTS instead of callback scheduling time.
- `server/recording-sync.ts` decodes source timing with a streaming ffprobe pass. Audio duration uses actual sample counts, covering missing WebM Duration and Opus pre-skip; video uses decoded PTS and frame duration. Files are registered by ID and originals remain immutable.
- Normalization chooses the microphone's first sample as zero and its decoded length as the common interval. Earlier sources are trimmed; late video holds its first frame, short video holds its last frame, and missing audio becomes silence. No time stretching is applied. Without microphone, another audio source, then screen, supplies the clock.
- Normalized files are separate H.264 MP4 / PCM WAV assets with a synchronization manifest and take metadata. Video retains enough complete frames to cover fractional audio endpoints. Clip source ranges end exactly at the common sample-based duration; media metadata still describes the actual encoded file duration.
- Preview, timeline and caption generation all consume the normalized media and common trim. Caption mapping uses the existing narration mapping on normalized microphone audio, requiring no second timestamp adjustment.
- Repeated keep-both activation of an installed take is idempotent. Existing projects and manually adjusted source offsets remain supported. There is no automatic migration: legacy anchors cannot prove sample timing, and old edits must be preserved.

## Verification

Synthetic FFmpeg tests generate camera/screen/audio with different first-source epochs, lengths and nonzero file PTS. They check all starts at zero, equal clip lengths, visual events within one frame of microphone time, unchanged microphone samples, silent system-audio padding, held video, caption/word mapping, durable synchronization metadata, and unchanged original file hashes. Other cases cover live WebM without Duration, Opus pre-skip and 0.18 s fractional-frame tails.

An isolated replay of the copied user media produces camera, microphone and screen clips at exactly 0–0.18 s. Encoded video covers that interval with six frames (camera 0.200086 s, screen 0.2 s); timeline sourceOut is 0.18 s for all three. Replay uses the old event anchors only, so it is structural evidence, not physical lip-sync acceptance. Results are in `/tmp/cc-sync-debug/replay-result.json`.

An isolated real Electron renderer exercised generated canvas video and oscillator audio through the sample relay and MediaRecorder, including pause/resume. Swift compilation and the native generated-media self-test exercise native timestamps, audio retiming and pause/finalization without TCC. The self-test needed its own missing `startWriting()` restored before it could run.

Physical camera/microphone/screen capture, driver latency and long-duration clock drift have not been tested. Browser epochs describe the first forwarded sample's delivery boundary; device-internal capture latency and renderer delivery stalls are not calibrated. Existing pause-transition skew warnings remain applicable. Normalization adds decoding/encoding work and storage after Stop; originals are retained. No app was packaged, installed or pushed. Resolving the Electron package unexpectedly auto-downloaded its development runtime into node_modules; this was not an application installation.

Final validation: `npm run build` passed (TypeScript and Vite; existing chunk-size advisory). `npm test` passed serially with 1,652 passing, zero failures and one skipped test (`Vision local person masks and face centering affect actual exported pixels`: local consented portrait fixture absent). The final full suite used a temporary `SCENEFORGE_DATA_DIR`. Source media and project SHA-256 hashes still matched the original debug copies. Build/test logs, renderer experiments and native self-test outputs are under `/tmp/cc-sync-debug/`.
