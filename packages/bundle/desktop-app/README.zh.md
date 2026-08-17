# `@deepseek-ai/dsh-desktop-app`

[English](README.md) | 中文

dsh 桌面端组合包。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-base`](../base/README.md) 与 [`dsh-web-app`](../web-app/README.md) 之上：保留共享的浏览器插件清单，禁用 HTTP server、Web 运行时与客户端插件 HMR 行，固定使用应用内目录浏览交互，并挂载本包的 `desktop-runtime` 胶水插件。

该胶水为 [`apps/desktop`](../../../apps/desktop/README.md) 的 Electron 主进程提供 `ctx.desktopRuntime`：

- `graph()` — 组合完成的 `window.__DSH_BOOT__` 入口图。
- `fetch(request)` — 经共享 API 网关 fetch handler 的一次进程内请求。
- `readBundle(id)` — 某个客户端插件 bundle 的 JavaScript 源码。
- `mux(signal)` / `host(signal)` — 两条服务端推送事件流。

Electron 渲染层通过 `file://` 加载已构建的 [`apps/web`](../../../apps/web/) 前端；preload 桥把 fetch 与事件流流量经 IPC 传输，而不是 HTTP 或 WebSocket。`desktop` profile 模板（`dsh-base` + `dsh-web-app` + `dsh-desktop-app`）与 `web`、`headless` 一样在首次启动时自动初始化。

## Model Experience

无，桌面壳只是承载现有 GUI，不新增模型可见的提示段。

#### KV Cache effect

无；通过桌面窗口创建的会话与 `dsh web` 会话行为一致，只是没有局域网 URL。

## Known Limitations and Deferred Work

- **尚未接入原生对话框** — 组合固定使用应用内目录浏览器；后续可以让 Electron dialog 后端注册到 [`directory-picker` seam](../../host/directory-picker/README.md) 后面，无需改动网关。
- **客户端插件 HMR 已禁用** — 打包后的桌面应用通过重新构建并重启生效；开发场景可以用 overlay 重新启用 webserver 载体来获得热重载。
