<!-- refreshed: 2026-08-17 -->
# Architecture

**Analysis Date:** 2026-08-17

## System Overview

DeepSeek Harness is a plugin-based agent harness built on **vendored Cordis** (`vendor/cordis`). The governing principle is **"everything is a plugin"** — there is no privileged core to patch. Every part of the product, including the model adapter, the tool registry, the session log, and the agent loop itself, is a Cordis plugin mounted beside the others and replaceable from configuration. Registrations are reversible effects that unwind when their plugin unloads.

```text
┌──────────────────────────────────────────────────────────────────┐
│                      SURFACES (entry points)                      │
│  apps/cli (dsh bin) │ sdk/server (JSON-RPC) │ acp/acp (ACP)      │
│  apps/web │ apps/desktop │ python/sdk │ host/webserver (HTTP)    │
├───────────────────────────┬──────────────────────────────────────┤
│   COMPOSITION LAYER        │   profiles + bundles + patches       │
│   boot/app-boot            │   bundle/{base,web-app,headless,...} │
│   preset/                  │   core/scope (per-agent scoping)     │
├──────────────┬─────────────┴─────────────────────────────────────┤
│  CORE SPINE  │  core/session │ core/system-prompt │ core/tools    │
│  (product    │  core/agent  │ core/agent-loop │ core/agent-*     │
│   API)       │  llm/llm (adapter seam)                            │
├──────────────┼────────────────────────────────────────────────────┤
│  CAPABILITY  │  shell/ │ subprocess/ │ terminal/ │ fs/ │ web/     │
│  SEAMS       │  lsp/   │ skill/      │ compaction/ │ code-runtime/│
│  (Service    │  subagent/ │ jobs/ │ workflow/ │ spill/ │ sandbox/  │
│   Def/Provider/Consumer)                                          │
├──────────────┼────────────────────────────────────────────────────┤
│  PRODUCT     │  interaction/ │ goal/ │ plan/ │ todo/ │ feedback/  │
│  PLUGINS     │  schedule/ │ guard/ │ extensions/ │ context/       │
│              │  session/{persistence,title,telemetry} │ api/      │
├──────────────┼────────────────────────────────────────────────────┤
│  DATA PLANE  │  session-persistence-{jsonl,sqlite} │ storage/     │
│  (durable)   │  session-query/ │ attachment/ │ workspace/         │
├──────────────┼────────────────────────────────────────────────────┤
│  FOUNDATION  │  util/* │ vendor/{cordis,loader,include,...}       │
│  + SUPPORT   │  test-support/ │ examples/ │ native/landlock-run   │
└──────────────┴────────────────────────────────────────────────────┘
```

## Component Responsibilities

The package set lives under `packages/<group>/<pkg>/` as `@deepseek-ai/dsh-<pkg>` workspaces. Group READMEs (e.g. `packages/core/README.md`) own the package→ctx-key maps. Notable responsibilities:

| Component | Responsibility | File |
|-----------|----------------|------|
| `core/session` | Append-only `SessionEvent` log, in-memory store, `SessionEventMap` declaration-merging vocabulary, format versioning | `packages/core/session/src/types.ts` |
| `core/system-prompt` | Prompt-section and tool-schema assembly | `packages/core/system-prompt/src/` |
| `core/tools` | Scoped tool registry + guarded execution pipeline (`tools/pre-execute`, `tools/execute`, `tools/post-execute` waterfalls) | `packages/core/tools/src/types.ts` |
| `core/agent` | `Agent` interface, live registry, `agent/*` events, `Inbox`, `agentEvents` dispatcher | `packages/core/agent/src/` |
| `core/agent-loop` | Default `Agent` driver (`ReactLoopAgent`) over queued turns/step boundaries | `packages/core/agent-loop/src/agent.ts` |
| `core/scope` | Per-agent scoped-registration primitive (`createScope`) | `packages/core/scope/src/` |
| `llm/llm` | Message/stream vocabulary + LLM adapter seam (`ctx.llm`), `HarnessError` base | `packages/llm/llm/src/error.ts` |
| `boot/app-boot` | Shared profile boot: profile resolution, patch-layer composition, fail-loud, bounded shutdown | `packages/boot/app-boot/src/index.ts` |
| `sdk/protocol` + `sdk/server` | JSON-RPC protocol + server plugin over stdio | `packages/sdk/server/src/index.ts` |
| `acp/acp` | Automation-only Agent Client Protocol server | `packages/acp/acp/src/index.ts` |
| `session/*` | Durable session data plane: persistence seam + JSONL/SQLite backends, projection, titles, telemetry | `packages/session/` |

## Pattern Overview

**Overall:** Plugin composition with typed events and capability seams on vendored Cordis. There is **no privileged core**: the model adapter, tool registry, session log, and agent loop are all plugins.

**Key Characteristics:**
- **Everything is a plugin** — extend by mounting a plugin beside the others; registrations are effects that unwind on unload.
- **Typed events use declaration merging** against `@deepseek-ai/dsh-session/types`' `SessionEventMap` — packages extend the map rather than patching the loop.
- **Capability seams** decompose every swappable capability into three roles: Service Definition / Service Provider / Consumer.
- **Model-visible ⟺ logged** — anything reaching a model request must be reconstructable from the session log.
- **Registrations are effects** — every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer.

## Layers

**Foundation (vendor/):**
- Purpose: The pinned Cordis framework and its ecosystem, rescoped to `@deepseek-ai/cordis*` and owned outright (auditable, patchable, pinned). Includes local modifications logged in `vendor/README.md`.
- Location: `vendor/{cordis,loader,include,group,timer,hmr,logger-console,cosmokit,schemastery}/`
- Contains: Cordis core, Loader, Include (patch semantics), Group, Timer, HMR, logger, cosmokit, schemastery.
- Depends on: nothing internal.
- Used by: every package (peer dependency on `@deepseek-ai/cordis`).

**Foundation (util/):**
- Purpose: Zero-dependency utilities shared across groups.
- Location: `packages/util/`
- Contains: `brand` (`Branded<B>`), `home-paths` (Harness home), `launch-environment`, `atomic-write`, `timeout`, `output-retention`, `native-command`.
- Used by: many packages.

**Core spine (core/, llm/):**
- Purpose: The product API spine and LLM adapter seam.
- Location: `packages/core/`, `packages/llm/llm/`
- Contains: session log, system-prompt, tools registry, agent, agent-loop, scope; LLM message/stream vocabulary.
- Depends on: `util/*`, `vendor/*`.
- Used by: all capability and product packages.

**Capability seams (shell/, subprocess/, terminal/, fs/, web/, lsp/, skill/, compaction/, subagent/, jobs/, workflow/, spill/, code-runtime/, sandbox/):**
- Purpose: Swappable capabilities, each with a Service Definition (interface), Service Provider(s) (impl), and Consumer (usually a model-facing tool).
- Location: `packages/{shell,subprocess,terminal,fs,web,lsp,skill,compaction,subagent,jobs,workflow,spill,code-runtime,sandbox}/`
- Contains: the seam + provider + tool packages per family.
- Depends on: core spine, `subprocess` (shared execution world), `sandbox` (confinement).

**Product plugins (interaction/, goal/, plan/, todo/, feedback/, schedule/, guard/, extensions/, context/, api/, preset/, session/):**
- Purpose: Human-collaboration plane, same-session state, loop hygiene, self-modification, remote BFF, per-session composition, durable session data plane.
- Location: `packages/{interaction,goal,plan,todo,feedback,schedule,guard,extensions,context,api,preset,session}/`
- Depends on: core spine + capability seams.

**Surfaces (apps/, sdk/, acp/, host/, client/, python/, examples/):**
- Purpose: Entry points and remote surfaces.
- Location: `apps/cli`, `apps/web`, `apps/desktop`, `packages/sdk/*`, `packages/acp/acp`, `packages/host/*`, `packages/client/*`, `python/sdk`, `examples/*`
- Depends on: boot, core spine, session data plane.

## Data Flow

### Primary Request Path — Session / Agent-Loop

The primary path is a **turn → step** flow driven by `ReactLoopAgent` in `packages/core/agent-loop/src/agent.ts`:

1. **Claim input** — the `Inbox` (`packages/core/agent/src/inbox.ts`) claims the next-step input plus one queued message.
2. **Assemble context** — `agent/pre-step` decides what the model sees; listeners may rewrite claimed messages or reject them (`packages/core/agent-loop/src/agent.ts`, `PreStepDecision`).
3. **Log entered messages** — entered messages append as `user/message` session events.
4. **Derive model history** — `deriveMessages()` projects model history from the session log (`packages/core/session/src/`).
5. **Model request** — `agent/request` → `llm/stream` → `assistant/chunk*` → `assistant/message`.
6. **Tool execution** — `tool/call*` → `tools/pre-execute` → `tools/execute` → `tools/post-execute` → `tool/result*` (pipeline graph in `docs/tool-execution-pipeline.md`).
7. **Step/turn close** — `step/end`; if tools owe another request or next-step input arrived, claim → next step; otherwise `agent/turn-stopping` → `turn/end`.

**Event taxonomy:**
- **Session events** (`turn/*`, `step/*`, `user/message`, `assistant/*`, `tool/*`) are durable facts appended to the log and broadcast through `session/event`.
- **Agent events** (`agent/*`) carry a live `Agent`: inbox, step, status, request, validation, continuation.
- **Capability events** attach policy and adapters to a seam (`fs/*`, `tools/*`, `telemetry/*`) without importing the loop.

**Waterfalls:** `agent/pre-step`, `agent/request`, `llm/stream`, and the three `tools/*` events are waterfalls whose listeners MUST call `next()` to delegate; `agent/turn-stopping` is serial and has no `next()`.

### Boot / Composition Flow

1. `apps/cli/src/bin.ts` parses args (`parseDshArgs` in `apps/cli/src/args.ts`) and dispatches by mode (`profile`, `plugin`, `dump-config`).
2. `runProfile` (`apps/cli/src/profile-boot.ts`) resolves the profile, composes the patch stack: bundles (in `dsh.profile.bundles` order) → profile `cordis.patch.yml` → home-level `$DSH_HOME/cordis.patch.yml` → `--patch` overlays → telemetry switch.
3. `boot()` (`packages/boot/app-boot/src/index.ts`) mounts the tree over an empty root config; provides launch environment snapshot and cmdline args to plugins.
4. Fail-loud guards and bounded shutdown (`installFailLoud`) own process lifetime; HMR watches user patch layers for config-only live reload.

**State Management:** The session log is the source of truth. `deriveMessages()` projects model history; raw `assistant/chunk` events preserve replay/UI fidelity. Fork, resume, transcripts, telemetry, and persistence all derive from the event stream. Runtime state (agent phase, inbox) is held in the `ReactLoopAgent` instance and dispatched through `agent/*` events.

## Key Abstractions

**Capability Seam (Service Definition / Service Provider / Consumer):**
- Purpose: A swappable capability split into three roles; one role alone is not a seam.
- Examples: `packages/shell/shell/src/types.ts` (Definition: `ShellExecRequest`/`ShellExecSpec`), `packages/shell/bash-local` (Provider), `packages/shell/tool-bash` (Consumer). Same for `fs`, `web`, `lsp`, `skill`, `subagent`, `compaction`, `workflow`, `spill`, `code-runtime`, `terminal`, `sandbox`.
- Pattern: Definition declares the interface + `resolve(request): Spec` step; Provider implements it; Consumer (tool) uses it. The request/spec split (`ShellExecRequest` → `resolve` → `ShellExecSpec`) is the canonical template.

**Typed Events with Declaration Merging:**
- Purpose: Durable + live extension points without patching the loop.
- Examples: `packages/core/tools/src/types.ts` merges `'tool/code-dispatch'` into `SessionEventMap` (`declare module '@deepseek-ai/dsh-session/types'`).
- Pattern: Extend `SessionEventMap` for durable vocabulary; extend Cordis `Context` via `declare module '@deepseek-ai/cordis'` (e.g. `packages/boot/app-boot/src/index.ts`).

**Registries as Services:**
- Purpose: Scoped tool registry, live agent registry, LLM adapter registry, provider registries.
- Examples: `ctx.tools` (`packages/core/tools/`), `ctx.agents` (`packages/core/agent/`), `ctx.llm` (`packages/llm/llm/`), `ctx.sessions` (`packages/core/session/`).
- Pattern: `register()` returns the disposer; all contributions go through `ctx.effect()`/`ctx.on()`.

**Branded IDs:**
- Purpose: Opaque cross-boundary ids.
- Examples: `SessionId = Branded<'SessionId'>` (`packages/core/session/src/types.ts`).
- Pattern: `Branded<B>` from `dsh-brand`, never bare `string`.

## Entry Points

**`dsh` CLI:**
- Location: `apps/cli/src/bin.ts` (source launch via `node --import tsx/esm`; built bin at `apps/cli/lib`).
- Triggers: shell invocation `pnpm dsh --profile <name> ...`.
- Responsibilities: mode dispatch (`profile`/`plugin`/`dump-config`), profile boot, patch overlay.

**JSON-RPC SDK Server:**
- Location: `packages/sdk/server/src/index.ts` (plugin `sdk-jsonrpc-server`).
- Triggers: loaded by an external `cordis.yml`; communicates over stdio `JsonRpcLineTransport` (`packages/sdk/protocol`).
- Responsibilities: serve SDK requests, answer `shutdown`, dispose root runtime, exit 0.

**ACP Server:**
- Location: `packages/acp/acp/src/index.ts`.
- Triggers: automation-only ACP launch (e.g. `pnpm run demo:acp`).
- Responsibilities: Agent Client Protocol automation server.

**Web Host / Client:**
- Location: `packages/host/` (API gateway + HTTP server), `packages/client/` (browser half), `packages/api/gateway` (Remote BFF assembly + Typert RPC gateway).
- Triggers: browser/Electron surfaces (`apps/web`, `apps/desktop`).

## Architectural Constraints

- **ESM everywhere** (`"type": "module"`). Use package names across packages and `.ts` in local relative imports. Config subprocesses run built `lib/` under plain Node. Source-launch must stay ESM (no CJS-only exports) because it runs through tsx's ESM-only hook.
- **Registrations are effects** — every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer.
- **Model-visible ⟺ logged** — anything reaching a model request must be reconstructable from the session log; a new model-visible input requires a new session event.
- **Plugins, not loop changes** — new behavior attaches to documented extension points; changing `agent-loop` requires updating `docs/architecture.md`.
- **Capability seams are complete** — a seam comprises Service Definition / Service Provider / Consumer; split only when roles evolve independently.
- **Explicit > implicit at package boundaries** — defaulting is an explicit `resolve(request): Spec` step in the owning implementation, never a hidden `?? default` inside `run()`.
- **No hardcoded tunables in plugins** — deployment-varying choices are validated `Config` fields changeable from cordis.yml; a `DEFAULT_*` constant or test hook is not configurability. Protocol constants, external specs, and security invariants stay fixed.
- **Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent.
- **Opaque cross-boundary ids are branded** (`Branded<B>`), never bare `string`.
- **Trust TypeScript at typed same-process boundaries** — no runtime validation solely for values the static interface requires; validate at parser/config, queued, model/tool JSON, durable/file, worker, process, and wire boundaries.
- **Switch on discriminant tags** — closed unions end in `assertNever`; merge-extensible unions fall through a documented default.
- **Extension plugins depend on Service Definitions, never concrete providers.** `dsh-agent-loop` is swappable; UI/hook/tool plugins use `dsh-agent`.

## Anti-Patterns

### Privileged-Core Thinking

**What happens:** Treating `agent-loop` or the core packages as a private implementation to patch in place.
**Why it's wrong:** The project's whole premise is "everything is a plugin" with no privileged core; changing the loop ripples across the architecture and violates the documented contract.
**Do this instead:** Attach new behavior to a documented extension point (event, waterfall, registry, seam). Only change `agent-loop` when the loop itself must change, and update `docs/architecture.md` in the same change (`docs/architecture.md#where-new-behavior-goes`).

### Hidden Defaulting Inside `run()`

**What happens:** `const spec = { ...request, workdir: request.workdir ?? DEFAULT }` hidden inside a provider's execute path.
**Why it's wrong:** Violates "Explicit > implicit at package boundaries"; deployment-varying choices must be configuration.
**Do this instead:** Follow the shell template: a caller passes `ShellExecRequest`, the owning implementation exposes an explicit `resolve(request): ShellExecSpec` step that fills defaults from validated `Config` (`packages/shell/shell/src/types.ts`).

### Runtime Validation at Typed Boundaries

**What happens:** Adding hostile-input checks, fallbacks, or defensive branches for values the static interface already guarantees at same-process boundaries.
**Why it's wrong:** Duplicates the type system and obscures real invariants; the convention is to trust TypeScript at typed same-process boundaries.
**Do this instead:** Validate only at the enumerated boundaries: parser/config, queued, model/tool JSON, durable/file, worker, process, wire.

### Swallowing Errors with Empty Catches

**What happens:** `catch {}` or a catch that ignores the error without justification.
**Why it's wrong:** Error handling must be explicit; empty catches hide real failures.
**Do this instead:** An empty `catch` names what it swallows and why nothing else can reach it; keep the `try` to one statement (`AGENTS.md#defensive-patterns`).

## Error Handling

**Strategy:** Fail-loud with machine-routable codes, cause chaining, and structured normalization.

**Patterns:**
- **`HarnessError` base** with stable machine-routable `code` (e.g. `CONTEXT_WINDOW_EXCEEDED`, `QUOTA`, `EMPTY_RESPONSE`, `INVALID_CREDENTIAL`) and `cause` chaining; route on `code`, never parse `message` (`packages/llm/llm/src/error.ts`).
- **`errorChain()`** renders a thrown value with its full `cause` chain and `AggregateError` members for diagnostic surfaces only — never parse results (`packages/llm/llm/src/error.ts`).
- **Waterfall veto** — waterfalls can reject by returning without `next()`; `assertNever` on closed unions.
- **Tool pipeline normalization** — the registry losslessly snapshots candidate results and normalizes snapshot/pipeline failures into `isError` outcomes before the visible definition's `finalizeContent` (`docs/tool-execution-pipeline.md`).
- **Fail-loud boot** — `installFailLoud` (`packages/boot/app-boot/src/index.ts`) surfaces misconfiguration at load.
- **Bounded shutdown** — signals own teardown throughout startup; SIGTERM exits 0, SIGINT exits 130 (`apps/cli/src/profile-boot.ts`).

## Cross-Cutting Concerns

**Logging:** `@deepseek-ai/cordis-plugin-logger-console` (vendored); the durable session log is the source of truth for model-visible content. Stdout is reserved for protocol frames in the JSON-RPC surface (no stdout logger there) (`packages/sdk/server/src/index.ts`).

**Validation:** Schemastery schemas (`@deepseek-ai/schemastery`) for `Config`; validation at enumerated boundaries (parser/config, queued, model/tool JSON, durable/file, worker, process, wire).

**Authentication/Identity:** `packages/identity/` (anonymous identity), `packages/credentials/` (credential-reference seam + env-over-`.env` provider), `packages/settings/` (user-settings seam).

---

*Architecture analysis: 2026-08-17*
