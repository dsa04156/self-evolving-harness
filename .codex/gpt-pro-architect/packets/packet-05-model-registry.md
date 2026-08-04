# Architect Packet 05 — Provider-aware model registry

## Metadata

- repo: `dsa04156/self-evolving-harness`
- branch / base commit: `main` / `d7310d7e1eca24d5c6cdcb2d4558a7a27c3f9ae8`
- packet date: 2026-08-04 (Asia/Seoul)
- previous packet: `architect/PACKET_04_FINAL_EVIDENCE.md`
- current goal: replace the short provider-fixed model menu with a broad, executable model registry
  while preserving an independently owned coding-agent loop.

## Approval Scope

- destination: the exact existing ChatGPT.com architect conversation
- transport: Oracle 0.16.1 exact-tab attach preflight, then the already-approved direct-CDP fallback
  only if Oracle cannot attach
- data categories: this bounded repo summary, selected file names, exact public-reference SHAs, test
  counts, and redacted operational results
- excluded: source upload, `.env`, credentials, key values, browser storage/cookies, sealed benchmark
  data, raw traces, personal data, and provider calls requiring payment
- authorization: the user explicitly requested this architect skill and authorized planned external
  review; no new window, tab, upload, or engine is authorized.

## Canonical Context

SEH must remain a standalone runtime. It owns context construction, the model/tool loop, filesystem and
shell execution, verification, evidence, sessions, and the separate HarnessVersion evolution lifecycle.
It cannot wrap Codex, Gajae-Code, OpenCode, or another agent runtime. Catalog visibility is not account
entitlement, and task retry is not harness evolution.

## Reference-code observations

No reference source was copied or added as a dependency.

- Gajae-Code `38e026c785968e722e5b3a1b8025cadfc54c8c84`: `model-manager.ts` combines static,
  models.dev, cache, and dynamic sources; `model-selector.ts` exposes provider-aware search.
- OpenCode `7fe993879f98aa17cecc70f70d3f40d6f0f11689`: provider plugins are separate from
  `models-dev.ts` catalog caching and the model-selector UI searches provider/name/ID.
- Oh My OpenAgent `55ea9490b70b2f2017077e3f78d4bf7db3555bc8`: its model-core resolves host-provided
  model availability and provenance, but does not own a standalone provider transport.

These observations motivated interfaces and UX only. The implementation is clean-room TypeScript.

## Implemented change

### Runtime

- `src/product/provider-registry.ts`: one typed registry for OpenAI, OpenRouter, and Ollama; it owns
  labels, credential-environment slot names, fixed endpoints, transport types, and curated examples.
- `src/providers/openai-compatible-chat-provider.ts`: native Chat Completions adapter used for
  OpenRouter. It translates SEH's model contract, preserves provider-bound assistant/tool-call history,
  disables hidden SDK retries, accounts reported usage, supports cancellation, and returns safe errors.
  SEH still executes tools and controls every model iteration.
- `src/providers/openrouter-catalog.ts`: live discovery from the fixed official `/models` endpoint,
  filtered to text-output entries advertising `tools`. Redirects fail closed, response bytes and row
  count are capped, UTF-8 and projected fields are validated, and terminal controls are removed.
- `src/product/config.ts` and `coding-agent.ts`: executable OpenRouter config/adapter binding. The only
  accepted endpoint is `https://openrouter.ai/api/v1`; keys remain process-environment-only.

### UX

- `/model` now selects the `(provider, model)` pair rather than keeping the active provider fixed.
- The initial view mixes useful OpenAI, live OpenRouter, and local rows. Search matches provider,
  display name, and exact model ID. Each provider has a custom-ID row.
- A real PTY smoke displayed `Model registry · 293 routes`; searching `claude` narrowed it to 17 live
  candidates. A separate live discovery returned 258 tool-capable OpenRouter routes and included both
  Claude and Gemini families.
- OpenRouter was added to init/help/doctor and Bash/Zsh/Fish completion.

## Security and failure boundaries

- Config cannot redirect an OpenRouter key to a custom host; catalog fetch uses `redirect: error`.
- Live response processing is capped at 8 MiB and 2,000 rows before projection.
- Provider history includes the producing provider ID and rejects cross-provider replay.
- Catalog discovery can fail without disabling bundled examples; a discovered row proves visibility,
  not credentials or entitlement.
- No key value is persisted in config, memory, event, session, docs, tests, or this packet.
- `fast-uri` was patched from 3.1.4 to 3.1.5 after the audit identified its current advisory.

## Evidence

- `npm run verify:release`: 244/244 tests passed, 131 JSON Schemas compiled, deterministic demo passed,
  publication governance passed, historical scan reported `secrets=0`, trust-plane conformance passed.
- After the final bounded-stream/redirect hardening and dependency patch: TypeScript check passed;
  OpenRouter plus product/TTY focused suite 33/33 passed; 131 schemas compiled; live catalog returned
  258 tool-capable routes; `npm audit --omit=dev` reported 0 vulnerabilities.
- Actual alternate-screen PTY smoke: registry opened with 293 routes, `claude` filtered 17/293, cancel
  and `/exit` completed normally.
- Package dry run produced `self-evolving-harness@0.5.0`; `seh --version` printed `0.5.0`.
- `git diff --check` passed. Current bytes are intentionally uncommitted pending this narrow review.

## Known limitations

- Direct first-party adapters are OpenAI Responses and local Ollama; other vendors are executable via
  the OpenRouter Chat Completions route, not first-party Anthropic/Google SDK adapters.
- Live model lists and provider-side aliases can drift. SEH records the exact requested model and the
  provider-reported model but cannot prove opaque server routing.
- No paid provider inference was run; deterministic fake transports test execution semantics.
- The registry is refreshed on picker open and is not yet persisted as a cross-process TTL cache.

## Decision Needed

Judge only this model-registry increment. Does it close the prior “too few models / provider-fixed UX”
defect with an actually executable, independent runtime path, without weakening credential, evidence,
or harness-evolution boundaries? Identify only release-blocking defects; do not request broad new
provider SDKs, a GUI, paid inference, or architecture expansion unless necessary for correctness.

## Required Response Format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
