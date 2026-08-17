# `@deepseek-ai/dsh-desktop-app`

English | [中文](README.zh.md)

The dsh desktop-surface bundle. [`cordis.patch.yml`](cordis.patch.yml) rides over [`dsh-base`](../base/README.md) plus [`dsh-web-app`](../web-app/README.md): it keeps the shared browser plugin roster, disables the HTTP server, Web runtime, and client-plugin HMR rows, pins the in-app directory-browse interaction, and mounts this package's `desktop-runtime` glue plugin.

The glue provides `ctx.desktopRuntime` to the Electron main process in [`apps/desktop`](../../../apps/desktop/README.md):

- `graph()` — the composed `window.__DSH_BOOT__` entry graph.
- `fetch(request)` — one in-process request through the shared API gateway's fetch handler.
- `readBundle(id)` — the JavaScript source of one client plugin bundle.
- `mux(signal)` / `host(signal)` — the two server-push event streams.

The Electron renderer loads the built [`apps/web`](../../../apps/web/) frontend over `file://`; the preload bridge carries fetch and stream traffic through IPC instead of HTTP or WebSockets. The `desktop` profile template (`dsh-base` + `dsh-web-app` + `dsh-desktop-app`) is initialized on first launch like the `web` and `headless` profiles.

## Model Experience

None, as the desktop shell serves the existing GUI and adds no model-visible prompt section.

#### KV Cache effect

None; sessions created through the desktop window behave like `dsh web` sessions without a LAN URL.

## Known Limitations and Deferred Work

- **Native dialogs are not wired yet** — the composition pins the in-app directory browser; an Electron dialog backend can later register behind the [`directory-picker` seam](../../host/directory-picker/README.md) without touching the gateway.
- **Client-plugin HMR is disabled** — a packaged desktop app rebuilds and relaunches; a development overlay can re-enable the webserver carrier for live reloads.
