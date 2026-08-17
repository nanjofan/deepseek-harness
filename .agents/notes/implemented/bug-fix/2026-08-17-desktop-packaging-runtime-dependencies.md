# Agent Note: Package desktop runtime support dependencies

Status: implemented

English | [中文](2026-08-17-desktop-packaging-runtime-dependencies.zh.md)

## Problem

The packaged desktop app runs from the built `lib/` plus the `node_modules` tree that electron-builder copies, but that tree is not the same as the desktop profile's runtime import closure. Several support packages that bundle packages declare only as `peerDependencies` (`dsh-scope`, `dsh-shell`, `dsh-sandbox`, `dsh-timeout`, `dsh-workflow`, and eleven more) were absent from `app.asar`. Windows failed at startup with `ERR_MODULE_NOT_FOUND` for `@deepseek-ai/dsh-scope`, and the mac artifact carried the same omission.

## Decision

`apps/desktop/package.json` now declares the full runtime support closure: `cordis-plugin-group`, `dsh-anonymous-user-id`, `dsh-atomic-write`, `dsh-bash-local`, `dsh-code-runtime`, `dsh-compaction`, `dsh-fs`, `dsh-output-retention`, `dsh-sandbox`, `dsh-scope`, `dsh-session-telemetry`, `dsh-session-title-llm`, `dsh-shell`, `dsh-spill`, `dsh-subagent-in-process-driver`, `dsh-subprocess`, `dsh-timeout`, and `dsh-workflow`.

The Windows NSIS target is now an assisted installer (`oneClick: false`, per-user install, directory selection, start-menu and desktop shortcuts), and `desktop-build.yml` passes the Apple signing/notarization secrets through to electron-builder and uploads only installer artifacts instead of unpacked directories.

## Alternatives considered

**Move the missing packages from `peerDependencies` into each bundle's `dependencies`.** Rejected because the bundles intentionally share these runtime support packages as peers; the desktop app is the consumer that must install them.

**Ship every workspace package in the desktop app.** Rejected because it would include test, demo, and capability packages the desktop profile never loads.

## Consequences

The packaged desktop `app.asar` now contains the complete runtime import closure of the `dsh-base` + `dsh-web-app` + `dsh-desktop-app` bundles. Windows users get an installer with a wizard. Mac artifacts remain unsigned until Apple credentials are configured in CI; the workflow consumes them when present.
