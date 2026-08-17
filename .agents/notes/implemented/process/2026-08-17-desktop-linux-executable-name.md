# Agent Note: Desktop packaging sets safe Linux names and disables implicit publishing

Status: implemented

English | [中文](2026-08-17-desktop-linux-executable-name.zh.md)

## Problem

`apps/desktop/electron-builder.yml` did not set `executableName`. On Linux, electron-builder derives it from the package name, and for the scoped package `@deepseek-ai/dsh-desktop` the slash is removed to `@deepseek-aidsh-desktop`. AppImage rejects that string because `@` is not a safe filename character, so the Linux GitHub Actions job failed while building the arm64 AppImage. The deb target would also fail: `apps/desktop` had no repository metadata for the package homepage, and the author string carries no email for the maintainer. After those were fixed, the deb artifact name still used the scoped package name, so fpm tried to write `release/@deepseek-ai/dsh-desktop_*.deb` under a directory that did not exist. Separately, electron-builder detected CI and implicitly tried to publish every platform's artifacts, which failed all three jobs because no `GH_TOKEN` was set.

## Decision

The `linux` section sets `executableName: dsh-desktop`, `packageName: dsh-desktop`, and `artifactName: dsh-desktop-${version}-${arch}.${ext}`, so AppImage and deb get filename-safe package and artifact names; it also keeps `maintainer: DeepSeek Harness` for the deb control record. `apps/desktop/package.json` gains the standard workspace `repository` block so electron-builder can derive the package homepage. The desktop-build workflow passes `--publish never` to electron-builder because the workflow uploads artifacts with `actions/upload-artifact` instead of publishing a release. The app display name stays `productName: DeepSeek Harness`.

## Alternatives considered

- Set a top-level `executableName`. Rejected because it would also rename the macOS and Windows product binaries away from the intended `DeepSeek Harness` name.
- Remove the npm package scope. Rejected because the scoped workspace name is a repository-wide convention and would require touching manifests and lockfiles.
- Publish the built artifacts with a GitHub token. Rejected because the workflow already uploads artifacts and has no release/publish intent.

## Consequences

- Linux AppImage and deb packaging use `dsh-desktop` for the on-disk executable while the product keeps its display name.
- The deb target now has both required metadata: a project homepage from the repository field and a maintainer from the Linux config.
- macOS and Windows packaging no longer needs `GH_TOKEN` in CI; all three desktop-build jobs only build and upload artifacts.
- Linux package and artifact names stay safe and do not depend on the npm scope.
