# Desktop builds

Creator Compiler is an Electron desktop application with a React interface and native Rust Cutroom engine. The app starts a loopback media service inside an Electron utility process. All media operations and storage are local.

## Platform targets

- macOS 14 or later on Apple Silicon: `.app`, `.dmg`, `.zip`.
- Windows x64: NSIS `.exe` installer and `.zip`.

The current native architecture is built on each target operating system. macOS-only Swift helpers are skipped on Windows. Electron handles camera, microphone, screen/window selection and recording there. A native resvg renderer draws exported text, captions and shapes without Swift. Apple Vision features remain Mac-only.

## Build

```sh
npm run setup
npm run package:mac  # on macOS
npm run package:win  # on Windows with MSVC build tools
```

Outputs go to `release/`. The platform workflow runs on macOS and Windows and uploads installers as artifacts. Its Windows smoke test starts the packaged executable with a fresh data directory and confirms that the service and bundled Cutroom answer.

`recorder/app/electron-builder.cjs` defines both targets. `scripts/package-desktop.mjs` builds the native engine, stages the media runtime, and invokes the installer builder. `recorder/app/scripts/after-desktop-pack.cjs` adds a native stdio MCP launcher: C on macOS and Windows, using Electron's own Node runtime. Both installers include FFmpeg/FFprobe, Cutroom, and fonts. Speech transcription and OCR tools are optional and need separate installation.

Local macOS packaging discovers an existing signing identity when available. CI builds use no publisher identity; they are development artifacts, not notarized Mac or trusted Windows release builds. No certificate or account is created by these scripts.

## Development

`npm run desktop` opens the desktop shell. `npm run dev` is the renderer/service development loop. The source desktop shell can reuse that service on port 4184. Installed desktop apps use port 4194 so they stay separate from source development. To validate a packaged service independently, use a separate `SCENEFORGE_PORT` and `SCENEFORGE_DATA_DIR` before launching the executable.

Installed data lives under the platform application-data folder for Creator Compiler. The original SceneForge studio is separate. A source MCP launcher uses the source development data directory on port 4184 and starts the service when needed. The project configuration calls this creator-compiler-dev so it does not shadow the installed desktop integration. Packaged launchers use the installed app's data folder.

A successful build or startup check does not establish real camera, microphone, system-audio, or long-recording acceptance on physical Windows hardware. Test those on the target computer before a release.
