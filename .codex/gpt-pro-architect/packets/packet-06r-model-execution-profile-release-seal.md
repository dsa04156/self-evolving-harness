# Architect Packet 06R — Model execution-profile release seal

## Scope

- repository / branch: `dsa04156/self-evolving-harness` / `main`
- date: 2026-08-04 (Asia/Seoul)
- previous decision: Packet 06 `APPROVE`; no product/architecture/provider/schema/UX change required
- requested decision: approve only the exact committed candidate for an unchanged expected-old
  fast-forward publication
- prohibited and not performed: source revision after seal, paid inference, provider SDK, GUI, cache,
  benchmark access, evaluator change, evolution run, or empirical claim

## Commit and publication identity

- public remote head before push:
  `fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad`
- local continuity commit already reviewed after Packet 05 publication:
  `13361322bd225c0076d5a40b34792c5533d6d086`
- feature parent:
  `13361322bd225c0076d5a40b34792c5533d6d086`
- exact candidate commit:
  `e3d793ebd7192c04c73b19b300feb2f155f91e3b`
- exact candidate tree:
  `1fd7755a3fade3e39084d21e15c3b3f14d974047`
- candidate distance from public remote: 2 commits, linear ancestry
- feature commit subject: `feat(models): add model execution profiles`

The intended publication is one expected-old guarded fast-forward:

```text
fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad
  → 13361322bd225c0076d5a40b34792c5533d6d086  Packet 05 closure documentation
  → e3d793ebd7192c04c73b19b300feb2f155f91e3b  execution-profile feature
```

No merge, rebase, squash, amend, force rewrite, or candidate-byte modification occurred.

## Identity hashes

- canonical parent-to-candidate binary diff SHA-256:
  `3b4a4248c17c8210c006da9ab95b6e82fef42311cdb6a849a749ed9241cce29a`
- canonical remote-to-candidate binary diff SHA-256:
  `9992191b506681611266ec26a78c060301b7e0f50187401d2311dccd5976f8fe`
- `package-lock.json` SHA-256:
  `b35f32bfb2cbace7f60528366100b576806207f3a05b1cd060122819641da4a7`
- `src/product/model-profile.ts` SHA-256:
  `76986b0d44f80eab25b99cce7472d000651cca9e0584409146ac6fa08c8cad48`
- `test/product-model-profile.test.ts` SHA-256:
  `ba2d02527d0f610913514ad827f391b0deb12201531281bab44969fe4f37dc90`

The two new-file hashes exactly match Packet 06's reviewed working candidate.

## Feature commit inventory

Parent-to-candidate diffstat: **37 files changed, 1,279 insertions, 75 deletions**.

```text
M CHANGELOG.md
M README.md
M assets/terminal-demo.svg
M docs/research/cli-ux-reference.md
M docs/research/execution-paths.md
M docs/research/source-ledger.md
M docs/user-guide.md
M package-lock.json
M package.json
M schemas/provider-proxy-request-payload.schema.json
M src/domain/model.ts
M src/index.ts
M src/product/cli.ts
M src/product/coding-agent.ts
M src/product/config.ts
M src/product/fullscreen-tui.tsx
M src/product/interactive.ts
M src/product/model-catalog.ts
A src/product/model-profile.ts
M src/product/provider-registry.ts
M src/product/session-store.ts
M src/product/shell-completion.ts
M src/product/terminal-ui.ts
M src/providers/openai-compatible-chat-provider.ts
M src/providers/openai-responses-provider.ts
M src/providers/openrouter-catalog.ts
M src/providers/provider-proxy-wire.ts
M src/runtime/agent-loop.ts
M src/runtime/standalone.ts
M test/openai-provider.test.ts
M test/openrouter-provider.test.ts
M test/product-cli.test.ts
M test/product-coding-agent.test.ts
M test/product-fullscreen-tui.test.ts
M test/product-interactive.test.ts
A test/product-model-profile.test.ts
M test/product-openrouter-integration.test.ts
```

Remote-to-candidate additionally contains only the seven Packet 05 closure paths from the linear
continuity commit:

```text
M .codex/gpt-pro-architect/NOTES.md
M .codex/gpt-pro-architect/ledger.md
A .codex/gpt-pro-architect/packets/packet-05r-model-registry-release-seal.md
A .codex/gpt-pro-architect/packets/packet-05s-model-registry-post-publication.md
A .codex/gpt-pro-architect/responses/response-05r-model-registry-release-seal.md
A .codex/gpt-pro-architect/responses/response-05s-model-registry-post-publication.md
M .codex/gpt-pro-architect/thread.md
```

Remote-to-candidate total: **44 files changed, 1,868 insertions, 88 deletions**.

## Clean committed-candidate verification

A separate detached Git worktree was created at exact candidate
`e3d793ebd7192c04c73b19b300feb2f155f91e3b`. Dependencies were installed from the committed lockfile
using Node 24.18.1 and npm 11.18.0. The primary dirty continuity checkout was not used as evidence.

`npm run verify:release`: **PASS**

- TypeScript check: PASS
- build: PASS
- deterministic tests: **257/257 PASS**
- suites: 8
- fail / cancelled / skipped / todo: **0 / 0 / 0 / 0**
- JSON Schemas compiled: **131**
- deterministic fake-provider demo: completed → retired; verification passed
- development OS process boundary: verified; provider used false; promotion authorized false
- publication governance: PASS
- historical publication continuity: PASS
- post-corrective commits / blobs scanned: 56 / 521
- secrets / environment paths: **0 / 0**
- trust-plane conformance: verified; authorities granted **0**

The clean run's model/product/provider suite was rerun separately: **47/47 PASS**. It includes:

- model-specific default and supported-effort validation;
- unsupported effort and Fast/service-tier rejection;
- immutable `executionProfile` session evidence;
- `reasoningEffort` in request evidence;
- exact OpenAI Responses reasoning/service-tier wire mapping;
- exact OpenRouter Chat Completions reasoning wire mapping;
- same-provider opaque reasoning continuation;
- provider-switch history isolation; and
- registry → fake transport → SEH-owned tool loop → verifier completion.

Additional checks on the same detached candidate:

- `npm audit --omit=dev`: **0 vulnerabilities**
- `npm pack --dry-run`: PASS; version `0.6.0`; 936,814 bytes packed; 4,869,398 bytes unpacked;
  integrity `sha512-NWuPU6bsV9iufr+/JKjxdqetz4L6T8dJx7AXij3n9WQWaNnbfIfzuZmQygHHVw7V9OEz0TbMXsVNFnFajQofGw==`
- `seh --version`: `0.6.0`
- `git diff --check`: PASS
- `git status --porcelain=v1`: empty
- post-verification `HEAD`: `e3d793ebd7192c04c73b19b300feb2f155f91e3b`
- post-verification `HEAD^{tree}`: `1fd7755a3fade3e39084d21e15c3b3f14d974047`
- observed remote immediately before this packet:
  `fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad refs/heads/main`

No credential was read and no provider request was made.

## Claim boundary

This seal covers deterministic catalog/profile selection, validation, persistence, session evidence,
provider request construction, bounded history behavior, packaging, and repository integrity only.
It does not establish account entitlement, live provider acceptance, model quality, comparative
performance, Ultra orchestration, empirical harness evolution, self-improvement, or generalization.

## Decision needed

May exact candidate `e3d793ebd7192c04c73b19b300feb2f155f91e3b` be published unchanged by an
expected-old guarded fast-forward from remote head
`fa0dec6aa8176bb01cff7515ce80d3ca0f0619ad`?

## Required response format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
