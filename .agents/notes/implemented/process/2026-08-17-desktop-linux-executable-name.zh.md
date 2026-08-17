# Agent Note: 桌面打包设置安全的 Linux 名称并禁用隐式发布

Status: implemented

[English](2026-08-17-desktop-linux-executable-name.md) | 中文

## Problem

`apps/desktop/electron-builder.yml` 没有设置 `executableName`。在 Linux 上,electron-builder 会从包名推导它;对于 scoped 包 `@deepseek-ai/dsh-desktop`,斜杠被去掉后得到 `@deepseek-aidsh-desktop`。AppImage 拒绝该字符串,因为 `@` 不是安全的文件名符号,Linux GitHub Actions 任务在构建 arm64 AppImage 时因此失败。deb 目标同样会失败:`apps/desktop` 没有用于推导包主页的 repository 元数据,author 字符串也没有可供 maintainer 使用的邮箱。修复这些之后,deb 的 artifact 名仍然使用 scoped 包名,fpm 试图写入不存在的 `release/@deepseek-ai/dsh-desktop_*.deb` 目录。另外,electron-builder 检测到 CI 后隐式发布每个平台的产物,由于没有设置 `GH_TOKEN`,三个任务全部在最后一步失败。

## Decision

`linux` 段设置 `executableName: dsh-desktop`、`packageName: dsh-desktop` 与 `artifactName: dsh-desktop-${version}-${arch}.${ext}`,让 AppImage 与 deb 获得文件名安全的包名与 artifact 名;同时保留 `maintainer: DeepSeek Harness` 供 deb 控制记录使用。`apps/desktop/package.json` 补充了与 workspace 一致的 `repository` 块,使 electron-builder 能推导包主页。desktop-build workflow 给 electron-builder 传 `--publish never`,因为该 workflow 用 `actions/upload-artifact` 上传产物,并不发布 release。应用显示名仍为 `productName: DeepSeek Harness`。

## Alternatives considered

- 设置顶层 `executableName`。不采用,因为那会把 macOS 与 Windows 的产品二进制也改名,偏离预期的 `DeepSeek Harness` 名称。
- 去掉 npm 包 scope。不采用,因为 scoped workspace 包名是仓库级约定,改动会波及 manifests 与 lockfile。
- 用 GitHub token 发布构建产物。不采用,因为 workflow 已经上传 artifacts,没有发布 release 的意图。

## Consequences

- Linux AppImage 与 deb 打包使用 `dsh-desktop` 作为磁盘上的可执行文件名,产品显示名保持不变。
- deb 目标现在具备全部必需元数据:repository 字段提供项目主页,Linux 配置提供 maintainer。
- macOS 与 Windows 的 CI 不再需要 `GH_TOKEN`;三个 desktop-build 任务都只构建并上传产物。
- Linux 包名与 artifact 名保持安全,不再依赖 npm scope。
