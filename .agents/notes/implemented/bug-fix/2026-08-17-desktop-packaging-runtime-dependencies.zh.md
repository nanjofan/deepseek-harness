# Agent Note: 打包桌面运行时支撑依赖

Status: implemented

[English](2026-08-17-desktop-packaging-runtime-dependencies.md) | 中文

## 问题

打包后的桌面应用运行在构建出的 `lib/` 加 electron-builder 复制的 `node_modules` 上，但该依赖树并不等于 desktop profile 的运行时导入闭包。多个仅被 bundle 包声明为 `peerDependencies` 的支撑包（`dsh-scope`、`dsh-shell`、`dsh-sandbox`、`dsh-timeout`、`dsh-workflow` 等，共十八个）没有进入 `app.asar`。Windows 启动时因 `@deepseek-ai/dsh-scope` 报 `ERR_MODULE_NOT_FOUND`，mac 产物也存在同样的遗漏。

## 决策

`apps/desktop/package.json` 现在声明完整的运行时支撑闭包：`cordis-plugin-group`、`dsh-anonymous-user-id`、`dsh-atomic-write`、`dsh-bash-local`、`dsh-code-runtime`、`dsh-compaction`、`dsh-fs`、`dsh-output-retention`、`dsh-sandbox`、`dsh-scope`、`dsh-session-telemetry`、`dsh-session-title-llm`、`dsh-shell`、`dsh-spill`、`dsh-subagent-in-process-driver`、`dsh-subprocess`、`dsh-timeout`、`dsh-workflow`。

Windows 的 NSIS 目标现在改为带向导的安装程序（`oneClick: false`、按用户安装、可选安装目录、创建开始菜单与桌面快捷方式）；`desktop-build.yml` 把 Apple 签名/公证密钥传给 electron-builder，并且只上传安装产物，不再上传免安装目录。

## 曾考虑的替代方案

**把缺失包从 `peerDependencies` 移进各 bundle 的 `dependencies`。** 否决：bundle 有意把这些运行时支撑包作为 peer 共享，安装它们的应是 desktop 应用这个消费者。

**把整个 workspace 的所有包都打进桌面应用。** 否决：会带上 desktop profile 不会加载的测试、示例和能力包。

## 后果

打包后的桌面 `app.asar` 现在包含 `dsh-base` + `dsh-web-app` + `dsh-desktop-app` 的完整运行时导入闭包。Windows 用户得到带向导的安装程序。在 CI 配置 Apple 凭据之前，mac 产物仍未签名；工作流在配置存在时会使用这些凭据。
