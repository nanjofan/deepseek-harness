# Testing Patterns

**Analysis Date:** 2026-08-17

## Test Framework

**Runner:** [vitest](https://vitest.dev) v4.1.8 (plus `@vitest/coverage-v8` v4.1.8). Configs live at the repo root.

**Assertion Library:** vitest built-in `expect` (imported from `'vitest'` per test file). Property-based testing uses `fast-check` (v4.8.0).

**Run Commands** (from `package.json`):
```bash
pnpm run test                  # vitest run (unit tests)
pnpm run test:coverage         # vitest run --coverage (CI coverage gate)
pnpm run test:e2e              # real-API tests; self-skip without DEEPSEEK_API_KEY
pnpm run test:snapshot         # keyless ACP/headless replay vs expected outputs; filter: -t <name>
pnpm run test:snapshot:record  # re-record expected outputs (needs key)
pnpm run test:snapshot:refresh # replay committed scripts and rewrite current expected outputs (keyless)
pnpm run test:web              # build + Chromium browser snapshot lane (required Linux PR gate)
pnpm run test:web:built        # replay web snapshots (read-only DSH_SNAPSHOT=replay in CI)
pnpm run test:web:perf         # perf replay lane
pnpm run test:gui              # vitest run packages/client packages/host
```

Focused test selection (per `dsh-pre-push-checks` skill):
```sh
pnpm exec vitest run packages/<group>/<package>/tests/<behavior>.spec.ts -t <test-name>
```

## Test File Organization

**Location:**
- Unit tests live at package level under `tests/`, never `src/__tests__/` — `packages/<group>/<pkg>/tests/*.spec.ts`. Repository script specs live under `scripts/**/*.spec.ts`. Tests stay with the code area they exercise.
- Real-API tests: `*.e2e.ts` (unit config excludes these; e2e config includes them).
- Snapshot tests: `*.snapshot.ts`.
- Shared fixtures live in `tests/harness.ts` (never another `*.e2e.ts`, which would re-register its `describe` and duplicate real API calls). Example: `packages/fs/tool-fs/tests/harness.ts`.

**Naming:** `<behavior>.spec.ts`, `<behavior>.e2e.ts`, `<behavior>.snapshot.ts`. Vitest `include` globs in `vitest.config.ts`:
```ts
['packages/*/*/tests/**/*.spec.{ts,tsx}', 'apps/*/tests/**/*.spec.ts', 'examples/*/tests/**/*.spec.ts', 'scripts/**/*.spec.ts']
```

**Structure:**
```
packages/<group>/<pkg>/tests/
├── <behavior>.spec.ts       # unit
├── <behavior>.e2e.ts        # real-API (key-gated)
├── harness.ts               # shared fixtures/helpers (NOT a spec)
├── invariant.spec.ts        # package invariant companion tests
└── snapshots/ or fixtures/  # golden outputs, recorded JSONL
```

## Test Structure

**Suite Organization:**
```typescript
// packages/core/session/tests/scoped.spec.ts
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
// ...workspace and local imports...

async function mount(): Promise<Context> { /* helper */ }
async function mintScope(ctx: Context, name: string): Promise<Scope> { /* helper */ }

describe('session dispatch carriers', () => {
  it('a session entered through a scoped context dispatches its events in that scope', async () => {
    const ctx = await mount()
    // arrange -> act -> assert
    expect(heard).toEqual([...])
  })
})
```

**Patterns:**
- **Arrange/Act/Assert**: `mount()`/`harness()` build the context; assertions are explicit `expect(...).toEqual(...)` / `.toBe(...)` / `.resolves.toBe(...)` / `.rejects.toThrow(...)`.
- **Tests describe behavior, not correctness** — change obsolete behavior with its tests, explain why in the PR (root `AGENTS.md`).
- **Tests describe real behavior, not implementation**: assertions fail on the intended regression and verify external state, logs, events, or disposal rather than restating implementation (`dsh-code-review` skill).
- Registry tests assert cleanup/disposal via the HMR-safety pattern: dispose the contributing fiber, assert removal.
- Helper functions are module-level, exported only from `harness.ts` when shared across spec files.
- `beforeEach`/`afterEach` set up and tear down per-test state (see `packages/examples/agent-spine-demo/tests/multi-project-sandbox.e2e.ts`). e2e tests own their resources: create the harness in the test, dispose in `afterEach` even on failure/retry/timeout.

## Mocking

**Framework:** Hand-rolled scripted mocks and `fast-check` arbitraries — no `vitest.mock`/`vi.mock` module mocking as the default. The rule is **prefer the real implementation over a mock** (docs/testing.md): mock only the expensive or non-deterministic boundary (LLM adapter, network, clock); keep everything downstream real.

**Patterns:**
```typescript
// packages/core/agent-loop/tests/contract-regressions.spec.ts
const adapter = new MockAdapter([textResponse('unchanged')])
const ctx = await harness(adapter)
```
- The scripted mock model (`MockAdapter`, `textResponse`, `toolCallResponse` from `./mock-adapter.ts`) plugs into the real tool and executor. `makeBridgeHarness({ withBash: true })` plugs in `dsh-bash-local` and `dsh-tool-bash`, then runs `echo`.
- Property tests generate arbitrary inputs via `fast-check` `fc.property(logArb, ...)` and assert invariants (`packages/core/session/tests/properties.spec.ts`).

**What to Mock:**
- LLM adapter, network, clock, and non-deterministic external boundaries only.

**What NOT to Mock:**
- The product code under test and its downstream dependencies. A hand-rolled stand-in proves the bridge moves bytes, not that the shipping tool behaves as asserted. Real provider boundaries are exercised in e2e (`test:e2e`) with keys.

## Fixtures and Factories

**Test Data:**
```typescript
// packages/core/agent-loop/tests/contract-regressions.spec.ts
function textResponse(text: string): StreamChunk[] { /* ... */ }
```
- Fixtures live in `tests/fixtures/` (e.g., `examples/acp-agent/tests/fixtures/`, `packages/typert/generator/tests/fixtures/type-model/`).
- Shared fixture builders live in `tests/harness.ts` or a `tests/fixtures/` directory — never another spec file (which would re-register `describe`).
- Example-local snapshot fixtures live under `examples/<name>/tests/snapshots/` and `tests/fixtures/`.
- Fixtures must replay on macOS/Linux; **fix fixtures, not normalizers** (root `AGENTS.md`).
- Committed session-format JSONL uses the canonical packed-row layout; `scripts/migrate-packed-session-fixtures.ts` rewrites older layouts.

**Location:**
- `packages/*/*/tests/fixtures/`, `examples/*/tests/fixtures/`, `examples/*/tests/snapshots/`, `apps/cli/tests/snapshots/`, `apps/web/tests/snapshots/`, `scripts/**/*.spec.ts`.

## Coverage

**Requirements:** Per-file 100% on `packages/*/*/src` — the CI gate (`pnpm run test:coverage`, not `test`). Configured in `vitest.config.ts`:
```ts
coverage: {
  provider: 'v8',
  include: ['packages/*/*/src/**/*.{ts,tsx}'],
  thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
}
```
- Per-file so a well-covered big file can't subsidize a bare one. An uncovered line is often **dead code the gate is correctly flagging for deletion**, not a missing test to bolt on. Line coverage is necessary, never sufficient — it proves lines ran, not that the feature works as shipped.
- The custom reporter (`scripts/coverage-uncovered-locations.cjs`) prints exact `path:line:col` for every uncovered statement/branch/function when a file misses the gate.
- Coverage `exclude` list (in `vitest.config.ts`) is substantial and TODO-annotated (GUI debt lanes, self-executing `bin.ts`/`worker.ts`, types-only files, `extensions/*`, typert generator). Do not add to it casually; use narrow, justified exceptions instead of disabling a rule globally.
- v8 ignore comments must carry a reason (see quality-gates Agent Note). Decorator-transpiled code adds `/* v8 ignore next -- compiler-synthetic decorator accessors have no source behavior */` in `vitest.shared.ts`.
- `pwsh-local` and pwsh-sandbox files are coverage-exempt on hosts without a real `pwsh`; CI ships pwsh and enforces the full bar.
- Heavy suites run uninstrumented in a parallel gate via `scripts/coverage-exempt.ts` (`DSH_COVERAGE_EXEMPT_HEAVY=1`); membership requires every coverage-measured file already be fully covered elsewhere.
- Process-bound suites (`processBoundTests` in `vitest.config.ts`) stay in their own fork for inventory control.

**View Coverage:**
```bash
pnpm run test:coverage   # text + html + uncovered-locations reports locally
```

## Test Types

**Unit Tests** (`pnpm run test`, `vitest.config.ts`):
- Package/example specs under `tests/**/*.spec.ts` plus repo script specs under `scripts/**/*.spec.ts`.
- Two projects: `thread-safe` (forked workers, `pool: 'forks'`) and `process-bound` (narrow list for process-global/time-sensitive I/O). Node's CJS lexer aborts from worker threads, hence forking.
- Prefer edge cases, error paths, event ordering, concurrency races, and **permanent tests for contract regressions** (see `packages/core/agent-loop/tests/contract-regressions.spec.ts`).
- `.tsx` client component specs use jsdom via per-file `@vitest-environment` pragma.

**Integration/REAL-composition tests** (non-unit, part of unit or e2e lanes):
- Product-visible plugins require a non-unit REAL-composition test: boot test-only `cordis.yml` through Loader and app/process; mock only external services or nondeterministic inputs; assert model-visible request/log, durable state, or user-visible output. Hand-built `ctx.plugin(...)` suites are insufficient.

**Real-API e2e** (`pnpm run test:e2e`, `vitest.e2e.config.ts`):
- `*.e2e.ts` suites. Include: `packages/*/*/tests/**/*.e2e.ts`, `apps/cli/tests/**/*.e2e.ts`, `examples/*/tests/**/*.e2e.ts`.
- Each suite self-skips without its credential key so keyless CI stays green. DeepSeek + provider-specific smokes gate on their own keys (`EXA_API_KEY`, `PERPLEXITY_API_KEY`, ...).
- Timeouts: `testTimeout: 120_000`, `hookTimeout: 30_000`, `retry: 2`, bounded file parallelism (`DSH_E2E_MAX_WORKERS`, default 4; `=1` restores serial).
- **Verify the world, not the self-report**: an e2e assertion re-runs the command or re-reads the file externally; assert untouched files are byte-identical. Highest-value are smoke tests that boot the real example, send one prompt, and check the world.

**Snapshot** (`pnpm run test:snapshot`, `vitest.snapshot.config.ts`):
- Keyless expected outputs covering external behavior: transport contracts/presentation, and persisted logs pinning assembled backend behavior.
- Include: `scripts/**/*.snapshot.ts`, `apps/cli/tests/**/*.snapshot.ts`, `examples/*/tests/**/*.snapshot.ts`, and (in `lib` mode) `apps/web/tests/**/*.snapshot.ts`.
- Replay is the keyless default (`DSH_SNAPSHOT=replay`): boot real subprocess paths from recorded model responses and diff assembled requests, normalized protocol/transcript output, and persisted-log expected outputs. `record` spends real API quota; `refresh` rewrites current expected outputs keyless. Replay/refresh never load `.env`; only `record` reads a key.
- Parallel replay (`DSH_SNAPSHOT_MAX_CONCURRENCY`, default 5); record/refresh stay serial.

**Web browser snapshot** (`pnpm run test:web`, `vitest.web.config.ts`):
- Chromium compares replayed browser output with `apps/web/tests/snapshots/`. CI forces `DSH_SNAPSHOT=replay` (read-only, never writes). Record/refresh stay local, every diff reviewed. Builds first for plugin CSS.

## Common Patterns

**Async Testing:**
```typescript
// packages/core/session/tests/scoped.spec.ts
await expect(ctx.sessions.flush(session)).resolves.toBe(true)
await expect(ctx.sessions.flush(session)).rejects.toThrow('disk full')
```
- Await async setup with `await ctx.plugin(...)`.
- `waitForIdle(ctx, agent)` waits on `agent/status` events to settle async loop work (`packages/fs/tool-fs/tests/harness.ts`, `packages/core/agent-loop/tests/contract-regressions.spec.ts`).
- Parallel-dispatch assertions use set membership rather than ordering when completion order is unspecified (`flushed.slice(0, 2).sort()` in `scoped.spec.ts`).

**Error Testing:**
```typescript
await expect(operation()).rejects.toThrow('expected message')
await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
```
- Recovery tests separate pre/post-chunk failures by step and prove failed chunks derive no message or tool side effect.

## Test Subprocess Launch Modes

Per `docs/testing.md` "Test subprocess launch modes":
- **CI and build-having test lanes** run every example or Cordis-config subprocess from built `lib/` through the shared dual-mode launcher (`@deepseek-ai/dsh-loader-smoke`'s `resolveExampleLaunch`), which selects `src` mode (tsx + root tsconfig paths) or `lib` mode (plain Node + package exports) from an explicit mode or `DSH_EXAMPLE_MODE`. Do not hand-write `--import tsx` for these subprocesses.
- **Protocol and OS fixtures** that do not load Cordis run erasable `.ts` directly with Node, without tsx or the root paths map.
- Only a test whose subject is source-path resolution may select `src`; state that contract in the test.
- **Test the real entry path**: a package `bin` runs built `lib/bin.js` under plain `node` (`packages/examples/*/tests/built-bin.e2e.ts`, `packages/code-runtime/code-runtime-worker-thread/tests/built-lib.e2e.ts`), and a genuinely-missing config exits non-zero. Keep the built-artifact smokes green.

## Test Resolution: Source Plane Only

Every vitest config points `vite-tsconfig-paths` at `tsconfig.base.json` (via `pathsPlugin()` in `vitest.config.ts`); bare workspace imports resolve to `src`, never through package `exports` to built `lib/` — stale artifacts there load a second copy of module singletons. Built artifacts are consumed only explicitly (lib-mode subprocesses and built smokes). `tsconfig.base.json` must never gain `include`/`files` (would narrow the facade's match-all scope).

## Snapshot Testing Policy

- Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless scenario in the same PR through a runnable example's owning snapshot suite. Package tests, e2e assertions, mock-only fixtures, and PR rationale do not substitute for the assembled transcript.
- ACP automation scenarios use `examples/<name>/tests/snapshots/`, a scenario table over the `@deepseek-ai/dsh-acp-snapshot` suite factory (`examples/acp-agent` is primary). One scenario (`text-turn`) pins full system-prompt/tool-schema content; other fixtures tokenize it so an edit churns one line.
- `examples/headless-agent` owns the internal canonical-event JSONL snapshots and replay fixtures.
- Completed interactive-terminal journeys use JSONL-driven scenarios under `apps/cli/tests/snapshots/`; transient presentation uses the package-local semantic matrix.
- Browser-rendered web GUI journeys use `apps/web/tests/snapshots/`.
- `pnpm run test:snapshot:record` when a model transcript changes; `test:snapshot:refresh` when replay input remains valid. Review every JSONL and expected-output diff.
- New capability seams, lifecycle variants, or transcript surfaces name every coverage tier at plan time and verify the harness can express it before implementation.
- `DSH_SNAPSHOT` env modes: `replay` (default, keyless), `record` (real API), `refresh` (replay + rewrite goldens).

## Coverage Gate Mechanics

The coverage gate is run via `check:ci:coverage` → `scripts/run-gates.ts ci-coverage`. It runs the instrumented gate plus the coverage-exempt heavy suites uninstrumented beside it. The invariant host `scripts/test-invariants.ts` mounts every package's invariant companion (the exhaustive topology test `scripts/test-invariants.spec.ts` loads all of them so aggregated coverage observes every registration while per-file setup imports only the owner's).

---

*Testing analysis: 2026-08-17*
