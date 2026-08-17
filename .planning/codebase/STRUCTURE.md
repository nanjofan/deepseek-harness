# Codebase Structure

**Analysis Date:** 2026-08-17

## Directory Layout

```
deepseek-harness/
├── apps/              # Product assemblies over the package tier
│   ├── cli/           #   owns the `dsh` bin (src/bin.ts → lib/bin.js)
│   ├── web/           #   VitePress/web app shell
│   └── desktop/       #   Electron shell (Electron + preload + native)
├── packages/          # @deepseek-ai/dsh-<pkg> workspaces at <group>/<pkg>/
│   ├── core/          #   product API spine: session, system-prompt, tools, agent, agent-loop
│   ├── api/           #   Remote BFF assembly + Typert RPC gateway
│   ├── typert/        #   type graph generator, loader, runtime registry
│   ├── goal/          #   same-session goal persistence + lifecycle
│   ├── schedule/      #   session-local scheduled follow-ups
│   ├── feedback/      #   human feedback
│   ├── identity/      #   shared anonymous identity
│   ├── llm/           #   LLM capability family: abstract service + provider adapters
│   ├── e2b/           #   E2B providers (POC)
│   ├── subprocess/    #   subprocess seam + local process-tree provider
│   ├── shell/         #   bash capability family: seam + local/pwsh providers + tools
│   ├── terminal/      #   persistent PTY capability family
│   ├── code-runtime/  #   code-execution seam + worker-thread provider + Code Mode
│   ├── sandbox/       #   process-confinement seam (bwrap/Landlock/Seatbelt)
│   ├── fs/            #   filesystem seam + local impl + file tools + policy
│   ├── lsp/           #   LSP seam + generic stdio provider + lsp tool
│   ├── skill/         #   skill registry + local provider + catalog/loader tool
│   ├── compaction/    #   compaction seam + basic provider + command Consumer
│   ├── context/       #   model-visible request context plugins
│   ├── subagent/      #   subagent seam + providers + delegation Consumers
│   ├── jobs/          #   generic background-job runtime + job_* tools
│   ├── workflow/      #   workflow seam + worker-thread engine + tools
│   ├── web/           #   web seam + search/fetch providers + web tools
│   ├── attachment/    #   durable attachment identity + local content storage
│   ├── spill/         #   spill seam + local impl + tool-result spill policy
│   ├── todo/          #   todo_write tool
│   ├── plan/          #   plan collaboration state + entry command
│   ├── preset/        #   per-session agent composition from preset cordis.yml
│   ├── guard/         #   loop-hygiene + tool-timeout plugins
│   ├── bundle/        #   installable dsh --profile patch layers (base, web-app, headless, desktop-app)
│   ├── extensions/    #   self-modification: inspect/mount own plugins (cordis tools + runners)
│   ├── hooks/         #   Claude Code/Codex hook bridges + wire-protocol library
│   ├── session/       #   durable session data plane: persistence, projection, titles, telemetry
│   ├── session-query/ #   session retrieval family (logical corpus, lineage, FTS)
│   ├── settings/      #   user-settings seam + file provider
│   ├── credentials/   #   credential-reference seam + env/.env provider
│   ├── storage/       #   non-session storage hub + backends
│   ├── workspace/     #   workspace entity
│   ├── sdk/           #   JSON-RPC protocol, server, TypeScript client
│   ├── acp/           #   automation-only Agent Client Protocol server
│   ├── interaction/   #   approval/interaction seams, permission, commands, ask-user
│   ├── boot/          #   shared app-bin glue (app-boot, cmdline)
│   ├── host/          #   web-GUI host half: API gateway + HTTP route server
│   ├── client/        #   web-GUI browser half: shell, wire, object services, ui-* plugins
│   ├── examples/      #   demo bundles (agent-spine + CLI/ACP/JSON-RPC bins)
│   ├── test-support/  #   support infrastructure (testkits, invariants, replay, Loader smokes)
│   ├── util/          #   zero-dependency utilities (brand, home-paths, launch-environment, …)
│   └── AGENTS.md, README.md   # package rules + group/ctx-key maps
├── vendor/            # Vendored Cordis source (rescoped @deepseek-ai/cordis*)
├── native/            # @deepseek-ai/node-addon-landlock-run source of record
├── python/            # Python SDK + bundled runtime (deepseek-harness-sdk, deepseek-harness-runtime-bin)
├── examples/          # Runnable cordis.yml leaves over packages/examples bundles
├── docs/              # architecture, generated catalogs, postmortems, cookbook
├── .agents/           # agent workflows + Agent Notes (notes/)
├── scripts/           # repo gates + generators (tsx)
├── website/           # VitePress projection of selected bilingual docs
└── patches/           # pnpm patched dependencies (node-pty)
```

## Directory Purposes

**`packages/<group>/<pkg>/`** — every npm package is `@deepseek-ai/dsh-<pkg>`, ESM (`"type": "module"`). Group READMEs own the package→ctx-key maps. Each package exports a `.` entry (main `lib/index.js`) and optional `./invariant` (or sub-entry) export (e.g. `packages/core/agent-loop/package.json`).

**`apps/`** — product assemblies. `apps/cli` owns the `dsh` bin (`src/bin.ts` source launch through tsx, built to `lib/`). `apps/desktop` is the Electron shell. `apps/web` is the web app shell.

**`vendor/`** — pinned source copies of Cordis + ecosystem, rescoped to `@deepseek-ai/cordis*` and owned outright. Manifest + local-modification log + sync procedure in `vendor/README.md`.

**`native/`** — `@deepseek-ai/node-addon-landlock-run` source of record (Landlock self-restrict-then-exec launcher). Own workspace + lockfile, three-package npm family.

**`python/`** — Python SDK (`deepseek-harness-sdk`) + bundled runtime (`deepseek-harness-runtime-bin`) communicating over newline-delimited JSON-RPC on stdio. `python/sdk-runtime` is a deploy root for the single-exe build.

**`docs/`** — architecture, generated catalogs (module-graph, config-catalog, tool-catalog), subsystem docs, postmortems, cookbook. Many files generated (e.g. `docs/module-graph.md` from `scripts/gen-module-graph.ts`).

**`examples/`** — runnable cordis.yml leaves (acp-agent, headless-agent, jsonrpc-agent, mcp-memory, web-cordis, web-schedule). One workspace member for dependency resolution only, not build targets.

**`scripts/`** — repo gates and generators (tsx). Includes `scripts/run-gates.ts` (CI gates) and generators like `gen-module-graph.ts`, `gen-cordis-catalog.ts`, `verify-*` checks.

**`.agents/`** — agent workflows (`skills/`) and Agent Notes (`notes/`). Skills include `dsh-pre-push-checks`, `dsh-code-review`, `dsh-prose-standard`, etc.

## Key File Locations

**Entry Points:**
- `apps/cli/src/bin.ts`: `dsh` CLI mode dispatch (`profile`/`plugin`/`dump-config`)
- `apps/cli/src/profile-boot.ts`: profile resolution + patch-stack composition + boot + shutdown
- `apps/cli/src/args.ts`: `parseDshArgs`
- `packages/sdk/server/src/index.ts`: JSON-RPC server plugin (`sdk-jsonrpc-server`)
- `packages/acp/acp/src/index.ts`: ACP server plugin
- `packages/host/webserver/`: HTTP route server plugin
- `packages/api/gateway/src/index.ts`: Remote BFF / RPC gateway

**Configuration:**
- `package.json`: workspaces, scripts, engines (`node ^22.19.0 || >=24.0.0`), packageManager `pnpm@11.7.0`
- `pnpm-workspace.yaml`: workspace globs (`vendor/*`, `packages/*/*`, `apps/*`, `website`, `native/landlock-run`, `examples`, `python/sdk-runtime`), `linkWorkspacePackages`, `overrides` (vendored cosmokit/schemastery links), `allowBuilds`
- `tsconfig.json`, `tsconfig.base.json`, `tsconfig.host.json`, `tsconfig.client.json`, `tsconfig.base.client.json`: TypeScript project layout (source plane resolves via `paths` to `src`)
- `tsdown.config.ts`: runtime bundling (host/client faces)
- `vitest.config.ts`, `vitest.e2e.config.ts`, `vitest.snapshot.config.ts`, `vitest.web*.config.ts`: test runners
- `lefthook.yml`: git hooks

**Core Logic:**
- `packages/core/agent-loop/src/agent.ts`: `ReactLoopAgent` driver
- `packages/core/agent-loop/src/tool-calls.ts`: tool scheduling
- `packages/core/session/src/types.ts`: `SessionEventMap`, `SessionId`, `SESSION_FORMAT_VERSION`
- `packages/core/tools/src/types.ts`: tool pipeline + session-event declaration merging
- `packages/llm/llm/src/error.ts`: `HarnessError`, `errorChain`, canonical error codes

**Testing:**
- Per-package `tests/` directories (e.g. `packages/boot/app-boot/tests/`)
- `packages/test-support/`: testkits, invariants, replay, Loader smokes, LLM mock server
- `docs/testing.md` owns the testing policy

## Naming Conventions

**Files:**
- Source: `src/index.ts` per package; named modules within `src/` (e.g. `agent.ts`, `tool-calls.ts`, `types.ts`, `invariant.ts`).
- Tests: co-located under `<pkg>/tests/` (e.g. `packages/boot/app-boot/tests/config-reload.spec.ts`).
- Local relative imports use explicit `.ts` specifiers (NodeNext-safe); package-crossing imports use package names.

**Directories:**
- `packages/<group>/<pkg>/` — group names plural capability areas (`shell`, `fs`, `web`); pkg names lowercase hyphenated (`bash-local`, `tool-bash`, `session-persistence-jsonl`).
- Service-role packages prefixed by role: `tool-<name>` (Consumer), `<impl>-local`/`<impl>-sandbox` (Provider), bare `<family>` (Definition/registry).

**Types:**
- Closed unions end in `assertNever`; merge-extensible unions fall through a documented default.
- Branded ids via `Branded<'Name'>` from `@deepseek-ai/dsh-brand`.
- `Config` interfaces per plugin with Schemastery `Schema.object({...})`.

## Where to Add New Code

**New model provider:** register its adapter on `ctx.llm`. Follow `packages/llm/llm-deepseek/` structure. Tests in its `tests/`.

**New model-facing capability (tool):** register on `ctx.tools`; its schema joins prompt assembly. Design the capability seam (Service Definition + Provider + Consumer) — see `docs/cookbook/adding-a-tool.md` and the capability-seams architecture note.

**New capability seam (shell/subprocess/fs/web/…):** create the family under `packages/<group>/<pkg>/`: a `<family>/` Definition package, one or more provider packages, and one or more `tool-<name>` Consumer packages. Add the group README table entry and the `packages/README.md` hierarchy table.

**New product plugin (interaction/guard/goal/…):** create `packages/<group>/<pkg>/` with `src/index.ts` (plugin `apply(ctx, config)`), `Config` schema, `tests/`. Declare `@deepseek-ai/cordis` as peerDependency (+ dev). Register contributions via `ctx.effect()`/`ctx.on()` and return disposers.

**New durable session vocabulary:** extend `SessionEventMap` via `declare module '@deepseek-ai/dsh-session/types'` in the owning package (e.g. `packages/core/tools/src/types.ts`). Render and replay from the log; only structural format changes bump `SESSION_FORMAT_VERSION` (`packages/core/session/src/types.ts`).

**New utility:** add to `packages/util/<name>/` as zero-dependency (`brand`, `home-paths`, `timeout`, etc.).

**New extension point consumer:** attach to a documented event/waterfall (e.g. `tools/pre-execute`, `agent/turn-stopping`) rather than changing the loop.

## Special Directories

**`vendor/`:**
- Purpose: source-vendored Cordis framework + ecosystem, rescoped to `@deepseek-ai/cordis*`.
- Generated: No (pinned source copies; local modifications logged in `vendor/README.md`).
- Committed: Yes. Update via the sync procedure in `vendor/README.md`; re-apply/retire logged local modifications; rerun `pnpm run test && pnpm run build`.

**`native/`:**
- Purpose: `@deepseek-ai/node-addon-landlock-run` source of record (native Landlock launcher).
- Generated: No. Committed: Yes. Own workspace + lockfile, three-package npm family.

**`website/`:**
- Purpose: VitePress projection of selected bilingual `docs/` sources.
- Generated: Built output (VitePress build). Source committed. Doubles as dead-link check (`pnpm run website:build`).

**`python/sdk-runtime`:**
- Purpose: Deploy root of the single-exe build — a pure dependency manifest whose closure is what the exe bundles and what the Python runtime distributes.
- Generated: Bundled artifacts. Committed manifest.

**`examples/` (root):**
- Purpose: Runnable cordis.yml leaves (acp-agent, headless-agent, jsonrpc-agent, mcp-memory, web-cordis, web-schedule) over `packages/examples/` bundles.
- Generated: Snapshot outputs (`.jsonl`) are recorded and committed as test fixtures.

**`packages/examples/`:**
- Purpose: demo bundles (agent-spine + CLI/ACP/JSON-RPC bins) that root examples leaves load.
- Generated: No. Committed: Yes. Support — example infra.

---

*Structure analysis: 2026-08-17*
