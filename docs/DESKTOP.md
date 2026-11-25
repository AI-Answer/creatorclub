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

Local macOS packaging discovers an existing signing identity when available. Pull request builds are unsigned development artifacts.

## Releases and updates

Every push to `main` builds both systems, and once both pass their tests and the Windows smoke test, `.github/workflows/desktop-build.yml` publishes them as one [GitHub Release](https://github.com/AI-Answer/creatorclub/releases) named `v0.1.<commit count>`. A manual run of the workflow builds the signed Mac app and publishes only when **publish** is ticked.

Installed apps update themselves (`recorder/app/desktop/updater.cjs`): they check when they start and every 30 minutes, download a newer release in the background, and install it the next time Creator Compiler quits. **Creator Compiler → Restart to Update** installs it at once, unless a recording or an export is still running. **Creator Compiler → Check for Updates…** asks right away. The log is `updates.log` in the app's data folder. Set `CREATORCLUB_NO_UPDATE=1` to turn updates off.

The Mac app is signed with the team's own **CreatorClub Dev** certificate (the certificate keeps its original name) (SHA-1 `91F6F733CA70788FCF998212EBE1BBE9F4D231C6`, valid until 2036), not an Apple Developer ID. It lives in the repository secrets `CREATORCLUB_DEV_CERT_BASE64` and `CREATORCLUB_DEV_CERT_PASSWORD`. A Mac installs an update only when it is signed with the same certificate as the copy it runs, so never replace it: a new certificate means every Mac has to reinstall by hand. The workflow refuses to publish a Mac build signed with any other certificate.

Installing for the first time:

- **Mac:** download `Creator-Compiler-<version>-mac-arm64.dmg` from the newest release (or `Creator-Compiler-mac-arm64.dmg`, the same file without the version, which [always links to the newest](https://github.com/AI-Answer/creatorclub/releases/latest/download/Creator-Compiler-mac-arm64.dmg)) and drag Creator Compiler to Applications. The first time you open it, macOS says it can't verify the app: click **Done**, then **System Settings → Privacy & Security → Open Anyway**. You do this once; updates install on their own.
- **Windows:** run `Creator-Compiler-<version>-win-x64.exe` (or the version-less `Creator-Compiler-win-x64.exe`). The installer is not signed yet, so Windows shows "Windows protected your PC": **More info → Run anyway**.

The app has had other names during development (SceneForge, CreatorClub). Everything people see now says Creator Compiler, while what existing installs depend on is unchanged: the app id `com.aianswer.creatorclub`, the data folder `Creator Compiler` (`~/Library/Application Support/Creator Compiler` on a Mac), the `CREATORCLUB_*` and `SCENEFORGE_*` environment variables, the signing certificate and the update feed. A Mac that installed an earlier build keeps its app where it is (for example `/Applications/CreatorClub.app`) and updates it in place, so MCP configurations that point inside it keep working. New installs are `Creator Compiler.app`.

## Development

`npm run desktop` opens the desktop shell. `npm run dev` is the renderer/service development loop. The source desktop shell can reuse that service on port 4184. Installed desktop apps use port 4194 so they stay separate from source development. To validate a packaged service independently, use a separate `SCENEFORGE_PORT` and `SCENEFORGE_DATA_DIR` before launching the executable.

The source desktop keeps its browser profile and single-instance lock in `recorder/app/.local/desktop-user-data`, recording projects in `.local/studio`, and channel workspaces in `.local/channels`. The desktop, web-development, and source MCP launchers use these development folders; explicit environment overrides are honored. Source development can run beside the installed app without reopening its window or editing its workspaces.

Installed data lives under the platform application-data folder for Creator Compiler. The original SceneForge studio is separate. A source MCP launcher uses the source development data directory on port 4184 and starts the service when needed. The project configuration calls this creator-compiler-dev so it does not shadow the installed desktop integration. Packaged launchers use the installed app's data folder.

Channel workspaces are stored separately in `~/Documents/Creator Compiler` (`CREATORCLUB_DIR` overrides this). Existing `~/Documents/CreatorClub` data is reused when the renamed folder is absent; it is not moved or overwritten. The desktop bundle includes Dani's methodology files and Inter font for the redesigned planning, recording, and editing workflows.

A successful build or startup check does not establish real camera, microphone, system-audio, or long-recording acceptance on physical Windows hardware. Test those on the target computer before a release.

## Running from source and local builds

`npm run desktop` runs the shell on the source tree. On a Mac it runs inside `recorder/app/.local/Creator Compiler Dev.app`, a renamed and re-signed copy of the local Electron.app, so the Dock and menu bar show Creator Compiler and its icon rather than Electron. The copy is made once per Electron version (or icon or signing identity) and still starts from your terminal, so logs and privacy prompts behave as before. `CREATORCLUB_PLAIN_ELECTRON=1` runs the stock Electron.app.

`npm run setup:local` (`scripts/setup-local.mjs`) builds and installs **Creator Compiler (Local)** from the checkout with `recorder/app/electron-builder.local.cjs`: `~/Applications/Creator Compiler (Local).app` on a Mac, `%LOCALAPPDATA%\Programs\Creator Compiler (Local)` on Windows. Its package.json carries `creatorCompilerEdition: "local"`, so `desktop/runtime.cjs` gives it its own data folder (`Creator Compiler (Local)`), projects folder (`~/Documents/Creator Compiler (Local)`) and port (`4195`), and it never self-updates. On a Mac it is signed with the identity `scripts/dev-app.mjs` picks (`CREATORCLUB_DEV_SIGN_IDENTITY`, the pin in `.local/signing-identity.json`, or the only Apple signing identity in the keychain), which keeps camera, microphone and screen permissions across rebuilds; with none it is ad-hoc signed.
