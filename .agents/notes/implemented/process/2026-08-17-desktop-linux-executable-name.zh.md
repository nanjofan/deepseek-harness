# Agent Note: Linux 桌面打包设置 executableName 与 deb 元数据

Status: implemented

[English](2026-08-17-desktop-linux-executable-name.md) | 中文

## Problem

`apps/desktop/electron-builder.yml` 没有设置 `executableName`。在 Linux 上,electron-builder 会从包名推导它;对于 scoped 包 `@deepseek-ai/dsh-desktop`,斜杠被去掉后得到 `@deepseek-aidsh-desktop`。AppImage 拒绝该字符串,因为 `@` 不是安全的文件名符号,Linux GitHub Actions 任务在构建 arm64 AppImage 时因此失败。deb 目标同样会失败:`apps/desktop` 没有用于推导包主页的 repository 元数据,author 字符串也没有可供 maintainer 使用的邮箱。

## Decision

`linux` 段设置 `executableName: dsh-desktop`,为 AppImage 与 deb 提供安全的可执行文件名,并设置 `maintainer: DeepSeek Harness` 供 deb 控制记录使用。`apps/desktop/package.json` 补充了与 workspace 一致的 `repository` 块,使 electron-builder 能推导包主页。应用显示名仍为 `productName: DeepSeek Harness`。

## Alternatives considered

- 设置顶层 `executableName`。不采用,因为那会把 macOS 与 Windows 的产品二进制也改名,偏离预期的 `DeepSeek Harness` 名称。
- 去掉 npm 包 scope。不采用,因为 scoped workspace 包名是仓库级约定,改动会波及 manifests 与 lockfile。

## Consequences

- Linux AppImage 与 deb 打包使用 `dsh-desktop` 作为磁盘上的可执行文件名,产品显示名保持不变。
- deb 目标现在具备全部必需元数据:repository 字段提供项目主页,Linux 配置提供 maintainer。
- 改动只作用于 Linux;macOS 与 Windows 的打包行为不变。
