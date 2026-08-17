# Agent Note: 桌面 web 构建改用 Vite mode 选择变体

Status: implemented

[English](2026-08-17-desktop-build-cross-platform-mode.md) | 中文

## Problem

`apps/web` 的 `build:desktop` 脚本在 `vite build` 前内联设置了 `DSH_DESKTOP_BUILD=1`。这个赋值只在 POSIX shell 中有效,GitHub Actions 的 Windows `cmd.exe` 会直接拒绝该命令,`windows-latest` 桌面构建在 Vite 启动前就失败了。

## Decision

`build:desktop` 现在执行 `vite build --mode desktop`,`vite.config.ts` 改为从配置钩子的 `mode` 参数推导桌面变体,不再读取环境变量。变体的输出约定不变:桌面构建使用 base `'./'` 与 outDir `'dist-desktop'`,普通构建使用 `'/'` 与 `'dist'`。

## Alternatives considered

- 添加 `cross-env` 并保留环境变量。不采用,因为 Vite 本身就把 mode 暴露给配置函数,新增依赖只是为了一个 shell 兼容垫片。
- 在脚本行直接传 `--base` 与 `--outDir`。不采用,因为这样会在 npm 脚本里重复变体选择,两处定义容易漂移。

## Consequences

- 同一个 `build:desktop` 脚本现在可运行于 macOS、Linux 与 Windows。
- 桌面构建以 mode `desktop` 运行 Vite;应用代码没有读取 `import.meta.env.MODE` 来决定行为。
- 新的配置函数下,桌面构建与普通 web 构建均已在本机验证通过。
