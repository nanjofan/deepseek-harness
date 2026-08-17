# Technology Stack

**Analysis Date:** 2026-08-17

## Languages

**Primary:**
- TypeScript ^6.0.3 — the whole harness product, `packages/`, `apps/`, `scripts/`, `vendor/`. ESM everywhere (`"type": "module"` in every package manifest), `strict: true` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` (`tsconfig.base.json`).
- Python >=3.10 — the Python SDK (`python/sdk/src/deepseek_harness/`) and the bundled runtime deploy (`python/sdk-runtime/`).
- C — the native Landlock confinement launcher `native/landlock-run/packages/entry/src/main.c` (self-restrict-then-exec for sandboxing subprocesses on Linux).
- JSON/cordis.yml — configuration and plugin composition layers (`examples/*/cordis.yml`, `packages/bundle/*/cordis.patch.yml`).

**Secondary:**
- YAML — plugin composition (`cordis.yml`), repo metadata, CI workflows (`.github/workflows/`).
- Shell (bash) — repo gates and dev scripts (`scripts/*.sh`, `native/landlock-run/scripts/`).

## Runtime

**Environment:**
- Node.js `^22.19.0 || >=24.0.0` (`package.json` `engines`). CI pins Node 24 (`PRIMARY_NODE_VERSION: '24'` in `.github/workflows/ci.yml`). Node's native TypeScript modes are unavailable across the engines range, so the `dsh` CLI source launch runs through `tsx/esm` (`node --import tsx/esm`, `package.json` script `"dsh"`).

**Package Manager:**
- pnpm `11.7.0` (`packageManager` field, `pnpm-lock.yaml` present).
- pnpm workspaces defined in `pnpm-workspace.yaml`: `vendor/*`, `packages/*/*`, `native/landlock-run`, `native/landlock-run/packages/*`, `apps/*`, `website`, `examples`, `python/sdk-runtime`.
- `linkWorkspacePackages: true`; `overrides` link vendored `@deepseek-ai/cosmokit` and `@deepseek-ai/schemastery` to `vendor/` sources; `allowBuilds` gates postinstall scripts (esbuild, lefthook, electron, electron-winstaller, node-pty, koffi, and the subprocess-local spawn helper); `patchedDependencies` patches `node-pty@1.1.0`.

## Frameworks

**Core:**
- Cordis (vendored, rescaled to `@deepseek-ai/cordis`) — the plugin framework under everything. Every part of the product is a plugin: model adapters, tool registry, session log, agent loop. Vendored source lives in `vendor/` (`cordis`, `cosmokit`, `schemastery`, `loader`, `include`, `group`, `timer`, `hmr`, `logger-console`); `@deepseek-ai/cordis` is a peerDependency of every harness package. See `docs/architecture.md`.
- React ^18.2.0 — the web client (`apps/web/package.json`, `packages/client/` UI plugin tree). JSX `react-jsx` in `tsconfig.base.client.json`.

**Testing:**
- vitest ^4.1.8 — unit, e2e, snapshot, and web test runners (`vitest.config.ts`, `vitest.e2e.config.ts`, `vitest.snapshot.config.ts`, `vitest.web.config.ts`, `vitest.web.perf.config.ts`, `vitest.web-stress.config.ts`, shared helpers in `vitest.shared.ts`).
- @vitest/coverage-v8 ^4.1.8 — coverage provider; CI enforces per-file 100% on `packages/*/*/src/**/*.{ts,tsx}` (`vitest.config.ts` thresholds).
- playwright ^1.49.0 — browser e2e (`apps/web/package.json`).
- fast-check ^4.8.0, @testing-library/react, @testing-library/dom, jsdom — property/component test tooling (root `package.json` devDependencies).

**Build/Dev:**
- tsc ^6.0.3 — project-reference builds emit `lib/types/**/*.d.ts` (declaration) and JS into `lib/`. Aggregates: `tsconfig.host.json`, `tsconfig.client.json`, solution `tsconfig.json`.
- tsdown ^0.22.2 — bundles the runtime into `lib/` (ESM only, platform node, target es2024) via `tsdown.config.ts`. Runs a Typert plugin for host-face generation.
- tsx ^4.22.4 — runs TypeScript directly for scripts, generators, demos, and the `dsh` CLI source launch.
- vite ^6.0.0 + @vitejs/plugin-react — web app build (`apps/web/package.json`); vite-tsconfig-paths resolves workspace sources in vitest configs.
- oxlint 1.76.0 + oxlint-tsgolint — linting (`scripts/run-oxlint.ts`, `package.json` `lint` script).
- knip ^6.16.1, publint, jscpd ^5.0.12 — dependency/hygiene and cross-file duplication gates (`package.json` `hygiene`/`duplication` scripts, `knip.json`).
- lefthook ^2.1.9 — git hooks, installed via `postinstall` (`scripts/install-lefthook.mjs`), configured in `lefthook.yml`.
- esbuild ^0.25.0 — electron preload bundle (`apps/desktop/package.json`).

## Key Dependencies

**Critical:**
- `@deepseek-ai/cordis` (workspace, vendored) — the plugin kernel; peerDependency + dev of every harness package.
- `@deepseek-ai/schemastery` (workspace, vendored) — schema validation for every plugin `Config`, mirror of the upstream `schemastery` API. Every package depends on it.
- `@deepseek-ai/dsh-llm` (`packages/llm/llm/`) — the provider-neutral LLM service seam every adapter (`dsh-llm-deepseek`, `dsh-llm-pi-ai`) implements.
- `@earendil-works/pi-ai` ^0.82.1 — optional LLM API backend used by `dsh-llm-pi-ai` (design-verification twin of the direct-fetch adapter).
- `@agentclientprotocol/sdk` 0.25.1 — Agent Client Protocol server for automation (`packages/acp/acp/`).
- `@opentelemetry/*` — log/OTLP telemetry backend (`packages/session/session-telemetry-otel/`).

**Infrastructure:**
- `node:sqlite` (`DatabaseSync`) — Node's built-in SQLite, used by `packages/session/session-persistence-sqlite/` and `packages/session-query/session-query-sqlite/` (`src/schema.ts`).
- `koffi` ^3.1.0 — Windows FFI for write-through JSONL publication (`packages/session/session-persistence-jsonl/`) and Windows ACL sandboxing (`packages/sandbox/sandbox-windows-acl/`).
- `node-pty` ^1.1.0 — cross-platform persistent PTY backend (`packages/subprocess/subprocess-local/`), patched in `pnpm-workspace.yaml`.
- `e2b` 2.29.1 — remote Linux sandbox SDK (`packages/e2b/e2b/`).
- `@deepseek-ai/node-addon-landlock-run` (workspace) — Landlock confinement launcher (`native/landlock-run/`).
- `chokidar` ^4.0.3 — file watching for the `.env` credentials provider (`packages/credentials/credentials-local/`).
- `yaml` ^2.9.0, `js-yaml` — YAML parsing for config and credentials.
- `zod` ^4.4.3 — used alongside schemastery in some packages (`packages/host/apiproxy/`, `packages/llm/token-meter/`, `packages/interaction/commands/`, `packages/extensions/cordis-host-runner/`).
- `electron` ^37.2.0 + electron-builder ^26.0.12 — desktop shell (`apps/desktop/package.json`).
- `fflate` ^0.8.2 — compression (apiproxy).

## Configuration

**Environment:**
- Three trusted environment layers resolved via `packages/util/launch-environment/`: inherited process env (`process`), `<invocation cwd>/.env` (`project-env`), and `$DSH_HOME/.env` (`user-env`). Consumers use `launchEnvironmentOf(ctx)` instead of `process.env` (see `packages/util/launch-environment/README.md`).
- Root `.env` is gitignored (never committed); the e2e vitest config loads it via `process.loadEnvFile` (`vitest.e2e.config.ts`). No `.env` file is present in the working tree.
- Key env vars: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_SEARCH_BASE_URL`, `EXA_API_KEY`, `PERPLEXITY_API_KEY`, `E2B_API_KEY`, `DSH_HOME`, `DSH_TELEMETRY_DISABLED`, `DSH_SNAPSHOT`, `DSH_E2E_MAX_WORKERS`, `DSH_EXAMPLE_MODE`.

**Build:**
- `tsconfig.base.json` — shared compiler options + the full workspace source `paths` facade. **Do not add `include`/`files`** — it doubles as the vite-tsconfig-paths resolution facade.
- `tsconfig.base.client.json` — client-side shape (React JSX, DOM libs, no ambient node types).
- `tsconfig.host.json` / `tsconfig.client.json` — the two project-reference aggregates (`tsc -b`).
- `tsconfig.json` — solution file referencing both aggregates; `files: []`.
- `tsdown.config.ts` — build entry (`lib/types/{index,invariant,startup}.js`), ESM-only output.
- `knip.json` — dependency-hygiene entry/project per workspace.
- `.oxlintrc*`, `.jscpd.json` — lint and duplication config.

## Platform Requirements

**Development:**
- Node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`.
- macOS/Linux primary; Windows supported with platform guards (`vitest.config.ts` excludes bash-requiring suites; `koffi`/`node-pty` handle Windows-specific transport). Wine used only to diagnose known Windows failures (`package.json` `check:windows-wine`).
- `bwrap` (bubblewrap) needed for the Linux sandbox e2e (`sandbox-local`); `pwsh` (PowerShell) needed for the PowerShell provider suites.

**Production:**
- Distributed as npm packages under scope `@deepseek-ai/dsh-*` (plus the Python wheel `deepseek-harness-sdk`/`deepseek-harness-runtime-bin` and the prebuilt native binaries `@deepseek-ai/node-addon-landlock-run-*`).
- Desktop distribution via electron-builder (`apps/desktop/`); web GUI served by the CLI's `dsh web` host.

---

*Stack analysis: 2026-08-17*
