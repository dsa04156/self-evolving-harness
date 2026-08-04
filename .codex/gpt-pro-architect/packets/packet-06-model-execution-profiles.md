# Architect Packet 06 — Codex-style model execution profiles

## Metadata and scope

- repository / branch: `dsa04156/self-evolving-harness` / `main`
- packet date: 2026-08-04 (Asia/Seoul)
- remote base: `fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad`
- local HEAD: `13361322bd225c0076d5a40b34792c5533d6d086` (Packet 05 closure docs only)
- working candidate: CLI `0.6.0`, 35 tracked paths changed plus 2 new source/test paths
- current goal: judge the architecture, correctness, evidence boundary, and release readiness of the
  model / reasoning / speed execution-profile increment
- excluded: credentials, environment values, repository upload, sealed data, raw traces, screenshots,
  live inference, provider entitlement claims, benchmark bodies, and personal data

The user explicitly requested Codex-style model selection, especially model-specific `low`, `high`,
`xhigh`, and related options. This is an incremental product-runtime change. It does not change the
Harness Evolution lifecycle, evaluator, permission policy, benchmark data, optimizer, tool
implementation, or promotion policy.

## Exact prior-art inspection

The reference was inspected from source, not copied:

- repository: `openai/codex`
- branch / exact commit: `main` / `b2dc8b3e4be4fe3a453d50e13835f707b258f15b`
- commit date inspected: 2026-08-04
- license: Apache-2.0

Execution/configuration path followed:

```text
codex-rs/models-manager/models.json
  → protocol/src/openai_models.rs::ModelPreset / ReasoningEffort
  → models-manager/src/manager.rs
  → tui/src/chatwidget/model_popups.rs
  → UpdateModel + UpdateReasoningEffort + PersistModelSelection
  → app/config_persistence.rs
  → core turn configuration
  → core/src/client.rs
  → provider request
```

Observed Codex facts relevant to this candidate:

1. A model preset owns an ordered supported-effort set and a default effort; effort is not encoded in
   the model ID.
2. The picker is two-stage: model first, then only that model's supported reasoning levels.
3. Sol defaults to `low`; Terra and Luna default to `medium`. The inspected normal single-model levels
   extend through `max`.
4. `Max` and `Ultra` are behind `More reasoning…`.
5. Fast is a separate `priority` service tier rather than a reasoning level.
6. Codex lowers `Ultra` to provider-wire `Max` and separately enables proactive multi-agent behavior.
   Therefore SEH does not expose `Ultra` until it can own equivalent orchestration semantics.

Permanent exact-SHA links and observed-fact/inference separation were added to
`docs/research/cli-ux-reference.md`, `docs/research/execution-paths.md`, and
`docs/research/source-ledger.md`.

## Candidate design

### Typed capability profile

New `src/product/model-profile.ts` defines:

- `ModelReasoningCapabilities { defaultEffort, supportedEfforts, mandatory }`
- normalization of provider metadata into the closed order
  `none|minimal|low|medium|high|xhigh|max`
- model-specific default selection and supported-effort validation
- standard picker rows with `Max` behind `More reasoning…`
- explicit labels and cost/latency descriptions

`src/domain/model.ts` owns the shared provider-wire `ModelReasoningEffort` type. `ultra` is absent by
design; it is not relabeled single-model inference.

### Provider-aware catalog

`src/product/provider-registry.ts` now binds reasoning capabilities and optional service tiers to each
curated model. The pinned GPT-5.6 product presets are:

| Model | Default | Supported | Fast |
| --- | --- | --- | --- |
| GPT-5.6 Sol | low | low, medium, high, xhigh, max | priority |
| GPT-5.6 Terra | medium | low, medium, high, xhigh, max | priority |
| GPT-5.6 Luna | medium | low, medium, high, xhigh, max | priority |

Known older routes have narrower profiles or no reasoning metadata rather than inheriting a global
fabricated set. OpenRouter's bounded public catalog parser imports `supported_efforts`,
`default_effort`, and `mandatory`; `null` follows OpenRouter's documented gateway-wide semantics.
Live discovery may supersede a bundled OpenRouter example, but direct OpenAI known-model validation is
pinned locally.

Catalog visibility remains separate from account entitlement and successful inference.

### Product interaction

- `/model`: searchable provider/model picker, then model-specific effort picker
- `/effort [auto|none|minimal|low|medium|high|xhigh|max]`: reopen or set effort
- `/fast [on|off]`: direct OpenAI priority tier only when advertised
- `--effort` and `--fast`: equivalent initialization/run/chat flags
- Bash, Zsh, and Fish completion updated
- fixed header and status show `(provider/model, effort, Fast)`
- project configuration persists the selected execution profile for following task sessions
- an already-running turn is never rebound

### Execution and evidence path

```text
picker or CLI flags
  → strict ProductConfig validation and persistence
  → new immutable ProductSessionRecord.executionProfile
  → standalone runtime ModelRequest.reasoningEffort
  → model-request evidence hash includes reasoningEffort
  → OpenAI Responses reasoning.effort / service_tier
     OR OpenRouter Chat Completions reasoning.effort
  → provider metadata records requested effort and reported service tier
```

OpenRouter assistant `reasoning` and `reasoning_details` are retained as opaque provider-native state
only for the same provider's tool-call continuation. Switching providers creates a new session and
does not replay provider-bound history.

Unsupported known model/effort pairs, unsupported priority pairs, Ollama portable-effort requests,
and malformed persisted values fail before inference. Older config files without `reasoningEffort`
load as provider-default rather than silently inventing a new explicit selection.

## Focused evidence

Focused model/product/provider suite:

- **47/47 PASS**, zero failed, skipped, cancelled, or todo
- includes CLI persistence of `gpt-5.6-sol + xhigh + priority`
- includes Sol default/support validation and rejection of `minimal`
- includes priority rejection on a model that does not advertise it
- includes absence of fake `Ultra`
- includes immutable new-session execution-profile evidence
- includes exact OpenAI and OpenRouter wire parameters
- includes preservation of OpenRouter reasoning history during a tool loop
- includes registry → adapter → SEH-owned tool loop → verifier completion
- includes provider-switch isolation

No-provider PTY smoke on temporary state:

1. initialized `openai/gpt-5.6-sol` without a key and without inference;
2. home header showed `LOW`;
3. `/effort` showed `Low`, `Medium`, `High`, `Extra high`, and `More reasoning…`;
4. selected `High`, then `/fast on`;
5. header showed `HIGH · FAST`;
6. persisted config contained `reasoningEffort: high` and `serviceTier: priority`.

## Complete release evidence

`npm run verify:release` on the current working candidate: **PASS**

- TypeScript check and build: PASS
- deterministic tests: **257/257 PASS**
- suites: 8; failures/skips/cancellations: 0
- JSON Schemas compiled: **131**
- deterministic fake-provider demo: completed → retired; verification passed
- development OS process boundary: verified; provider used false; promotion authorized false
- publication governance and historical continuity: PASS
- scanned historical objects: secrets **0**, environment paths **0**
- trust-plane conformance: verified; authorities granted **0**
- `git diff --check`: PASS
- `npm audit --omit=dev`: **0 vulnerabilities**
- `npm pack --dry-run`: PASS, version `0.6.0`, 639 files, 936.8 kB packed

Candidate identity before commit:

- tracked binary diff SHA-256:
  `920b1e19fd7dfef6e0f0fb240cec3241545ab8dbcfd5399c9ffa8ab497b6db60`
- new `src/product/model-profile.ts` SHA-256:
  `76986b0d44f80eab25b99cce7472d000651cca9e0584409146ac6fa08c8cad48`
- new `test/product-model-profile.test.ts` SHA-256:
  `ba2d02527d0f610913514ad827f391b0deb12201531281bab44969fe4f37dc90`
- lockfile SHA-256:
  `b35f32bfb2cbace7f60528366100b576806207f3a05b1cd060122819641da4a7`

The candidate is intentionally not yet represented as an approved release commit. If this design is
accepted, the builder will commit the exact bytes, bind commit/tree/parent/changed-path identities,
perform a clean committed-candidate release check, and use an expected-old fast-forward push only.

## Claim boundary

Established: deterministic profile selection, validation, persistence, session evidence, provider-wire
construction, and no-provider UX behavior.

Not established: live paid-provider interoperability, provider entitlement, current alias routing,
model quality, comparative performance, proactive Ultra orchestration, empirical harness evolution,
self-improvement, or generalization. No API key was read or transmitted and no credentialed provider
call was made.

## Decision needed

Judge whether this is a faithful clean-room adoption of Codex's model-profile separation and whether
the implementation/evidence is sufficient to proceed to exact candidate commit, clean committed-tree
verification, and an unchanged expected-old fast-forward publication. Identify only concrete blockers
within this increment.

## Required response format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
