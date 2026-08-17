# Agent Note: Desktop web build selects its variant with a Vite mode

Status: implemented

English | [中文](2026-08-17-desktop-build-cross-platform-mode.zh.md)

## Problem

`apps/web`'s `build:desktop` script set `DSH_DESKTOP_BUILD=1` inline before `vite build`. That assignment is POSIX-only, so the Windows `cmd.exe` used by GitHub Actions rejected the command and the `windows-latest` desktop build failed before Vite started.

## Decision

`build:desktop` now runs `vite build --mode desktop`, and `vite.config.ts` derives the desktop variant from the config hook's `mode` argument instead of an environment variable. The variant keeps the same output contract: base `'./'` and outDir `'dist-desktop'` for desktop, `'/'` and `'dist'` for the regular build.

## Alternatives considered

- Add `cross-env` and keep the environment variable. Rejected because Vite already exposes a mode switch to config functions, so a new dependency would only carry a shell compatibility shim.
- Pass `--base` and `--outDir` on the script line. Rejected because it would duplicate variant selection in the npm script and let the two definitions drift.

## Consequences

- The same `build:desktop` script now runs on macOS, Linux, and Windows.
- The desktop build runs Vite in mode `desktop`; no app code reads `import.meta.env.MODE` for behavior.
- Both the desktop build and the regular web build pass locally with the new config function.
