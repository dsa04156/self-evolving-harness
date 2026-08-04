# Architect Packet 08R — Product HarnessVersion release seal

## Scope

- repository / branch: `dsa04156/self-evolving-harness` / `main`
- date: 2026-08-04 (Asia/Seoul)
- previous decision: Packet 08 `APPROVE`; the Round 07 authority-path blocker is closed
- requested decision: approve only the exact committed `0.8.0` candidate for an unchanged
  expected-old fast-forward publication
- not performed: Codex runtime/app-server/crate/login/provider use, paid inference, protected data,
  benchmark execution, empirical evolution, promotion, or research-claim expansion

## Exact candidate identity

- public remote and feature parent:
  `e816af35dc2abdb61ede5a5403723cc2d76a1827`
- exact candidate commit:
  `9c13755aca6028b352ce5d1390675686b0ab7d83`
- exact candidate tree:
  `76010b3b08f3ce1cc7fa1e16cbad12e36df74a3c`
- commit subject: `feat: bind product sessions to harness versions`
- parent-to-candidate binary diff SHA-256:
  `ad11345327e204496083b8f0050c503b427b2f1492280f8516ad3207e5b1cb2d`
- `package-lock.json` SHA-256:
  `30a10f72d37da039ac1295cc11ded3e04c64cf05ffc6668cc5d8796ee8584043`
- ancestry: one normal commit directly ahead of the observed public remote

An earlier local candidate `f1a3ea3c16f64c0f84ae0bc3b1214dcfc4b644b0` was invalidated after the
full clean gate exposed one stale provider-switch test expectation. The test expected an execution-
affecting provider change to remain a child of the old thread. The accepted contract requires a new
root thread. The test was corrected, the commit identity changed, and every clean gate below was run
from the new candidate. The invalidated candidate was not pushed or submitted as release evidence.

## Complete changed-path inventory

Parent-to-candidate diffstat: **39 files changed, 3,578 insertions, 205 deletions**.

```text
M .codex/gpt-pro-architect/NOTES.md
M .codex/gpt-pro-architect/direct-cdp.mjs
M .codex/gpt-pro-architect/ledger.md
A .codex/gpt-pro-architect/packets/packet-07-codex-fork-decision.md
A .codex/gpt-pro-architect/packets/packet-08-product-harness-execution.md
A .codex/gpt-pro-architect/responses/response-07-codex-fork-decision.md
A .codex/gpt-pro-architect/responses/response-08-product-harness-execution.md
M .codex/gpt-pro-architect/thread.md
M CHANGELOG.md
M README.md
A docs/architecture/adr-0007-codex-patterns-not-runtime.md
A docs/research/codex-reuse-ledger.md
M docs/research/source-ledger.md
M docs/user-guide.md
M package-lock.json
M package.json
A schemas/product-thread-projection.schema.json
M src/harness/component-registry.ts
M src/index.ts
M src/product/cli.ts
M src/product/coding-agent.ts
M src/product/defaults.ts
A src/product/harness-registry.ts
M src/product/interactive.ts
A src/product/resources.ts
M src/product/session-store.ts
M src/product/shell-completion.ts
M src/product/terminal-ui.ts
A src/product/thread-projection.ts
M src/runtime/agent-loop.ts
M src/runtime/standalone.ts
M src/runtime/workflow.ts
M test/product-cli.test.ts
M test/product-coding-agent.test.ts
A test/product-harness-registry.test.ts
M test/product-interactive.test.ts
M test/product-openrouter-integration.test.ts
A test/standalone-runtime-ownership.test.ts
M test/workflow-routing.test.ts
```

## Clean committed-candidate verification

A separate detached worktree was created at exact candidate
`9c13755aca6028b352ce5d1390675686b0ab7d83`. Dependencies came only from the committed lockfile.
Node 24.18.1 ran npm and all project commands. The active checkout was not used as release evidence.

`npm run verify:release`: **PASS**

- TypeScript strict check: PASS
- build: PASS
- tests: **265/265 PASS**, 8 suites
- fail / cancelled / skipped / todo: **0 / 0 / 0 / 0**
- JSON Schemas compiled: **132**
- fake-provider demo: completed → retired; verification passed; 2 model calls, 1 tool call,
  20 events, 5 receipts
- development process boundary: verified; 8 roles; 7 adversarial rejections; provider used false;
  promotion authorized false; research evidence authorized false
- publication governance: PASS
- historical publication union: 4 roots, 64 commits, 456 trees, 878 blobs, 19,742 observations
- post-corrective scan: 60 commits, 598 blobs; secrets **0**; environment paths **0**
- trust-plane conformance: verified; 7 domains; 52 artifacts; 7 outstanding empirical obligations;
  authorities granted **0**

Focused product/runtime boundary command: **15/15 PASS**. It explicitly covers:

- identical ProductExecutionConfig → identical content-addressed HarnessVersion;
- changed execution configuration → different HarnessVersion;
- model, reasoning effort, and service tier recovery from the pinned version;
- root → resume → fork exact version/closure inheritance despite current-config drift;
- explicit one-time `legacy-current` bridge without an exact-replay claim;
- tool-description-to-implementation/schema misbinding rejection;
- runtime-contract mismatch rejection;
- causal workflow transitions;
- bounded-child routing and pinned subagent-prompt behavior;
- high-risk primary retention;
- projection reconstruction plus authority rejection;
- provider-switch history isolation through a detached root; and
- no Codex, Gajae-Code, or OpenCode import/dependency/process invocation in the product path.

Additional checks on the same detached candidate:

- `npm audit --omit=dev`: **0 vulnerabilities**
- `npm pack --dry-run --json`: PASS; version `0.8.0`; 981,534 bytes packed; 5,088,177 bytes
  unpacked; 661 entries; integrity
  `sha512-pLq0ctm2bbHHI0BbiDXcmwS/EPlAsRNbg0qSAzXwukIg1f/6h/hK5V2/BDd1A/3csgLrncOY5sk0BWtnLTTqYA==`
- installed package command `seh --version`: `0.8.0`
- `git diff --check`: PASS
- `git status --porcelain=v1`: empty
- post-verification `HEAD`: `9c13755aca6028b352ce5d1390675686b0ab7d83`
- post-verification `HEAD^{tree}`: `76010b3b08f3ce1cc7fa1e16cbad12e36df74a3c`
- remote observed immediately before packet:
  `e816af35dc2abdb61ede5a5403723cc2d76a1827 refs/heads/main`

The candidate commit and detached candidate tree did not change after this clean run. No credential
was read, no provider request was made, and no protected task or benchmark body was accessed.

## Claim boundary

This seal covers deterministic product-to-HarnessVersion integration, exact session lineage,
workflow/routing causality, projection non-authority, provider-history isolation, packaging, and
repository integrity. It does not establish live-provider interoperability, B0–B6 performance,
held-out improvement, attribution benefit, evidence efficiency, cross-model transfer, empirical
harness evolution, self-improvement, or production security.

## Decision needed

May exact candidate `9c13755aca6028b352ce5d1390675686b0ab7d83` be published unchanged by an
expected-old guarded fast-forward from remote head
`e816af35dc2abdb61ede5a5403723cc2d76a1827`?

## Required response format

Decision: APPROVE | REVISE | BLOCK

Rationale:

Required changes:

Risks/missing evidence:

Next packet request:
