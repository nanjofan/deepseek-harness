# Agent Note: Linux desktop packaging sets executableName and deb metadata

Status: implemented

English | [中文](2026-08-17-desktop-linux-executable-name.zh.md)

## Problem

`apps/desktop/electron-builder.yml` did not set `executableName`. On Linux, electron-builder derives it from the package name, and for the scoped package `@deepseek-ai/dsh-desktop` the slash is removed to `@deepseek-aidsh-desktop`. AppImage rejects that string because `@` is not a safe filename character, so the Linux GitHub Actions job failed while building the arm64 AppImage. The deb target would also fail: `apps/desktop` had no repository metadata for the package homepage, and the author string carries no email for the maintainer.

## Decision

The `linux` section sets `executableName: dsh-desktop`, a filename-safe executable name for AppImage and deb, and `maintainer: DeepSeek Harness` for the deb control record. `apps/desktop/package.json` gains the standard workspace `repository` block so electron-builder can derive the package homepage. The app display name stays `productName: DeepSeek Harness`.

## Alternatives considered

- Set a top-level `executableName`. Rejected because it would also rename the macOS and Windows product binaries away from the intended `DeepSeek Harness` name.
- Remove the npm package scope. Rejected because the scoped workspace name is a repository-wide convention and would require touching manifests and lockfiles.

## Consequences

- Linux AppImage and deb packaging use `dsh-desktop` for the on-disk executable while the product keeps its display name.
- The deb target now has both required metadata: a project homepage from the repository field and a maintainer from the Linux config.
- The change is scoped to Linux; macOS and Windows packaging behavior is unchanged.
