# Coding Conventions

**Analysis Date:** 2026-08-17

## Naming Patterns

**Files:**
- `src/*.ts` for source; `tests/*.spec.ts` for unit tests, `tests/*.e2e.ts` for real-API tests, `*.snapshot.ts` for keyless snapshots. Tests live at package level under `tests/`, never `src/__tests__/` ([packages/AGENTS.md](../packages/AGENTS.md)).
- `src/index.ts` is the package entry; `src/types.ts` holds **only** types (no runtime code); `src/brand.ts` holds branded-id factories; `src/invariant.ts` is the package-owned invariant companion.
- Special suffix files: `*.config.ts` (tool/app config, excluded from lint and repo TypeScript programs), `src/bin.ts` / `src/worker.ts` (self-executing entries, coverage-excluded because importing them would boot inside the unit process).

**Functions:**
- camelCase. Local helpers inside a spec are often exported-free module-level functions: `mount()`, `harness(adapter)`, `waitForIdle(ctx, agent)` in `packages/core/agent-loop/tests/contract-regressions.spec.ts`.
- Async event/listener arrow callbacks use `void fn()` for deliberate fire-and-forget (`no-void` is off in `.oxlintrc.json`). Example in `packages/core/session/tests/scoped.spec.ts`: `ctx.on('session/event', (_session, event) => void heard.push(...))`.

**Variables:**
- camelCase. Unused parameters/args/caught errors are prefixed `_` (`argsIgnorePattern: "^_"`, `caughtErrorsIgnorePattern: "^_"` in `.oxlintrc.json`). Example: `(_s, event)` in `packages/core/session/tests/scoped.spec.ts`, `_input` / `_ref` in `scripts/test-invariants.ts`.
- Underscore-prefixed members or names starting with `_` are exempt from `no-unused-vars`.

**Types:**
- PascalCase for interfaces/types/enums/classes (`SessionEvent`, `SessionEventMap`, `Appendable`, `InvariantInstaller`).
- Branded cross-boundary ids use the `Branded<B>` nominal-typing primitive from `@deepseek-ai/dsh-brand` — never bare `string` at boundaries. A brand makes structurally-identical strings non-interchangeable (`SessionId` ≠ `CallId` at the type level). Construction goes through a per-id factory in the OWNING package (a plain cast, zero runtime cost). Examples: `CallId` in `dsh-llm` (`packages/llm/llm/src`), shared `SessionId` in `dsh-session`, `JobId` in `dsh-jobs`. Only ids that cross package boundaries and could plausibly be confused get a brand — not every string.
- Factory functions capitalized like the type they build: `CallId(r.id)`, `SessionId('...')` (see `packages/core/session/tests/properties.spec.ts`).

## Code Style

**Formatting:** [oxlint](https://oxlint.rs) with `@stylistic/eslint-plugin` rules in `.oxlintrc.json`. Key settings:
- 2-space indent, single quotes with `avoidEscape`, no semicolons (`semi: never`), `comma-dangle: always-multiline`, `eol-last: always`, `no-trailing-spaces`, `arrow-parens: as-needed` (parens required for block bodies), `member-delimiter-style` with no delimiter on multiline interfaces, `max-len: 140` (validation-only; `ignoreUrls`, `ignoreStrings`, `ignoreTemplateLiterals`).
- Files end with exactly one trailing newline; `git diff --cached --check` (pre-commit) gates it.

**Linting:** oxlint (v1.76.0) via `scripts/run-oxlint.ts`, run as `pnpm run lint`. Type-aware linting (`typeAware: true`) for the shared strict override. Key rules enforced:
- `no-explicit-any: error` — every intentional `any` needs a narrow suppression with rationale.
- `no-var`, `prefer-const`, `no-unused-expressions`, `no-unused-vars`.
- High-value bug-class rules: `no-floating-promises: error` (lost promises in the agent loop are the repo's highest-value linted bug class), `await-thenable`, `no-misused-promises`, `no-misused-spread`, `restrict-plus-operands` (all allowed flags false), `no-unsafe-*` family, `return-await: error-handling-correctness-only`, `prefer-promise-reject-errors`, `use-unknown-in-catch-callback-variable`.
- Deliberate off/overrides: `no-empty-object-type: off` (merge-extensible maps intentionally use empty object types), `no-invalid-void-type: off` in src (event signatures use `void`), `no-namespace: off` (Cordis `Config` namespaces are the idiom), `no-void: off` (fire-and-forget arrow listeners).
- Stricter rules apply to `src/` but not `tests/` (second override): `no-non-null-assertion: error`, `no-unnecessary-condition`, `only-throw-error`, `require-await`, `restrict-template-expressions`, `switch-exhaustiveness-check`. Tests relax these: `no-non-null-assertion: off` (assertions commonly follow an `expect()`), `only-throw-error: off`, `require-await: off`, `restrict-template-expressions: off`.
- SonarJS duplicate rules (sonarjs plugin) catch duplicated branches/conditions/expressions/functions.
- The staged profile `.oxlintrc.staged.json` extends the main config with `typeAware: false` and is what the pre-commit hook runs with `--fix`.

## Import Organization

**Order:** node builtins (`node:child_process`, `node:fs/promises`, `node:url`), then `vitest`, then `@deepseek-ai/cordis` and other workspace packages, then relative/local imports. See `packages/core/agent-loop/tests/contract-regressions.spec.ts` and `packages/fs/tool-fs/tests/harness.ts` for the canonical ordering.

**Path Aliases:**
- Workspace imports use bare package names across packages: `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-llm`, etc. (`packages/core/agent-loop/tests/contract-regressions.spec.ts`).
- Local relative imports within a package append `.ts` extension: `../src/agent.ts`, `./mock-adapter.ts`, `./resolve.ts` (`tsconfig.base.json` sets `allowImportingTsExtensions: true` + `rewriteRelativeImportExtensions: true`).
- Subpath imports for branded ids, types, invariants, and client entries: `@deepseek-ai/dsh-session/invariant`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-tools/types` (mapped in `tsconfig.base.json` `paths`).
- ESM everywhere (`"type": "module"`). No CJS exports; vendored `@deepseek-ai/cordis` is a peerDependency (+ dev) of every harness package.

## Error Handling

**Patterns:**
- **Empty `catch` names what it swallows** and why nothing else can reach it; keep the `try` to one statement. Example in `vitest.snapshot.config.ts`: `catch { // No .env — fine, the environment may already carry the variables. }` and `catch (error) { if ((error as ...)?.code !== 'ENOENT') throw error }`.
- Prefer `expect(...).rejects.toThrow('...')` in tests for rejection assertions (`packages/core/session/tests/scoped.spec.ts`).
- **Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent.
- Use `use-unknown-in-catch-callback-variable` — catch variables are `unknown`, so narrow with a type assertion (as in `vitest.snapshot.config.ts` and `scripts/test-invariants.ts`).
- Represent one async operation with one lifecycle controller/transaction; separate readiness/cancellation/disposal/sentinel state needs an independent owner.

**Error classes:** typed errors are preferred; `prefer-promise-reject-errors` is on. Guard-provided timeout/guard errors, `LlmError`, `ValidationError` (from cordis) are used (`packages/core/agent-loop/tests/contract-regressions.spec.ts` imports `LlmError`).

## Logging

**Framework:** Cordis logger (`ctx.logger`), not a dedicated logging package. There is no `console`-based logging convention in product source (console is reserved for demo/CLI bins).

**Patterns:**
- Typed events require `@mode` and payload `@param` JSDoc; scoped keys absent from payloads need `@dshScopeScan unsupported` (root `AGENTS.md`).
- A `SessionEventMap` member is required-on-read by default — builds that don't know its type refuse the log unless the event carries the envelope's `ignorable: true`.
- **Model-visible ⟺ logged:** anything reaching a model request must be reconstructable from the session log; a new model-visible input requires a session event (extend `SessionEventMap`, render from the log).

## Comments

**When to Comment:**
- Comments describe non-obvious contracts or rationale that code cannot express; they **do not restate what code already implies** (`AGENTS.md` + `dsh-prose-standard` skill). Do not narrate control flow, restate code, or preserve review history.
- Every module and export has concise JSDoc for its non-obvious contract; function-like exports include `@param`/`@returns`, enforced by `scripts/verify-export-jsdoc.ts`.
- Use direct, concrete terms; no metaphors. Before `contract`/`boundary`/`shape`, prefer `response fields`, `JSON validation`, `ESM exports`. Keep `contract` for preconditions/postconditions/invariants/compatibility promises.

**JSDoc/TSDoc:**
- Format: `/** ... */` with `@param name - description` and `@returns description`. See `scripts/verify-export-jsdoc.ts` and `scripts/test-invariants.ts` for the canonical form.
- Module-level `@module` tags: `@module @deepseek-ai/dsh-brand` (`packages/util/brand/src/index.ts`, `packages/util/brand/src/invariant.ts`).
- Public class methods document parameters and non-void returns; `@mode` required on event JSDoc.
- Heritage-declared members, plugin-protocol slots (`Config`, `inject`, `name`, `reusable`, `apply`), and constructors keep their docs at the declaring Service Definition, protocol, or class.
- `//` comments for single-line; explanatory comments above the code they annotate. Fixtures/expected-output comments in specs explain non-obvious test design only (`scripts/test-invariants.ts` and spec files demonstrate).

**TODO markers:** Three tags by urgency (see `docs/development.md`): `FIXME` (release blocker), `TODO` (fix soon), `XXX` (someday). Pick the tag matching urgency. Example in `vitest.config.ts`: `// TODO(gui): cover and remove as the client test lane matures.`

## Function Design

**Size:** No hard function-length gate; oxlint `max-len: 140` and SonarJS duplication rules are the main style constraints. Helpers are extracted (e.g., `mount()`, `harness()`, `waitForIdle()`, `send()`, `inboxText()` in `packages/core/agent-loop/tests/contract-regressions.spec.ts`).

**Parameters:** camelCase; unused parameters prefixed `_`. Functions that describe one operation take focused params, not a context-wide object.

**Return Values:** Explicit. Non-void returns must be documented in JSDoc. Registrations return the disposer; `register()` returns a disposer. Function plugins return `Promise<() => void>` from `apply` (`packages/util/brand/src/invariant.ts`).

## Module Design

**Exports:** Plugin export conventions (`packages/AGENTS.md`):
- Service packages default-export their service class (e.g., `SessionStore`, `AgentLoop`, `LlmRuntime`).
- Function plugins named-export `name` / `inject` / `Config` / `apply` and have **no** default export. Mixing forms makes the Loader discard the function plugin's namespace.
- `name`/`inject`/`Config`/`reusable`/`apply` are protocol slots exempt from JSDoc requirements.

**Barrel Files:** `src/index.ts` is the single package entry. Each package uses **one aggregate** (registered in exactly one of `tsconfig.host.json` / `tsconfig.client.json`) — "keep compiler faces explicit". Only `api/remotes` splits for generated Host/Client contracts. Use one aggregate per package.

**Registrations are effects:** every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer.

**Invariant companions:** every package owns `./invariant` (`src/invariant.ts`) — registers the manifest name, checks an event/data relation, or gives empty installers package-specific `No runtime invariant:` reasons. Generated companions, unexplained empties, and ignored reporters fail `verify-package-invariants`.

**Discriminant unions:** switch on discriminant tags; closed unions end in `assertNever`; merge-extensible unions fall through a documented default (`switch-exhaustiveness-check` with `considerDefaultExhaustiveForUnions`).

---

*Convention analysis: 2026-08-17*
