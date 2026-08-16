# DeepSeek Harness Desktop

English | [中文](README.zh.md)

The Electron desktop shell for DeepSeek Harness. It reuses the existing web GUI ([`apps/web`](../web/README.md)), the host API gateway, and the whole browser plugin roster; only the transport is new: the renderer loads the built frontend over `file://` and every RPC rides an IPC bridge to the harness running in the Electron main process.

## Architecture

The `desktop` profile (`dsh-base` + `dsh-web-app` + `dsh-desktop-app`) is booted in the main process through [`src/boot.ts`](src/boot.ts). The desktop bundle disables the HTTP server, Web runtime, and client-plugin HMR rows, pins the in-app directory browse interaction, and provides `ctx.desktopRuntime` ([`@deepseek-ai/dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)) with:

- the composed `window.__DSH_BOOT__` graph,
- an in-process fetch handler over the shared API gateway,
- client-plugin bundle sources, and
- the mux and host event streams.

The preload bridge ([`src/preload.ts`](src/preload.ts)) exposes the boot graph and `window.dshDesktop` to the renderer. `@deepseek-ai/dsh-client-connection` selects `DesktopApiClient` when that bridge is present, so `session`, `approval`, `question`, and all other RPC flows work unchanged. `apps/web` passes a desktop `loadBundle` seam so plugin bundles arrive over IPC instead of `/plugins/*` HTTP routes.

## Development

Prerequisites: Node ^22.19 || >=24, pnpm, and a built workspace (`pnpm install` then `pnpm run build`).

```sh
pnpm run build:desktop   # desktop dist + main/preload build
pnpm run desktop         # build and launch Electron from the checkout
```

The first launch initializes `~/.dsh/profiles/desktop` like the `web` and `headless` profiles.

## Packaging

[`electron-builder.yml`](electron-builder.yml) defines the targets. Build the current platform with:

```sh
pnpm run desktop:dist
```

Targets and architectures:

| Platform | Formats | Architectures |
|---|---|---|
| macOS | dmg, zip | x64, arm64 |
| Windows | nsis | x64, arm64 |
| Linux | AppImage, deb | x64, arm64 |

macOS targets must be built on macOS. Windows and Linux targets can be cross-built from macOS when the toolchain permits; native modules (`node-pty`, `koffi`, ...) are rebuilt for the Electron ABI by electron-builder (`npmRebuild: true`), so arm64/Windows cross-builds are best produced on a matching CI runner.

## Known Limitations

- The directory picker uses the in-app browse interaction; an Electron dialog backend can be added behind the `directory-picker` seam later.
- Client-plugin HMR is disabled in the packaged app; rebuild and relaunch after frontend changes.
