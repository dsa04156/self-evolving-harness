# Architect Packet 07 — Codex Fork Decision

## Metadata

- repo: `dsa04156/self-evolving-harness`
- branch: `main`
- local/remote commit: `e816af35dc2abdb61ede5a5403723cc2d76a1827`
- packet date: 2026-08-04
- previous packet: Packet 06S, approved and closed
- current goal: decide whether to replace the independent SEH runtime with a fork of OpenAI Codex and attach the evolution system, or preserve the independent kernel and reuse only bounded Codex patterns/components

## Approval Scope

- destination: existing ChatGPT.com architect thread
- transport: Oracle exact-tab dry-run, then the previously approved exact-tab direct-CDP fallback if Oracle live attach remains unavailable
- data categories: public-repo architecture summary, public commit identities, public license facts, code-size/dependency observations, and the decision question below
- excluded: secrets, credentials, environment values, raw traces, sealed benchmark bodies, screenshots, uploads, and unrelated user data

## Original Contract That Still Governs the Repo

The user originally required an independently executable coding-agent harness that directly owns provider abstraction, agent loop, context, tool execution, filesystem/shell tools, memory, skills, workflow, subagents/jobs, sessions, permissions/sandboxing, evidence, verification, recovery, and a separate first-class Harness Evolution Loop. The explicit prohibitions included:

- do not implement a Codex wrapper;
- do not use an existing agent runtime as the core executor;
- do not call task retry self-evolution;
- keep evaluator, permissions/safety, benchmark data, budget, model identity, audit log, tool implementation, middleware, and optimizer immutable in the MVP.

The tracked `SCOPE.md`, `RESEARCH_CONTRACT.md`, and `NON_GOALS.md` encode those constraints. Changing the core to Codex would therefore be a deliberate research/product contract pivot, not an implementation detail.

## Current SEH State

- Package version: `0.7.0`.
- TypeScript source: 63,116 lines; source plus tests: 87,222 lines.
- Current public commit has a clean worktree and green hosted CI.
- The deterministic release gate previously passed 260/260 tests and 131 schemas.
- The product now has an Ink fullscreen TUI, home screen, slash palette/autocomplete, model/provider/reasoning/service-tier selection, owned model/tool loop, read/write/edit/bash/git tools, filesystem memory, sessions, verification, bubblewrap sandbox integration, model-callable child agents and backend jobs, skills, and read-only harness/evolution status.
- The backend already contains versioned harness components, evidence/audit infrastructure, bounded mutation, isolated Git-worktree evaluation, external evaluator process, promotion/rejection/rollback records, and separate Session/HarnessVersion lifecycles.
- The largest current integration gap is not “no runtime”; it is that the exact product execution configuration is not yet materialized into the persistent `HarnessComponentRegistry`, and workflow/routing/subagent policies are not yet fully wired through the product path. Empirical B0–B6 and held-out claims remain intentionally `NOT TESTED`.

## Fresh Codex Source Audit

Official source was inspected at exact commit:

- repository: `openai/codex`
- commit: `db1a4145692fcfc88fb354f478b0019ca0d2ef9d`
- commit timestamp: 2026-08-04T03:49:53Z
- license: Apache-2.0
- checkout size: approximately 88 MiB, 5,512 files under `codex-rs`
- Rust line counts from the selected trees, including tests: core 298,637; TUI 238,882; app-server 128,410; total 665,929

Observed coupling:

- `codex-tui` directly depends on a broad set of Codex crates: app-server client/protocol, config, connectors, plugins, login, model provider/manager, protocol, rollout, sandboxing, state, and many utilities.
- `codex-app-server` directly depends on `codex-core` plus login, provider, tools, sandboxing, state, thread store, skills, hooks, plugins, MCP, and many extension crates.
- `codex-core` itself depends on the provider, tools, state, sandboxing, skills, memories, hooks, MCP, thread store, rollout/trace, plugins, config, and many other Codex crates.
- The current app-server exposes mature Thread/Turn/Item streaming, model lists and effort options, permissions, skills, hooks, plugins, MCP, background terminals, thread persistence/resume/fork, and command execution.

Inference: the polished Codex TUI is not a small independent skin. Copying it wholesale either imports a large fraction of the Codex workspace or requires a substantial decoupling rewrite. Using Codex app-server would be technically simpler but would explicitly make Codex the runtime backend, violating the current contract.

## Options

### A — Full Codex fork as the new product/core

Benefits: fastest path to Codex-grade login, model catalog, TUI behavior, app-server protocol, sandbox/platform maturity, MCP/plugins, and broad UX coverage.

Costs: abandons the independent-runtime claim; makes the research contribution “evolution layer on a Codex fork”; imports a very large Rust/upstream-maintenance surface; creates difficult trust-boundary and matched-baseline attribution questions; requires Apache attribution/modified-file notices and a clear rebrand; risks making evolution mutations inseparable from upstream Codex changes.

### B — Keep SEH core; bounded transplant of Codex UX/protocol patterns

Benefits: preserves the research contract, current 87k-line tested investment, component/evidence/evolution semantics, and independent evaluation boundary. We may port or clean-room reimplement selected Apache-2.0 interaction patterns with exact source provenance and license compliance: Thread/Turn/Item-style product events, slash/menu behavior, session resume/fork ergonomics, status surfaces, app-server-shaped API, and targeted TUI widgets.

Costs: slower than inheriting the full product; login via a user's Codex/ChatGPT subscription remains unavailable to an independent provider adapter; each reused code fragment requires provenance and license tracking; UX parity must be earned feature by feature.

### C — Dual distribution

Keep the independent SEH core as the research artifact, while creating a separately named optional Codex-derived distribution that embeds SEH evolution around a Codex fork. This delivers a product experiment but must never be used as evidence for the standalone-runtime claim or mixed into the independent B0–B6 track.

Costs: two languages/products, duplicate integration and release work, high maintenance, and a likely distraction before the independent core is fully integrated.

## Local Recommendation

`REVISE` the implementation plan toward Option B. Do not replace the core with Codex. Treat Codex as a source-provenance-controlled UX and protocol reference. First wire the actual product run into the versioned component graph and make workflow/routing/subagent prompt policies executable. Then add a Codex-shaped local app-server/session event surface and continue closing UX gaps. Consider Option C only after the independent artifact and evaluation protocol are frozen; never combine its evidence with the standalone track.

## Decision Needed

Judge the fork proposal against both product velocity and the existing research contract.

1. Is a full Codex fork now justified, or would it invalidate the central independent-harness contribution?
2. Is Option B technically credible given the observed Codex TUI/core coupling and current SEH state?
3. If Option B is approved, name the smallest next implementation slice that most improves Codex-like usability without making Codex the runtime backend.
4. Identify any licensing, attribution, security, evaluation, or upstream-maintenance condition that must be added before reusing Codex code or patterns.

## Required Response Format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
