# Creator Compiler: notes for coding agents

Creator Compiler is a local desktop studio for planning, recording and editing videos: an Electron shell, a React interface, a Node service on loopback, and Cutroom, a Rust editing engine. Everything runs on the user's computer.

## Get it running

Node.js 24 is required (`engines` in `package.json`). From the repository root:

```sh
npm run setup:local   # check tools, install, build, and install "Creator Compiler (Local)" to launch from the Dock or Start menu
npm run setup         # install and build only (dependencies, Cutroom, runtime, interface and service)
npm run dev           # interface at http://127.0.0.1:4183 with live reload; service on 4184
npm run desktop       # the desktop shell on this checkout (on a Mac, as "Creator Compiler Dev")
npm run mcp           # the stdio MCP server against the source service
```

`setup:local` stops and prints install commands when a tool is missing (Node.js 24, Rust, CMake, Xcode Command Line Tools on a Mac, Visual Studio Build Tools with C++ on Windows). Don't install system tools without asking the user. Rerun it after a change or a `git pull` to rebuild and reinstall the local app; it reinstalls dependencies only when `package-lock.json` changed.

## Where things live

| Path | What |
| --- | --- |
| `recorder/app/src` | React interface. `src/club/` is the workspace (Home, Discover, Videos, Research, and Plan / Record / Edit / Publish inside a video). |
| `recorder/app/server` | Local service (Express): projects, media, exports, jobs, MCP tools (`server/mcp.ts`). `server/club/` is the workspace back end. |
| `recorder/app/shared` | Types and logic used by both the interface and the service. |
| `recorder/app/desktop` | Electron shell: windows, capture, recording HUD, permissions, updates. `desktop/runtime.cjs` holds the app's identity (name, data folder, port). |
| `recorder/app/scripts` | Build, packaging, signing and runtime staging, with their tests (`*.test.mjs`). |
| `engine/cutroom` | Rust engine (cutting, graphics, rendering), vendored with its own license. |
| `methodology/` | Prompt files the planning tools read. |
| `scripts/` | Root entry points: setup, setup-local, dev, mcp, packaging. |
| `.github/workflows/desktop-build.yml` | Builds and tests Mac and Windows on every PR; every push to `main` publishes a GitHub Release that installed apps update to. |

Data stays apart by how the app runs: source development uses `recorder/app/.local/` (studio, channels, desktop profile); the installed app uses `Creator Compiler` in the platform's app-data folder and `~/Documents/Creator Compiler`; the local build uses `Creator Compiler (Local)` in both places and port 4195. Never point a test or a script at the installed app's folders.

## Drive the running app

`.mcp.json` registers `creator-compiler-dev` (`node scripts/mcp.mjs`). It starts or reuses the source service on port 4184 with the `.local` test data and exposes the editor and Cutroom tools, so you can open projects, change the timeline, run cuts and render while the user watches in `npm run dev` or `npm run desktop`. It needs `npm run build` (it runs `server-dist/mcp.mjs`).

## Test and build

```sh
npm test                       # recorder/app: service, interface and script tests (node:test via tsx)
npm run test:scripts           # root scripts/*.test.mjs
npm run build                  # type check, Vite build, bundled service and native Mac helpers
cargo test --release --locked --manifest-path engine/cutroom/Cargo.toml -p cutroom-core -p cutroom-gfx -p cutroom-cut
npm --prefix recorder/app run test:cutroom   # exercise the native engine (needs npm run runtime:desktop)
```

Run a single file with `cd recorder/app && node --import tsx --test server/<file>.test.ts`. Tests sit next to the code they cover (`foo.ts` and `foo.test.ts`). Electron can't start in tests, so desktop shell behaviour is checked by reading `desktop/main.cjs` source with regexes; keep those tests passing when you edit the shell.

## Conventions

- Match the file you are in. The `.cjs` and `.mjs` desktop and build scripts are dense: short names, single-space indent, semicolons, and related statements on one line. TypeScript in `src/` and `server/` is conventionally formatted.
- Comments say why, in plain sentences, above the code they explain. No commented-out code.
- User-facing text says "Creator Compiler". Older names (SceneForge, CreatorClub) remain only where installed apps depend on them: the app id `com.aianswer.creatorclub`, the `Creator Compiler` data folder, `CREATORCLUB_*` and `SCENEFORGE_*` environment variables, the signing certificate and the update feed. Don't rename those.
- Don't break self-updates: `latest*.yml` and the versioned release assets must keep their names (`recorder/app/scripts/desktop-updater.test.mjs` checks this).
- macOS privacy grants are tied to the signing identity, which is why dev and local bundles are signed with a stable certificate (`recorder/app/scripts/dev-app.mjs`). Don't switch them to ad-hoc signing.
- Add or update a test with each behaviour change.

## Changes and pull requests

- Branch from `main` (`<name>/<topic>`), open a PR to `main`, and let the **Desktop apps** workflow build and test both systems. A merge to `main` publishes a release to every installed app, so keep `main` releasable.
- Commit messages are one plain sentence about the behaviour, e.g. "Kanban drag: a small sideways nudge keeps the card in place". PR descriptions say what was wrong, what changed and how it was checked, with screenshots for visible changes (the app with synthetic sample footage, never private recordings).
