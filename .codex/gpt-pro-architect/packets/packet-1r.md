# Architect Gate 1R — Revised Research and Architecture Contract

Date: 2026-07-30  
Project: Standalone Self-Evolving Coding-Agent Harness  
Protocol status: `draft-1`, not frozen for experiments  
Requested decision: `APPROVE`, `REVISE`, or `BLOCK`

## 1. Decision requested

Please determine whether the revised contracts close all Gate 1 blocking findings sufficiently to
authorize a bounded runtime prototype.

An `APPROVE` authorizes only the independent runtime kernel, deterministic fake-provider/fake-tool
tests, process/OS boundary enforcement, version registry, candidate isolation, bounded mutation
prototype, external evaluator process, and promotion/rejection/rollback machinery needed for Gate 2.
It does not authorize paid-provider runs, benchmark evolution, gate/final access, canary activation,
performance claims, security claims, or autonomous-improvement claims.

The prior packet had SHA-256
`dae5250f170c9b6370e6110c8fce92a3e64301910c293fb44dba24cb3eaf213a`.
Your `REVISE` response is retained unchanged with SHA-256
`8a0c1be94f0962eaaf06610a0107e28f0047adb72ada87eebbc51b972afdedce`.
This packet addresses the 26 required revisions within the exact scope you authorized.

## 2. Scope and claim lock

The product is not a Codex wrapper, Gajae-Code plugin, OpenCode plugin, NexAU/DeepAgent front end, or an
external controller around another coding runtime. It must own:

- provider abstraction and model invocation;
- context construction and append-only agent execution loop;
- tool registry/execution, filesystem, shell, Git, permissions, and sandbox;
- filesystem memory, skills, workflows, subagents, backend jobs, and session persistence;
- operations control, events, receipts, verification, recovery, and audit;
- a separately identified harness-evolution lifecycle.

The task loop remains:

```text
context → model → tool call → tool result → verification → completion or retry
```

The evolution loop remains:

```text
multiple traces → weakness mining → failure attribution
→ bounded component mutation → new immutable HarnessVersionManifest
→ independent held-in/gate evaluation → offline canary
→ promote, reject, or rollback
```

A retry, reflection, prompt reinjection, recovery, memory update, resume, or session restart is never
harness evolution. Evolution requires a new content identity, explicit mutation evidence, evaluation of
the exact whole composition, and an append-only promotion/rejection history.

The maximum presently defensible novelty is a systems integration and enforcement contribution:
a standalone runtime combined with typed/content-addressed harness composition, strict lifecycle
separation, machine-enforced principals, and evidence-linked whole-harness promotion. Trace-driven
mutation, worktrees, bounded proposals, held-out evaluation, prompt optimization, rejected-edit memory,
and generic “self-improvement” are prior art and are not claimed as new.

## 3. Prior-art evidence remains exact-SHA scoped

No source code was copied. Findings distinguish observed code paths from inference and are limited to
the inspected commits:

| Source | Exact revision | Execution-path finding |
|---|---|---|
| Gajae-Code | `8778760cf924246ab86e4c6c3fda26da8a572cd8` | Own provider/session/tool/agent loop and deterministic operations/recovery/receipt path; no harness-version evolution found in inspected path. |
| Oh My OpenAgent `dev` | `258fab04159c0d628d7cc4c811e2907aee1cd0a1` | Pure-core/adapters/skills/hooks/tool composition is useful prior art, but inspected editions rely on host runtimes. Sustainable Use License prevents reuse here. |
| OpenAI Codex | `6219b7c40fc9c702c0aef9964e72b492558f60e4` | Thread/Turn/Item, turn loop, tool routing, permissions, events, and persistence are implemented; no inspected content-addressed evolution lifecycle. |
| Agentic Harness Engineering | `faf44bc4aea57413c520bc5711c6ebf628e0da1e` | Outer evaluate/analyze/evolve loop, layered traces, Git lineage/worktrees, and constrained workspace; core execution/evaluation depends on NexAU/Harbor and some debugger behavior is unavailable. |
| Meta-Harness | `44b9942127847f7421db70d8c7e48407f09a3c70` | External proposer writes free-form Python candidates, validation/frontier/test separation; depends on an external coding harness and permits broad executable mutation. |
| Self-Harness | arXiv `2606.09498v1` | Weakness mining, rich failure records, bounded/diverse proposals, preservation checks, rejected-edit memory, and independent evaluation are documented prior art; no public method repository was identified. |
| Harness-evolution evaluation critique | code `ffd1ba1c2c3e31099264f630b9ed44aec63a86a7`; arXiv `2607.12227v1` | Defines parallel/sequential/harness-scaling comparisons and publishes the 45/10/34 Terminal-Bench split; shows why matched feedback/inference budget and search/test separation are necessary. |
| Lilian Weng article | dated 2026-07-04; no immutable page commit | Filesystem memory, explicit background work, progressively broader optimization surfaces, and immutable evaluator/permission boundaries are documented guidance. |
| Darwin Gödel Machine | `a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2` | Archive/open-ended self-modification is prior art and outside the bounded MVP mutation surface. |

The exact source ledger has raw SHA-256
`c232e486dd91a29102749e1499a98e3acb1431c63b3502baa069242a4cab67ee`.
The prior-art matrix, execution paths, gap analysis, and license ledger have respective hashes:
`dde5dd5131328540836108dc1063f0f9b831f19f5ed54f7ce0412337245bb939`,
`3ffe5b24ff4e55a4928d35716fc4049c9684b4caebccb915fe2e176ad95d541d`,
`1e3f3c459dc04b977e6fe026a4706b6a5618086aad1adefade939c7a741e5623`,
and `d047ecd46f17743f7186ad41045bede73b0c94def8f5660952ce2bcc79116e47`.

## 4. Revised object identity and component model

### 4.1 Immutable manifests versus external records

The model now has disjoint objects:

- `ComponentManifest`: immutable identity, type-registry reference, semantic version, payload reference,
  dependency IDs, capability digest, and recomputed behavior closure;
- `HarnessVersionManifest`: immutable runtime-contract/type-registry references, canonical slot bindings,
  semantic version, and full transitive behavior closure;
- `ComponentProvenanceRecord`: trusted append-only origin/build/review information;
- `HarnessLineageRecord`: parent, proposal, attribution, and mutation relationship;
- `HarnessLifecycleRecord`: signed lifecycle transition only;
- `EvaluationResult` and `PromotionDecision`: signed external evidence;
- `DeploymentPointerRecord`: atomic channel generation and whole-harness target.

Evaluation, provenance, lineage, lifecycle, promotion, rollback, and activation never enter component or
harness content identity. Appending any such record leaves both manifest IDs unchanged.

There is no per-component active pointer. A channel selects one exact, previously evaluated whole-harness
manifest through compare-and-swap over the parent harness ID, channel generation, and prior pointer-record
hash. A stale candidate cannot rebase implicitly. Existing sessions and descendants remain pinned.

### 4.2 Authoritative type registry

One protocol-pinned `ComponentTypeRegistry` contains 25 type definitions. Only it determines type,
mutable class, payload schema, dependency types, and maximum capabilities. Candidate input cannot
self-declare any of these.

The only MVP-mutable types are:

`SystemPrompt`, `ContextPolicy`, `MemoryRetrievalPolicy`, `Skill`, `WorkflowPolicy`, `RoutingPolicy`,
`SubagentPrompt`, and `ToolDescription`.

Permission/safety/evaluator/benchmark/budget/model/trace/audit/promotion/tool implementation/middleware/
optimizer types are immutable. Conditionally mutable types have no enabled condition in protocol v1.
The registry canonical identity is
`ctr-sha256:4ea08a4fc41207afab1c571c43a3ca11bbdda3b9268ff556fccbac3a0d7edada`.

### 4.3 Canonical identity and closure

Profile `seh-jcs-v1` freezes:

- RFC 8785 JCS over strict I-JSON and UTF-8;
- NFC text, LF line endings, no BOM/NUL/noncharacters, and no silent evaluation-time normalization;
- SHA-256 with object-specific prefixes;
- canonical set ordering and behavior-sensitive list ordering;
- POSIX relative paths with collision checks;
- no symlinks, hardlinks, special files, executable bits, archives, compression, base64/data URLs, host
  paths, mutable URLs/keys, or indirect artifacts;
- descriptor-relative materialization, no symlink following, and post-materialization rehash;
- sorted/deduplicated full transitive dependency and artifact closure;
- recomputation of IDs, counts, byte totals, capability digests, and mutation deltas.

Changing a tiny reference to replace large or multiple dependencies is charged over the expanded
closure. Every transitively changed stable component family counts toward the one-component or explicit
two-component limit. Mutation records include expanded-closure edit bytes, replacement-surface bytes,
normalized token/structural operations, and capability changes. The 8 KiB ceiling is defense in depth,
not a scientific size-match claim.

### 4.4 Mutable payload languages

All candidate-controlled behavior is canonical declarative JSON:

- typed prompt sections;
- fixed context-source selection/limits;
- fixed memory namespaces and deterministic ranking;
- finite non-executable skill guidance;
- a finite workflow graph with closed actions/triggers/five guards;
- a finite routing table;
- a tool description bound to an immutable tool ID and implementation-schema hash.

Candidate code, bytecode, scripts, expressions, regex guards, imports, builds, plugins, hooks, middleware,
downloads, external references/includes, encoded expansion, shell templates, tool registration, dynamic
state, capability additions, and unbounded generation are rejected. A skill supplies model context only.
A workflow dispatches closed immutable handler IDs only. Mutable tool prose cannot alter executor input
schema, implementation, permissions, mount, network, secret, or budget.

### 4.5 Runtime-state reproducibility

Every evaluation names an immutable `RuntimeStateSnapshot` that pins or resets memory snapshot, workspace
base/overlay, environment/toolchain/container, checkpoints, caches, model configuration, policy bundle,
budget, and network. Fresh paired evaluation overlays never share mutable state.

Children and backend jobs inherit the exact harness ID, protocol ID, snapshot ID, model ID, split
authorization, delegated principal subset, deadline, and budget slice. They may reduce authority but
cannot rebind a newly active harness or any other inherited pin.

## 5. Six-layer architecture and independent state machines

The six layers remain:

1. Agent Runtime Kernel;
2. Harness Component Plane;
3. Operations Control Plane;
4. Evidence Plane;
5. Evolution Control Plane;
6. Immutable Trust Plane.

Layer numbers are functional groupings, not privilege levels. Authority comes from authenticated
principals and capabilities.

The session lifecycle is:

```text
created → initialized → running
running ↔ waiting
running → validating → completed → retired
running/waiting → blocked or recovering
blocked → recovering; recovering → initialized/running/blocked
```

`retired` is terminal. The session receives one harness/snapshot/protocol/model/split/budget binding at
initialization and never changes it. Retry and recovery are session transitions only.

The harness lifecycle is a projection over signed external records:

```text
draft → candidate → statically_validated → evaluating → canary → active → retired
draft/candidate/statically_validated/evaluating/canary → rejected → retired
active → rolled_back → retired
```

No transition skips static validation and exact-composition evaluation. `canary` is offline replay or an
isolated synthetic canary, not live users or final tasks. Activation and rollback are whole-harness CAS
operations. Rejected and rolled-back candidates and evidence are retained.

## 6. Revised trust, transport, and threat contract

### 6.1 TCB and principals

Language separation is explicitly not a security boundary. The planned Node.js 24.x/TypeScript runtime
and Python 3.13 evaluator are engineering choices only.

Conformant evidence requires separate host UIDs and fresh containers/namespaces for runtime, operations,
proposer, evaluator, promoter, audit store, provider proxy, benchmark author, and protocol author as
applicable. The principal matrix freezes each role's:

- UID/container identity;
- read-only/read-write mounts;
- accepted/emitted message types;
- signing/provider/task-handle secrets;
- network destinations;
- CPU/memory/process/time/output/model/tool/feedback caps; and
- exclusive record-creation authority.

The proposer has mine evidence and candidate staging only. The evaluator has an authorized opaque task
vault and read-only exact manifests but no candidate/registry write. The promoter has signed aggregate
evidence and an authenticated CAS request capability but no model/provider or direct registry write.
Only the provider proxy owns provider credentials and meters every model role.

The MVP TCB includes the kernel/container enforcement, bootstrap administrator, protocol keys and pinned
trust executables/policies, canonicalizer/schema validator/crypto, locked runtimes and dependencies.
Git, worktrees, prompts, model outputs, candidate content, mutable memory/workspaces, and SQLite
projections are outside the TCB.

A malicious root/kernel is outside the containment claim. The provider is not assumed to expose
immutable model weights. Audit storage is tamper-evident only while keys/checkpoints and the stated host
assumptions hold. Benchmark-author blinding reduces but cannot eliminate bias/contamination.

### 6.2 Authenticated protocol

Inter-principal transport is a local authenticated Unix socket:

```text
4-byte unsigned big-endian length || canonical UTF-8 JSON envelope
```

Inline messages are at most 1 MiB; large artifacts travel by verified content hash. Receivers verify
Unix peer credentials, protocol/role/message authorization, expiry, sender sequence/nonce/message ID,
Ed25519 signature, payload hash/size/schema, artifact references, capability, and host budget.
Requests/responses use message, correlation, and causation IDs. Partial/extra/trailing frames, replay,
schema/hash mismatch, timeout, crash, protocol downgrade, and unauthorized role fail closed. A retry is
a new charged request and never evolution.

### 6.3 Hard acceptance boundary

Gate 2 must execute deterministic contract tests plus authenticated-wire and real OS-boundary adversarial
tests. Emulated process isolation is labeled `isolation_emulated` and cannot support a security result.
Any unauthorized read/write/network/secret/record action, evaluator impersonation, data leak, protocol
mix, accounting omission, or non-atomic activation is a hard failure regardless of task performance.

## 7. Revised data roles and feedback boundary

### 7.1 HarnessFaultBench-v0

- single fault: 28 mine, 14 gate, 14 final;
- multi-cause: 14 final only;
- no multi-cause final metric is a promotion or candidate gate.

The fixture contract is frozen before implementation. For all seven mutable families it specifies eight
numbered mechanics (`01`–`08`), difficulty strata, deterministic fake-provider/fake-tool tables, causal
intervention oracle, expected attribution label, scorer/tie/unknown-ID behavior, ambiguity rejection, and
independent review. Routing and SubagentPrompt mechanics alternate exactly. Fourteen multi-cause pairs
form a fixed balanced graph with degree four per family per stratum.

Final HarnessFaultBench may be called sealed only if separate benchmark-author/vault access conditions
are met; otherwise it is developer-withheld.

### 7.2 Terminal-Bench replication

The public exact IDs remain 45 evolution-train, 10 selection-validation, and 34 **withheld public test**.
“Withheld” describes experiment-time access only. Model pretraining and prior-exposure contamination are
explicit residual risks; the split is not called sealed.

### 7.3 Gate and temporal governance

Each evolutionary method generates at most five mine-only candidates with fixed seeds
`1729, 271828, 314159, 161803, 57721`. The batch is content-addressed before one gate batch. Every
candidate receives at most one gate evaluation; there are no adaptive replacements. The proposer is
stopped and loses write capability before gate. After one fixed selection, only one bounded aggregate
packet is released; task IDs, per-task outcomes, paths, traces, verifier diagnostics, and labels are
forbidden. The maximum is six charged feedback events per method.

Temporal holdout requires independent/blinded authors, preregistered inclusion/rejection rules, target
20/minimum 15 tasks, timestamped hashes, frozen verifiers, candidate-result access logs, contamination
checks, and a separate replication protocol.

Final roles never create, rank, select, promote, repair, tune, or change rollback policy for a candidate.

## 8. Revised B0–B6 comparisons and budget contract

The executable matrix includes:

- B0 static direct pass@1 anchor;
- B1 parallel sampling;
- B2 sequential refinement;
- B3 task-specific harness scaling;
- B4 prompt-only evolution;
- B5-U free-form mutable-bundle rewrite;
- B5-SM mandatory size-matched free-form control;
- B6-ABL mandatory bounded attribution-ablated control;
- B6 attribution-guided bounded mutation.

B5-SM matches candidate count, changed-component count, expanded closure and replacement surface within
±10%, proposer/feedback/compute envelope, without receiving target identity or attribution. B6-ABL uses
the same bounded grammar, one/two-component limits, size envelope, proposal seeds, candidate count,
preservation/rejected-edit fields, and budgets as B6, but receives no ranked `AttributionResult`.

`K_A=5` is a maximum of five solver-attempt slots per task under one matched task-search envelope. B0
uses one and leaves four unused. `K_B=5` is five complete candidate-manifest slots per evolutionary arm,
not retry count. Unused resources expire and never move across task, candidate, seed, phase, method, or
track.

Every provider event—including failed, cancelled, timed-out, cached, reasoning, retry, judge,
summarizer, attribution, subagent, and background calls—maps to exactly one frozen phase and shared
host-enforced account. Missing usage conservatively consumes the reserved cap. Cached input counts in
full for matching. Deterministic verifier compute is reported separately.

B0 has zero evolution cost and is a performance/cost anchor, not an equal-development method. Reports
separate shared mine-corpus cost, incremental and standalone evolution cost, gate/canary cost, final
per-task inference cost, deterministic compute, and amortization/break-even sensitivity.

The candidate operational cost scalar is mean total charged tokens over all gate tasks:

```text
R_C = (C_candidate + 1) / (C_parent + 1)
```

The normal path requires `R_C <= 1.10`. A higher-cost exception requires all of: at least one additional
pass, net fail→pass minus pass→fail at least one, and at least a 5% smoothed success-per-token gain.
Safety, permission, data, immutable, and audit violations always remain zero.

## 9. Revised hypotheses and statistics

H1 is split:

- H1a: B6 versus B6-ABL estimates the incremental effect of the explicit attribution artifact/workflow
  under the same bounded surface;
- H1b: B6 versus B5-SM tests the full structured method against size-matched free-form mutation.

Strong H1b wording additionally requires the lower confidence bound for relative regression reduction to
be at least 25%. B5-U remains descriptive.

H2 requires frozen B6 to improve final task-average paired pass@1 over both B0 and B4 with no final
retry/mutation and Holm-controlled intervals strictly above zero.

H3's primary efficiency outcome is total system charged inference across summarization, mining,
attribution, proposal, judge, subagent/background, and any differing solver work. Proposer tokens are
secondary. The cost-ratio interval upper bound must be below 0.80 while mine/dedicated-pilot quality
meets frozen non-inferiority.

The primary sampling unit is task; seeds are nested repeated measurements. The study never reports
task×seed as sample size. Primary intervals use 10,000 paired hierarchical bootstrap replicates,
resampling tasks within strata and then matched seeds within tasks. H1 and H2 families use Holm
correction. Scaling superiority requires B6 to beat B1, B2, and B3 after correction.

Final rollout count `S` is selected from `{2,3,5,8}` using mine/dedicated-pilot data only: choose the
smallest value with paired-difference Monte Carlo SE ≤1 percentage point and seed variance contribution
≤20%; otherwise freeze `S=8` and label precision-limited.

The previous ad hoc −5/−2 margins are withdrawn. H3 quality margins cannot exceed one mine task
(1/28 attribution; 1/45 candidate quality) and require ≥80% paired-simulation power. The candidate gate
margin remains `PILOT_PENDING` under a frozen mine-only selection rule. If calibration fails, the
protocol is revised before gate rather than widened after observation.

## 10. Required schema and validator surface

Twenty-nine Draft 2020-12 schemas now cover:

- common identity/signature/artifact forms;
- immutable component/harness/type-registry/protocol manifests;
- external provenance, lineage, lifecycle, and deployment records;
- runtime-state snapshots and authenticated wire envelopes;
- runtime events, evidence receipts, failure patterns, attributions, mutations, evaluations, and
  promotion decisions;
- all eight mutable payload languages plus immutable policy/artifact descriptors;
- HarnessFaultBench fixture records.

JSON Schema is not treated as sufficient. Gate 2 cross-object validation must recompute hashes and
closures, resolve all references, validate DAG/capability/transitive-diff rules, enforce principal/
split/phase/record authority, project both state machines, verify audit sequences/signatures, reproduce
budgets and cost rules, enforce gate-feedback limits, and reject final-role decision inputs.

Golden/adversarial tests are preregistered for canonicalization, filesystem objects, executable smuggling,
hidden dependency changes, runtime-state contamination, descendant rebinding, lifecycle/CAS concurrency,
rollback, forged/missing/reordered evidence, secret exfiltration, full budget accounting, benchmark
oracles, statistics, authenticated framing, evaluator/promoter impersonation, mount/network escape,
fork/process survival, and provider egress.

## 11. Disposition of all 26 required revisions

1. Immutable manifests and external records: contracted.
2. One atomic evaluated whole-harness pointer: contracted.
3. Canonical serialization, filesystem, artifact, and closure hashing: contracted.
4. Authoritative immutable type registry and trusted provenance: contracted.
5. Closed declarative payload languages and executable/indirection bans: contracted.
6. Expanded-closure mutation size and semantic deltas: contracted.
7. Transitive changes count against component limits: contracted.
8. Runtime-state snapshots and descendant inheritance/reset: contracted.
9. Metric-to-split matrix; multi-cause moved to final only: contracted.
10. Finite non-adaptive gate feedback: contracted.
11. Terminal-Bench renamed withheld public test with contamination disclosure: contracted.
12. Independent/blinded temporal governance: contracted.
13. Mandatory B5-SM and B6-ABL controls: contracted.
14. Separate operational definitions of Track A/B `K`: contracted.
15. Evolution/final/amortized cost and B0 anchor separated: contracted.
16. Phase-specific complete budget ledger: contracted.
17. H3 primary metric changed to total charged system inference: contracted.
18. Non-inferiority margins deferred to frozen mine-only calibration: contracted.
19. Estimands, task-clustered hierarchy, seed precision, multiplicity: contracted.
20. Exact candidate cost denominator and mechanical >10% exception: contracted.
21. HarnessFaultBench fixture/oracle/scorer/balance contract: contracted before implementation.
22. Principal-by-capability matrix: contracted.
23. Immutability is protocol-scoped digest pinning; mixed protocols forbidden: contracted.
24. ADR and authenticated/limited/fail-closed wire/OS isolation: contracted.
25. Pre-contract Python spike quarantined outside runtime/package/test/import/evidence paths with
    original and archived hash manifests: complete.
26. This packet resubmits the revised contracts and validator/adversarial acceptance criteria.

These statuses mean design/static-contract completion only. The executable acceptance evidence is
deliberately a Gate 2 obligation.

## 12. Local precheck and reproducibility evidence

The deterministic Gate 1R precheck currently reports:

```text
PASS schemas=29 type_registry=valid splits=28/14/14/14+45/10/34 spike=quarantined markdown_links=10
```

It validates schema meta-syntax and local references, the registry instance/identity/payload hashes,
exact mutable set, split counts/disjointness, YAML budget/feedback fields, manifest/record separation,
spike archive hashes, required artifact presence, and local contract links.

Key raw SHA-256 values:

| Contract | SHA-256 |
|---|---|
| component manifest schema | `defdb238b1d3149312241793e467e385cb54a05c0b3612785a6056f23197f9c7` |
| harness manifest schema | `147a039af5f1fe5214219157df06179cae18726845da5498970272f3c127f6cf` |
| protocol manifest schema | `b29804ad5e4b96c89f195ba4bc25ebffd31a4647e849ac4d9c1a92f344650d10` |
| split manifest | `fbab1b5bb8c7796cab08ee5c4b3368647edbae4ec99678b408d6e3ff240966fb` |
| budget config | `d9ea3533ade1778c39d8b9e189f3987d13596ca69cca311d42eeadd4e442dc42` |
| gate feedback policy | `8b14310349cb98921a15f880ad777062c229566c6ce6e968f3fb47cf8b8441c6` |
| baseline matrix | `1638b62cdc58c1fe7f8247084c84785971258810e6909a6b32c986a188313544` |
| statistical plan | `7c9db67ff80db2f3d4013d1cbb9a863cea5eda2cbc68b7313216c5896d18022e` |
| fixture specification | `e8f18fe797c2873cbe83d9673ab25cafff4a46aff848fff6cc5e8919e32c6a4a` |
| principal matrix | `3efd96568d40edc8b8134922f201d3d7a9c9d06118c4ddf3ced26de991d652ed` |
| ADR | `f2ee1ef3937b5df7104b8b376f781146e51c72de19a02b47bd59eff62d39c5e3` |
| validator/adversarial plan | `e3f57536a706de7f06018cc7ad7aeaf6a4b1b31f1dd24534cdfeae177b3cec41` |

Five HTML/SVG architecture/sequence/state diagrams were rendered in local Chrome at 1440×1000 with zero
console warnings/errors, viewport overflow, or inspected SVG text overflow.

No runtime, provider, benchmark fixture, evaluation, isolation, promotion, or performance test is
claimed. Those were intentionally not run under the prior authorized scope.

## 13. Open but bounded items

The following are intentionally unresolved, not silently chosen after seeing gate/final outcomes:

- numeric phase token/tool/time/resource caps: mine-only pilot then Gate 3 freeze;
- final rollout count and exact generated seed stream: frozen precision rule;
- candidate gate non-inferiority margin: `PILOT_PENDING` under the preregistered rule;
- whether H3 has adequate power at permitted one-task-resolution margins;
- provider reproducibility tier and exact model version: selected before provider smoke;
- whether the host can satisfy distinct UID/container/mount/key/network adversarial tests;
- independent benchmark-author availability and whether HFB final earns the word “sealed”;
- temporal task count above the hard minimum of 15;
- all empirical hypotheses, including the realistic possibility of no held-out improvement.

Any failure here narrows claims or causes a later `REVISE`; it does not justify post-hoc rule changes.

## 14. Requested Gate 1R judgment

Please assess separately:

1. novelty boundary;
2. correctness of immutable identity, closure, activation, and lifecycle separation;
3. evaluation fairness and causal controls;
4. generalization/data governance;
5. reproducibility/statistics;
6. trust/security contract;
7. claim discipline.

Please explicitly identify any remaining blocking finding and map it to a concrete contract revision.

Return exactly one top-level decision:

- `APPROVE`: the bounded Gate 2 runtime prototype may begin;
- `REVISE`: only named research/design corrections are authorized;
- `BLOCK`: the contribution or protocol is not viable without redefinition.

