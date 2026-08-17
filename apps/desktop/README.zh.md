# DeepSeek Harness 桌面版

[English](README.md) | 中文

DeepSeek Harness 的 Electron 桌面壳。它复用现有 Web GUI（[`apps/web`](../web/README.md)）、宿主 API 网关和完整浏览器插件清单，只有传输层是新增的：渲染层通过 `file://` 加载构建好的前端，所有 RPC 走 IPC 桥进入运行在 Electron 主进程里的 harness。

## 架构

主进程通过 [`src/boot.ts`](src/boot.ts) 启动 `desktop` profile（`dsh-base` + `dsh-web-app` + `dsh-desktop-app`）。桌面组合包禁用了 HTTP server、Web 运行时和客户端插件 HMR 行，固定使用应用内目录浏览交互，并提供 `ctx.desktopRuntime`（[`@deepseek-ai/dsh-desktop-app`](../../packages/bundle/desktop-app/README.md)），内容包括：

- 组合完成的 `window.__DSH_BOOT__` 入口图；
- 共享 API 网关之上的进程内 fetch handler；
- 客户端插件 bundle 源码；
- mux 与 host 事件流。

preload 桥（[`src/preload.ts`](src/preload.ts)）把启动图和 `window.dshDesktop` 暴露给渲染层。`@deepseek-ai/dsh-client-connection` 在检测到该桥时自动选用 `DesktopApiClient`，因此 `session`、`approval`、`question` 等所有 RPC 流程无需改动。`apps/web` 传入桌面版 `loadBundle` seam，让插件 bundle 经 IPC 到达，而不是走 `/plugins/*` HTTP 路由。

## 开发

前置要求：Node ^22.19 || >=24、pnpm，以及已构建的 workspace（先 `pnpm install` 再 `pnpm run build`）。

```sh
pnpm run build:desktop   # desktop dist + main/preload build
pnpm run desktop         # build and launch Electron from the checkout
```

首次启动会在 `~/.dsh/profiles/desktop` 初始化 profile，与 `web`、`headless` 一致。

## 打包

[`electron-builder.yml`](electron-builder.yml) 定义了目标格式。构建当前平台：

```sh
pnpm run desktop:dist
```

目标与架构：

| 平台 | 格式 | 架构 |
|---|---|---|
| macOS | dmg、zip | x64、arm64 |
| Windows | nsis | x64、arm64 |
| Linux | AppImage、deb | x64、arm64 |

macOS 目标必须在 macOS 上构建。Windows 与 Linux 目标在工具链允许时可以从 macOS 交叉构建；原生模块（`node-pty`、`koffi` 等）由 electron-builder 按 Electron ABI 重新构建（`npmRebuild: true`），因此 arm64/Windows 交叉构建最好交给匹配的 CI runner。

## 已知限制

- 目录选择器使用应用内浏览交互；后续可以在 `directory-picker` seam 后面接入 Electron 对话框后端。
- 打包应用中客户端插件 HMR 已禁用；前端变更后需重新构建并重启。
