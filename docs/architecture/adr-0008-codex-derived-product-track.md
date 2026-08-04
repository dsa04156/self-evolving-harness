# ADR-0008: Add a separately governed Codex-derived product track

- Status: accepted for `product/codex-fork`
- Date: 2026-08-04
- Supersedes: ADR-0007 only on the Codex-derived product branch
- Standalone baseline: `standalone-v0.9.0` at
  `58114ebbbfc3f442ffa896c4d534718ae1f76b69`
- Codex upstream: `openai/codex@5af85998c24fb3353ddd8164c3ed472057b03cb3`

## Context

The standalone SEH runtime proves that the component, evidence, evolution, and trust contracts can
exist without another coding-agent harness. It does not yet match the product breadth and terminal
polish of Codex CLI. The user has now prioritized a complete, usable coding-agent product and
explicitly authorized source reuse where the license permits it.

The previous audit remains technically correct: Codex TUI is tightly coupled to Codex core,
app-server, provider, login, state, sandbox, skills, plugins, MCP, and rollout crates. Therefore the
product track imports the whole upstream workspace instead of pretending that the TUI is a detachable
skin.

## Decision

This branch contains a full, exact-SHA Apache-2.0 Codex source import under `upstream/codex`. It will
be modified internally so that harness evolution is a first-class lifecycle, not implemented by
spawning an unmodified `codex` binary or treating app-server as a black-box backend.

The two distributions remain distinct:

| Track | Runtime authority | Intended claim |
| --- | --- | --- |
| `standalone-v0.9.0` and `main` | SEH TypeScript kernel | independent standalone harness |
| `product/codex-fork` | modified Codex Rust workspace | Codex-derived product with SEH evolution |

The Codex-derived product must pin an exact `HarnessVersion` before a thread executes, emit
SEH-owned events and receipts from inside the runtime, and use a separately authorized evaluator and
promoter for candidate qualification and deployment. Task retry, recovery, reflection, and upstream
merge remain distinct from harness evolution.

## Integration boundary

```text
Codex CLI / TUI / app-server
  -> modified Codex session and tool runtime
  -> SEH harness-version resolver
  -> append-only RuntimeEvent and EvidenceReceipt bridge
  -> isolated candidate worktree
  -> external evaluator and immutable promotion policy
  -> promote, reject, or rollback audit record
```

The implementation may reuse Codex login and provider code only through the unmodified supported
upstream flow. It must not scrape browser state, copy access tokens, call private endpoints through a
new credential path, or claim that a ChatGPT subscription is portable to third-party distributions
without a successful supported-flow verification.

## Evidence separation

Codex-derived traces and evaluation results carry `runtimeTrack = "codex-derived"`. They cannot be
pooled with, substituted for, or presented as standalone-runtime evidence. Upstream imports and
ordinary product patches are development commits, never candidate mutations. Every upstream update
must pin a commit and update the provenance ledger before merge.

## License and branding

The imported source retains `upstream/codex/LICENSE` and `upstream/codex/NOTICE`. Modified or copied
files are recorded in `docs/research/codex-fork-provenance.json`. The resulting product will use SEH
branding and must not imply OpenAI endorsement or official Codex distribution status.

## Rollback

The standalone tag and branch history remain immutable. The product branch can be abandoned without
rewriting standalone evidence. Candidate rollback inside the product restores a complete
content-addressed harness closure; it is not implemented as an upstream Git rollback.
