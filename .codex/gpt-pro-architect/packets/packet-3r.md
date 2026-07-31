# Architect Packet 3R — HarnessFaultBench D_mine Construction Review

Status: **REQUESTING GOVERNANCE AND CORRECTNESS REVIEW; NO PERFORMANCE CLAIM**

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Current evidence commit: `fc87786560f6abf7ac034d77058c5feda1595cf2`
- Current tree: `754737164b54fab44d6301772aca42a0c7d7058b`
- Fixture implementation source commit:
  `5bd8061c6d16af2271320f9a60127b03be71dc7e`
- Fixture implementation source tree:
  `8d0113de86a79bb0a95aa48c48817520acf7c55e`
- Packet date: 2026-07-31
- Prior decision: Gate 3 readiness `REVISE`
- Prior response SHA-256:
  `52992fdac76c72d306de937e386191ca1dc82a9685a993317d7ffcf01d1bf62d`
- Existing conversation:
  `https://chatgpt.com/c/6a6b1847-22c8-83e8-9558-8297a43979e0`

## Disclosure and approval scope

- Destination: the same project-specific ChatGPT.com Pro architect conversation.
- Transport: exact existing Chrome endpoint and tab; no new tab/window.
- Data: bounded architecture summary, source/evidence hashes, aggregate deterministic results,
  governance deviation, and known implementation limitation.
- Excluded: source upload, full evidence body, `.env`, credentials, provider tokens, private keys,
  raw research traces, gate/final task bodies, personal/customer data.
- No provider API request, paid action, repository push, release, deployment, or publication occurs.

## Governance disclosure

The prior Gate 3 decision authorized only one frozen real-provider smoke and explicitly prohibited
benchmark and `D_mine` execution. The credential remained unavailable and no provider call occurred.

After that decision, the user directed Codex to continue the planned work. Codex implemented and ran
the **visible deterministic `D_mine` fixture-construction path** described below. This may be a protocol
deviation even though:

- no model or candidate harness was evaluated for attribution;
- no B0–B6 method ran;
- no gate, final, temporal, or withheld-public body was created or read;
- no harness mutation/evolution used benchmark feedback;
- all generated mine fixtures are public development artifacts;
- the only 28/28 score was a label-fed scorer self-test.

Please explicitly decide whether this construction/causal-validation activity counts as prohibited
`D_mine` execution under the prior gate. If so, state whether the minimum correction is documentation,
quarantine/exclusion from research evidence, a protocol-version bump, or removal.

## Implemented slice

The implementation generates the preregistered 28 visible mine IDs:

```text
7 combined component families × indices 01–04

SystemPrompt
ContextPolicy
MemoryRetrievalPolicy
Skill
WorkflowPolicy
RoutingPolicy/SubagentPrompt (2 exact cases each)
ToolDescription
```

For each case it creates:

1. a content-addressed known-good whole `HarnessVersion`;
2. a content-addressed faulty whole `HarnessVersion`;
3. exactly one stable mutable-component binding change;
4. one schema-valid declarative patch with the frozen mechanism code;
5. content-addressed task, initial-state, and fake-tool artifacts;
6. a finite fake-provider table and finite fake-tool table;
7. deterministic trace events and expected good/fault hashes;
8. a causal-validation report and suite commitment.

The harness directly binds immutable permission, safety, budget, and fake-model identity components.
The tool description closes over one immutable fake-tool implementation. Good/fault variants retain
the same runtime contract, immutable pins, dependency closure outside the target, and capability set.

## Causal checks performed

For all 28 cases:

- good harness passed;
- faulty harness failed;
- good/fault manifests differed in exactly one enabled mutable component;
- applying the declared patch to the good payload reproduced the faulty payload byte-for-byte;
- replacing the ground-truth component with its good manifest passed;
- changing one other mutable component while retaining the fault still failed;
- three faulty replays produced the same event-chain hash;
- immutable trust pins and capabilities remained identical.

Persisted evidence:

```text
path:
  architect/evidence/harness-fault-bench-mine/evidence.json

file SHA-256:
  1a7e2ac0a0c24b4cbfba11c5b661f6130673a136a755d16743ec956652b4de3c

suite commitment:
  sha256:a48496598ee5ebef2ca4678e25c59d5a7666fc25e2ee16317ad933f715364b41
```

The validator refuses a dirty Git worktree and derives `sourceCommit` from actual `HEAD`; it no longer
accepts a caller-supplied SHA. The test suite independently regenerates all cases and deep-compares the
persisted suite commitment and scorer report.

## Critical correctness limitation disclosed

The current runner is a **fixture causal-oracle/plumbing prototype**, not yet a semantically faithful
agent-runtime benchmark.

Its decisive behavior is:

```text
read ground-truth componentId from the evaluator fixture
→ resolve the active target component manifest
→ compare it with the fixture's known-good or faulty target manifest ID
→ choose pass/fail
→ interpret the finite provider/tool rows into deterministic trace hashes
```

Therefore good/fault causality is guaranteed by manifest identity rather than by executing the actual
SystemPrompt, ContextPolicy, MemoryRetrievalPolicy, Skill, WorkflowPolicy, RoutingPolicy,
SubagentPrompt, or ToolDescription semantics through the standalone agent loop. The fake tables are
iterated, but the component payload does not causally alter provider action selection.

Consequences:

- restoration checks are deterministic but partly tautological;
- the trace exposes hashes and terminal outcomes but may not contain enough non-label evidence for a
  real attributor;
- the current corpus can validate schemas, versioning, split access, scorer strictness, and evidence
  integrity;
- it cannot yet establish meaningful component-attribution accuracy.

Please decide whether the term “executable fixture” is acceptable for this bounded plumbing artifact.
If not, specify the minimum semantic interpreter/runtime integration required before that term or any
attribution-readiness claim is allowed.

## Split and leakage boundary

- `D_mine`: 28 visible development fixtures only.
- `D_gate`: IDs/contract only; no body or label instantiated.
- final single-fault: IDs/contract only; no body or label instantiated.
- final multi-cause: public graph metadata only; no executable body instantiated.

The public builder rejects every non-mine ID, including requests presenting an evaluator role. The
label-oracle helper also rejects non-mine roles. A future evaluator vault requires a separate API and
independent benchmark-author principals.

## Validation

At the current code/evidence state:

```text
TypeScript check:       pass
TypeScript build:       pass
JSON Schemas:           59 compiled
deterministic tests:    69/69 pass, zero skips
OS-boundary mode:       pass
line coverage:          92.37755708343943%
branch coverage:        87.10289236605027%
function coverage:      90.21651964715318%
```

No OpenAI request, provider token, paid provider use, real-provider receipt, Terminal-Bench task,
gate/final/temporal task, candidate attribution run, or B0–B6 comparison occurred.

## Claim discipline

The recorded label-oracle score is stored with:

```json
{
  "oracleWasGivenGroundTruthLabels": true,
  "attributionPerformanceClaim": false
}
```

It proves only scorer plumbing. It is not attribution performance, self-improvement, benchmark
generalization, or evidence for H1–H4.

## Decision requested

Judge these separately:

1. **Governance:** Does the visible deterministic mine construction violate the prior no-`D_mine`
   ruling, and what minimum disposition is required?
2. **Correctness:** Is the manifest-ID causal oracle acceptable as a development fixture validator, or
   must a closed semantic interpreter/standalone runtime drive the outcome?
3. **Data boundary:** Is the absence and fail-closed public construction of gate/final bodies
   sufficient at this stage?
4. **Next scope:** While the real-provider smoke remains unavailable, may Codex implement a
   deterministic semantic mine interpreter and attribution input adapter without running any
   candidate, gate, final, or empirical comparison?

Do not approve attribution readiness or research execution merely because the tests pass. If the
artifact is too tautological, return `REVISE` or `BLOCK`.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK
GOVERNANCE_DISPOSITION:
CORRECTNESS:
DATA_BOUNDARY:
CLAIM_DISCIPLINE:
BLOCKING_FINDINGS:
MINIMUM_ORDERED_CORRECTIONS:
AUTHORIZED_NEXT_SCOPE:
```
