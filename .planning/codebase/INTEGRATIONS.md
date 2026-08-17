# External Integrations

**Analysis Date:** 2026-08-17

## APIs & External Services

**LLM / Model providers:**
- DeepSeek chat-completions API — the primary model provider, `packages/llm/llm-deepseek/`.
  - Direct `fetch` + SSE against an OpenAI-compatible `/chat/completions` endpoint (no SDK), implemented in `packages/llm/llm-deepseek/src/adapter.ts` and `src/sse.ts`.
  - Base URL: config `baseURL` → `$DEEPSEEK_BASE_URL` (trusted env layer) → `PUBLIC_BASE_URL = 'https://api.deepseek.com'` (`packages/llm/llm-deepseek/src/index.ts`).
  - API key: resolved per request through the credential seam (`ctx.credentials`), default credential ref `DEEPSEEK_API_KEY`; falls back to the ambient launch environment. Missing key → `LlmError` `MISSING_CREDENTIAL`.
  - Bearer auth header `authorization: Bearer <key>` plus attribution `user-agent` and `x-deepseek-harness-user-id` / `x-deepseek-harness-session-id` headers (`src/adapter.ts`).
  - Default catalog models `deepseek-v4-flash` / `deepseek-v4-pro` (`src/index.ts`).
- pi-ai (@earendil-works/pi-ai ^0.82.1) — an alternate LLM backend / design-verification twin of the direct-fetch adapter, `packages/llm/llm-pi-ai/`. Same DeepSeek credential semantics.

**Web search providers (`packages/web/`):**
- Exa search API — `packages/web/web-search-exa/`. Default base `https://api.exa.ai` (via `EXA_DEFAULT_BASE_URL` in `src/provider.ts`); key from config `apiKey` or `$EXA_API_KEY` (`src/index.ts`); `/search` is appended.
- Perplexity search API — `packages/web/web-search-perplexity/`. Key from config or `$PERPLEXITY_API_KEY`.
- DeepSeek Anthropic-compatible search — `packages/web/web-search-deepseek/`. Calls the Anthropic-compatible Messages API with the native `web_search_20250305` server tool. Default base `https://api.deepseek.com/anthropic/v1` (`DEEPSEEK_DEFAULT_BASE_URL`), distinct from the chat-completions `DEEPSEEK_BASE_URL`; endpoint override env `DEEPSEEK_SEARCH_BASE_URL` (`src/index.ts`). Reuses `DEEPSEEK_API_KEY`.
- Anonymous public HTTP fetch — `packages/web/web-fetch-http/` (no external service).

## Data Storage

**Databases:**
- SQLite via Node's built-in `node:sqlite` (`DatabaseSync`) — **no external driver**. Used by:
  - `packages/session/session-persistence-sqlite/` — durable session-event persistence backend (`src/schema.ts`).
  - `packages/session-query/session-query-sqlite/` — SQLite full-text search over session logs.
  - `packages/storage/storage-sqlite/` — generic non-session storage backend.
  - Monotonic `SCHEMA_VERSION` gates on-disk format (`docs/architecture.md`).

**File Storage:**
- Local filesystem primarily. Session persistence also has a JSONL backend: `packages/session/session-persistence-jsonl/` (append-only log; `koffi` provides write-through durability on Windows). Attachment and spill storage are content-addressed local files (`packages/attachment/`, `packages/spill/`). Credentials are stored in `$DSH_HOME/.env` (`packages/credentials/credentials-local/`). Harness home, paths, and retention helpers in `packages/util/home-paths/` and `packages/util/output-retention/`.

**Caching:**
- None distributed (no Redis/Memcached). In-process caches exist within packages (e.g. `dsh-llm-deepseek` caches last-good connection facts; `dsh-session-projection-cache` in `packages/host/apiproxy/` deps).

## Authentication & Identity

**Auth Provider:**
- Custom, in-product. No OAuth/SSO. Identity is anonymous via `packages/identity/anonymous-user-id/` (`getOrCreateAnonymousUserId`, persisted under the harness home). User-facing auth is the API-key credential plane:
  - `packages/credentials/credentials/` (seam) + `packages/credentials/credentials-local/` (file-backed provider reading `$DSH_HOME/.env` under the live process env, with `chokidar` watching).
  - `packages/settings/` — user-settings capability (`ctx.settings`) storing per-provider config sections (e.g. `llm-deepseek` namespace) editable from the web Models page.
  - Credential references are `CredentialRef` values (branded), resolved per request so an endpoint and its key never come from different config generations (`packages/llm/llm-deepseek/src/adapter.ts`).

## Monitoring & Observability

**Error Tracking:**
- None external. Errors are normalized `LlmError`/typed errors and surfaced through the session log (`docs/architecture.md`: model-visible ⟺ logged).

**Logs:**
- OpenTelemetry, via `packages/session/session-telemetry-otel/`. Composes the OTel JS SDK: `LoggerProvider` + `BatchLogRecordProcessor` + `OTLPLogExporter` (OTLP/HTTP). Config: `mode` (`FULL`/`FEEDBACK_ONLY`/`DISABLED`, default `DISABLED`), `exporter.url` (full OTLP logs endpoint), passthrough `exporter`/`processor` SDK options. Resource carries `service.name`, `service.version`, `user.id` (`src/index.ts`).
- Local logging via Cordis `ctx.logger` (vendored `logger-console`).
- Session telemetry records are captured and projected onto the log pipeline; `DSH_TELEMETRY_DISABLED=1` is set in CI to prevent reporting to the baked production telemetry endpoint (`.github/workflows/ci.yml`, `.github/workflows/e2e.yml`).

## CI/CD & Deployment

**Hosting:**
- npm registry (public packages `@deepseek-ai/dsh-*`), PyPI (Python wheel), and platform-specific prebuilt native binaries. Release scripts in `scripts/release/` (`release:dsh`, `release:vendor`, `release:pack`, `release:publish`).

**CI Pipeline:**
- GitHub Actions, `.github/workflows/`:
  - `ci.yml` — primary CI: static gates, coverage (per-file 100%), lint, hygiene, build, consumers, Windows lanes (`ci-*` jobs). Node 24, pnpm, `pnpm install --frozen-lockfile`. Linux enterprise jobs support failover to a self-hosted pool via `DSH_CI_FAILOVER_LINUX` variable; Windows via `DSH_CI_FAILOVER_WINDOWS`. Sets `DSH_TELEMETRY_DISABLED=1`.
  - `e2e.yml` — real DeepSeek API e2e; maps repo secret `DEEPSEEK_API_KEY_EXTERNAL` to `DEEPSEEK_API_KEY`, pins `DEEPSEEK_BASE_URL=https://api.deepseek.com`; installs `bwrap`; keyless PRs (forks/Dependabot) skip. Never uses `pull_request_target`.
  - `e2b-e2e.yml`, `pi-ai-provider-e2e.yml` — provider-specific real-API suites.
  - `landlock-run.yml` / `landlock-run-release.yml` — native Landlock build matrix and release.
  - `python-release.yml` — Python SDK wheel + runtime-bin release.
  - `release.yml` / `release-vendor.yml` — npm releases.
  - `desktop-build.yml`, `build-exe-for-python-sdk.yml`, `docs-pages.yml`, `sandbox.yml`, `issue-lifecycle.yml`, `issue-policy.yml`.
- Pre-push hooks via lefthook (`lefthook.yml`, `scripts/install-lefthook.mjs`).

## Environment Configuration

**Required env vars:**
- `DEEPSEEK_API_KEY` — DeepSeek LLM + search API key (default credential ref for `dsh-llm-deepseek`, `dsh-web-search-deepseek`).
- `DEEPSEEK_BASE_URL` — optional chat-completions endpoint override.
- `DEEPSEEK_SEARCH_BASE_URL` — optional search Messages endpoint override.
- `EXA_API_KEY`, `PERPLEXITY_API_KEY` — optional web-search provider keys.
- `E2B_API_KEY` — optional E2B sandbox key (`packages/e2b/e2b/src/index.ts`).
- `DSH_HOME` — harness home directory (profiles, credentials, anonymous id, settings).

**Secrets location:**
- Root `.env` (gitignored) and `$DSH_HOME/.env` — loaded through the trusted environment layers (`packages/util/launch-environment/`). Secrets are never committed; CI injects `DEEPSEEK_API_KEY` from the `DEEPSEEK_API_KEY_EXTERNAL` repo secret.
- Credential configuration uses *references* (`CredentialRef`, env var names) rather than literal keys — a literal API key is not a configuration value (`packages/llm/llm-deepseek/src/index.ts`).

## Webhooks & Callbacks

**Incoming:**
- None inbound. External provider responses are pull/poll (SSE streams, REST), not webhooks.

**Outgoing:**
- None configured outbound webhook endpoints. Subagent delegation to Claude Code / Codex (`packages/subagent/subagent-claude-code/`, `subagent-codex/`) and the Agent Client Protocol server (`packages/acp/acp/`) are local-process/stdio, not network webhooks. Telemetry exports out over OTLP/HTTP when `session-telemetry-otel` is in `FULL`/`FEEDBACK_ONLY` mode.

---

*Integration audit: 2026-08-17*
