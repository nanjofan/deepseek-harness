# Agent Note：桌面 Electron 壳 —— 同一套 Web 客户端清单，换成 IPC 载体

Status: implemented

[English](2026-08-15-desktop-electron-shell.md) | 中文

## 问题

harness 目前以 `dsh web` 浏览器 GUI 和 headless runner 交付，桌面产品需要一个原生壳。GUI 分层笔记早已预留了 Electron 客户端："a future Electron application reuses the same web client packages over an IPC fetch carrier"，webserver 子系统文档也写明 Electron 通过 `file://` 加载 dist、经 IPC 桥承载 fetch。本次变更在 macOS、Linux、Windows 的 x64 与 arm64 上实现这个壳。

## 决策

### 选 Electron，不选 Tauri 或 Wails

整个 harness 核心是 Node.js + Cordis 插件（含 `node-pty`、`koffi` 等原生包）。Electron 主进程本身就是 Node，harness 可以进程内启动，不需要 sidecar。Tauri（Rust）与 Wails（Go）必须额外打包 Node sidecar 并自建主进程桥，体积优势被抵消，还要重复造传输层。

### `desktop` profile 与 `dsh-desktop-app` 组合包

`PROFILE_TEMPLATES` 增加 `desktop: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-desktop-app']`。桌面组合包是 `dsh-web-app` 之上的补丁层，因此整个浏览器插件清单原样复用。补丁内容：

- 禁用 `web-startup`、`webserver`、`web-runtime`、`client-hmr`；
- 把目录选择器固定为应用内浏览交互的宿主端与客户端面（auto 选择器会读取 `webServer` 绑定事实）；
- 清空 `connection` 行的 `webRuntime` 注入与 LAN trust（IPC 载体同进程且只信任自己的渲染层）；
- 插入 `desktop-runtime` 行，提供 `ctx.desktopRuntime`：启动图、`ctx.apiProxy` 之上的进程内 fetch handler、客户端 bundle 读取，以及 mux/host 事件流。

### 既有包的能力泛化

- `dsh-client-modules` 宿主半不再强制要求 webserver：没有时跳过 `/plugins` 路由与 index tap，但仍组合启动图并解析 bundle 路径，桌面壳据此走 IPC 交付 bundle。
- `dsh-client-connection` 宿主半在没有 webserver 时变为空操作而不是注入失败，同一入口继续留在 loader 中供浏览器清单使用。

### Electron 壳（`apps/desktop`）

- `src/boot.ts` 用共享的 `dsh-app-boot` 原语在主进程启动 `desktop` profile（含遥测退出开关与用户补丁层）。
- 启动时补上 CLI 同款的出厂 agent-preset overlay（经 `@deepseek-ai/dsh` 解析），未显式指定 preset 的空白会话创建因此可用。
- `src/preload.ts` 在 `contextIsolation` + sandbox 下通过 `contextBridge` 暴露启动图（`window.__DSH_BOOT__`）与 `window.dshDesktop`（fetch、事件流、bundle 加载、abort）。
- `dsh-client-connection/client` 新增 `DesktopApiClient`，只替换 `doFetch` 与两个流 opener，对应预留的 IPC 桥子类。
- 会话日志导出控制器的 HEAD 探测走桌面桥，文件经 Electron 原生保存对话框落盘（`dsh:download`），因为 `file://` 下没有同源 HTTP fetch。
- `apps/web` 传入桌面版 `loadBundle` seam，插件 bundle 经 IPC 到达而不是 `/plugins/*`。
- 前端额外构建一份 `dist-desktop`（相对 Vite base），保证 `file://` 下资源 URL 可解析；`dsh web` 仍用服务端相对路径的 dist。
- `electron-builder.yml` 目标为 dmg/zip（macOS）、nsis（Windows）、AppImage/deb（Linux），各覆盖 x64 与 arm64。

## 影响

- 桌面应用不监听任何 HTTP 端口：具有远程执行级别能力的 `/api` 只存在于应用自有的 IPC handler 后面，并拒绝 `/api` 之外的路径。
- 打包应用关闭客户端插件 HMR；开发场景可用 overlay 重新启用 webserver 载体。
- v1 目录交互使用应用内浏览选择器；后续可在既有 `directory-picker` seam 后面接入 Electron 对话框后端。
- Web 体验不变：web-app 测试与快照仍走 HTTP/WebSocket 载体。
