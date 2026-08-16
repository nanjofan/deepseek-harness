# Agent Note: desktop Electron shell — same web client roster over an IPC carrier

Status: implemented

English | [中文](2026-08-15-desktop-electron-shell.zh.md)

## Problem

The harness ships `dsh web` as a browser GUI and the headless runner, but a desktop product needs a native shell. The GUI layering note already reserved Electron as a future client: "a future Electron application reuses the same web client packages over an IPC fetch carrier", and the webserver subsystem says Electron loads dist over `file://` and carries fetch over an IPC bridge. This change implements that shell for macOS, Linux, and Windows on x64 and arm64.

## Decision

### Electron, not Tauri or Wails

The whole harness core is Node.js + Cordis plugins (including native packages such as `node-pty` and `koffi`). Electron's main process is Node, so the harness boots in-process with no sidecar. Tauri (Rust) and Wails (Go) would require a packaged Node sidecar plus a custom main-process bridge, losing their size advantage while duplicating the transport work.

### The `desktop` profile and the `dsh-desktop-app` bundle

`PROFILE_TEMPLATES` gains `desktop: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-desktop-app']`. The desktop bundle is a patch layer over `dsh-web-app`, so the entire browser plugin roster is reused unchanged. Its patch:

- disables `web-startup`, `webserver`, `web-runtime`, and `client-hmr`;
- pins the directory-picker interaction to the in-app browse host and client surface (the auto chooser reads `webServer` bind facts);
- clears the `connection` row's `webRuntime` injection and LAN trust (the IPC carrier is same-process and renderer-trusted);
- inserts the `desktop-runtime` row providing `ctx.desktopRuntime`: the boot graph, an in-process fetch handler over `ctx.apiProxy`, client-bundle reads, and the mux/host event streams.

### Carrier generalization in existing packages

- `dsh-client-modules` node half no longer requires a webserver: without one it skips the `/plugins` route and index tap but still composes the graph and resolves bundle paths, which the desktop shell needs for IPC bundle delivery.
- `dsh-client-connection` node half becomes inert without a webserver instead of failing its injection, so the same entry stays in the loader for the browser roster.

### The Electron shell (`apps/desktop`)

- `src/boot.ts` boots the `desktop` profile in the main process using the shared `dsh-app-boot` primitives (including the telemetry opt-out and user patch layers).
- The boot adds the same shipped agent-preset overlay as the CLI (resolved through `@deepseek-ai/dsh`), so blank-session creation without an explicit preset works.
- `src/preload.ts` exposes the boot graph as `window.__DSH_BOOT__` and `window.dshDesktop` (fetch, stream events, bundle loading, abort) through `contextBridge` under `contextIsolation` + sandbox.
- `DesktopApiClient` in `dsh-client-connection/client` swaps only `doFetch` plus the two stream openers, matching the reserved IPC bridge subclass.
- The session-log export controller uses the desktop bridge for its HEAD probe and saves through an Electron native save dialog (`dsh:download`), because `file://` has no same-origin HTTP fetch.
- `apps/web` passes a desktop `loadBundle` seam so plugin bundles arrive over IPC rather than `/plugins/*`.
- The frontend builds a second dist (`dist-desktop`) with a relative Vite base so `file://` asset URLs resolve; `dsh web` keeps the server-relative dist.
- `electron-builder.yml` targets dmg/zip (macOS), nsis (Windows), AppImage/deb (Linux), each x64 and arm64.

## Consequences

- The desktop app opens no HTTP port: the RCE-grade `/api` face exists only behind the app-owned IPC handler, which rejects any path outside `/api`.
- Client-plugin HMR is off in the packaged app; a development overlay can re-enable the webserver carrier.
- The in-app browse picker is the v1 directory interaction; an Electron dialog backend can register behind the existing `directory-picker` seam later.
- The web experience is unchanged: web-app tests and snapshots still exercise the HTTP/WebSocket carrier.
