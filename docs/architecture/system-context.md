# System Context and Six-Layer Architecture

Status: Gate 1R design contract  
Protocol: `draft-1`

## Decision

The system is a standalone coding-agent harness. It owns model invocation, context construction,
the agent loop, tool dispatch, persistent state, skills, subagents, permissions, evidence, and
verification. Codex, Gajae-Code, OpenCode, NexAU, DeepAgent, and similar systems are neither runtime
backends nor required control planes.

Two lifecycles share evidence but never share identity:

- a `Session` runs tasks under one pinned, immutable `HarnessVersion`;
- a `HarnessVersion` evolves only through candidate creation, independent evaluation, and an audited
  promotion decision.

No event may simultaneously mean “retry this task” and “create a new harness.”

## Layers

| Layer | Owns | Must not own |
|---|---|---|
| 1. Agent Runtime Kernel | provider interface, context builder, append-only agent loop, tool registry/executor, session and subagent runtime, event bus | candidate promotion, evaluator policy |
| 2. Harness Component Plane | immutable typed manifests, authoritative type registry, content-addressed dependency closure, external provenance/lifecycle records | in-place content edits or per-component activation |
| 3. Operations Control Plane | `start`, `submit`, `observe`, `interrupt`, `resume`, `recover`, `validate`, `finalize`, `retire`, checkpoints and ownership | harness mutation |
| 4. Evidence Plane | runtime events, verifier facts, receipts, artifacts, failure reports, hash-chain projections | causal claims presented as facts |
| 5. Evolution Control Plane | weakness mining, clustering, attribution, bounded proposals, candidate registry, canary coordination | final-role access, promotion-policy changes |
| 6. Immutable Trust Plane | evaluator, permissions/safety, sealed data, budget enforcement, model identity, audit verification, promotion policy | proposer-controlled code or writable candidate mounts |

The layer number is an architectural grouping, not a privilege order. Authority is defined by
principals and capabilities.

## Runtime principals

1. **Runtime principal** reads one resolved harness manifest, executes tools through the permission
   broker, and appends events. It cannot activate a harness version.
2. **Operations owner** is the single writer for a session checkpoint and lease. It may recover a
   session but cannot change its pinned harness version.
3. **Proposer principal** reads redacted `D_mine` evidence and writes only a proposal plus its candidate
   worktree. It cannot read `D_gate` details or any final-role path.
4. **Evaluator principal** mounts a candidate read-only, mounts its authorized benchmark split
   read-only, and emits signed/schema-valid results through a narrow output channel. It cannot mutate
   the candidate or registry.
5. **Promoter principal** applies the immutable promotion policy to evaluator results and audit facts.
   It cannot propose mutations or run task-solving model calls.
6. **Audit principal/store** accepts append-only, chained records and verifies sequence, hash, producer,
   and manifest references. It never trusts a candidate-produced receipt.
7. **Model-provider proxy** exclusively holds provider credentials and meters every model role against
   protocol phase accounts.
8. **Benchmark author** creates blinded temporal/task artifacts without candidate-result access; the
   separate protocol author reviews and freezes their hashes.

Development may emulate principals with separate local processes. Such emulation is not claimed as a
production security boundary until UID/container, mount, network, and secret-isolation tests pass.

## Authoritative stores

- **Component registry:** immutable component payload blobs/manifests and append-only external provenance
  records.
- **Harness registry:** immutable whole-version manifests, append-only lineage/lifecycle records, and one
  atomic whole-harness channel pointer.
- **Session store:** append-only event stream and recoverable projections/checkpoints.
- **Artifact store:** content-addressed tool outputs and verification artifacts.
- **Audit store:** chained promotion, rejection, rollback, permission, and access decisions.
- **Memory store:** scoped filesystem records with provenance, retention, and retrieval receipts.
- **Benchmark vault:** split manifests, genuinely sealed material, and withheld-public-test handles,
  readable only by an authorized evaluator phase.

Indexes and checkpoints are rebuildable projections. Event, artifact, component, harness, and audit
records are authoritative only after their hash and schema validate.

## Cross-layer invariants

1. Every runtime event names exactly one `sessionId`, protocol, runtime-state snapshot, and the session's
   pinned `harnessVersionId`.
2. Parent and child/subagent sessions use the same harness version unless a new top-level session is
   explicitly started after promotion.
3. Component payloads and harness manifests are immutable; activation is a whole-harness CAS record.
4. A candidate cannot bind a changed immutable or conditionally-mutable component without a separately
   satisfied, machine-checkable condition. MVP conditions authorize no such changes.
5. Recorded observations carry producer trust; verifier outcomes and inferences are separate schema
   classes and only evaluator-authenticated outcomes satisfy evaluation gates.
6. Candidate evaluation never exposes task content, paths, verifier details, or raw traces from
   `D_gate` or any final role to the proposer.
7. Final roles are not promotion gates. They unlock only after `protocol-v1` freeze for confirmatory
   evaluation of frozen artifacts.
8. Worktrees isolate candidate file histories; only the sandbox/permission layer isolates authority.
9. All model calls, including proposer, summarizer, attribution, judge, reflection, and subagent calls,
   debit the common evaluation ledger.
10. The active version always has a valid rollback target whose content is independently resolvable.
11. Any trust-plane, benchmark, budget, model, environment, schema, or statistical-plan change creates a
    new protocol ID; confirmatory records never mix protocol IDs.

## Bootstrap

The registry starts with two separately identified but composition-equivalent manifests: a retained
bootstrap rollback anchor and an activation target. Their external lineage record links them. The first
signed deployment-pointer initialization selects the target and records the anchor as rollback target;
neither manifest embeds an active state or rollback pointer.

## Deferred implementation decision

The runtime-language and isolation choice is revised in
[ADR-0001](adr-0001-runtime-and-evaluator-stack.md) and remains pending Gate 1R approval. The pre-contract
Python code is hash-pinned under `spikes/python-contract-spike/`, outside all authoritative paths.
